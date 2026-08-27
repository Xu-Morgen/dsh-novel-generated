/**
 * I72 写作进度面板 —— 可重建派生统计投影的**兼容组合面**（design §14.10 / R14-7；
 * 架构审查 §4.1 拆分：types.ts / build.ts / repository.ts 三切片，本文件只做
 * 显式 re-export，既有消费方（statistics-service、smoke-i72 结构断言等）的导入面
 * 与产物文本都不变）。
 *
 * 契约与不变式见 types.ts（契约层）；纯函数构建见 build.ts；文件仓库见 repository.ts。
 */
export {
  STATISTICS_DIRECTORY,
  STATISTICS_FILE,
  STATISTICS_VERSION,
  OVERVIEW_CHAPTER_LIMIT,
  SCENE_CARD_DEFAULT_LIMIT,
  TASK_HISTORY_DEFAULT_LIMIT,
} from './types.js';
export type {
  StatisticsSources,
  StatisticsTaskInput,
  SceneWordStats,
  ChapterWordStats,
  SceneCardStats,
  PovWordStat,
  CardPovStat,
  TaskHistoryRow,
  TaskStatusCounts,
  QueueSummary,
  ChapterSummaryRow,
  ActFilterNode,
  StatisticsProjection,
  StatisticsFile,
  StatisticsOverview,
  SceneCardFilter,
  TaskFilter,
} from './types.js';
export {
  buildStatistics,
  buildStatisticsOverview,
  filterSceneCards,
  filterTasks,
  chapterDetail,
} from './build.js';
export { StatisticsRepository } from './repository.js';
