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

/**
 * Host-only Typert face. Keeping the I108 baseline descriptors here prevents
 * its Host evidence schema from entering the browser client graph while the
 * existing client-mounted contributions remain available from `remote.ts`.
 */
export const hostContribution: TypertContribution = {
  package: 'novel-creation-tool', face: 'host', schemas: [], model: { services: [], events: [], objects: [] },
  invocations: [probeInvocation, workspaceViewModelInvocation, ...editorInvocations, ...projectLifecycleInvocations, ...uploadInvocations, ...onboardingInvocations, ...onboardingAnalyzerInvocations, ...llmConfigInvocations, ...workbenchSettingsInvocations, ...writingInvocations.filter((descriptor) => descriptor !== writingPreviewLayersInvocation), ...reviewInvocations, ...queueInvocations, ...knowledgeInvocations, ...ruleStyleInvocations, ...progressInvocations, ...importExportInvocations, ...branchInvocations, ...searchInvocations, ...statisticsInvocations, ...timelineInvocations, ...textMutationInvocations, ...sceneOutlineBindingInvocations, ...textDeletionInvocations, ...outlineGenerationBaselineInvocations, ...textChangeImpactInvocations, ...outlineReconciliationInvocations, writingPreviewLayersInvocation, ...referenceAuditInvocations, ...referenceCorrectionInvocations, ...longDraftInvocations, ...outlineGenerationScopeInvocations],
};
