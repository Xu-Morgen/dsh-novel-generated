import { z } from 'zod';
import { entityIdSchema } from '../schema/base.js';
import { detailBeatSchema, type DetailBeat } from '../schema/outline.js';
import { writingCandidateSchema } from '../candidate/index.js';
import { candidateTargetSnapshotSchema } from '../schema/candidate-target.js';
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

const queueTaskBaseShape = {
  id: queueTaskIdSchema,
  projectId: entityIdSchema,
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  actId: entityIdSchema,
  beatId: entityIdSchema,
  cardId: entityIdSchema,
  card: detailBeatSchema,
  navigation: queueNavigationSchema,
  intent: z.literal('scene-card'),
  status: queueTaskStatusSchema,
  candidateId: z.string().min(1).nullable(),
  attempts: z.number().int().nonnegative(),
  error: z.string().nullable(),
  budgetUnits: z.number().int().nonnegative().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  candidate: writingCandidateSchema.nullable(),
  settings: queueSettingsSchema.nullable(),
};

/** I105 current task contract: every row freezes all three canonical owners. */
export const queueTaskSchema = z.object({
  version: z.literal(2),
  ...queueTaskBaseShape,
  targetSnapshot: candidateTargetSnapshotSchema,
}).strict();
export type QueueTaskData = z.infer<typeof queueTaskSchema>;

/** Explicit pre-I105 disk shape; accepted only by the migration seam. */
export const legacyQueueTaskSchema = z.object(queueTaskBaseShape).strict();
export type LegacyQueueTaskData = z.infer<typeof legacyQueueTaskSchema>;
export const storedQueueTaskSchema = z.union([queueTaskSchema, legacyQueueTaskSchema.extend({ version: z.literal(1) }).strict()]);
export type StoredQueueTaskData = z.infer<typeof storedQueueTaskSchema>;

/** I105 current project journal contract. */
export const queueJournalSchema = z.object({
  version: z.literal(2),
  projectId: entityIdSchema,
  runState: queueRunStateSchema,
  config: queueConfigSchema,
  consumedUnits: z.number().int().nonnegative(),
  tasks: z.array(storedQueueTaskSchema),
  updatedAt: z.string().datetime(),
}).strict();
export type QueueJournalData = z.infer<typeof queueJournalSchema>;

/** Fresh canonical owner resolution used by the queue's atomic refresh seam. */
export interface QueueTaskRefresh {
  readonly sourceTaskId: string;
  readonly chapterId: string;
  readonly sceneId: string;
  readonly actId: string;
  readonly beatId: string;
  readonly card: DetailBeat;
  readonly navigation: QueueNavigation;
  readonly targetSnapshot: QueueTaskData['targetSnapshot'];
  readonly occupied: boolean;
  readonly updatedAt: string;
}

/**
 * Atomically refresh same-card rows and append new rows against one prospective
 * journal. Current rows are the normal caller; explicit startAt may also upgrade
 * a failed legacy row. Every refreshed row is rebuilt from a fresh canonical
 * resolution, resets generation state, and preserves the taskId(sceneId)
 * invariant. The returned replacement is produced only after journal schema
 * and project-wide card/id/target uniqueness validation succeed.
 */
export function refreshQueueJournal(
  journal: QueueJournalData,
  refreshes: readonly QueueTaskRefresh[],
  additions: readonly QueueTaskData[] = [],
): QueueJournalData {
  const bySource = new Map<string, QueueTaskRefresh>();
  for (const refresh of refreshes) {
    if (bySource.has(refresh.sourceTaskId)) throw new Error(`Duplicate queue refresh source: ${refresh.sourceTaskId}`);
    bySource.set(refresh.sourceTaskId, refresh);
  }
  const found = new Set<string>();
  const tasks = journal.tasks.map((stored): StoredQueueTaskData => {
    const refresh = bySource.get(stored.id);
    if (refresh === undefined) return stored;
    found.add(stored.id);
    if (stored.cardId !== refresh.card.id) throw new Error(`Queue refresh must preserve card identity: ${stored.cardId}`);
    if (refresh.targetSnapshot.chapterId !== refresh.chapterId
      || refresh.targetSnapshot.sceneId !== refresh.sceneId
      || refresh.targetSnapshot.detailBeatId !== stored.cardId) {
      throw new Error(`Queue refresh target snapshot mismatch: ${stored.cardId}`);
    }
    return queueTaskSchema.parse({
      ...stored,
      version: 2,
      id: queueTaskId(refresh.sceneId),
      chapterId: refresh.chapterId,
      sceneId: refresh.sceneId,
      actId: refresh.actId,
      beatId: refresh.beatId,
      cardId: refresh.card.id,
      card: { ...refresh.card },
      navigation: { ...refresh.navigation },
      status: refresh.occupied ? 'completed' : 'queued',
      candidateId: null,
      attempts: 0,
      error: null,
      budgetUnits: null,
      candidate: null,
      settings: null,
      targetSnapshot: refresh.targetSnapshot,
      updatedAt: refresh.updatedAt,
    });
  });
  for (const sourceTaskId of bySource.keys()) {
    if (!found.has(sourceTaskId)) throw new Error(`Queue refresh source not found: ${sourceTaskId}`);
  }
  tasks.push(...additions.map((task) => queueTaskSchema.parse(task)));

  const cards = new Map<string, string>();
  const ids = new Set<string>();
  const targets = new Map<string, string>();
  for (const task of tasks) {
    const priorCard = cards.get(task.cardId);
    if (priorCard !== undefined) throw new Error(`Queue card already claimed by ${priorCard}: ${task.cardId}`);
    cards.set(task.cardId, task.id);
    if (ids.has(task.id)) throw new Error(`Queue task id collision: ${task.id}`);
    ids.add(task.id);
    const targetKey = `${task.chapterId}\u0000${task.sceneId}`;
    const priorTarget = targets.get(targetKey);
    if (priorTarget !== undefined) throw new Error(`Queue target already claimed by ${priorTarget}: ${task.chapterId}/${task.sceneId}`);
    targets.set(targetKey, task.cardId);
  }
  return queueJournalSchema.parse({ ...journal, tasks });
}

/** Explicit pre-I105 journal shape, never used for current writes. */
export const legacyQueueJournalSchema = z.object({
  projectId: entityIdSchema,
  runState: queueRunStateSchema,
  config: queueConfigSchema,
  consumedUnits: z.number().int().nonnegative(),
  tasks: z.array(legacyQueueTaskSchema),
  updatedAt: z.string().datetime(),
}).strict();
export type LegacyQueueJournalData = z.infer<typeof legacyQueueJournalSchema>;

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
  queued: ['running', 'failed', 'cancelled', 'completed'],
  running: ['queued', 'candidate-ready', 'failed'],
  'candidate-ready': ['completed', 'queued', 'failed'],
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
