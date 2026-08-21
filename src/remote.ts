import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';

/** I2 gate probe identity retained for the public contract regression. */
export const NOVEL_PROBE_NAMESPACE = 'novelProbe';
export const PROBE_MARKER = 'I2-PROBE';
export interface ProbeData { readonly marker: string; readonly ready: boolean; }
export function probeData(): ProbeData { return { marker: PROBE_MARKER, ready: true }; }
export const probeInvocation: InvocationDescriptor = {
  id: 'novel-creation-tool/novelProbe/probe', service: NOVEL_PROBE_NAMESPACE,
  namespace: NOVEL_PROBE_NAMESPACE, method: 'probe', invocation: { kind: 'direct' },
  parameters: [], result: { mode: 'src-json' },
};
export const probeContribution: TypertContribution = {
  package: 'novel-creation-tool', face: 'host', schemas: [],
  model: { services: [], events: [], objects: [] }, invocations: [probeInvocation],
};
export const probeRemoteContribution: TypertRemoteContribution = {
  package: 'novel-creation-tool', descriptors: [probeInvocation],
};

/** Stable JSON view model consumed by the I33 product Slot (design §0.1.2). */
export interface WorkspaceViewModel {
  readonly product: 'novel-creation-tool';
  readonly version: '2.0.0';
  readonly ready: true;
  readonly capabilities: readonly ['generate', 'rewrite', 'continue', 'inspire'];
}
export const NOVEL_WORKSPACE_NAMESPACE = 'novelWorkspace';
export const workspaceViewModelInvocation: InvocationDescriptor = {
  id: 'novel-creation-tool/novelWorkspace/viewModel', service: NOVEL_WORKSPACE_NAMESPACE,
  namespace: NOVEL_WORKSPACE_NAMESPACE, method: 'viewModel', invocation: { kind: 'direct' },
  parameters: [], result: { mode: 'src-json' },
};
export const workspaceContribution: TypertContribution = {
  package: 'novel-creation-tool', face: 'host', schemas: [],
  model: { services: [], events: [], objects: [] }, invocations: [workspaceViewModelInvocation],
};
export const workspaceRemoteContribution: TypertRemoteContribution = {
  package: 'novel-creation-tool', descriptors: [workspaceViewModelInvocation],
};
export function workspaceViewModel(): WorkspaceViewModel {
  return { product: 'novel-creation-tool', version: '2.0.0', ready: true,
    capabilities: ['generate', 'rewrite', 'continue', 'inspire'] };
}
