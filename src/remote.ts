import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import { probeInvocation, probeContribution, probeRemoteContribution } from './host/remote/probe.js';
import { workspaceViewModelInvocation, editorInvocations, workspaceContribution, workspaceRemoteContribution } from './host/remote/editor.js';
import { projectLifecycleInvocations, projectLifecycleRemoteContribution } from './host/remote/project-lifecycle.js';

export * from './host/remote/common.js';
export * from './host/remote/probe.js';
export * from './host/remote/editor.js';
export * from './host/remote/project-lifecycle.js';
export type { WorkspaceEditorService } from './host/workspace-service.js';
export { createWorkspaceEditorService } from './host/workspace-service.js';

/** Compatibility aggregation for the single Typert Host face. */
export const hostContribution: TypertContribution = {
  package: 'novel-creation-tool', face: 'host', schemas: [], model: { services: [], events: [], objects: [] },
  invocations: [probeInvocation, workspaceViewModelInvocation, ...editorInvocations, ...projectLifecycleInvocations],
};

export { probeContribution, probeRemoteContribution, workspaceContribution, workspaceRemoteContribution, projectLifecycleRemoteContribution };
