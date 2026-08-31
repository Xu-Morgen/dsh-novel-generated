import type { Context } from '@deepseek-ai/cordis';

import type { GenerationSettings } from '../../llm/port/index.js';
import type { SettingsIndex } from '../../core/settings-index/index.js';
import type { NovelCharacterService } from '../character-service.js';
import type { NovelWorldviewService } from '../worldview-service.js';
import type { NovelOutlineService } from '../outline-service.js';
import type { NovelRelationshipService } from '../relationship-service.js';
import type { NovelStateService } from '../state-service.js';
import type { NovelCanonService } from '../canon-service.js';
import type { NovelConfirmationService } from '../confirmation-service.js';
import type { NovelProjectService } from '../project-service.js';
import type { NovelTextServiceBundle } from '../text-service.js';
import type { NovelSceneOutlineBindingService } from '../scene-outline-binding-service.js';
import type { NovelOutlineGenerationBaselineService } from '../outline-generation-baseline-service.js';
import type { NovelOutlineGenerationScopeService } from '../outline-generation-scope-service.js';
import type { NovelRuleService } from '../rule-service.js';
import type { NovelStyleService } from '../style-service.js';
import type { NovelKnowledgeService } from '../knowledge-service.js';
import type { NovelInspirationService } from '../inspiration-service.js';
import type { NovelHostUploadService } from '../upload-service.js';
import type { NovelLlmConfigService } from '../llm-config-service.js';
import type { NovelWorkbenchSettingsService } from '../workbench-settings-service.js';
import type { NovelConsistencyDetectionService } from '../consistency-detection-service.js';
import type { NovelKnowledgeLeakDetectionService } from '../knowledge-leak-detection-service.js';
import type { NovelRelationshipStyleDetectionService } from '../relationship-style-detection-service.js';
import type { NovelTimelineService } from '../timeline-service.js';
import type { NovelTextEditService } from '../text-edit-service.js';
import type { NovelWritingAdjudicationService } from '../writing-adjudication-service.js';
import type { QueueService } from '../queue-service.js';
import type { NextSceneContextProvider } from '../writing-context.js';
import type { NovelTextDeletionService } from '../text-deletion-service.js';
import type { NovelTextChangeImpactService } from '../text-change-impact-service.js';
import type { NovelOutlineReconciliationPlannerService } from '../outline-reconciliation-planner-service.js';
import type { NovelOutlineReconciliationService } from '../outline-reconciliation-service.js';
import type { NovelReferenceAuditService } from '../reference-audit-service.js';
import type { NovelReferenceCorrectionService } from '../reference-correction-service.js';
import type { LongDraftWorkflowCoordinator } from '../long-draft-workflow-coordinator.js';
import type { NovelOutlineDetailGenerationService } from '../outline-detail-generation-service.js';
import type { NovelLinkIndexService } from '../link-index-service.js';
import type { ReviewRepairWorkflow } from '../review-repair-workflow.js';

/**
 * I89 index.ts 组合根分段共享类型（review v2.0 §3.4 / 计划 §18 I89）。
 *
 * 三段组装函数按依赖顺序执行，各自只消费前一阶段的产物：
 * - `CompositionBase`：Fiber 装配基座（ctx/config/onFiberDispose/logger）；
 * - `BaseServices`：基础服务（领域层 + 检测/解析 + 基础设施 + 设置解析）；
 * - `ManagementServices`：管理面（analyzer/onboarding/timeline/写作裁决/审校/队列）。
 * 编排面（knowledge/rule-style/progress/portability/branch/search/statistics/
 * workspace/agent/typert）为末段，直接消费前两者，不需要自己的共享类型。
 *
 * 不变式：不改任何 Service/Remote 契约与装配行为（装配等价，既有测试全绿）。
 */

export interface NovelCreationConfig {
  projectsRoot?: string;
  /** Host-only location for A2 settings; it is not a project/export data path. */
  settingsRoot?: string;
  /** 是否注册对话创作 Agent 工具（novel_open/status/context/continue/inspire），默认 true。 */
  agentTools?: boolean;
}

export interface CompositionBase {
  ctx: Context;
  config: NovelCreationConfig;
  projectsRoot: string | undefined;
  /** I75：把 dispose 回调归属到当前 Fiber 的单一钩子。 */
  onFiberDispose(dispose: () => void): void;
  logger: ReturnType<Context['logger']>;
}

export interface BaseServices {
  logger: ReturnType<Context['logger']>;
  /** I75：`resolveA2GenerationConfig(await settingsIndex.load()).settings` 单一闭包。 */
  resolveGenerationSettings(): Promise<GenerationSettings>;
  /** analyzer 的 settings 包装：显式 settings 直通，缺省解析并给出可操作报错。 */
  resolveAnalyzerSettings(settings: unknown): Promise<unknown>;
  settingsIndex: SettingsIndex;
  characterService: NovelCharacterService;
  worldviewService: NovelWorldviewService;
  outlineService: NovelOutlineService;
  relationshipService: NovelRelationshipService;
  stateService: NovelStateService;
  canonService: NovelCanonService;
  confirmationService: NovelConfirmationService;
  projectService: NovelProjectService;
  textService: NovelTextServiceBundle;
  /** I126 rebuildable text-link index; derived and invalidated after C5 writes. */
  linkIndexService: NovelLinkIndexService;
  sceneOutlineBindingService: NovelSceneOutlineBindingService;
  outlineGenerationBaselineService: NovelOutlineGenerationBaselineService;
  outlineGenerationScopeService: NovelOutlineGenerationScopeService;
  ruleService: NovelRuleService;
  styleService: NovelStyleService;
  knowledgeService: NovelKnowledgeService;
  llm: unknown;
  uploadService: NovelHostUploadService;
  llmConfigService: NovelLlmConfigService;
  workbenchSettingsService: NovelWorkbenchSettingsService;
  inspirationService: NovelInspirationService;
  consistencyDetectionService: NovelConsistencyDetectionService;
  knowledgeLeakDetectionService: NovelKnowledgeLeakDetectionService;
  relationshipStyleDetectionService: NovelRelationshipStyleDetectionService;
}

export interface ManagementServices {
  timelineService: NovelTimelineService;
  controlledTextEditService: NovelTextEditService;
  writingAdjudicationService: NovelWritingAdjudicationService;
  nextSceneContext: NextSceneContextProvider;
  queueService: QueueService;
  textDeletionService: NovelTextDeletionService;
  textChangeImpactService: NovelTextChangeImpactService;
  outlineReconciliationPlannerService: NovelOutlineReconciliationPlannerService;
  outlineReconciliationService: NovelOutlineReconciliationService;
  referenceAuditService: NovelReferenceAuditService;
  referenceCorrectionService: NovelReferenceCorrectionService;
  longDraftWorkflowCoordinator: LongDraftWorkflowCoordinator;
  outlineDetailGenerationService: NovelOutlineDetailGenerationService;
  reviewRepairService: ReviewRepairWorkflow;
}
