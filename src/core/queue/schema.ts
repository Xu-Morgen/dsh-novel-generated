import { z } from 'zod';
import { entityIdSchema } from '../schema/base.js';
import { GenerationSettingsSchema } from '../schema/generation-settings.js';

/**
 * I65 可恢复自动生成队列 —— 纯 zod wire 合同（design §14.9 / R13-6）。
 *
 * 本模块是队列**持久化/领域 schema 的纯形状单一来源**：只含 zod 与纯 schema，
 * 不引入 node 内置模块，也不依赖 `core/candidate`（其 node:crypto 只进 Host 图）。
 * `core/queue/task.ts` 从本模块导入并 re-export，因此 `core/queue/index.js` 的
 * 既有导出面不变；`host/remote/queue.ts`（Client bundle 会经 shared.ts 解析本文件
 * 完整导入图）只入图本模块，不得导入 task.ts/journal.ts（node:fs/node:crypto）。
 *
 * 契约与不变式（语义见 core/queue/task.ts 各 schema 的 JSDoc）：
 * - `queueRunStateSchema` / `queueTaskStatusSchema` / `queueConfigSchema` 是
 *   运行态/任务态/配置的 canonical 定义，wire 层与账本层都以本模块为单一来源；
 * - `queueTaskIdSchema` 是任务稳定 id 的 wire 合同（`qt-<sceneId>` 前缀）；
 * - `queueSettingsSchema` 是生成设置的最小持久化投影（modelRef/credentialRef 是
 *   引用名非密钥）；
 * - `queueNavigationSchema` 是 OutlineNavigation 的持久化 wire 形状（核心域形状
 *   见 core/schema/outline-progress.ts OutlineNavigation 接口，本模块为 zod 化
 *   wire 合同，I73/I77 的时间线/进度/队列导航共用同一形状来源）。
 */
export const queueTaskIdSchema = z.string().regex(/^qt-[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/);
export type QueueTaskId = z.infer<typeof queueTaskIdSchema>;

/** 队列运行态（一次 run 的生命周期；持久化到账本）。 */
export const queueRunStateSchema = z.enum(['idle', 'running', 'paused', 'stopped-hard', 'stopped-soft', 'budget-exhausted', 'completed']);
export type QueueRunState = z.infer<typeof queueRunStateSchema>;

/** 单任务状态（状态机见 core/queue/task.ts assertTaskTransition）。 */
export const queueTaskStatusSchema = z.enum(['queued', 'running', 'candidate-ready', 'failed', 'cancelled', 'completed']);
export type QueueTaskStatus = z.infer<typeof queueTaskStatusSchema>;

/** 生成设置的最小持久化投影（modelRef/credentialRef 是引用名，非密钥；I65 恢复用）。 */
export const queueSettingsSchema = GenerationSettingsSchema;
export type QueueSettings = z.infer<typeof queueSettingsSchema>;

/** OutlineNavigation 的持久化 wire 形状（队列自有投影，不复制领域 truth）。 */
export const queueNavigationSchema = z.object({
  actId: entityIdSchema,
  beatId: entityIdSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  prerequisites: z.array(z.string().trim().min(1)),
  prerequisitesMet: z.boolean(),
  instruction: z.string().trim().min(1),
  deviationIds: z.array(z.string().trim().min(1)),
}).strict();
export type QueueNavigation = z.infer<typeof queueNavigationSchema>;

/** 队列运行配置：wordBudget（null = 不限）/ maxRetries（首次之后的允许重试数）/ 停止策略。 */
export const queueConfigSchema = z.object({
  wordBudget: z.number().int().positive().nullable(),
  maxRetries: z.number().int().nonnegative(),
  stopOnSoftWarnings: z.boolean(),
}).strict();
export type QueueConfig = z.infer<typeof queueConfigSchema>;

export const DEFAULT_QUEUE_CONFIG: QueueConfig = Object.freeze({ wordBudget: null, maxRetries: 0, stopOnSoftWarnings: false });
