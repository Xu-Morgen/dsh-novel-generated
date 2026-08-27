import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';

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
 * - `reject`：Gate 拒绝（C3 零写）；`pending`：待确认提案只读列表（重载一致）。
 *
 * 不变式：所有参数/结果都是最小 owned JSON；Client 不持有任何领域真相与文件
 * 路径。本模块只依赖 zod 与纯 schema（Client bundle 会经 shared.ts 解析本文件
 * 完整导入图；core/knowledge/actions 是 Host-only 校验/写回逻辑，不得入图）。
 * wire 形状与 host/knowledge-manager-service 投影对齐（strict），由 Host 服务端
 * 再经 core 合同严格复验。
 */

export const knowledgeStatusWireSchema = z.enum(['hidden', 'partially-revealed', 'revealed']);
export const knowledgeKindWireSchema = z.enum(['secret', 'foreshadow', 'plotpoint', 'backstory']);
export const knowledgeChangeKindWireSchema = z.enum(['reveal', 'holder-add']);

export const knowledgeRevealPlanWireSchema = z.object({
  revealTo: z.array(z.string().min(1)),
  revealAt: z.string().min(1),
}).strict();

export const knowledgeEntryWireSchema = z.object({
  id: z.string().min(1),
  fact: z.string().min(1),
  kind: knowledgeKindWireSchema,
  status: knowledgeStatusWireSchema,
  holders: z.array(z.string().min(1)),
  revealPlan: knowledgeRevealPlanWireSchema,
  /** POV 边界提示（Host 解析角色名生成；作者视角速览）。 */
  povHint: z.string().min(1),
}).strict();

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

/** 与 core/knowledge/actions 的 knowledgeChangeInputSchema 同构（wire 形状 strict）。 */
const knowledgeChangeInputWireSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('reveal'),
    entryId: z.string().min(1).max(64),
    holders: z.array(z.string().min(1).max(64)).min(1),
    status: z.enum(['partially-revealed', 'revealed']).optional(),
    revealAt: z.string().trim().min(1).optional(),
  }).strict(),
  z.object({
    kind: z.literal('holder-add'),
    entryId: z.string().min(1).max(64),
    holders: z.array(z.string().min(1).max(64)).min(1),
  }).strict(),
]);

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

export const knowledgePendingOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  proposals: z.array(knowledgeProposalViewWireSchema),
}).strict();

const param = (name: string, codec: TypertCodec = strictCodec('novel-creation-tool#json', z.unknown()), optional = false): InvocationParameterDescriptor =>
  ({ name, wire: name, source: 'json', codec, ...(optional ? { acceptsUndefined: true } : {}) });

function knowledgeInvocation(method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor {
  return { id: `novel-creation-tool/novelKnowledgeManager/${method}`, service: 'novelKnowledgeManager', namespace: 'novelKnowledgeManager', method, invocation: { kind: 'direct' }, parameters, result: resultSchema };
}

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
], strictCodec('novel-creation-tool#novelKnowledgeManager:pending', knowledgePendingOutcomeWireSchema));

export const knowledgeInvocations = [
  knowledgeListInvocation,
  knowledgeReadInvocation,
  knowledgeProposeInvocation,
  knowledgeAcceptInvocation,
  knowledgeRejectInvocation,
  knowledgePendingInvocation,
] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
export const knowledgeRemoteContribution: TypertRemoteContribution = { package: 'novel-creation-tool-knowledge', descriptors: [...knowledgeInvocations] };
