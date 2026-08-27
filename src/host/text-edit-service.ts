import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createLocalizedEditService, type LocalizedEditResult, type ReparseRequest } from './edit-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { GenerationSettings } from '../llm/port/index.js';
import { asLlmBackend } from '../llm/port/index.js';
import { parseC2StateFromNarrative, applyC2StateOperationsToDraft, type C2StateParserOutput } from '../llm/parse/state.js';
import { parseC1RelationshipsFromNarrative, materializeC1RelationshipOperations, type C1RelationshipParserOutput } from '../llm/parse/relationship.js';
import { parseC3KnowledgeFromNarrative, materializeC3KnowledgeOperations, type C3KnowledgeParserOutput } from '../llm/parse/knowledge.js';
import { parseC4CanonFromNarrative, type C4CanonParserOutput } from '../llm/parse/canon.js';
import { parseB2WorldviewFromNarrative, type B2WorldviewParserOutput } from '../llm/parse/worldview.js';
import type { Scene } from '../core/schema/text.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';
import type { EditRange } from '../core/edit/index.js';
import type { StateDraft } from '../core/state/index.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository } from '../core/text/index.js';

/** I61 重解析 fan-out 的层顺序（与 I30 生命周期一致，design §6.6）。 */
export const REPARSE_LAYERS = ['c2', 'c1', 'c3', 'c4', 'b2'] as const;
export type ReparseLayer = (typeof REPARSE_LAYERS)[number];

export interface ReparseProposeResult {
  readonly proposalId: string;
  readonly status: 'pending' | 'accepted' | 'rejected';
}

export interface ReparseAcceptResult {
  readonly status: 'written';
  readonly scene: Scene;
  readonly layers: readonly ReparseLayer[];
}

export interface TextEditDeps {
  readonly llm: unknown;
  readonly projectsRoot?: string;
  readonly state: NovelStateService;
  readonly relationship: NovelRelationshipService;
  readonly knowledge: NovelKnowledgeService;
  readonly canon: NovelCanonService;
  readonly worldview: NovelWorldviewService;
  readonly confirmation: NovelConfirmationService;
  /** 解析当前活动生成设置（modelRef/credentialRef），供五个 parser 经 Host `ctx.llm` 路由。 */
  readonly resolveSettings: () => Promise<GenerationSettings>;
  readonly onDispose?: (dispose: () => void) => void;
}

export interface NovelTextEditService {
  open(projectId: string): Promise<void>;
  /**
   * I42 固定范围逐字保存（design §5.12 / R13-2）：只写 C5 文本，绝不隐式修改
   * 任何结构层。`baseHash` 为客户端装载正文时的 SHA-256；当前文本哈希不一致时
   * 拒绝（脏文本保护，防止陈旧草稿覆盖并发写入）。
   */
  edit(projectId: string, chapterId: string, sceneId: string, range: EditRange, replacement: string, baseHash?: string): Promise<LocalizedEditResult>;
  /**
   * 显式重解析：把「范围修改」作为 I11 提案交给 ConfirmationGate（kind
   * `localized-reparse`，payload 含 before/after 指纹）。未确认不解析、不写层。
   * proposalId 由 Host 按 (原文, 范围, 替换) 确定性生成；同一编辑重复提议幂等
   * 返回既有提案（不重复调用 Gate.propose）。
   */
  reparsePropose(projectId: string, chapterId: string, sceneId: string, range: EditRange, replacement: string, baseHash?: string): Promise<ReparseProposeResult>;
  /**
   * 确认并应用重解析：先经 I11 幂等 accept，再走既有 parser fan-out（I25–I29 的
   * parser 函数 + 既有 Domain Service writers，design §14.9），最后写 C5 文本。
   * 未确认、拒绝或非法范围一律零写。`baseHash` 在 accept 时再次核对当前文本：
   * propose 与 accept 之间正文被其他写入者改动时拒绝（脏文本保护）。
   */
  reparseAccept(projectId: string, chapterId: string, sceneId: string, range: EditRange, replacement: string, proposalId: string, baseHash?: string): Promise<ReparseAcceptResult>;
  /** 显式拒绝已提出的重解析：Gate 置 rejected，零写。 */
  reparseReject(projectId: string, proposalId: string): Promise<{ readonly proposalId: string; readonly status: 'rejected' }>;
}

/**
 * I61 C5 正文编辑与可选 reparse 的 Host owner（design §5.12 / §14.9 / R13-2）。
 *
 * 职责与不变式：
 * - `edit` 复用 I42 `createLocalizedEditService.edit`（逐字精确、范围外不变），
 *   外加 `baseHash` 脏文本保护；它只写 C5，不触达 B2/C1/C2/C3/C4。
 * - `reparsePropose` / `reparseAccept` / `reparseReject` 复用 I42 的
 *   propose/apply 状态机与 I11 Gate：accept 是唯一用户确认；未确认/拒绝时
 *   parsers 与 writers 一律不执行（拒绝零写）。
 * - 确认后的 fan-out 只复用既有 parser 函数（I25–I29）与既有 Domain Service
 *   writers（与 I30 生命周期 / agent-tools 同一批函数），不新增第二套解析或
 *   写入语义（R2-7「NarrativeParser 独立于正文生成」）。
 * - B2 改写保持 confirmation-first：writer 经共享 ConfirmationGate 提出并接受
 *   `b2-worldview-parser-supersedes` 提案后再经既有改写服务落盘。
 * - 低置信结构化变更 fail-closed（抛错），与 agent-tools 同一策略。
 * - proposalId 确定性生成：`scene-reparse-<sha256(chapterId|sceneId|range|replacement|beforeHash)>`
 *   —— 同一次编辑的 propose/accept 引用同一提案；重复提议幂等返回既有提案，
 *   不重复调用 Gate.propose（Gate replay 语义保留给业务无关的重复 id）。
 */
export function createTextEditService(deps: TextEditDeps): NovelTextEditService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const backend = asLlmBackend(deps.llm);
  const editService = createLocalizedEditService(deps.llm, projectsRoot, deps.onDispose);
  const opened = new Set<string>();
  const repositories = new Map<string, TextRepository>();

  const ensureOpen = async (projectId: string): Promise<void> => {
    validateProjectId(projectId);
    if (opened.has(projectId)) return;
    await editService.open(projectId);
    opened.add(projectId);
  };
  const repository = async (projectId: string): Promise<TextRepository> => {
    validateProjectId(projectId);
    let repo = repositories.get(projectId);
    if (repo === undefined) {
      repo = new TextRepository(projectDirectory(projectsRoot, projectId));
      await repo.open();
      repositories.set(projectId, repo);
    }
    return repo;
  };

  const hash = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

  const assertBaseHash = (actual: string, baseHash: string | undefined, projectId: string, chapterId: string, sceneId: string): void => {
    if (baseHash !== undefined && hash(actual) !== baseHash) {
      throw new Error(`正文已变化（脏文本保护）：请刷新 ${projectId}/${chapterId}/${sceneId} 后重试`);
    }
  };

  const proposalIdFor = (chapterId: string, sceneId: string, range: EditRange, replacement: string, beforeHash: string): string => {
    const digest = createHash('sha256')
      .update([chapterId, sceneId, String(range.start), String(range.end), replacement, beforeHash].join('\u0000'), 'utf8')
      .digest('hex')
      .slice(0, 24);
    return `scene-reparse-${digest}`;
  };

  /** 确认后的 fan-out：真实 parser 闭包（I25–I29）作用于「编辑后」正文。 */
  const buildParsers = (
    projectId: string,
    prose: string,
    settings: GenerationSettings,
  ): ReparseRequest['parsers'] => ({
    c2: () => parseC2StateFromNarrative(backend, { prose, state: deps.state.current(projectId) }, settings),
    c1: async () => parseC1RelationshipsFromNarrative(backend, { prose, current: await deps.relationship.read(projectId) }, settings),
    c3: async () => parseC3KnowledgeFromNarrative(backend, { prose, ...(await deps.knowledge.read(projectId)) }, settings),
    c4: () => parseC4CanonFromNarrative(backend, { prose, canon: deps.canon.query(projectId) }, settings),
    b2: async () => parseB2WorldviewFromNarrative(backend, { prose, current: await deps.worldview.list(projectId) }, settings),
  });

  /** 既有 Domain Service 写回器（与 I30 / agent-tools 同一批函数，C2→C1→C3→C4→B2）。 */
  const buildWriters = (projectId: string, reparseProposalId: string): ReparseRequest['writers'] => ({
    c2: async (output) => {
      const parsed = output as C2StateParserOutput;
      if (parsed.ops.some((operation) => operation.confidence === 'low')) throw new Error('Low-confidence C2 operations require ConfirmationGate');
      await deps.state.transaction(projectId, (draft) => applyC2StateOperationsToDraft(draft as StateDraft, parsed.ops));
    },
    c1: async (output) => {
      const parsed = output as C1RelationshipParserOutput;
      if (parsed.ops.some((operation) => operation.confidence === 'low')) throw new Error('Low-confidence C1 operations require ConfirmationGate');
      const next = materializeC1RelationshipOperations(await deps.relationship.read(projectId), parsed.ops);
      await deps.relationship.saveAll(projectId, next);
    },
    c3: async (output) => {
      const parsed = output as C3KnowledgeParserOutput;
      if (parsed.ops.some((operation) => operation.confidence === 'low')) throw new Error('Low-confidence C3 operations require ConfirmationGate');
      const next = materializeC3KnowledgeOperations(await deps.knowledge.read(projectId), parsed.ops);
      await deps.knowledge.saveAll(projectId, next.entries, next.states);
    },
    c4: async (output) => {
      const parsed = output as C4CanonParserOutput;
      if (parsed.ops.some((operation) => operation.confidence === 'low' || operation.op === 'supersede')) {
        throw new Error('Low-confidence or supersede C4 operations require ConfirmationGate');
      }
      for (const operation of parsed.ops) {
        if (operation.op !== 'append') throw new Error('C4 supersede operations require ConfirmationGate');
        await deps.canon.append(projectId, operation.event);
      }
    },
    b2: async (output) => {
      const parsed = output as B2WorldviewParserOutput;
      if (parsed.ops.length === 0) return;
      // B2 改写 confirmation-first：先经 I11 Gate 提出并接受，再经既有改写服务落盘。
      const b2ProposalId = `${reparseProposalId}-b2`;
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
  });

  const service: NovelTextEditService = {
    async open(projectId) {
      await ensureOpen(projectId);
      await repository(projectId);
    },
    async edit(projectId, chapterId, sceneId, range, replacement, baseHash) {
      await ensureOpen(projectId);
      const repo = await repository(projectId);
      const chapter = await repo.readChapter(chapterId);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      assertBaseHash(scene.content, baseHash, projectId, chapterId, sceneId);
      return editService.edit(projectId, chapterId, sceneId, range, replacement);
    },
    async reparsePropose(projectId, chapterId, sceneId, range, replacement, baseHash) {
      await ensureOpen(projectId);
      const repo = await repository(projectId);
      const chapter = await repo.readChapter(chapterId);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      assertBaseHash(scene.content, baseHash, projectId, chapterId, sceneId);
      const beforeHash = hash(scene.content);
      const proposalId = proposalIdFor(chapterId, sceneId, range, replacement, beforeHash);
      // 幂等提议：同一编辑（原文+范围+替换确定同一 proposalId）重复提议直接返回
      // 既有提案记录，绝不重复调用 Gate.propose（replay 由 Gate 语义保留）。
      let record: ConfirmationRecord;
      try {
        record = deps.confirmation.get(projectId, proposalId);
      } catch {
        // propose 阶段不解析、不写层、不解析设置：占位闭包只满足 I42 契约
        // （I42 proposeReparse 仅消费 id/projectId/chapterId/sceneId/range/replacement）。
        const noop = async (): Promise<undefined> => undefined;
        const request: ReparseRequest = {
          id: proposalId, projectId, chapterId, sceneId, range, replacement,
          parsers: { c2: noop, c1: noop, c3: noop, c4: noop, b2: noop },
          writers: { c2: noop, c1: noop, c3: noop, c4: noop, b2: noop },
        };
        record = await editService.proposeReparse(request);
      }
      return Object.freeze({ proposalId: record.id, status: record.status });
    },
    async reparseAccept(projectId, chapterId, sceneId, range, replacement, proposalId, baseHash) {
      await ensureOpen(projectId);
      const repo = await repository(projectId);
      const chapter = await repo.readChapter(chapterId);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      assertBaseHash(scene.content, baseHash, projectId, chapterId, sceneId);
      if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end < range.start || range.end > scene.content.length) {
        throw new Error(`Invalid text range: ${range.start}-${range.end}`);
      }
      const prose = scene.content.slice(0, range.start) + replacement + scene.content.slice(range.end);
      const settings = await deps.resolveSettings();
      const request: ReparseRequest = {
        id: proposalId, projectId, chapterId, sceneId, range, replacement,
        parsers: buildParsers(projectId, prose, settings),
        writers: buildWriters(projectId, proposalId),
      };
      // 唯一用户确认：I11 accept 幂等（重复确认返回既有记录；已拒绝则失败）。
      await deps.confirmation.accept(projectId, proposalId);
      const applied = await editService.applyAcceptedReparse(request);
      return Object.freeze({ status: 'written' as const, scene: applied.scene, layers: REPARSE_LAYERS });
    },
    async reparseReject(projectId, proposalId) {
      await ensureOpen(projectId);
      const record = await deps.confirmation.reject(projectId, proposalId);
      return Object.freeze({ proposalId: record.id, status: 'rejected' as const });
    },
  };
  return Object.freeze(service);
}
