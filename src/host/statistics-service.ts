import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import {
  StatisticsRepository,
  buildStatistics,
  buildStatisticsOverview,
  chapterDetail,
  filterSceneCards,
  filterTasks,
  type ChapterWordStats,
  type SceneCardFilter,
  type SceneCardStats,
  type StatisticsOverview,
  type StatisticsProjection,
  type StatisticsTaskInput,
  type TaskFilter,
  type TaskHistoryRow,
} from '../core/statistics/index.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelTextService } from './text-service.js';
import type { QueueStatusView, QueueTaskView } from './queue-service.js';
import type { Chapter } from '../core/schema/text.js';
import type { Outline } from '../core/schema/outline.js';
import type { OutlineProgress } from '../core/schema/outline-progress.js';

/**
 * I72 写作进度面板 Host facade（design §14.10「写作进度」/ R14-7）。
 *
 * 职责与不变式：
 * - 只经六层既有 Domain Service 读取 live source-of-truth 重建统计投影；统计
 *   文件是派生视图（`core/statistics`，`<projectDir>/.statistics/statistics.json`），
 *   `build`/`drop`/`stats` 控制其生命周期，绝不成为第二份作品进度真相（计划 §16
 *   「派生视图风险」）。
 * - 统计口径复用既有 owner：字数 = `countProseUnits`（I65 队列同一写作单位）；
 *   场景卡 ↔ 已写正文 = `stableSceneId`（I65 队列同一确定性派生）；任务记录只经
 *   I65 队列 owner 的 `status()` 读取（本服务零写账本、不读账本文件）。
 * - 空作品/未初始化：大纲 `uninitialized` → outline/progress 视为 undefined（统计
 *   为零、`overview.empty` 标记空作品视图，绝不产出 NaN/假进度）；C6 缺失同样
 *   按空执行态统计。C6 真正损坏由 outline owner 的 schema 校验在其它入口拦截，
 *   本派生视图只反映缺失（不因执行态缺失而失败）。
 * - 返回最小 owned JSON 投影（聚合/有界行），不返回完整 live object、不携带任何
 *   文件路径；统计缺失时 fail closed（明确报错引导重建）。
 */

export interface StatisticsServiceDeps {
  readonly projectsRoot?: string;
  readonly text: NovelTextService;
  readonly outline: NovelOutlineService;
  /** I65 队列 owner：status 是任务记录的唯一读取面（统计只读）。 */
  readonly queue: { status(projectId: string): Promise<QueueStatusView> };
}

/** 派生统计存在性 + 分项计数（可观测性）。 */
export interface StatisticsStatsView {
  readonly indexExists: boolean;
  readonly builtAt?: string;
  readonly counts: { readonly chapters: number; readonly scenes: number; readonly cards: number; readonly tasks: number };
}

/** 场景卡筛选查询（Client 传最小 owned JSON；Host 侧有界）。 */
export interface StatisticsSceneCardFilter {
  readonly actId?: string;
  readonly beatId?: string;
  readonly status?: 'planned' | 'writing' | 'done';
  readonly limit?: number;
}

/** 任务历史筛选查询（Client 传最小 owned JSON；Host 侧有界）。 */
export interface StatisticsTaskFilter {
  readonly status?: QueueTaskView['status'];
  readonly limit?: number;
}

export interface SceneCardsView {
  readonly total: number;
  readonly cards: readonly SceneCardStats[];
}

export interface TasksView {
  readonly total: number;
  readonly tasks: readonly TaskHistoryRow[];
}

export interface ChapterDetailView {
  readonly chapter: ChapterWordStats;
}

export interface NovelStatisticsService {
  open(projectId: string): Promise<void>;
  /** 从 C5/B5/C6/I65 账本 live source-of-truth 重建派生统计（幂等覆盖）。 */
  build(projectId: string): Promise<StatisticsStatsView>;
  /** 删除派生统计（删除后可重建）。 */
  drop(projectId: string): Promise<StatisticsStatsView>;
  /** 派生统计状态（存在性 + 分项计数）。 */
  stats(projectId: string): Promise<StatisticsStatsView>;
  /** 进度概览（聚合 + 有界章节行 + 幕/节筛选树；空作品 empty 标记）。 */
  overview(projectId: string): Promise<StatisticsOverview>;
  /** 单章节详情（含场景字数明细）。 */
  chapterDetail(projectId: string, chapterId: string): Promise<ChapterDetailView>;
  /** 场景卡统计（act/beat/status 筛选，有界）。 */
  sceneCards(projectId: string, filter?: StatisticsSceneCardFilter): Promise<SceneCardsView>;
  /** 任务历史（status 筛选，有界）。 */
  tasks(projectId: string, filter?: StatisticsTaskFilter): Promise<TasksView>;
}

function taskInputOf(task: QueueTaskView): StatisticsTaskInput {
  return {
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
  };
}

export function createStatisticsService(deps: StatisticsServiceDeps): NovelStatisticsService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const repositories = new Map<string, StatisticsRepository>();
  /** 内存投影缓存（派生视图只读缓存；build/drop 失效，重启后惰性重读）。 */
  const cache = new Map<string, { builtAt: string; projection: StatisticsProjection }>();

  const get = (projectId: string): StatisticsRepository => {
    validateProjectId(projectId);
    let repository = repositories.get(projectId);
    if (repository === undefined) {
      repository = new StatisticsRepository(projectDirectory(projectsRoot, projectId));
      repositories.set(projectId, repository);
    }
    return repository;
  };

  /** 从 C5/B5/C6/I65 live 服务读取 source-of-truth（只读，零写）。 */
  const collectSources = async (projectId: string): Promise<{ sources: Parameters<typeof buildStatistics>[0] }> => {
    const [chapters, outline, queueStatus] = await Promise.all([
      deps.text.listChapters(projectId),
      (async (): Promise<Outline | undefined> => {
        const readiness = await deps.outline.readiness(projectId);
        if (readiness === 'uninitialized') return undefined;
        if (readiness === 'corrupt') throw new Error('大纲文档损坏：请先修复 B5 再重建统计。');
        return deps.outline.read(projectId);
      })(),
      deps.queue.status(projectId),
    ]);
    let progress: OutlineProgress | undefined;
    if (outline !== undefined) {
      try {
        progress = await deps.outline.readProgress(projectId);
      } catch {
        // C6 缺失/未初始化是合法空执行态（统计显示零进度，不因执行态缺失失败）。
        progress = undefined;
      }
    }
    const tasks = queueStatus.tasks.map(taskInputOf);
    return { sources: { chapters: chapters as readonly Chapter[], outline, progress, tasks, queue: { runState: queueStatus.runState, consumedUnits: queueStatus.consumedUnits } } };
  };

  /** 加载投影（内存缓存；build/drop 失效；缺失 fail closed 引导重建）。 */
  const loadProjection = async (projectId: string): Promise<{ projectId: string; builtAt: string; projection: StatisticsProjection }> => {
    const cached = cache.get(projectId);
    if (cached !== undefined) return { projectId, ...cached };
    const file = await get(projectId).load();
    if (file === undefined) {
      throw new Error('派生统计未构建：请先「重建统计」（派生视图可随时重建，不写任何结构层）。');
    }
    const loaded = { projectId, builtAt: file.builtAt, projection: file.projection };
    cache.set(projectId, loaded);
    return loaded;
  };

  const statsOf = (loaded: { builtAt: string; projection: StatisticsProjection } | undefined): StatisticsStatsView => {
    if (loaded === undefined) return { indexExists: false, counts: { chapters: 0, scenes: 0, cards: 0, tasks: 0 } };
    const counts = {
      chapters: loaded.projection.chapters.length,
      scenes: loaded.projection.chapters.reduce((total, chapter) => total + chapter.scenes.length, 0),
      cards: loaded.projection.cards.length,
      tasks: loaded.projection.tasks.length,
    };
    return { indexExists: true, builtAt: loaded.builtAt, counts };
  };

  return Object.freeze({
    async open(projectId: string) {
      validateProjectId(projectId);
      get(projectId);
    },
    async build(projectId: string) {
      const { sources } = await collectSources(projectId);
      const file = await get(projectId).build(sources, projectId);
      const built = { builtAt: file.builtAt, projection: file.projection };
      cache.set(projectId, built);
      return statsOf(built);
    },
    async drop(projectId: string) {
      await get(projectId).drop();
      cache.delete(projectId);
      return statsOf(undefined);
    },
    async stats(projectId: string) {
      const file = await get(projectId).load();
      if (file === undefined) return statsOf(undefined);
      return statsOf({ builtAt: file.builtAt, projection: file.projection });
    },
    async overview(projectId: string) {
      const loaded = await loadProjection(projectId);
      return buildStatisticsOverview(loaded.projection);
    },
    async chapterDetail(projectId: string, chapterId: string) {
      const loaded = await loadProjection(projectId);
      const chapter = chapterDetail(loaded.projection, chapterId.trim());
      if (chapter === undefined) throw new Error(`未知章节：${chapterId}`);
      return Object.freeze({ chapter });
    },
    async sceneCards(projectId: string, filter: StatisticsSceneCardFilter = {}) {
      const loaded = await loadProjection(projectId);
      const cardFilter: SceneCardFilter = {
        ...(filter.actId !== undefined && filter.actId !== '' ? { actId: filter.actId } : {}),
        ...(filter.beatId !== undefined && filter.beatId !== '' ? { beatId: filter.beatId } : {}),
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.limit !== undefined && Number.isFinite(filter.limit) ? { limit: Math.max(1, Math.floor(filter.limit)) } : {}),
      };
      return filterSceneCards(loaded.projection, cardFilter);
    },
    async tasks(projectId: string, filter: StatisticsTaskFilter = {}) {
      const loaded = await loadProjection(projectId);
      const taskFilter: TaskFilter = {
        ...(filter.status !== undefined ? { status: filter.status } : {}),
        ...(filter.limit !== undefined && Number.isFinite(filter.limit) ? { limit: Math.max(1, Math.floor(filter.limit)) } : {}),
      };
      return filterTasks(loaded.projection, taskFilter);
    },
  });
}
