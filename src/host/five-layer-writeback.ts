import type { LifecycleWriters } from '../core/lifecycle/index.js';
import type { StateDraft } from '../core/state/index.js';
import { applyC2StateOperationsToDraft, type C2StateParserOutput } from '../llm/parse/state.js';
import { materializeC1RelationshipOperations, type C1RelationshipParserOutput } from '../llm/parse/relationship.js';
import { materializeC3KnowledgeOperations, type C3KnowledgeParserOutput } from '../llm/parse/knowledge.js';
import type { C4CanonParserOutput } from '../llm/parse/canon.js';
import type { B2WorldviewParserOutput } from '../llm/parse/worldview.js';
import type { NovelStateService } from './state-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';

/**
 * 共享五层写回器（架构审查 §5.2 / §5.4 / §9 #4 —— 复制源唯一）。
 *
 * C2→C1→C3→C4→B2 的结构化层写回（design §6.6 / I30 saga）只有一份实现，两个
 * Host 消费方共用：
 * - `writing-adjudication-service`（I63 accept 落地，经 `executeLifecycle` 受控写回）；
 * - `text-edit-service`（I61 reparseAccept 确认后 fan-out 落层）。
 *
 * 语义与不变式（与重构前两处逐行比对的既有行为一致）：
 * - 层顺序固定 C2→C1→C3→C4→B2；每层先做低置信 fail-closed（抛错，绝不让
 *   低置信结构化变更绕过 I11 ConfirmationGate 落盘）。
 * - C4 只允许 append；supersede 与低置信 ops 一律抛错（正史纠错必须经 Gate）。
 * - B2 改写 confirmation-first：写回前先经共享 ConfirmationGate 提出并接受
 *   `b2-worldview-parser-supersedes` 提案（proposalId = `${proposalId}-b2`），再经
 *   既有改写服务落盘；version/status/supersededBy 归存储层（b2ReplacementSchema）。
 * - `skipEmptyB2Proposal` 保留 I61 与 I30 的两处既有语义差异（见该选项文档）。
 */
export interface FiveLayerWritebackDeps {
  readonly state: NovelStateService;
  readonly relationship: NovelRelationshipService;
  readonly knowledge: NovelKnowledgeService;
  readonly canon: NovelCanonService;
  readonly worldview: NovelWorldviewService;
  readonly confirmation: NovelConfirmationService;
}

export interface FiveLayerWritebackOptions {
  /**
   * B2 ops 为空时跳过 Gate 提案。I61 text-edit 语义（`text-edit-service.ts` L153–201
   * 既有 `if (parsed.ops.length === 0) return;`）：空改写不产生空提案审计噪音。
   * 缺省 false —— 保持 I30 裁决 saga（I63）既有行为：journal 每阶段都记录 Gate
   * 决策，B2 恒提案（含空 ops）。
   */
  readonly skipEmptyB2Proposal?: boolean;
}

/**
 * 构建五层写回器。`proposalId` 用于派生 B2 Gate 提案 id（`${proposalId}-b2`），
 * 同一批写回重入必须复用同一 proposalId（Gate 拒绝重复提案 id）。
 *
 * I96（review v2.0 §8#1 / 计划 §18 I96）：返回类型按层参数化（五层 parser
 * 输出类型独立流动），writer 参数不再 `as` 断言、不再被擦成 unknown——
 * parser/writer 形状漂移在接线层即报编译错。
 */
export function buildFiveLayerWriters(
  deps: FiveLayerWritebackDeps,
  projectId: string,
  proposalId: string,
  options: FiveLayerWritebackOptions = {},
): LifecycleWriters<C2StateParserOutput, C1RelationshipParserOutput, C3KnowledgeParserOutput, C4CanonParserOutput, B2WorldviewParserOutput> {
  const lowConfidence = (ops: readonly { confidence?: unknown }[]): boolean =>
    ops.some((operation) => operation.confidence === 'low');
  return {
    c2: async (parsed) => {
      if (lowConfidence(parsed.ops)) throw new Error('Low-confidence C2 operations require ConfirmationGate');
      await deps.state.transaction(projectId, (draft) => applyC2StateOperationsToDraft(draft as StateDraft, parsed.ops));
    },
    c1: async (parsed) => {
      if (lowConfidence(parsed.ops)) throw new Error('Low-confidence C1 operations require ConfirmationGate');
      const next = materializeC1RelationshipOperations(await deps.relationship.read(projectId), parsed.ops);
      await deps.relationship.saveAll(projectId, next);
    },
    c3: async (parsed) => {
      if (lowConfidence(parsed.ops)) throw new Error('Low-confidence C3 operations require ConfirmationGate');
      const next = materializeC3KnowledgeOperations(await deps.knowledge.read(projectId), parsed.ops);
      await deps.knowledge.saveAll(projectId, next.entries, next.states);
    },
    c4: async (parsed) => {
      if (parsed.ops.some((operation) => operation.confidence === 'low' || operation.op === 'supersede')) {
        throw new Error('Low-confidence or supersede C4 operations require ConfirmationGate');
      }
      for (const operation of parsed.ops) {
        if (operation.op !== 'append') throw new Error('C4 supersede operations require ConfirmationGate');
        await deps.canon.append(projectId, operation.event);
      }
    },
    b2: async (parsed) => {
      if (options.skipEmptyB2Proposal === true && parsed.ops.length === 0) return;
      // B2 改写 confirmation-first：先经 I11 Gate 提出并接受，再经既有改写服务落盘。
      const b2ProposalId = `${proposalId}-b2`;
      await deps.confirmation.propose(projectId, {
        id: b2ProposalId,
        kind: 'b2-worldview-parser-supersedes',
        payload: { ops: parsed.ops },
      });
      await deps.confirmation.accept(projectId, b2ProposalId);
      for (const operation of parsed.ops) {
        // B2 解析器契约（b2ReplacementSchema）约定 version/status/supersededBy 归存储层。
        await deps.worldview.rewrite(projectId, operation.targetId, {
          ...operation.replacement,
          status: 'active',
          supersededBy: null,
        });
      }
    },
  };
}
