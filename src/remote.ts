import type { InvocationDescriptor, InvocationParameterDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import type { NovelCharacterService } from './host/character-service.js';
import type { NovelWorldviewService } from './host/worldview-service.js';
import type { CharacterCore, CharacterCoreInput, CharacterCorePatch } from './core/schema/characters.js';
import type { WorldEntry, WorldEntryInput } from './core/schema/worldview.js';

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

const jsonParameter = (name: string): InvocationParameterDescriptor => ({
  name, wire: name, source: 'json', codec: { mode: 'src-json' },
});
const projectParameter = jsonParameter('projectId');
const entityParameter = jsonParameter('entityId');
const inputParameter = jsonParameter('input');
const patchParameter = jsonParameter('patch');

function editorInvocation(
  service: string,
  method: string,
  parameters: readonly InvocationParameterDescriptor[],
): InvocationDescriptor {
  return {
    id: `novel-creation-tool/${service}/${method}`,
    service, namespace: service, method, invocation: { kind: 'direct' },
    parameters, result: { mode: 'src-json' },
  };
}

/** Explicit I34 Host-for-Client contract; no Client-side domain validation is implied. */
export const characterListInvocation = editorInvocation('novelCharacter', 'list', [projectParameter]);
export const characterReadInvocation = editorInvocation('novelCharacter', 'read', [projectParameter, entityParameter]);
export const characterCreateInvocation = editorInvocation('novelCharacter', 'create', [projectParameter, inputParameter]);
export const characterUpdateInvocation = editorInvocation('novelCharacter', 'update', [projectParameter, entityParameter, patchParameter]);
export const worldviewListInvocation = editorInvocation('novelWorldview', 'list', [projectParameter]);
export const worldviewReadInvocation = editorInvocation('novelWorldview', 'read', [projectParameter, entityParameter]);
export const worldviewCreateInvocation = editorInvocation('novelWorldview', 'create', [projectParameter, inputParameter]);
export const worldviewRewriteInvocation = editorInvocation('novelWorldview', 'rewrite', [projectParameter, entityParameter, inputParameter]);
export const editorInvocations = [
  characterListInvocation, characterReadInvocation, characterCreateInvocation, characterUpdateInvocation,
  worldviewListInvocation, worldviewReadInvocation, worldviewCreateInvocation, worldviewRewriteInvocation,
] as const;
export const workspaceContribution: TypertContribution = {
  package: 'novel-creation-tool', face: 'host', schemas: [],
  model: { services: [], events: [], objects: [] }, invocations: [workspaceViewModelInvocation, ...editorInvocations],
};
export const workspaceRemoteContribution: TypertRemoteContribution = {
  package: 'novel-creation-tool', descriptors: [workspaceViewModelInvocation, ...editorInvocations],
};

export interface WorkspaceEditorService {
  viewModel(): WorkspaceViewModel;
  characterList(projectId: string): Promise<CharacterCore[]>;
  characterRead(projectId: string, entityId: string): Promise<CharacterCore>;
  characterCreate(projectId: string, input: CharacterCoreInput): Promise<CharacterCore>;
  characterUpdate(projectId: string, entityId: string, patch: CharacterCorePatch): Promise<CharacterCore>;
  worldviewList(projectId: string): Promise<WorldEntry[]>;
  worldviewRead(projectId: string, entityId: string): Promise<WorldEntry>;
  worldviewCreate(projectId: string, input: WorldEntryInput): Promise<WorldEntry>;
  worldviewRewrite(projectId: string, entityId: string, input: WorldEntryInput): Promise<{ superseded: WorldEntry; replacement: WorldEntry }>;
}

/** Host-only adapter that keeps existing domain Services as the sole write owner. */
export function createWorkspaceEditorService(
  characters: NovelCharacterService,
  worldview: NovelWorldviewService,
): WorkspaceEditorService {
  return {
    viewModel: workspaceViewModel,
    characterList: (projectId) => characters.list(projectId),
    characterRead: (projectId, entityId) => characters.read(projectId, entityId),
    characterCreate: (projectId, input) => characters.create(projectId, input),
    characterUpdate: (projectId, entityId, patch) => characters.update(projectId, entityId, patch),
    worldviewList: (projectId) => worldview.list(projectId),
    worldviewRead: (projectId, entityId) => worldview.read(projectId, entityId),
    worldviewCreate: (projectId, input) => worldview.create(projectId, input),
    worldviewRewrite: (projectId, entityId, input) => worldview.rewrite(projectId, entityId, input),
  };
}

export function workspaceViewModel(): WorkspaceViewModel {
  return { product: 'novel-creation-tool', version: '2.0.0', ready: true,
    capabilities: ['generate', 'rewrite', 'continue', 'inspire'] };
}
