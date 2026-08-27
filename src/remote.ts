import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import { probeInvocation, probeContribution, probeRemoteContribution } from './host/remote/probe.js';
import { workspaceViewModelInvocation, editorInvocations, workspaceContribution, workspaceRemoteContribution } from './host/remote/editor.js';
import { projectLifecycleInvocations, projectLifecycleRemoteContribution } from './host/remote/project-lifecycle.js';
import { uploadInvocations, uploadRemoteContribution } from './host/remote/upload.js';
import { onboardingInvocations, onboardingRemoteContribution } from './host/remote/onboarding.js';
import { onboardingAnalyzerInvocations, onboardingAnalyzerRemoteContribution } from './host/remote/onboarding-analyzer.js';
import { llmConfigInvocations, llmConfigRemoteContribution } from './host/remote/llm-config.js';
import { workbenchSettingsInvocations, workbenchSettingsRemoteContribution } from './host/remote/workbench-settings.js';
import { writingInvocations, writingRemoteContribution } from './host/remote/writing.js';
import { reviewInvocations, reviewRemoteContribution } from './host/remote/review.js';
import { queueInvocations, queueRemoteContribution } from './host/remote/queue.js';
import { knowledgeInvocations, knowledgeRemoteContribution } from './host/remote/knowledge.js';
import { ruleStyleInvocations, ruleStyleRemoteContribution } from './host/remote/rule-style.js';
import { progressInvocations, progressRemoteContribution } from './host/remote/progress.js';
import { importExportInvocations, importExportRemoteContribution } from './host/remote/import-export.js';

export * from './host/remote/common.js';
export * from './host/remote/probe.js';
export * from './host/remote/editor.js';
export * from './host/remote/project-lifecycle.js';
export * from './host/remote/upload.js';
export * from './host/remote/text.js';
export * from './host/remote/onboarding.js';
export * from './host/remote/onboarding-analyzer.js';
export * from './host/remote/llm-config.js';
export * from './host/remote/workbench-settings.js';
export * from './host/remote/writing.js';
export * from './host/remote/review.js';
export * from './host/remote/queue.js';
export * from './host/remote/knowledge.js';
export * from './host/remote/rule-style.js';
export * from './host/remote/progress.js';
export * from './host/remote/import-export.js';
export type { WorkspaceEditorService } from './host/workspace-service.js';
export { createWorkspaceEditorService } from './host/workspace-service.js';

/** Compatibility aggregation for the single Typert Host face. */
export const hostContribution: TypertContribution = {
  package: 'novel-creation-tool', face: 'host', schemas: [], model: { services: [], events: [], objects: [] },
  invocations: [probeInvocation, workspaceViewModelInvocation, ...editorInvocations, ...projectLifecycleInvocations, ...uploadInvocations, ...onboardingInvocations, ...onboardingAnalyzerInvocations, ...llmConfigInvocations, ...workbenchSettingsInvocations, ...writingInvocations, ...reviewInvocations, ...queueInvocations, ...knowledgeInvocations, ...ruleStyleInvocations, ...progressInvocations, ...importExportInvocations],
};

export { probeContribution, probeRemoteContribution, workspaceContribution, workspaceRemoteContribution, projectLifecycleRemoteContribution, uploadRemoteContribution, onboardingRemoteContribution, onboardingAnalyzerRemoteContribution, llmConfigRemoteContribution, workbenchSettingsRemoteContribution, writingRemoteContribution, reviewRemoteContribution, queueRemoteContribution, knowledgeRemoteContribution, ruleStyleRemoteContribution, progressRemoteContribution, importExportRemoteContribution };
