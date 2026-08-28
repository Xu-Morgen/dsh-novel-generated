import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { jsonCodec, strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
// I77：运行态/任务态枚举从 core/queue/schema.ts 派生（I72 统计口径与 I65 队列
// 同一状态源；纯 zod 模块可入 Client bundle 图 —— 架构审查 §6.3/§9#3）。
import { queueRunStateSchema, queueTaskStatusSchema } from '../../core/queue/schema.js';

/**
 * I72 写作进度面板 Remote（design §14.10「写作进度」/ R14-7）。
 *
 * `novelStatistics` 是 Client 进度面板的唯一读写面：
 * - `rebuild`：从 C5/B5/C6/I65 账本 live source-of-truth 重建派生统计（幂等覆盖，
 *   零写结构层）；
 * - `drop`：删除派生统计（删除后可重建；统计不是第二真相）；
 * - `stats`：统计存在性 + 分项计数（可观测性）；
 * - `overview`：进度概览聚合（章节字数/目标完成度/场景卡状态/POV 分布/队列摘要/
 *   有界章节行 + 幕节筛选树；空作品 empty 标记）；
 * - `chapterDetail`：单章节场景字数明细；
 * - `sceneCards`：场景卡统计（act/beat/status 筛选，有界）；
 * - `tasks`：任务历史（status 筛选，有界）。
 *
 * 不变式：所有参数/结果都是最小 owned JSON —— 概览/行均不含完整正文/大纲/
 * live object，绝不携带文件路径；统计口径（字数/场景卡联动）由 Host 侧
 * core/statistics 保证，Client 不做任何领域计算。本模块只依赖 zod 与纯 schema
 * （Client bundle 会经 shared.ts 解析本文件完整导入图，core/statistics 依赖
 * node:fs，不得入图）。
 */

export const statisticsStatsWireSchema = z.object({
  indexExists: z.boolean(),
  builtAt: z.string().min(1).optional(),
  counts: z.object({
    chapters: z.number().int().nonnegative(),
    scenes: z.number().int().nonnegative(),
    cards: z.number().int().nonnegative(),
    tasks: z.number().int().nonnegative(),
  }).strict(),
}).strict();
export type StatisticsStatsShape = z.infer<typeof statisticsStatsWireSchema>;

export const povWordStatWireSchema = z.object({
  pov: z.string().min(1),
  chapters: z.number().int().nonnegative(),
  scenes: z.number().int().nonnegative(),
  units: z.number().int().nonnegative(),
  chars: z.number().int().nonnegative(),
}).strict();

export const cardPovStatWireSchema = z.object({
  pov: z.string().min(1),
  cards: z.number().int().nonnegative(),
  wordTarget: z.number().int().nonnegative(),
}).strict();

const taskStatusCountsWireSchema = z.object({
  queued: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  'candidate-ready': z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
}).strict();

export const queueSummaryWireSchema = z.object({
  runState: queueRunStateSchema,
  consumedUnits: z.number().int().nonnegative(),
  taskCounts: taskStatusCountsWireSchema,
  totalTasks: z.number().int().nonnegative(),
}).strict();

export const chapterSummaryRowWireSchema = z.object({
  chapterId: z.string().min(1),
  index: z.number().int().positive(),
  title: z.string(),
  pov: z.string().min(1),
  status: z.enum(['draft', 'revised', 'canon']),
  sceneCount: z.number().int().nonnegative(),
  units: z.number().int().nonnegative(),
  chars: z.number().int().nonnegative(),
}).strict();

export const actFilterNodeWireSchema = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  title: z.string(),
  beats: z.array(z.object({ id: z.string().min(1), title: z.string() }).strict()),
}).strict();

export const statisticsOverviewWireSchema = z.object({
  empty: z.boolean(),
  chapterCount: z.number().int().nonnegative(),
  sceneCount: z.number().int().nonnegative(),
  totalUnits: z.number().int().nonnegative(),
  totalChars: z.number().int().nonnegative(),
  cardCount: z.number().int().nonnegative(),
  totalWordTarget: z.number().int().nonnegative(),
  cardWrittenUnits: z.number().int().nonnegative(),
  completionRatio: z.number().min(0).max(1),
  beatCount: z.number().int().nonnegative(),
  completedBeatCount: z.number().int().nonnegative(),
  beatCompletionRatio: z.number().min(0).max(1),
  currentBeat: z.string().nullable(),
  cardStatusCounts: z.object({ planned: z.number().int().nonnegative(), writing: z.number().int().nonnegative(), done: z.number().int().nonnegative() }).strict(),
  povStats: z.array(povWordStatWireSchema),
  cardPovStats: z.array(cardPovStatWireSchema),
  queue: queueSummaryWireSchema,
  chapters: z.array(chapterSummaryRowWireSchema),
  acts: z.array(actFilterNodeWireSchema),
}).strict();
export type StatisticsOverviewShape = z.infer<typeof statisticsOverviewWireSchema>;

export const sceneCardWireSchema = z.object({
  actId: z.string().min(1),
  actIndex: z.number().int().nonnegative(),
  actTitle: z.string(),
  beatId: z.string().min(1),
  beatTitle: z.string(),
  cardId: z.string().min(1),
  title: z.string(),
  pov: z.string().min(1),
  wordTarget: z.number().int().positive(),
  status: z.enum(['planned', 'writing', 'done']),
  sceneId: z.string().min(1),
  writtenUnits: z.number().int().nonnegative(),
  completionRatio: z.number().min(0).max(1),
}).strict();
export type SceneCardShape = z.infer<typeof sceneCardWireSchema>;

export const sceneCardsResultWireSchema = z.object({
  total: z.number().int().nonnegative(),
  cards: z.array(sceneCardWireSchema),
}).strict();
export type SceneCardsResultShape = z.infer<typeof sceneCardsResultWireSchema>;

export const taskHistoryRowWireSchema = z.object({
  id: z.string().min(1),
  sceneId: z.string().min(1),
  chapterId: z.string().min(1),
  cardTitle: z.string(),
  cardPov: z.string().min(1),
  status: queueTaskStatusSchema,
  attempts: z.number().int().nonnegative(),
  budgetUnits: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).strict();
export type TaskHistoryRowShape = z.infer<typeof taskHistoryRowWireSchema>;

export const tasksResultWireSchema = z.object({
  total: z.number().int().nonnegative(),
  tasks: z.array(taskHistoryRowWireSchema),
}).strict();
export type TasksResultShape = z.infer<typeof tasksResultWireSchema>;

export const sceneWordStatsWireSchema = z.object({
  sceneId: z.string().min(1),
  index: z.number().int().nonnegative(),
  summary: z.string(),
  units: z.number().int().nonnegative(),
  chars: z.number().int().nonnegative(),
}).strict();

export const chapterDetailWireSchema = z.object({
  chapter: z.object({
    chapterId: z.string().min(1),
    index: z.number().int().positive(),
    title: z.string(),
    pov: z.string().min(1),
    status: z.enum(['draft', 'revised', 'canon']),
    sceneCount: z.number().int().nonnegative(),
    units: z.number().int().nonnegative(),
    chars: z.number().int().nonnegative(),
    scenes: z.array(sceneWordStatsWireSchema),
  }).strict(),
}).strict();
export type ChapterDetailShape = z.infer<typeof chapterDetailWireSchema>;

// I75：`param`/`statisticsInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const statisticsInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelStatistics', method, parameters, resultSchema);

const projectParameter = param('projectId', stringCodec);
const chapterIdParameter = param('chapterId', stringCodec);
// I86：sceneCards/tasks 的可选筛选参数必须用 jsonCodec —— 真实 DSH 客户端绑定器
// （dsh-api-gateway/lib/client.js）按位置逐个 strict parse 实参：jsonCodec(z.unknown)
// 放行显式 `undefined`（丢弃后 Host 接受缺省位），string/number strict codec 会拒绝
// undefined（`rejected "actId"`）。Host 适配闭包（index.ts）仍用 String()/Number()
// 收敛为 domain filter，筛选语义不变。
const actIdParameter = param('actId', jsonCodec, true);
const beatIdParameter = param('beatId', jsonCodec, true);
const cardStatusParameter = param('status', jsonCodec, true);
const taskStatusParameter = param('status', jsonCodec, true);
const limitParameter = param('limit', jsonCodec, true);

export const statisticsRebuildInvocation = statisticsInvocation('rebuild', [projectParameter], strictCodec('novel-creation-tool#novelStatistics:rebuild', statisticsStatsWireSchema));
export const statisticsDropInvocation = statisticsInvocation('drop', [projectParameter], strictCodec('novel-creation-tool#novelStatistics:drop', statisticsStatsWireSchema));
export const statisticsStatsInvocation = statisticsInvocation('stats', [projectParameter], strictCodec('novel-creation-tool#novelStatistics:stats', statisticsStatsWireSchema));
export const statisticsOverviewInvocation = statisticsInvocation('overview', [projectParameter], strictCodec('novel-creation-tool#novelStatistics:overview', statisticsOverviewWireSchema));
export const statisticsChapterDetailInvocation = statisticsInvocation('chapterDetail', [projectParameter, chapterIdParameter], strictCodec('novel-creation-tool#novelStatistics:chapterDetail', chapterDetailWireSchema));
export const statisticsSceneCardsInvocation = statisticsInvocation('sceneCards', [projectParameter, actIdParameter, beatIdParameter, cardStatusParameter, limitParameter], strictCodec('novel-creation-tool#novelStatistics:sceneCards', sceneCardsResultWireSchema));
export const statisticsTasksInvocation = statisticsInvocation('tasks', [projectParameter, taskStatusParameter, limitParameter], strictCodec('novel-creation-tool#novelStatistics:tasks', tasksResultWireSchema));

export const statisticsInvocations = [
  statisticsRebuildInvocation,
  statisticsDropInvocation,
  statisticsStatsInvocation,
  statisticsOverviewInvocation,
  statisticsChapterDetailInvocation,
  statisticsSceneCardsInvocation,
  statisticsTasksInvocation,
] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const statisticsRemoteContribution = remoteContribution('novel-creation-tool-statistics', statisticsInvocations);
