import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import { probeInvocation } from './probe.js';
import { workspaceViewModelInvocation, editorInvocations } from './editor.js';
import { projectLifecycleInvocations } from './project-lifecycle.js';
import { uploadInvocations } from './upload.js';
import { onboardingInvocations } from './onboarding.js';
import { onboardingAnalyzerInvocations } from './onboarding-analyzer.js';
import { llmConfigInvocations } from './llm-config.js';
import { workbenchSettingsInvocations } from './workbench-settings.js';
import { writingInvocations, writingPreviewLayersInvocation } from './writing.js';
import { reviewInvocations } from './review.js';
import { queueInvocations } from './queue.js';
import { knowledgeInvocations } from './knowledge.js';
import { ruleStyleInvocations } from './rule-style.js';
import { progressInvocations } from './progress.js';
import { importExportInvocations } from './import-export.js';
import { branchInvocations } from './branch.js';
import { searchInvocations } from './search.js';
import { statisticsInvocations } from './statistics.js';
import { timelineInvocations } from './timeline.js';
import { textMutationInvocations } from './text-mutation.js';
import { sceneOutlineBindingInvocations } from './scene-outline-binding.js';
import { textDeletionInvocations } from './text-deletion.js';
import { outlineGenerationBaselineInvocations } from './outline-generation-baseline.js';
import { textChangeImpactInvocations } from './text-change-impact.js';
import { outlineReconciliationInvocations } from './outline-reconciliation.js';
import { referenceAuditInvocations } from './reference-audit.js';
import { referenceCorrectionInvocations } from './reference-correction.js';
import { longDraftInvocations } from './long-draft.js';
import { outlineGenerationScopeInvocations } from './outline-generation-scope.js';
import { outlineDetailGenerationInvocations } from './outline-detail-generation.js';
import { importInterpretationInvocations } from './import-interpretation.js';
import { importInterpretationAnalysisInvocations } from './import-interpretation-analysis.js';
import { narrativeAdaptationInvocations } from './narrative-adaptation.js';
import { narrativeRevealInvocations } from './narrative-reveal.js';
import { narrativeImportPlanInvocations } from './narrative-import-plan.js';
import { ruleStyleImportInitializationInvocations } from './rule-style-import-initialization.js';

/**
 * Host-only Typert face. Every source-import Remote mounted by the Client must
 * also have its strict descriptor in this single Host registration owner;
 * otherwise the DSH Gateway does not claim `/api/<namespace>/<method>` and the
 * carrier returns HTTP 404 before domain dispatch (I158, design §14.25).
 */
export const hostContribution: TypertContribution = {
  package: 'novel-creation-tool', face: 'host', schemas: [], model: { services: [], events: [], objects: [] },
  invocations: [probeInvocation, workspaceViewModelInvocation, ...editorInvocations, ...projectLifecycleInvocations, ...uploadInvocations, ...onboardingInvocations, ...onboardingAnalyzerInvocations, ...llmConfigInvocations, ...workbenchSettingsInvocations, ...writingInvocations.filter((descriptor) => descriptor !== writingPreviewLayersInvocation), ...reviewInvocations, ...queueInvocations, ...knowledgeInvocations, ...ruleStyleInvocations, ...progressInvocations, ...importExportInvocations, ...branchInvocations, ...searchInvocations, ...statisticsInvocations, ...timelineInvocations, ...textMutationInvocations, ...sceneOutlineBindingInvocations, ...textDeletionInvocations, ...outlineGenerationBaselineInvocations, ...textChangeImpactInvocations, ...outlineReconciliationInvocations, writingPreviewLayersInvocation, ...referenceAuditInvocations, ...referenceCorrectionInvocations, ...longDraftInvocations, ...outlineGenerationScopeInvocations, ...outlineDetailGenerationInvocations, ...importInterpretationInvocations, ...importInterpretationAnalysisInvocations, ...narrativeAdaptationInvocations, ...narrativeRevealInvocations, ...narrativeImportPlanInvocations, ...ruleStyleImportInitializationInvocations],
};
