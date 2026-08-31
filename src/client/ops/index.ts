import type { ChaptersEditOps } from '../layers/chapters.js';
import type { WorkbenchOps } from '../store/types.js';
import { createCanonOps } from './canon.js';
import { createCharactersOps } from './characters.js';
import { createChaptersOps, type ChaptersPort } from './chapters.js';
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
import { createReferenceReviewOps } from './reference-review.js';
import { createRouterOps } from './router.js';
import type { EntityLink } from '../../core/schema/link.js';
import type { OpsPorts, OpsRuntime } from './context.js';

/**
 * I82 makeOps 组合根（架构审查 §5.1 / §9 #5）：逐层编辑动作全部由各层工厂构建，
 * 本模块只做编排。跨层共享点是 Router 对章节读取 ops 的窄引用 —— `chaptersRef`
 * 先于 chapters 创建，Router 落地后由 Search 复用其唯一前进入口。
 *
 * I101（计划 §18 I101）：每个工厂只接收 OpsRuntime + 自己声明的窄 port
 * （Pick<OpsPorts, ...>），不再传递完整 OpsContext。
 */
export function createWorkbenchOps(runtime: OpsRuntime, ports: OpsPorts): WorkbenchOps {
  const chaptersRef: { current?: ChaptersEditOps } = {};
  const chaptersPort: ChaptersPort = { workspace: ports.workspace, writing: ports.writing, branchNamespace: ports.branchNamespace, queueNamespace: ports.queueNamespace, textMutation: ports.textMutation, sceneOutlineBinding: ports.sceneOutlineBinding, textDeletion: ports.textDeletion, outlineReconciliation: ports.outlineReconciliation };
  const characters = createCharactersOps(runtime, { workspace: ports.workspace });
  const worldview = createWorldviewOps(runtime, { workspace: ports.workspace });
  const outline = createOutlineOps(runtime, { workspace: ports.workspace });
  const relationship = createRelationshipOps(runtime, { workspace: ports.workspace });
  const state = createStateOps(runtime, { workspace: ports.workspace });
  const canon = createCanonOps(runtime, { workspace: ports.workspace });
  const chapters = createChaptersOps(runtime, chaptersPort, chaptersRef);
  const review = createReviewOps(runtime, { reviewNamespace: ports.reviewNamespace });
  const queue = createQueueOps(runtime, { workspace: ports.workspace, queueNamespace: ports.queueNamespace });
  const knowledge = createKnowledgeOps(runtime, { workspace: ports.workspace, knowledgeNamespace: ports.knowledgeNamespace });
  const ruleStyle = createRuleStyleOps(runtime, { ruleStyleNamespace: ports.ruleStyleNamespace });
  const progress = createProgressOps(runtime, { progressNamespace: ports.progressNamespace });
  const importExport = createImportExportOps(runtime, { importExportNamespace: ports.importExportNamespace });
  const statistics = createStatisticsOps(runtime, { statisticsNamespace: ports.statisticsNamespace });
  const timeline = createTimelineOps(runtime, { timelineNamespace: ports.timelineNamespace });
  const referenceReview = createReferenceReviewOps(runtime, { referenceAuditNamespace: ports.referenceAuditNamespace, referenceCorrectionNamespace: ports.referenceCorrectionNamespace });
  const targetFocus = {
    focus(link: EntityLink): boolean {
      const current = runtime.snapshot;
      if (link.kind === 'text' || link.kind === 'search') return true;
      if (link.kind === 'character') { const item = current.characters.list.find((entry) => entry.id === link.entityId); if (!item) return false; characters.select(item); return true; }
      if (link.kind === 'worldview') { const item = current.worldview.list.find((entry) => entry.id === link.entityId); if (!item) return false; worldview.select(item); return true; }
      if (link.kind === 'relationship') { const item = current.relationship.list.find((entry) => entry.id === link.entityId); if (!item) return false; relationship.select(item); return true; }
      if (link.kind === 'canon') { const item = current.canon.events.find((entry) => entry.id === link.entityId); if (!item) return false; canon.select(item); return true; }
      if (link.kind === 'knowledge') { const item = current.knowledge.projection?.entries.find((entry) => entry.id === link.entityId); if (!item) return false; if (current.knowledge.selectedEntryId !== item.id) knowledge.selectFact(item.id); return true; }
      if (link.kind === 'review') { const item = current.review.projection?.issues.find((entry) => entry.id === link.entityId); if (!item) return false; if (!current.review.selected.includes(item.id)) review.selectIssue(item.id); return true; }
      if (link.kind === 'timeline') { const item = current.timeline.timeline?.nodes.find((entry) => entry.id === link.entityId); if (!item) return false; timeline.select(item.id); return true; }
      if (link.kind === 'scene-card') {
        for (const act of current.outlineEditor.draft.acts ?? []) for (const beat of act.beats ?? []) {
          if (beat.detailBeats?.some((card) => card.id === link.entityId)) { outline.selectAct(act.id); outline.selectBeat(act.id, beat.id); outline.selectDetail(link.entityId); return true; }
        }
        return false;
      }
      return false;
    },
  };
  const router = createRouterOps(runtime, chaptersRef, targetFocus);
  return {
    characters, worldview, outline, relationship, state, canon, chapters, review, queue, knowledge, ruleStyle, progress, importExport,
    search: createSearchOps(runtime, { searchNamespace: ports.searchNamespace }, router),
    statistics, timeline, referenceReview,
    router,
  };
}
