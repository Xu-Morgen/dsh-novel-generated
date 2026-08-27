import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Chapter, ChapterStatus } from '../schema/text.js';
import type { DetailBeatStatus, Outline } from '../schema/outline.js';
import type { OutlineProgress } from '../schema/outline-progress.js';
import { countProseUnits, stableSceneId } from '../queue/task.js';
import type { QueueRunState, QueueTaskStatus } from '../queue/task.js';

/**
 * I72 写作进度面板 —— 可重建派生统计投影（design §14.10「写作进度」/ R14-7）。
 *
 * 职责与不变式：
 * - 投影是**派生视图**：`<projectDir>/.statistics/statistics.json` 从 C5（正文）、
 *   B5（大纲场景卡）、C6（执行态）、I65 队列账本（任务记录）确定性构建，可
 *   `drop()` 删除、可随时 `build()` 重建（计划 §16「派生视图风险」：统计绝不成为
 *   正文/设定/进度的第二真相，也不自动改变大纲状态）。
 * - 统计口径全部复用既有 owner：字数用 `countProseUnits`（与 I65 队列预算同一
 *   写作单位口径）；场景卡 ↔ 已写正文的映射用 `stableSceneId(actId, beatId,
 *   cardId)`（与 I65 队列任务的目标场景 id 同一确定性派生）—— 同一张场景卡
 *   跨重启/跨视图恒等，统计与队列对同一场景的认知一致。
 * - 空作品无假进度：无章节/无大纲/无任务时各项为 0，完成度分母为 0 一律取 0
 *   （绝不产生 NaN/Infinity），`overview.empty` 明确标记空作品视图。
 * - 纯函数 + 确定性：同输入同输出（遍历顺序、排序 key 全部固定），重建后
 *   概览/筛选/详情逐字段一致。
 * - 本模块只读 live source-of-truth 的调用方 owned 输入（与 ContextAssembler /
 *   core/search 同一模式：不自己读文件真相），文件仓库只写派生 JSON。
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

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function sceneStatsOf(scene: Chapter['scenes'][number]): SceneWordStats {
  return Object.freeze({
    sceneId: scene.id,
    index: scene.index,
    summary: scene.summary,
    units: countProseUnits(scene.content),
    chars: scene.content.length,
  });
}

function chapterStatsOf(chapter: Chapter): ChapterWordStats {
  const scenes = chapter.scenes
    .slice()
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .map(sceneStatsOf);
  return Object.freeze({
    chapterId: chapter.id,
    index: chapter.index,
    title: chapter.title,
    pov: chapter.pov,
    status: chapter.status,
    sceneCount: scenes.length,
    units: sum(scenes.map((scene) => scene.units)),
    chars: sum(scenes.map((scene) => scene.chars)),
    scenes: Object.freeze(scenes),
  });
}

function cardStatsOf(act: Outline['acts'][number], beat: Outline['acts'][number]['beats'][number], card: Outline['acts'][number]['beats'][number]['detailBeats'][number], writtenUnits: number): SceneCardStats {
  return Object.freeze({
    actId: act.id,
    actIndex: act.index,
    actTitle: act.title,
    beatId: beat.id,
    beatTitle: beat.title,
    cardId: card.id,
    title: card.title,
    pov: card.pov,
    wordTarget: card.wordTarget,
    status: card.status,
    sceneId: stableSceneId(act.id, beat.id, card.id),
    writtenUnits,
    // B5 schema 保证 wordTarget > 0；仍防御 0 分母（空作品无假进度）。
    completionRatio: card.wordTarget > 0 ? Math.min(1, writtenUnits / card.wordTarget) : 0,
  });
}

function taskRowOf(task: StatisticsTaskInput): TaskHistoryRow {
  return Object.freeze({
    id: task.id,
    sceneId: task.sceneId,
    chapterId: task.chapterId,
    cardTitle: task.cardTitle,
    cardPov: task.cardPov,
    status: task.status,
    attempts: task.attempts,
    budgetUnits: task.budgetUnits,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  });
}

function queueSummaryOf(tasks: readonly TaskHistoryRow[], queue: { readonly runState: QueueRunState; readonly consumedUnits: number }): QueueSummary {
  const taskCounts = { queued: 0, running: 0, 'candidate-ready': 0, failed: 0, cancelled: 0, completed: 0 };
  for (const task of tasks) taskCounts[task.status] += 1;
  return Object.freeze({
    runState: queue.runState,
    consumedUnits: queue.consumedUnits,
    taskCounts: Object.freeze({ ...taskCounts }),
    totalTasks: tasks.length,
  });
}

/**
 * 从 C5/B5/C6/I65 账本输入确定性构建完整投影。
 * 遍历顺序与排序 key 全部固定：章节按 index→id，场景按 index→id，卡片按
 * 幕 index→节 id→卡 id，任务按 updatedAt desc→id asc —— 重建后逐字段一致。
 */
export function buildStatistics(sources: StatisticsSources): StatisticsProjection {
  const chapters = sources.chapters
    .slice()
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .map(chapterStatsOf);

  // B5 场景卡 → C5 联动：场景 id = stableSceneId（与 I65 队列同一确定性派生）。
  const chapterScenes = new Map<string, SceneWordStats>();
  for (const chapter of chapters) {
    for (const scene of chapter.scenes) chapterScenes.set(scene.sceneId, scene);
  }
  const cards: SceneCardStats[] = [];
  for (const act of sources.outline?.acts ?? []) {
    for (const beat of act.beats) {
      for (const card of beat.detailBeats) {
        const sceneId = stableSceneId(act.id, beat.id, card.id);
        cards.push(cardStatsOf(act, beat, card, chapterScenes.get(sceneId)?.units ?? 0));
      }
    }
  }

  const beatTotal = (sources.outline?.acts ?? []).reduce((total, act) => total + act.beats.length, 0);
  const beatCompleted = Object.freeze([...(sources.progress?.completedBeats ?? [])].sort());

  const tasks = sources.tasks
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id))
    .map(taskRowOf);

  return Object.freeze({
    chapters: Object.freeze(chapters),
    cards: Object.freeze(cards),
    beatTotal,
    beatCompleted,
    currentBeat: sources.progress?.currentBeat ?? null,
    tasks: Object.freeze(tasks),
    queue: queueSummaryOf(tasks, sources.queue),
  });
}

/** 概览聚合（纯派生；所有比值在分母为 0 时取 0 —— 空作品无假进度）。 */
export function buildStatisticsOverview(projection: StatisticsProjection): StatisticsOverview {
  const totalUnits = sum(projection.chapters.map((chapter) => chapter.units));
  const totalChars = sum(projection.chapters.map((chapter) => chapter.chars));
  const sceneCount = sum(projection.chapters.map((chapter) => chapter.scenes.length));
  const cardCount = projection.cards.length;
  const totalWordTarget = sum(projection.cards.map((card) => card.wordTarget));
  const cardWrittenUnits = sum(projection.cards.map((card) => card.writtenUnits));
  const completedBeatCount = projection.beatCompleted.length;

  const cardStatusCounts = { planned: 0, writing: 0, done: 0 };
  for (const card of projection.cards) cardStatusCounts[card.status] += 1;

  const povMap = new Map<string, { pov: string; chapters: number; scenes: number; units: number; chars: number }>();
  for (const chapter of projection.chapters) {
    const current = povMap.get(chapter.pov) ?? { pov: chapter.pov, chapters: 0, scenes: 0, units: 0, chars: 0 };
    current.chapters += 1;
    current.scenes += chapter.sceneCount;
    current.units += chapter.units;
    current.chars += chapter.chars;
    povMap.set(chapter.pov, current);
  }
  const povStats = Object.freeze([...povMap.values()]
    .sort((left, right) => right.units - left.units || left.pov.localeCompare(right.pov))
    .map((stat) => Object.freeze({ ...stat })));

  const cardPovMap = new Map<string, { pov: string; cards: number; wordTarget: number }>();
  for (const card of projection.cards) {
    const current = cardPovMap.get(card.pov) ?? { pov: card.pov, cards: 0, wordTarget: 0 };
    current.cards += 1;
    current.wordTarget += card.wordTarget;
    cardPovMap.set(card.pov, current);
  }
  const cardPovStats = Object.freeze([...cardPovMap.values()]
    .sort((left, right) => right.wordTarget - left.wordTarget || left.pov.localeCompare(right.pov))
    .map((stat) => Object.freeze({ ...stat })));

  const chapters = Object.freeze(projection.chapters
    .slice(0, OVERVIEW_CHAPTER_LIMIT)
    .map((chapter) => Object.freeze({
      chapterId: chapter.chapterId,
      index: chapter.index,
      title: chapter.title,
      pov: chapter.pov,
      status: chapter.status,
      sceneCount: chapter.sceneCount,
      units: chapter.units,
      chars: chapter.chars,
    })));

  // 幕/节筛选树（B5；节按 id 排序保持确定性）。
  const acts = Object.freeze((projection.cards.length === 0
    ? []
    : [...new Map(projection.cards.map((card) => [card.actId, { id: card.actId, index: card.actIndex, title: card.actTitle }])).values()]
      .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
      .map((act) => {
        const beats = [...new Map(projection.cards.filter((card) => card.actId === act.id).map((card) => [card.beatId, { id: card.beatId, title: card.beatTitle }])).values()]
          .sort((left, right) => left.id.localeCompare(right.id));
        return Object.freeze({ ...act, beats: Object.freeze(beats) });
      })));

  const empty = projection.chapters.length === 0 && projection.cards.length === 0 && projection.tasks.length === 0;

  return Object.freeze({
    empty,
    chapterCount: projection.chapters.length,
    sceneCount,
    totalUnits,
    totalChars,
    cardCount,
    totalWordTarget,
    cardWrittenUnits,
    completionRatio: totalWordTarget > 0 ? Math.min(1, cardWrittenUnits / totalWordTarget) : 0,
    beatCount: projection.beatTotal,
    completedBeatCount,
    beatCompletionRatio: projection.beatTotal > 0 ? completedBeatCount / projection.beatTotal : 0,
    currentBeat: projection.currentBeat,
    cardStatusCounts: Object.freeze({ ...cardStatusCounts }),
    povStats,
    cardPovStats,
    queue: projection.queue,
    chapters,
    acts,
  });
}

/** 场景卡筛选（act/beat/status 可叠加；result 有界且确定排序）。 */
export function filterSceneCards(projection: StatisticsProjection, filter: SceneCardFilter = {}): { readonly total: number; readonly cards: readonly SceneCardStats[] } {
  const limit = filter.limit ?? SCENE_CARD_DEFAULT_LIMIT;
  const matched = projection.cards.filter((card) =>
    (filter.actId === undefined || card.actId === filter.actId)
    && (filter.beatId === undefined || card.beatId === filter.beatId)
    && (filter.status === undefined || card.status === filter.status));
  const ordered = matched
    .slice()
    .sort((left, right) => left.actIndex - right.actIndex || left.actId.localeCompare(right.actId) || left.beatId.localeCompare(right.beatId) || left.cardId.localeCompare(right.cardId));
  return Object.freeze({ total: ordered.length, cards: Object.freeze(ordered.slice(0, limit)) });
}

/** 任务历史筛选（status 可选；result 有界，按 updatedAt desc→id asc）。 */
export function filterTasks(projection: StatisticsProjection, filter: TaskFilter = {}): { readonly total: number; readonly tasks: readonly TaskHistoryRow[] } {
  const limit = filter.limit ?? TASK_HISTORY_DEFAULT_LIMIT;
  const matched = projection.tasks.filter((task) => filter.status === undefined || task.status === filter.status);
  return Object.freeze({ total: matched.length, tasks: Object.freeze(matched.slice(0, limit)) });
}

/** 单章节详情（含场景字数明细）；未知章节返回 undefined（fail closed）。 */
export function chapterDetail(projection: StatisticsProjection, chapterId: string): ChapterWordStats | undefined {
  return projection.chapters.find((chapter) => chapter.chapterId === chapterId);
}

/**
 * 统计投影的文件仓库：`build` 写派生文件、`drop` 删除、`load` 读取。
 * 本仓库从不写任何 source-of-truth 层（派生视图，计划 §16「派生视图风险」）。
 */
export class StatisticsRepository {
  private readonly filePath: string;

  constructor(projectDirectory: string) {
    this.filePath = join(projectDirectory, STATISTICS_DIRECTORY, STATISTICS_FILE);
  }

  /** 从调用方给定的 C5/B5/C6/I65 输入构建并落盘派生统计（重建路径；幂等覆盖）。 */
  async build(sources: StatisticsSources, projectId: string): Promise<StatisticsFile> {
    const file: StatisticsFile = {
      version: STATISTICS_VERSION,
      projectId,
      builtAt: new Date().toISOString(),
      projection: buildStatistics(sources),
    };
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(file)}\n`, 'utf8');
    return file;
  }

  /** 读取当前派生统计；不存在返回 undefined（由调用方决定 fail-closed 或引导重建）。 */
  async load(): Promise<StatisticsFile | undefined> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    const parsed = JSON.parse(raw) as StatisticsFile;
    if (parsed.version !== STATISTICS_VERSION || !Array.isArray(parsed.projection?.chapters)) {
      throw new Error(`Invalid statistics projection (version ${String(parsed?.version)}) — rebuild it`);
    }
    return parsed;
  }

  /** 删除派生统计（删除后可重建；返回是否确实删除）。 */
  async drop(): Promise<boolean> {
    try {
      await rm(this.filePath, { force: false });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }
}
