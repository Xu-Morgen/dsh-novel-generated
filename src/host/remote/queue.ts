import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
// I77：运行态/任务态/配置的 wire schema 从 core/queue/schema.ts 派生（纯 zod
// 模块；task.ts/journal.ts 依赖 node:fs/node:crypto 不得入 Client bundle 图，
// 故 I77 把纯合同收拢到 schema.ts —— 架构审查 §6.3/§9#3）。
import {
  queueConfigSchema,
  queueRunStateSchema,
  queueTaskStatusSchema,
} from '../../core/queue/schema.js';

/**
 * I65 可恢复自动生成队列 Remote（design §14.9「可恢复自动生成队列」/ R13-6）。
 *
 * `novelQueue` 是 Client 队列 UI 的唯一读写面：
 * - `status`：队列运行态 + 任务投影（最小 owned JSON；无候选正文、无 live object）；
 * - `start`：按场景卡范围入队 + 配置（wordBudget / maxRetries / stopOnSoftWarnings）
 *   并开始/继续 run（活动 run 时只合并范围与配置）；
 * - `pause` / `resume` / `cancel`：暂停 / 继续 / 取消（幂等）；
 * - `retry`：failed/candidate-ready 任务归零重排队；`cancelTask`：取消单个排队任务；
 * - `recover`：显式恢复（对账 + 候选 rehydrate；status/start 已惰性触发）。
 *
 * 不变式：所有参数/结果都是最小 owned JSON；Client 不持有任何领域真相与文件路径。
 * 本模块只依赖 zod 与纯 schema（Client bundle 会经 shared.ts 解析本文件完整导入图；
 * core/queue 依赖 node:fs/node:crypto，不得入图）。wire 形状与 host/queue-service
 * 投影对齐（strict），由 Host 服务端再经 core 合同严格复验。
 */

export const queueRunStateWireSchema = queueRunStateSchema;
export const queueTaskStatusWireSchema = queueTaskStatusSchema;

export const queueConfigWireSchema = queueConfigSchema;

export const queueTaskViewWireSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  chapterId: z.string().min(1),
  cardTitle: z.string().min(1),
  cardPov: z.string().min(1),
  status: queueTaskStatusWireSchema,
  candidateId: z.string().min(1).nullable(),
  attempts: z.number().int().nonnegative(),
  error: z.string().nullable(),
  budgetUnits: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();

export const queueStatusWireSchema = z.object({
  projectId: z.string().min(1),
  runState: queueRunStateWireSchema,
  config: queueConfigWireSchema,
  consumedUnits: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
  error: z.string().nullable(),
  tasks: z.array(queueTaskViewWireSchema),
}).strict();

export const queueStartInputSchema = z.object({
  cardIds: z.array(z.string().min(1)).optional(),
  wordBudget: z.number().int().positive().nullable().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  stopOnSoftWarnings: z.boolean().optional(),
}).strict();

export const queueStartAtInputSchema = queueStartInputSchema.extend({
  chapterId: z.string().min(1),
}).strict();

// I75：`param`/`queueInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const queueInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelQueue', method, parameters, resultSchema);

export const queueStatusInvocation = queueInvocation('status', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelQueue:status', queueStatusWireSchema));
export const queueStartInvocation = queueInvocation('start', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelQueue:startInput', queueStartInputSchema), true),
], strictCodec('novel-creation-tool#novelQueue:start', queueStatusWireSchema));
export const queueStartAtInvocation = queueInvocation('startAt', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelQueue:startAtInput', queueStartAtInputSchema)),
], strictCodec('novel-creation-tool#novelQueue:startAt', queueStatusWireSchema));
export const queuePauseInvocation = queueInvocation('pause', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelQueue:pause', queueStatusWireSchema));
export const queueResumeInvocation = queueInvocation('resume', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelQueue:resume', queueStatusWireSchema));
export const queueCancelInvocation = queueInvocation('cancel', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelQueue:cancel', queueStatusWireSchema));
export const queueRetryInvocation = queueInvocation('retry', [
  param('projectId', stringCodec),
  param('taskId', stringCodec),
], strictCodec('novel-creation-tool#novelQueue:retry', queueStatusWireSchema));
export const queueCancelTaskInvocation = queueInvocation('cancelTask', [
  param('projectId', stringCodec),
  param('taskId', stringCodec),
], strictCodec('novel-creation-tool#novelQueue:cancelTask', queueStatusWireSchema));
export const queueRecoverInvocation = queueInvocation('recover', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelQueue:recover', queueStatusWireSchema));

export const queueInvocations = [
  queueStatusInvocation,
  queueStartInvocation,
  queueStartAtInvocation,
  queuePauseInvocation,
  queueResumeInvocation,
  queueCancelInvocation,
  queueRetryInvocation,
  queueCancelTaskInvocation,
  queueRecoverInvocation,
] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const queueRemoteContribution = remoteContribution('novel-creation-tool-queue', queueInvocations);
