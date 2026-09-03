import type { OnboardingAnalyzerNamespace, OnboardingNamespace } from './onboarding.js';
import type {
  BranchNamespace,
  ImportExportNamespace,
  KnowledgeNamespace,
  LongDraftNamespace,
  ProgressNamespace,
  QueueNamespace,
  ReferenceAuditNamespace,
  ReferenceCorrectionNamespace,
  ReviewNamespace,
  ReviewRepairNamespace,
  RuleStyleNamespace,
  SearchNamespace,
  SceneOutlineBindingNamespace,
  StatisticsNamespace,
  TextDeletionNamespace,
  TextMutationNamespace,
  TimelineNamespace,
  OutlineDetailGenerationNamespace,
  OutlineReconciliationNamespace,
  WorkspaceNamespace,
  WritingNamespace,
} from './shared.js';
import type {
  ImportInterpretationAnalysisNamespace,
  ImportInterpretationNamespace,
  NarrativeAdaptationNamespace,
  NarrativeImportPlanNamespace,
  NarrativeRevealNamespace,
  RuleStyleImportInitializationNamespace,
} from './remote-namespace.js';
import type { LlmConfigNamespace } from './settings.js';
import type { WorkbenchSettingsNamespace } from './workbench-settings.js';

/**
 * The 31 Client-facing service keys shared by the historical mount adapter and
 * the Electron IPC adapter. This module contains types only: it owns neither a
 * DSH mount nor an Electron transport.
 */
export interface ClientServiceBag {
  workspace?: WorkspaceNamespace;
  onboarding?: OnboardingNamespace;
  analyzer?: OnboardingAnalyzerNamespace;
  llmConfig?: LlmConfigNamespace;
  workbenchSettings?: WorkbenchSettingsNamespace;
  writing?: WritingNamespace;
  reviewNamespace?: ReviewNamespace;
  reviewRepairNamespace?: ReviewRepairNamespace;
  queueNamespace?: QueueNamespace;
  knowledgeNamespace?: KnowledgeNamespace;
  ruleStyleNamespace?: RuleStyleNamespace;
  progressNamespace?: ProgressNamespace;
  importExportNamespace?: ImportExportNamespace;
  branchNamespace?: BranchNamespace;
  searchNamespace?: SearchNamespace;
  statisticsNamespace?: StatisticsNamespace;
  timelineNamespace?: TimelineNamespace;
  sceneOutlineBinding?: SceneOutlineBindingNamespace;
  textMutation?: TextMutationNamespace;
  textDeletion?: TextDeletionNamespace;
  outlineReconciliation?: OutlineReconciliationNamespace;
  referenceAudit?: ReferenceAuditNamespace;
  referenceCorrection?: ReferenceCorrectionNamespace;
  longDraft?: LongDraftNamespace;
  outlineDetailGeneration?: OutlineDetailGenerationNamespace;
  importInterpretation?: ImportInterpretationNamespace;
  importInterpretationAnalysis?: ImportInterpretationAnalysisNamespace;
  ruleStyleImportInitialization?: RuleStyleImportInitializationNamespace;
  narrativeAdaptation?: NarrativeAdaptationNamespace;
  narrativeReveal?: NarrativeRevealNamespace;
  narrativeImportPlan?: NarrativeImportPlanNamespace;
}
