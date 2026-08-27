import { z } from 'zod';
import { entityIdSchema } from '../schema/base.js';
import { detailBeatSchema } from '../schema/outline.js';
import { writingCandidateSchema } from '../candidate/index.js';
// I77：队列纯 zod wire 合同（运行态/任务态/配置/设置/导航/任务 id）收拢到
// core/queue/schema.ts 单一来源，本模块从纯模块导入并 re-export（既有的
// core/queue/index.js 导出面不变）；task.ts 保留依赖 writingCandidateSchema
// （node:crypto，只进 Host 图）的 queueTaskSchema/journal 部分（架构审查 §6.3
// /§9#3：wire schema 从 core schema 派生，host/remote/queue 只入图纯 schema）。
import {
  DEFAULT_QUEUE_CONFIG,
  queueConfigSchema,
  queueNavigationSchema,
  queueRunStateSchema,
  queueSettingsSchema,
  queueTaskIdSchema,
  queueTaskStatusSchema,
  type QueueConfig,
  type QueueNavigation,
  type QueueRunState,
  type QueueSettings,
  type QueueTaskId,
  type QueueTaskStatus,
} from './schema.js';
export {
  DEFAULT_QUEUE_CONFIG,
  queueConfigSchema,
  queueNavigationSchema,
  queueRunStateSchema,
  queueSettingsSchema,
  queueTaskIdSchema,
  queueTaskStatusSchema,
  type QueueConfig,
  type QueueNavigation,
  type QueueRunState,
  type QueueSettings,
  type QueueTaskId,
  type QueueTaskStatus,
} from './schema.js';

/**
 * I65 可恢复自动生成队列 —— 任务/运行/账本 Schema 与纯派生（design §14.9 / R13-6）。
 *
 * 队列由 Host 持有、按场景卡（B5 detailBeat）范围执行：每个任务对应一张场景卡，
 * 只生成一个绑定 project/chapter/scene 的候选（I62 合同）并停在「待裁决」
 * （candidate-ready），绝不自动接受候选、绝不静默改 B5/C6（R13-6「先候选、
 * 后裁决；队列只编排生成」）。
 *
 * 契约与不变式：
 * - 稳定 ID：`stableSceneId(actId, beatId, cardId)` 是确定性双种子 djb2-64 十六进
 *   制派生（`scene-<hex16>`，≤22 字符且满足 entityIdSchema），同一张场景卡跨重启
 *   恒等 —— 重启恢复据此识别「已生成候选 / 已写正文」的场景，绝不重复追加正文。
 *   `queueTaskId(sceneId)` 同样确定性（`qt-<sceneId>`），任务恢复依赖该稳定 ID。
 * - 任务状态机（`assertTaskTransition` 冻结）：queued → running → candidate-ready；
 *   running 可在取消时回到 queued（零写，重跑安全）；candidate-ready 经 retry 回到
 *   queued（作者拒绝后可重生成，旧候选不落地）；失败按 retry policy：attempts >
 *   maxRetries 才永久 failed；failed 经 retry 回到 queued；queued 可取消（cancelled）；
 *   candidate-ready 在 Host 核对目标场景已写正文后转 completed（不重复生成）。
 * - 预算：`countProseUnits` 是确定性「写作单位」计数（CJK 字符 + 拉丁空格分词），
 *   队列用它累计 consumedUnits；到达 wordBudget 后不再启动新任务（预算不超限）。
 * - 持久化：`queueJournalSchema` 是队列账本的严格 wire 合同（项目根下
 *   queue-journal.yaml），candidate-ready 任务内联其候选正文与生成 settings ——
 *   重启后可把候选原样 rehydrate 回 I63 裁决服务（无重复正文、可继续审阅裁决）。
 * - 本模块保持纯 zod/纯函数 + 复用既有 schema（detailBeatSchema / 候选合同），
 *   不持有任何 live object；candidate 依赖 node:crypto 只进 Host 图（I63 同）。
 */

/** 单任务持久化记录（candidate-ready 时内联候选 + settings，供重启 rehydrate）。 */
export const queueTaskSchema = z.object({
  id: queueTaskIdSchema,
  projectId: entityIdSchema,
  /** 目标章节（I65 与 I63 一致固定为 chapter-1；场景 id 由场景卡稳定派生）。 */
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  /** 场景卡来源路径（act/beat/card），可追溯 + 稳定 scene id 的输入。 */
  actId: entityIdSchema,
  beatId: entityIdSchema,
  cardId: entityIdSchema,
  /** 场景卡（prompt 重建：I43 buildChapterWritingPrompt 只消费 card + navigation）。 */
  card: detailBeatSchema,
  navigation: queueNavigationSchema,
  /** I65 队列只编排 scene-card 意图（每任务 = 一张场景卡）。 */
  intent: z.literal('scene-card'),
  status: queueTaskStatusSchema,
  candidateId: z.string().min(1).nullable(),
  /** 累计运行次数（含失败；retry 归零；maxRetries 据此裁决永久失败）。 */
  attempts: z.number().int().nonnegative(),
  error: z.string().nullable(),
  /** 该任务候选消耗的写作单位（预算累计；未生成时为 null）。 */
  budgetUnits: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  /** candidate-ready 时内联候选（重启恢复的持久化正文；其余状态为 null）。 */
  candidate: writingCandidateSchema.nullable(),
  settings: queueSettingsSchema.nullable(),
}).strict();
export type QueueTaskData = z.infer<typeof queueTaskSchema>;

/** 项目队列账本（一个项目一个 queue-journal.yaml）。 */
export const queueJournalSchema = z.object({
  projectId: entityIdSchema,
  runState: queueRunStateSchema,
  config: queueConfigSchema,
  /** 已生成候选累计消耗的写作单位（预算判定基准）。 */
  consumedUnits: z.number().int().nonnegative(),
  tasks: z.array(queueTaskSchema),
  updatedAt: z.string().datetime(),
}).strict();
export type QueueJournalData = z.infer<typeof queueJournalSchema>;

/** 32bit djb2 变体（纯函数；避免在可被共享导入图引用的模块引入 node:crypto）。 */
function hash32(input: string, seed: number): number {
  let hash = seed;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/** CJK 表意字符判定（不含 CJK 标点/全角符号，标点不计入写作单位）。 */
function isCjkIdeograph(code: number): boolean {
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
}

/**
 * 场景稳定 ID：`scene-` + (actId|beatId|cardId) 的双种子 64bit hex。
 * 同一张场景卡跨重启恒等；≤ 22 字符且满足 entityIdSchema（chapter 内唯一由
 * act+beat+card 三元组保证；enqueue 时对重复 sceneId fail-closed）。
 */
export function stableSceneId(actId: string, beatId: string, cardId: string): string {
  entityIdSchema.parse(actId);
  entityIdSchema.parse(beatId);
  entityIdSchema.parse(cardId);
  const key = [actId, beatId, cardId].join('|');
  const a = hash32(key, 5381).toString(16).padStart(8, '0');
  const b = hash32(key, 52711).toString(16).padStart(8, '0');
  const sceneId = `scene-${a}${b}`;
  entityIdSchema.parse(sceneId);
  return sceneId;
}

/** 任务稳定 ID：由场景稳定 ID 确定性派生（`qt-<sceneId>`），重启恢复锚点。 */
export function queueTaskId(sceneId: string): string {
  entityIdSchema.parse(sceneId);
  const taskId = `qt-${sceneId}`;
  queueTaskIdSchema.parse(taskId);
  return taskId;
}

/**
 * 确定性写作单位计数：CJK 表意字符逐个计 1，非 CJK 部分按空白分词计 1
 * （CJK 标点/全角符号不计入）。用于 word/token budget（中文正文无空格，
 * `split(/\s+/)` 会把整段计为 1 词，故按字符/分词混合计数；无第三方依赖、无 LLM）。
 */
export function countProseUnits(text: string): number {
  let units = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (isCjkIdeograph(code)) units += 1;
  }
  // 去除 CJK 表意 + CJK 标点/全角符号后再做拉丁分词（标点不产生单位）。
  const latin = text.replace(/[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/g, ' ').trim();
  if (latin.length > 0) units += latin.split(/\s+/).length;
  return units;
}

/** 任务状态机的合法迁移（冻结；非法迁移即 bug，fail-closed）。 */
const QUEUE_TASK_TRANSITIONS: Readonly<Record<QueueTaskStatus, readonly QueueTaskStatus[]>> = {
  queued: ['running', 'cancelled'],
  running: ['queued', 'candidate-ready', 'failed'],
  'candidate-ready': ['completed', 'queued'],
  failed: ['queued'],
  cancelled: [],
  completed: [],
};

/** 校验状态迁移是否合法；非法抛错（消费方绝不静默推进）。 */
export function assertTaskTransition(from: QueueTaskStatus, to: QueueTaskStatus): void {
  if (!QUEUE_TASK_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid queue task transition: ${from} → ${to}`);
  }
}

/** 终态判定（取消/完成；不再参与排队与恢复）。 */
export function isTerminalTaskStatus(status: QueueTaskStatus): boolean {
  return status === 'cancelled' || status === 'completed';
}
