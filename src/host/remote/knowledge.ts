import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
// I77：wire schema 从 core schema 派生（架构审查 §6.3/§9#3，沿用 timeline/editor
// 直接复用先例）。core/schema/knowledge.ts 与 core/knowledge/actions.ts 都是纯
// zod/纯函数模块（actions 文档明确「不依赖 node:fs/node:crypto」，Client bundle
// 经 shared.ts 解析本文件完整导入图可安全入图）。
import {
  knowledgeEntrySchema,
  knowledgeKindSchema,
  knowledgeStatusSchema,
  revealPlanSchema,
} from '../../core/schema/knowledge.js';
import {
  knowledgeChangeInputSchema,
  knowledgeChangeKindSchema,
} from '../../core/knowledge/actions.js';

/**
 * I66 C3 知情与揭示管理面 Remote（design §14.10「C3 知情与揭示」/ R14-1）。
 *
 * `novelKnowledgeManager` 是 Client 知情管理面板的唯一读写面：
 * - `list`：按事实/角色双视图投影（fact/kind/status/holders/revealPlan/
 *   POV 边界提示 + characterId/name/knows + 汇总）；只读零写；
 * - `read`：单条事实详情（holders/planned 带角色名 + 该事实 pending 提案）；
 * - `propose`：唯一揭示 / holder 变更提案入口 —— Host 先 fail-fast 校验（逆向
 *   status / 未知 entry / 已知情 holder / 未知角色零写拒绝），再写入 I11 Gate
 *   成为 pending（未确认零写）；
 * - `accept`：Gate 确认后受控写回（知情只增不退；已生效变更幂等 no-op）；
 * - `reject`：Gate 拒绝（C3 零写）；
 * - `pending`：待确认提案只读列表（服务返回裸数组，wire 契约即裸数组，组合根
 *   不再整形 —— I77 修复审查 §8#1 的补丁，契约漂移在类型层暴露）。
 *
 * 不变式：所有参数/结果都是最小 owned JSON；Client 不持有任何领域真相与文件
 * 路径。wire 形状以 core schema 为单一来源（strict）：kind/status/revealPlan/
 * entry（core/schema/knowledge）+ change input/kind（core/knowledge/actions），
 * 由 Host 服务端再经 core 合同严格复验。
 */

export const knowledgeStatusWireSchema = knowledgeStatusSchema;
export const knowledgeKindWireSchema = knowledgeKindSchema;
export const knowledgeChangeKindWireSchema = knowledgeChangeKindSchema;

export const knowledgeRevealPlanWireSchema = revealPlanSchema;

// C3 entry 的 wire 投影 = core entry 去掉持久化 version 字段 + POV 边界提示。
export const knowledgeEntryWireSchema = knowledgeEntrySchema.omit({ version: true }).extend({
  povHint: z.string().min(1),
});

export const knowledgeCharacterWireSchema = z.object({
  characterId: z.string().min(1),
  name: z.string().min(1),
  knows: z.array(z.string().min(1)),
}).strict();

export const knowledgeProjectionWireSchema = z.object({
  projectId: z.string().min(1),
  entries: z.array(knowledgeEntryWireSchema),
  characters: z.array(knowledgeCharacterWireSchema),
  summary: z.object({
    total: z.number().int().nonnegative(),
    hidden: z.number().int().nonnegative(),
    partiallyRevealed: z.number().int().nonnegative(),
    revealed: z.number().int().nonnegative(),
    withPlan: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const knowledgeNamedRefWireSchema = z.object({
  characterId: z.string().min(1),
  name: z.string().min(1),
}).strict();

export const knowledgeProposalViewWireSchema = z.object({
  proposalId: z.string().min(1),
  kind: knowledgeChangeKindWireSchema,
  entryId: z.string().min(1),
  holders: z.array(z.string().min(1)),
  status: knowledgeStatusWireSchema.optional(),
  revealAt: z.string().min(1).optional(),
}).strict();

export const knowledgeEntryDetailWireSchema = z.object({
  projectId: z.string().min(1),
  entry: knowledgeEntryWireSchema,
  holders: z.array(knowledgeNamedRefWireSchema),
  planned: z.array(knowledgeNamedRefWireSchema),
  pendingProposals: z.array(knowledgeProposalViewWireSchema),
}).strict();

/** 与 core/knowledge/actions 的 knowledgeChangeInputSchema 同一来源（wire 形状 strict）。 */
const knowledgeChangeInputWireSchema = knowledgeChangeInputSchema;

export const knowledgeProposeOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  proposalId: z.string().min(1),
  kind: knowledgeChangeKindWireSchema,
  status: z.literal('pending'),
  /** 提案生效后的事实预览（确认前展示预期结果）。 */
  preview: knowledgeEntryWireSchema,
}).strict();

export const knowledgeApplyOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  proposalId: z.string().min(1),
  applied: z.boolean(),
  projection: knowledgeProjectionWireSchema,
}).strict();

export const knowledgeRejectOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  proposalId: z.string().min(1),
  status: z.literal('rejected'),
}).strict();

/** I77：pending 的 wire 契约即领域服务返回的裸数组（见模块注释）。 */
export const knowledgePendingResultWireSchema = z.array(knowledgeProposalViewWireSchema);

// I75：`param`/`knowledgeInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
const knowledgeInvocation = (method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor =>
  remoteInvocation('novelKnowledgeManager', method, parameters, resultSchema);

export const knowledgeListInvocation = knowledgeInvocation('list', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelKnowledgeManager:list', knowledgeProjectionWireSchema));
export const knowledgeReadInvocation = knowledgeInvocation('read', [
  param('projectId', stringCodec),
  param('entryId', stringCodec),
], strictCodec('novel-creation-tool#novelKnowledgeManager:read', knowledgeEntryDetailWireSchema));
export const knowledgeProposeInvocation = knowledgeInvocation('propose', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelKnowledgeManager:proposeInput', knowledgeChangeInputWireSchema)),
], strictCodec('novel-creation-tool#novelKnowledgeManager:propose', knowledgeProposeOutcomeWireSchema));
export const knowledgeAcceptInvocation = knowledgeInvocation('accept', [
  param('projectId', stringCodec),
  param('proposalId', stringCodec),
], strictCodec('novel-creation-tool#novelKnowledgeManager:accept', knowledgeApplyOutcomeWireSchema));
export const knowledgeRejectInvocation = knowledgeInvocation('reject', [
  param('projectId', stringCodec),
  param('proposalId', stringCodec),
], strictCodec('novel-creation-tool#novelKnowledgeManager:reject', knowledgeRejectOutcomeWireSchema));
export const knowledgePendingInvocation = knowledgeInvocation('pending', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelKnowledgeManager:pending', knowledgePendingResultWireSchema));

export const knowledgeInvocations = [
  knowledgeListInvocation,
  knowledgeReadInvocation,
  knowledgeProposeInvocation,
  knowledgeAcceptInvocation,
  knowledgeRejectInvocation,
  knowledgePendingInvocation,
] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
export const knowledgeRemoteContribution: TypertRemoteContribution = remoteContribution('novel-creation-tool-knowledge', knowledgeInvocations);
