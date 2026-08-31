import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
import { consistencyStatusSchema, consistencyViolationsSchema } from '../../core/validate/index.js';

/**
 * I63 候选审阅与生成后裁决 Remote（design §14.9 / R13-4）。
 *
 * `novelWriting` 是 Client 审阅面板的唯一读写面：
 * - `propose`：产生绑定 project/chapter/scene/sourceHash 的候选（零写；settings 可选，
 *   缺省由 Host A2 配置惰性解析）；
 * - `preview`：候选正文 + diff + 校验结果（I21/I22/I24 → I20 裁决）；
 * - `adjudicate`：唯一裁决入口（accept 进入标准生命周期受控写回 / reject 零写 /
 *   rewrite 后继候选），结果严格 discriminated-union 校验。
 *
 * 不变式：所有参数/结果都是最小 owned JSON；Client 不持有任何领域真相与文件路径。
 * 本模块只依赖 zod 与纯 schema，绝不传递导入 Host 侧 node 内置模块（Client bundle
 * 会经 shared.ts 解析本文件的完整导入图；core/candidate 依赖 node:crypto，不得入图）。
 * 候选/target 的 wire 形状与 core/candidate 合同对齐（strict），由 Host 服务端再经
 * `parseWritingCandidate` 严格复验。
 */
const candidateTargetWireSchema = z.object({
  projectId: z.string().min(1),
  chapterId: z.string().min(1).optional(),
  sceneId: z.string().min(1).optional(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();
export const writingCandidateWireSchema = z.object({
  id: z.string().min(1).max(128),
  intent: z.enum(['generate', 'continue', 'scene-card', 'rewrite']),
  target: candidateTargetWireSchema,
  prompt: z.string().min(1),
  text: z.string().min(1),
  chunkCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
}).strict();

const writingProposeInputSchema = z.object({
  intent: z.enum(['continue', 'scene-card', 'rewrite']),
  chapterId: z.string().min(1).optional(),
  sceneId: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
  /** I122 selector; mode-specific prompt text remains an I123 concern. */
  polishMode: z.enum(['language', 'condense', 'expand']).optional(),
}).strict();
export type WritingProposeInputShape = z.infer<typeof writingProposeInputSchema>;

const writingProposeAtInputSchema = z.object({
  intent: z.enum(['continue', 'scene-card']),
  chapterId: z.string().min(1),
  sceneId: z.string().min(1),
}).strict();
export type WritingProposeAtInputShape = z.infer<typeof writingProposeAtInputSchema>;

const adjudicationSchema = z.object({
  status: consistencyStatusSchema,
  violations: consistencyViolationsSchema,
}).strict();

/** I71 生成注入解释 wire（design §14.10「搜索与上下文追踪」/ R14-6）：只含层/触发/预算摘要，无 secret 内容。 */
export const contextTraceSectionWireSchema = z.object({
  id: z.string().min(1),
  characterCount: z.number().int().nonnegative(),
  budget: z.number().int().nonnegative(),
  truncated: z.boolean(),
}).strict();

export const worldviewTriggerWireSchema = z.object({
  entryId: z.string().min(1),
  title: z.string(),
  matchedKeywords: z.array(z.string()),
}).strict();

export const contextTraceWireSchema = z.object({
  intent: z.enum(['generate', 'continue', 'scene-card', 'rewrite']),
  pov: z.string(),
  navigation: z.object({ actId: z.string().min(1), beatId: z.string().min(1), title: z.string() }).strict().optional(),
  sections: z.array(contextTraceSectionWireSchema),
  triggers: z.array(worldviewTriggerWireSchema),
  totals: z.object({
    characterCount: z.number().int().nonnegative(),
    budget: z.number().int().nonnegative(),
    truncatedSectionCount: z.number().int().nonnegative(),
  }).strict(),
  rewritePromptCharacters: z.number().int().nonnegative(),
  knowledgeVisibleCount: z.number().int().nonnegative(),
  sceneCard: z.object({ title: z.string().min(1), pov: z.string().min(1), wordTarget: z.number().int().positive() }).strict().optional(),
}).strict();
export type ContextTraceShape = z.infer<typeof contextTraceWireSchema>;

const candidateReviewSchema = z.object({
  candidateId: z.string().min(1),
  intent: z.enum(['generate', 'continue', 'scene-card', 'rewrite']),
  target: candidateTargetWireSchema,
  text: z.string().min(1),
  diff: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('new-scene') }).strict(),
    z.object({ kind: z.literal('replace'), before: z.string(), after: z.string() }).strict(),
  ]),
  validation: adjudicationSchema,
  trace: contextTraceWireSchema,
}).strict();
export type CandidateReviewShape = z.infer<typeof candidateReviewSchema>;

const adjudicationOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('rejected'), candidateId: z.string().min(1) }).strict(),
  z.object({ status: z.literal('rewritten'), candidateId: z.string().min(1), superseded: z.string().min(1), candidate: writingCandidateWireSchema }).strict(),
  z.object({ status: z.literal('generation-rejected'), candidateId: z.string().min(1), adjudication: adjudicationSchema }).strict(),
  z.object({ status: z.literal('prewrite-rejected'), candidateId: z.string().min(1), adjudication: adjudicationSchema }).strict(),
  z.object({ status: z.literal('pending-compensation'), candidateId: z.string().min(1), failedStage: z.enum(['c2', 'c1', 'c3', 'c4', 'b2']), afterGeneration: adjudicationSchema }).strict(),
  z.object({
    status: z.literal('written'),
    candidateId: z.string().min(1),
    scene: z.object({ chapterId: z.string().min(1), sceneId: z.string().min(1), index: z.number().int().nonnegative(), content: z.string() }).strict(),
    layers: z.array(z.enum(['c2', 'c1', 'c3', 'c4', 'b2'])),
  }).strict(),
]);
export type WritingAdjudicationOutcomeShape = z.infer<typeof adjudicationOutcomeSchema>;

const structuralPreviewChangeWireSchema = z.object({
  layer: z.enum(['c2', 'c1', 'c3', 'c4', 'b2']),
  kind: z.enum(['add', 'update', 'remove']),
  entityType: z.enum(['state', 'scene', 'character', 'relationship', 'knowledge-entry', 'knowledge-state', 'canon-event', 'world-entry']),
  entityId: z.string().min(1).max(64),
  beforeHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  afterHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  beforeIndex: z.number().int().nonnegative().optional(),
  afterIndex: z.number().int().nonnegative().optional(),
  changedFields: z.array(z.string().min(1).max(100)).max(40),
}).strict();
const structuralPreviewBaselineWireSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('baseline'), generationBaselineId: z.string().min(1).max(64), baselineRevision: z.number().int().positive(),
    detailBeatId: z.string().min(1).max(64), b5ContentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    bindingFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  z.object({ kind: z.literal('no-outline-baseline') }).strict(),
]);

/** Client-safe R18-2 projection; full plan/parser outputs never cross Host. */
export const writingLayerPreviewSchema = z.object({
  candidateId: z.string().min(1).max(128),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  generationBaseline: structuralPreviewBaselineWireSchema,
  changes: structuralPreviewChangeWireSchema.array().max(512),
  validation: adjudicationSchema,
}).strict();
export type WritingLayerPreviewShape = z.infer<typeof writingLayerPreviewSchema>;

// I75：`param`/`writingInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const writingInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelWriting', method, parameters, resultSchema);

export const writingProposeInvocation = writingInvocation('propose', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#writingProposeInput', writingProposeInputSchema)),
  param('settings', undefined, true),
], strictCodec('novel-creation-tool#writingPropose:result', z.object({ candidate: writingCandidateWireSchema }).strict()));
export const writingPreviewInvocation = writingInvocation('preview', [
  param('candidateId', stringCodec),
], strictCodec('novel-creation-tool#writingPreview:result', candidateReviewSchema));
export const writingAdjudicateInvocation = writingInvocation('adjudicate', [
  param('candidateId', stringCodec),
  param('decision', strictCodec('novel-creation-tool#writingDecision', z.enum(['accept', 'reject', 'rewrite']))),
  param('settings', undefined, true),
], strictCodec('novel-creation-tool#writingAdjudicate:result', adjudicationOutcomeSchema));
export const writingProposeAtInvocation = writingInvocation('proposeAt', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#writingProposeAtInput', writingProposeAtInputSchema)),
  param('settings', undefined, true),
], strictCodec('novel-creation-tool#writingProposeAt:result', z.object({ candidate: writingCandidateWireSchema }).strict()));

export const writingPreviewLayersInvocation = writingInvocation('previewLayers', [
  param('candidateId', stringCodec),
], strictCodec('novel-creation-tool#writingPreviewLayers:result', writingLayerPreviewSchema));

export const writingInvocations = [writingProposeInvocation, writingPreviewInvocation, writingAdjudicateInvocation, writingProposeAtInvocation, writingPreviewLayersInvocation] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const writingRemoteContribution = remoteContribution('novel-creation-tool-writing', writingInvocations);
