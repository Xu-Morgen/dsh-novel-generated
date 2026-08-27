import type { ChaptersEditOps } from '../layers/chapters.js';
import type { WorkbenchOps } from '../store/types.js';
import { createCanonOps } from './canon.js';
import { createCharactersOps } from './characters.js';
import { createChaptersOps } from './chapters.js';
import { createImportExportOps } from './import-export.js';
import { createKnowledgeOps } from './knowledge.js';
import { createOutlineOps } from './outline.js';
import { createProgressOps } from './progress.js';
import { createQueueOps } from './queue.js';
import { createRelationshipOps } from './relationship.js';
import { createReviewOps } from './review.js';
import { createRuleStyleOps } from './rule-style.js';
import { createSearchOps } from './search.js';
import { createStateOps } from './state.js';
import { createStatisticsOps } from './statistics.js';
import { createTimelineOps } from './timeline.js';
import { createWorldviewOps } from './worldview.js';
import type { OpsContext } from './context.js';

/**
 * I82 makeOps 组合根（架构审查 §5.1 / §9 #5）：逐层编辑动作全部由各层工厂构建，
 * 本模块只做编排。跨层共享点只有 search 的正文跳转 —— `chaptersRef` 先于 chapters
 * 创建，chapters 落地后把自身 ops 写入 ref，search 的 `jumpTo` 经 ref 复用
 * `openScene`（与 I71 原 `chaptersOpsRef` 语义一致）。
 */
export function createWorkbenchOps(ctx: OpsContext): WorkbenchOps {
  const chaptersRef: { current?: ChaptersEditOps } = {};
  return {
    characters: createCharactersOps(ctx),
    worldview: createWorldviewOps(ctx),
    outline: createOutlineOps(ctx),
    relationship: createRelationshipOps(ctx),
    state: createStateOps(ctx),
    canon: createCanonOps(ctx),
    chapters: createChaptersOps(ctx, chaptersRef),
    review: createReviewOps(ctx),
    queue: createQueueOps(ctx),
    knowledge: createKnowledgeOps(ctx),
    ruleStyle: createRuleStyleOps(ctx),
    progress: createProgressOps(ctx),
    importExport: createImportExportOps(ctx),
    search: createSearchOps(ctx, chaptersRef),
    statistics: createStatisticsOps(ctx),
    timeline: createTimelineOps(ctx),
  };
}
