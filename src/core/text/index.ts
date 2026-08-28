/**
 * C5 文本层兼容入口（review v2.0 §8#7 / 计划 §18 I94 拆分后保持导出兼容）：
 * codec/迁移（codec.ts）、仓储 + 编辑分支策略（repository.ts）、写入队列与
 * 镜像 outbox（write-queue.ts）。外部调用方一律从本 index 导入，语义不变。
 */
export {
  branchIdFor,
  CHAPTER_DOCS_DIRECTORY,
  INITIAL_BRANCH_LABEL,
  migrateLegacyChapter,
  parseChapterDocument,
  PREVIOUS_BRANCH_LABEL,
  renderChapterMarkdown,
  type TextRange,
} from './codec.js';
export { ChapterWriteQueue, type PendingMirrorFailure } from './write-queue.js';
export { TextRepository } from './repository.js';
