import type { Chapter } from '../schema/text.js';
import type { Outline } from '../schema/outline.js';
import { countProseUnits, stableSceneId } from '../queue/task.js';
import type {
  ActFilterNode,
  ChapterSummaryRow,
  ChapterWordStats,
  PovWordStat,
  SceneCardStats,
  SceneWordStats,
  StatisticsOverview,
  StatisticsProjection,
  StatisticsSources,
  StatisticsTaskInput,
  TaskHistoryRow,
  TaskFilter,
  QueueSummary,
  SceneCardFilter,
} from './types.js';
import { OVERVIEW_CHAPTER_LIMIT, SCENE_CARD_DEFAULT_LIMIT, TASK_HISTORY_DEFAULT_LIMIT } from './types.js';

/**
 * I72 写作进度面板 —— 可重建派生统计的**纯函数构建层**（design §14.10 / R14-7；
 * 架构审查 §4.1 拆分：契约类型在 types.ts，文件仓库在 repository.ts）。
 *
 * 本模块只读 live source-of-truth 的调用方 owned 输入（与 ContextAssembler /
 * core/search 同一模式：不自己读文件真相），文件仓库只写派生 JSON。纯函数 +
 * 确定性：同输入同输出（遍历顺序、排序 key 全部固定），重建后概览/筛选/详情
 * 逐字段一致。
 */

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

function queueSummaryOf(tasks: readonly TaskHistoryRow[], queue: { readonly runState: QueueSummary['runState']; readonly consumedUnits: number }): QueueSummary {
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
  const povStats: readonly PovWordStat[] = Object.freeze([...povMap.values()]
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

  const chapters: readonly ChapterSummaryRow[] = Object.freeze(projection.chapters
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
  const acts: readonly ActFilterNode[] = Object.freeze((projection.cards.length === 0
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
