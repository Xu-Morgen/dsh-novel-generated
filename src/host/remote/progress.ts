import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
// I77：wire schema 从 core schema 派生（架构审查 §6.3/§9#3）：偏差（core/schema/
// outline-progress）、导航（core/queue/schema 的 queueNavigationSchema ——
// OutlineNavigation 的持久化 wire 形状）、灵感方向（core/schema/inspiration）。
// 三个模块都是纯 zod，Client bundle 经 shared.ts 解析本文件完整导入图可安全入图。
import { outlineDeviationSchema } from '../../core/schema/outline-progress.js';
import { queueNavigationSchema } from '../../core/queue/schema.js';
import { directionSchema } from '../../core/schema/inspiration.js';

/**
 * I68 C6 进度与灵感方向落地 Remote（design §14.10「C6 与灵感落地」/ R14-3）。
 *
 * `novelOutlineProgress` 是 Client 进度/灵感面板的唯一读写面：
 * - `projection`：当前幕/节/场景卡完成状态 + 已完成节 + 偏差 + 导航指令 + 一致性
 *   判定（只读零写；「当前导航与 detailBeat 状态一致」由 consistency 派生）；
 * - `recordDeviation` / `reconcileDeviation`：作者记录/调和结构偏差（只写 C6）；
 * - `inspire`：灵感时刻（LLM 产 2–3 个可区分方向，零写，prompt 可选）；
 * - `select`：选定方向 → I11 Gate pending（未确认零写）；
 * - `apply`：Gate 确认后只改授权的 B5（logline/themes）与 C6（偏差），重复 apply
 *   幂等；`reject`：Gate 拒绝零写；`pending`：待确认方向（重载一致）；
 * - `audit`：该作品全部 inspiration.apply 裁决审计记录（accepted/rejected）。
 *
 * 不变式：所有参数/结果都是最小 owned JSON；Client 不持有任何领域真相与文件
 * 路径。本模块只依赖 zod 与纯 schema（Client bundle 会经 shared.ts 解析本文件
 * 完整导入图；core/outline/projection 与 host 服务是 Host-only 校验/写回逻辑，
 * 不得入图）。wire 形状与 host/progress-inspiration-service 投影对齐（strict），
 * 由 Host 服务端再经 core 合同严格复验。
 */

export const progressSceneStatusWireSchema = z.enum(['planned', 'writing', 'done']);

export const progressSceneWireSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  pov: z.string().min(1),
  wordTarget: z.number().int().positive(),
  status: progressSceneStatusWireSchema,
}).strict();

export const progressBeatWireSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  optional: z.boolean(),
  completed: z.boolean(),
  current: z.boolean(),
  prerequisitesMet: z.boolean(),
  sceneCards: z.array(progressSceneWireSchema),
  doneScenes: z.number().int().nonnegative(),
  totalScenes: z.number().int().nonnegative(),
}).strict();

export const progressActWireSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  title: z.string().min(1),
  beats: z.array(progressBeatWireSchema),
}).strict();

export const progressDeviationWireSchema = outlineDeviationSchema;

export const progressNavigationWireSchema = queueNavigationSchema;

export const progressConsistencyWireSchema = z.object({
  currentBeatCompleted: z.boolean(),
  completedBeatsWithOpenScenes: z.array(z.string()),
  navigationTargetAllScenesDone: z.boolean(),
}).strict();

export const progressProjectionWireSchema = z.object({
  outlineId: z.string().min(1),
  acts: z.array(progressActWireSchema),
  currentAct: z.string().min(1),
  currentBeat: z.string().min(1),
  completedBeats: z.array(z.string()),
  deviations: z.array(progressDeviationWireSchema),
  tensionLevel: z.number().finite().min(0).max(100),
  navigation: progressNavigationWireSchema,
  consistency: progressConsistencyWireSchema,
}).strict();

/** 灵感方向（core/schema/inspiration.directionSchema 单一来源；strict 复验由 Host 服务端执行）。 */
export const progressDirectionWireSchema = directionSchema;

/** select 入参：作者选定的方向（Host 复验后持久化进 Gate payload）。 */
export const progressSelectInputWireSchema = z.object({
  direction: progressDirectionWireSchema,
}).strict();

/** recordDeviation 入参：planned/actual/reason（id 可选，Host 生成稳定 id）。 */
export const progressDeviationRecordInputWireSchema = z.object({
  planned: z.string().trim().min(1),
  actual: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  id: z.string().trim().min(1).max(64).optional(),
}).strict();

export const progressInspireOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  directions: z.array(progressDirectionWireSchema),
}).strict();

export const progressSelectOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  proposalId: z.string().min(1),
  direction: progressDirectionWireSchema,
  status: z.literal('pending'),
}).strict();

export const progressApplyOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  proposalId: z.string().min(1),
  applied: z.boolean(),
  projection: progressProjectionWireSchema,
  audit: z.array(z.object({
    proposalId: z.string().min(1),
    status: z.enum(['accepted', 'rejected']),
    direction: progressDirectionWireSchema,
  }).strict()),
}).strict();

export const progressRejectOutcomeWireSchema = z.object({
  projectId: z.string().min(1),
  proposalId: z.string().min(1),
  status: z.literal('rejected'),
}).strict();

export const progressPendingProposalWireSchema = z.object({
  proposalId: z.string().min(1),
  direction: progressDirectionWireSchema,
  status: z.literal('pending'),
}).strict();

export const progressPendingOutcomeWireSchema = z.object({
  proposals: z.array(progressPendingProposalWireSchema),
}).strict();

export const progressAuditRecordWireSchema = z.object({
  proposalId: z.string().min(1),
  status: z.enum(['accepted', 'rejected']),
  direction: progressDirectionWireSchema,
}).strict();

export const progressAuditOutcomeWireSchema = z.object({
  records: z.array(progressAuditRecordWireSchema),
}).strict();

// I75：`param`/`progressInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const progressInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelOutlineProgress', method, parameters, resultSchema);

const projectionResult = strictCodec('novel-creation-tool#novelOutlineProgress:projection', progressProjectionWireSchema);

export const progressProjectionInvocation = progressInvocation('projection', [
  param('projectId', stringCodec),
], projectionResult);
export const progressRecordDeviationInvocation = progressInvocation('recordDeviation', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelOutlineProgress:recordDeviationInput', progressDeviationRecordInputWireSchema)),
], projectionResult);
export const progressReconcileDeviationInvocation = progressInvocation('reconcileDeviation', [
  param('projectId', stringCodec),
  param('deviationId', stringCodec),
], projectionResult);
export const progressInspireInvocation = progressInvocation('inspire', [
  param('projectId', stringCodec),
  param('prompt', stringCodec, true),
], strictCodec('novel-creation-tool#novelOutlineProgress:inspire', progressInspireOutcomeWireSchema));
export const progressSelectInvocation = progressInvocation('select', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelOutlineProgress:selectInput', progressSelectInputWireSchema)),
], strictCodec('novel-creation-tool#novelOutlineProgress:select', progressSelectOutcomeWireSchema));
export const progressApplyInvocation = progressInvocation('apply', [
  param('projectId', stringCodec),
  param('proposalId', stringCodec),
], strictCodec('novel-creation-tool#novelOutlineProgress:apply', progressApplyOutcomeWireSchema));
export const progressRejectInvocation = progressInvocation('reject', [
  param('projectId', stringCodec),
  param('proposalId', stringCodec),
], strictCodec('novel-creation-tool#novelOutlineProgress:reject', progressRejectOutcomeWireSchema));
export const progressPendingInvocation = progressInvocation('pending', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelOutlineProgress:pending', progressPendingOutcomeWireSchema));
export const progressAuditInvocation = progressInvocation('audit', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelOutlineProgress:audit', progressAuditOutcomeWireSchema));

export const progressInvocations = [
  progressProjectionInvocation,
  progressRecordDeviationInvocation,
  progressReconcileDeviationInvocation,
  progressInspireInvocation,
  progressSelectInvocation,
  progressApplyInvocation,
  progressRejectInvocation,
  progressPendingInvocation,
  progressAuditInvocation,
] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const progressRemoteContribution = remoteContribution('novel-creation-tool-progress', progressInvocations);
