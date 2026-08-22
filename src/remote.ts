import type { InvocationDescriptor, InvocationParameterDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import type { NovelCharacterService } from './host/character-service.js';
import type { NovelWorldviewService } from './host/worldview-service.js';
import type { NovelOutlineService } from './host/outline-service.js';
import type { NovelRelationshipService } from './host/relationship-service.js';
import type { CharacterCore, CharacterCoreInput, CharacterCorePatch } from './core/schema/characters.js';
import type { WorldEntry, WorldEntryInput } from './core/schema/worldview.js';
import type { Outline, OutlineBeatCard, OutlineInput } from './core/schema/outline.js';
import type { Relationship, RelationshipInput } from './core/schema/relationship.js';
import type { NovelStateService } from './host/state-service.js';
import type { NovelCanonService } from './host/canon-service.js';
import type { NovelConfirmationService } from './host/confirmation-service.js';
import type { WorldState } from './core/schema/state.js';
import type { CanonEventView, CanonQuery } from './core/canon/index.js';
import type { StateDiff } from './core/state/index.js';
import type { CanonCorrectionInput } from './core/schema/canon.js';
import type { ConfirmationRecord } from './core/schema/confirm.js';

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
const seqParameter = jsonParameter('seq');
const fromSeqParameter = jsonParameter('fromSeq');
const toSeqParameter = jsonParameter('toSeq');
const filterParameter = jsonParameter('filter');
const targetIdParameter = jsonParameter('targetId');
const proposalIdParameter = jsonParameter('proposalId');

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
export const outlineReadInvocation = editorInvocation('novelOutline', 'read', [projectParameter]);
export const outlineSaveInvocation = editorInvocation('novelOutline', 'save', [projectParameter, inputParameter]);
export const outlineBeatCardsInvocation = editorInvocation('novelOutline', 'beatCards', [projectParameter]);
export const relationshipReadInvocation = editorInvocation('novelRelationship', 'read', [projectParameter]);
export const relationshipSaveInvocation = editorInvocation('novelRelationship', 'save', [projectParameter, inputParameter]);
export const stateCurrentInvocation = editorInvocation('novelState', 'current', [projectParameter]);
export const stateSnapshotsInvocation = editorInvocation('novelState', 'snapshots', [projectParameter]);
export const stateRollbackInvocation = editorInvocation('novelState', 'rollback', [projectParameter, seqParameter]);
export const stateDiffInvocation = editorInvocation('novelState', 'diff', [projectParameter, fromSeqParameter, toSeqParameter]);
export const canonQueryInvocation = editorInvocation('novelCanon', 'query', [projectParameter, filterParameter]);
export const canonCorrectionProposeInvocation = editorInvocation('novelCanon', 'correctionPropose', [projectParameter, targetIdParameter, inputParameter]);
export const canonCorrectionAcceptInvocation = editorInvocation('novelCanon', 'correctionAccept', [projectParameter, proposalIdParameter]);
export const editorInvocations = [
  characterListInvocation, characterReadInvocation, characterCreateInvocation, characterUpdateInvocation,
  worldviewListInvocation, worldviewReadInvocation, worldviewCreateInvocation, worldviewRewriteInvocation,
  outlineReadInvocation, outlineSaveInvocation, outlineBeatCardsInvocation,
  relationshipReadInvocation, relationshipSaveInvocation,
  stateCurrentInvocation, stateSnapshotsInvocation, stateRollbackInvocation, stateDiffInvocation,
  canonQueryInvocation, canonCorrectionProposeInvocation, canonCorrectionAcceptInvocation,
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
  outlineRead(projectId: string): Promise<Outline>;
  outlineSave(projectId: string, input: OutlineInput): Promise<Outline>;
  outlineBeatCards(projectId: string): Promise<OutlineBeatCard[]>;
  relationshipRead(projectId: string): Promise<Relationship[]>;
  relationshipSave(projectId: string, input: RelationshipInput): Promise<Relationship>;
  stateCurrent(projectId: string): WorldState;
  stateSnapshots(projectId: string): WorldState[];
  stateRollback(projectId: string, seq: number): Promise<WorldState>;
  stateDiff(projectId: string, fromSeq: number, toSeq: number): StateDiff;
  canonQuery(projectId: string, filter?: CanonQuery): CanonEventView[];
  canonCorrectionPropose(projectId: string, targetId: string, input: CanonCorrectionInput): Promise<ConfirmationRecord>;
  canonCorrectionAccept(projectId: string, proposalId: string): Promise<{ confirmation: ConfirmationRecord; event: unknown }>;
}

/** Host-only adapter that keeps existing domain Services as the sole write owner. */
export function createWorkspaceEditorService(
  characters: NovelCharacterService,
  worldview: NovelWorldviewService,
  outline?: NovelOutlineService,
  relationship?: NovelRelationshipService,
  state?: NovelStateService,
  canon?: NovelCanonService,
  confirmation?: NovelConfirmationService,
): WorkspaceEditorService {
  if (!outline || !relationship) throw new Error('B5/C1 Host services are required');
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
    outlineRead: (projectId) => outline.read(projectId),
    outlineSave: (projectId, input) => outline.save(projectId, input),
    outlineBeatCards: (projectId) => outline.beatCards(projectId),
    relationshipRead: (projectId) => relationship.read(projectId),
    relationshipSave: (projectId, input) => relationship.save(projectId, input),
    stateCurrent: (projectId) => {
      if (!state) throw new Error('C2 Host service is required');
      return state.current(projectId);
    },
    stateSnapshots: (projectId) => {
      if (!state) throw new Error('C2 Host service is required');
      return state.snapshots(projectId);
    },
    stateRollback: (projectId, seq) => {
      if (!state) throw new Error('C2 Host service is required');
      return state.rollback(projectId, seq);
    },
    stateDiff: (projectId, fromSeq, toSeq) => {
      if (!state) throw new Error('C2 Host service is required');
      return state.diff(projectId, fromSeq, toSeq);
    },
    canonQuery: (projectId, filter) => {
      if (!canon) throw new Error('C4 Host service is required');
      return canon.query(projectId, filter);
    },
    canonCorrectionPropose: (projectId, targetId, input) => {
      if (!confirmation) throw new Error('Confirmation Host service is required');
      return confirmation.propose(projectId, {
        id: input.id,
        kind: 'canon-supersede',
        payload: { targetId, correction: input },
      });
    },
    canonCorrectionAccept: async (projectId, proposalId) => {
      if (!confirmation || !canon) throw new Error('C4 and Confirmation Host services are required');
      const confirmationRecord = await confirmation.accept(projectId, proposalId);
      if (confirmationRecord.kind !== 'canon-supersede') throw new Error('Invalid canon correction proposal kind');
      const payload = confirmationRecord.payload as { targetId?: string; correction?: CanonCorrectionInput };
      if (!payload.targetId || !payload.correction) throw new Error('Invalid canon correction proposal payload');
      const existing = canon.query(projectId).find((event) => event.id === payload.correction?.id);
      if (existing) return { confirmation: confirmationRecord, event: existing };
      return { confirmation: confirmationRecord, event: await canon.supersede(projectId, payload.targetId, payload.correction) };
    },
  };
}

export function workspaceViewModel(): WorkspaceViewModel {
  return { product: 'novel-creation-tool', version: '2.0.0', ready: true,
    capabilities: ['generate', 'rewrite', 'continue', 'inspire'] };
}
