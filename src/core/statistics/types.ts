import type { Chapter, ChapterStatus } from '../schema/text.js';
import type { DetailBeatStatus, Outline } from '../schema/outline.js';
import type { OutlineProgress } from '../schema/outline-progress.js';
import type { QueueRunState, QueueTaskStatus } from '../queue/task.js';

/**
 * I72 写作进度面板 —— 可重建派生统计投影的**契约层**（design §14.10「写作进度」/
 * R14-7；架构审查 §4.1 拆分：types.ts 只承载只读接口类型与契约常量，纯函数在
 * build.ts，文件仓库在 repository.ts）。
 *
 * 不变式：
 * - 投影是**派生视图**：`<projectDir>/.statistics/statistics.json` 从 C5（正文）、
 *   B5（大纲场景卡）、C6（执行态）、I65 队列账本（任务记录）确定性构建，可
 *   `drop()` 删除、可随时 `build()` 重建（计划 §16「派生视图风险」：统计绝不成为
 *   正文/设定/进度的第二真相，也不自动改变大纲状态）。
 * - 统计口径全部复用既有 owner：字数用 `countProseUnits`（与 I65 队列预算同一
 *   写作单位口径）；场景卡 ↔ 已写正文的映射用 `stableSceneId(actId, beatId,
 *   cardId)`（与 I65 队列任务的目标场景 id 同一确定性派生）。
 * - 空作品无假进度：无章节/无大纲/无任务时各项为 0，完成度分母为 0 一律取 0
 *   （绝不产生 NaN/Infinity），`overview.empty` 明确标记空作品视图。
 */

export const STATISTICS_DIRECTORY = '.statistics';
export const STATISTICS_FILE = 'statistics.json';
export const STATISTICS_VERSION = 1 as const;
/** 概览中章节行（chapters）的上限；大规模作品仍显示总数，行列表有界。 */
export const OVERVIEW_CHAPTER_LIMIT = 100;
/** 场景卡筛选结果默认上限。 */
export const SCENE_CARD_DEFAULT_LIMIT = 200;
/** 任务历史默认上限。 */
export const TASK_HISTORY_DEFAULT_LIMIT = 50;

/** 投影构建输入（调用方 owned：C5/B5/C6/I65 账本的 live 投影，本模块不读文件真相）。 */
export interface StatisticsSources {
  readonly chapters: readonly Chapter[];
  /** undefined = 大纲未初始化（空作品）；统计为零，不视为进度。 */
  readonly outline: Outline | undefined;
  /** undefined = C6 未初始化；completedBeats/currentBeat 按空处理。 */
  readonly progress: OutlineProgress | undefined;
  /** I65 队列账本的任务记录（空数组 = 无任务历史）。 */
  readonly tasks: readonly StatisticsTaskInput[];
  /** I65 队列 runState / 预算消耗（队列 owner 的权威值；缺省 = 无队列）。 */
  readonly queue: { readonly runState: QueueRunState; readonly consumedUnits: number };
}

/** 任务历史的最小输入形状（来自 I65 QueueStatusView，Host 侧映射）。 */
export interface StatisticsTaskInput {
  readonly id: string;
  readonly sceneId: string;
  readonly chapterId: string;
  readonly cardTitle: string;
  readonly cardPov: string;
  readonly status: QueueTaskStatus;
  readonly attempts: number;
  readonly budgetUnits: number | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 单场景字数（C5 派生；units 与队列预算同一写作单位口径）。 */
export interface SceneWordStats {
  readonly sceneId: string;
  readonly index: number;
  readonly summary: string;
  readonly units: number;
  readonly chars: number;
}

/** 单章节字数（含场景明细；units/chars 为全章合计）。 */
export interface ChapterWordStats {
  readonly chapterId: string;
  readonly index: number;
  readonly title: string;
  readonly pov: string;
  readonly status: ChapterStatus;
  readonly sceneCount: number;
  readonly units: number;
  readonly chars: number;
  readonly scenes: readonly SceneWordStats[];
}

/** B5 场景卡 + C5 已写正文的联动统计（sceneId 由 stableSceneId 派生）。 */
export interface SceneCardStats {
  readonly actId: string;
  readonly actIndex: number;
  readonly actTitle: string;
  readonly beatId: string;
  readonly beatTitle: string;
  readonly cardId: string;
  readonly title: string;
  readonly pov: string;
  readonly wordTarget: number;
  readonly status: DetailBeatStatus;
  readonly sceneId: string;
  /** 该卡对应 C5 场景的实际写作单位（未写 = 0；不会越界为负）。 */
  readonly writtenUnits: number;
  /** writtenUnits / wordTarget，夹在 [0,1]；wordTarget 恒 > 0（B5 schema）。 */
  readonly completionRatio: number;
}

/** 已写正文的 POV 分布（按章节 pov 聚合，C5 派生）。 */
export interface PovWordStat {
  readonly pov: string;
  readonly chapters: number;
  readonly scenes: number;
  readonly units: number;
  readonly chars: number;
}

/** 场景卡目标的 POV 分布（按卡片 pov 聚合，B5 派生）。 */
export interface CardPovStat {
  readonly pov: string;
  readonly cards: number;
  readonly wordTarget: number;
}

/** 任务历史单行（I65 账本派生，bounded 供 Client）。 */
export interface TaskHistoryRow {
  readonly id: string;
  readonly sceneId: string;
  readonly chapterId: string;
  readonly cardTitle: string;
  readonly cardPov: string;
  readonly status: QueueTaskStatus;
  readonly attempts: number;
  readonly budgetUnits: number | null;
  readonly error: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 任务状态计数（六个队列状态全集）。 */
export interface TaskStatusCounts {
  readonly queued: number;
  readonly running: number;
  readonly 'candidate-ready': number;
  readonly failed: number;
  readonly cancelled: number;
  readonly completed: number;
}

/** 队列摘要（I65 runState + 预算消耗（owner 权威值）+ 任务状态分布）。 */
export interface QueueSummary {
  readonly runState: QueueRunState;
  readonly consumedUnits: number;
  readonly taskCounts: TaskStatusCounts;
  readonly totalTasks: number;
}

/** 概览章节行（不含场景明细；大规模作品有界）。 */
export interface ChapterSummaryRow {
  readonly chapterId: string;
  readonly index: number;
  readonly title: string;
  readonly pov: string;
  readonly status: ChapterStatus;
  readonly sceneCount: number;
  readonly units: number;
  readonly chars: number;
}

/** 幕/节树（B5 派生；供场景卡筛选的选项来源，有界）。 */
export interface ActFilterNode {
  readonly id: string;
  readonly index: number;
  readonly title: string;
  readonly beats: readonly { readonly id: string; readonly title: string }[];
}

/** 完整派生投影（文件持久化形状的投影部分；全部纯派生、确定性）。 */
export interface StatisticsProjection {
  readonly chapters: readonly ChapterWordStats[];
  readonly cards: readonly SceneCardStats[];
  readonly beatTotal: number;
  readonly beatCompleted: readonly string[];
  readonly currentBeat: string | null;
  readonly tasks: readonly TaskHistoryRow[];
  readonly queue: QueueSummary;
}

/** 派生统计文件形状（version 锁形状，重建不改语义）。 */
export interface StatisticsFile {
  readonly version: 1;
  readonly projectId: string;
  readonly builtAt: string;
  readonly projection: StatisticsProjection;
}

/** 进度概览（聚合视图；空作品时 empty=true 且各项为零）。 */
export interface StatisticsOverview {
  readonly empty: boolean;
  // 正文总量（C5）。
  readonly chapterCount: number;
  readonly sceneCount: number;
  readonly totalUnits: number;
  readonly totalChars: number;
  // 目标完成度（B5 场景卡目标 vs 已写正文；分子只计场景卡联动场景）。
  readonly cardCount: number;
  readonly totalWordTarget: number;
  readonly cardWrittenUnits: number;
  readonly completionRatio: number;
  // 节完成度（C6 completedBeats vs B5 节总数）。
  readonly beatCount: number;
  readonly completedBeatCount: number;
  readonly beatCompletionRatio: number;
  readonly currentBeat: string | null;
  // 场景卡状态（B5 detailBeats.status 分布）。
  readonly cardStatusCounts: { readonly planned: number; readonly writing: number; readonly done: number };
  // POV 分布（C5 已写 + B5 卡片目标）。
  readonly povStats: readonly PovWordStat[];
  readonly cardPovStats: readonly CardPovStat[];
  // 任务历史摘要（I65）。
  readonly queue: QueueSummary;
  // 章节行（有界）+ 幕/节筛选树。
  readonly chapters: readonly ChapterSummaryRow[];
  readonly acts: readonly ActFilterNode[];
}

/** 场景卡筛选查询（act/beat/status 均可选；result 有界）。 */
export interface SceneCardFilter {
  readonly actId?: string;
  readonly beatId?: string;
  readonly status?: DetailBeatStatus;
  readonly limit?: number;
}

/** 任务历史筛选查询（status 可选；result 有界）。 */
export interface TaskFilter {
  readonly status?: QueueTaskStatus;
  readonly limit?: number;
}
