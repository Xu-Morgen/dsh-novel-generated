import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { TypertContribution } from '@deepseek-ai/dsh-typert-registry';
import { z } from 'zod';
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
import { characterCoreSchema } from './core/schema/characters.js';
import { worldEntrySchema } from './core/schema/worldview.js';
import { outlineSchema, detailBeatSchema } from './core/schema/outline.js';
import { relationshipSchema } from './core/schema/relationship.js';
import { worldStateSchema } from './core/schema/state.js';
import { canonEventSchema } from './core/schema/canon.js';
import { confirmationRecordSchema } from './core/schema/confirm.js';
import { createProjectInputSchema, projectCreateResultSchema, projectListResultSchema, projectOpenResultSchema } from './core/schema/project-lifecycle.js';
import type { NovelProjectService } from './host/project-service.js';

/**
 * Wire codecs. The DSH client gateway (`dsh-api-gateway`) rejects `src-json`
 * markers, so every parameter and result carries a `strict` codec. Results use
 * the domain schemas (typed reads); scalar ids/sequences use `string`/`number`;
 * complex `input`/`patch`/`filter` objects stay `unknown` because the Host owns
 * domain validation and the Client owns no schema (design §0.1.2).
 */
const strictCodec = (typeSymbol: string, schema: { parse(value: unknown): unknown }): TypertCodec =>
  ({ mode: 'strict', typeSymbol, schema });
const stringCodec = strictCodec('novel-creation-tool#string', z.string());
const numberCodec = strictCodec('novel-creation-tool#number', z.number());
const jsonCodec = strictCodec('novel-creation-tool#json', z.unknown());

/** C4 stored event plus its derived correction marker (see `CanonEventView`). */
const canonEventViewSchema = canonEventSchema.extend({ supersededBy: z.string().nullable() });
/** I14 downstream beat/scene-card view (see `OutlineBeatCard`). */
const outlineBeatCardSchema = z.object({
  actId: z.string(), beatId: z.string(), beatTitle: z.string(), detailBeat: detailBeatSchema,
});
/** C2 snapshot diff view (see `StateDiff`; `before`/`after` are arbitrary values). */
const stateDiffSchema = z.object({
  fromSeq: z.number(), toSeq: z.number(),
  changes: z.array(z.object({ path: z.string(), before: z.unknown(), after: z.unknown() })),
});
const workspaceViewModelSchema = z.object({
  product: z.literal('novel-creation-tool'), version: z.literal('2.0.0'), ready: z.literal(true),
  capabilities: z.array(z.enum(['generate', 'rewrite', 'continue', 'inspire'])),
});
const probeDataSchema = z.object({ marker: z.string(), ready: z.boolean() });
const worldviewRewriteResultSchema = z.object({ superseded: worldEntrySchema, replacement: worldEntrySchema });
const canonCorrectionAcceptResultSchema = z.object({ confirmation: confirmationRecordSchema, event: z.unknown() });

/** I2 gate probe identity retained for the public contract regression. */
export const NOVEL_PROBE_NAMESPACE = 'novelProbe';
export const PROBE_MARKER = 'I2-PROBE';
export interface ProbeData { readonly marker: string; readonly ready: boolean; }
export function probeData(): ProbeData { return { marker: PROBE_MARKER, ready: true }; }
export const probeInvocation: InvocationDescriptor = {
  id: 'novel-creation-tool/novelProbe/probe', service: NOVEL_PROBE_NAMESPACE,
  namespace: NOVEL_PROBE_NAMESPACE, method: 'probe', invocation: { kind: 'direct' },
  parameters: [], result: strictCodec('novel-creation-tool#probeData', probeDataSchema),
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
  parameters: [], result: strictCodec('novel-creation-tool#workspaceViewModel', workspaceViewModelSchema),
};
const param = (name: string, codec: TypertCodec = jsonCodec): InvocationParameterDescriptor => ({
  name, wire: name, source: 'json', codec,
});
const projectParameter = param('projectId', stringCodec);
const entityParameter = param('entityId', stringCodec);
const inputParameter = param('input');
const patchParameter = param('patch');
const seqParameter = param('seq', numberCodec);
const fromSeqParameter = param('fromSeq', numberCodec);
const toSeqParameter = param('toSeq', numberCodec);
const filterParameter = param('filter');
const targetIdParameter = param('targetId', stringCodec);
const proposalIdParameter = param('proposalId', stringCodec);

export const projectListInvocation: InvocationDescriptor = {
  id: 'novel-creation-tool/novelWorkspace/projectList', service: NOVEL_WORKSPACE_NAMESPACE,
  namespace: NOVEL_WORKSPACE_NAMESPACE, method: 'projectList', invocation: { kind: 'direct' },
  parameters: [], result: strictCodec('novel-creation-tool#projectList', projectListResultSchema),
};
export const projectCreateInvocation: InvocationDescriptor = {
  id: 'novel-creation-tool/novelWorkspace/projectCreate', service: NOVEL_WORKSPACE_NAMESPACE,
  namespace: NOVEL_WORKSPACE_NAMESPACE, method: 'projectCreate', invocation: { kind: 'direct' },
  parameters: [param('input', strictCodec('novel-creation-tool#createProjectInput', createProjectInputSchema))],
  result: strictCodec('novel-creation-tool#projectCreate', projectCreateResultSchema),
};
export const projectOpenInvocation: InvocationDescriptor = {
  id: 'novel-creation-tool/novelWorkspace/projectOpen', service: NOVEL_WORKSPACE_NAMESPACE,
  namespace: NOVEL_WORKSPACE_NAMESPACE, method: 'projectOpen', invocation: { kind: 'direct' },
  parameters: [projectParameter], result: strictCodec('novel-creation-tool#projectOpen', projectOpenResultSchema),
};
export const projectLifecycleInvocations = [projectListInvocation, projectCreateInvocation, projectOpenInvocation] as const;


function editorInvocation(
  service: string,
  method: string,
  parameters: readonly InvocationParameterDescriptor[],
  resultSchema: { parse(value: unknown): unknown },
): InvocationDescriptor {
  return {
    id: `novel-creation-tool/${service}/${method}`,
    service, namespace: service, method, invocation: { kind: 'direct' },
    parameters, result: strictCodec(`novel-creation-tool#${method}:result`, resultSchema),
  };
}

/**
 * Explicit I34 Host-for-Client contract; no Client-side domain validation is
 * implied. Every editor method lives on the single `novelWorkspace` service
 * (the Host-owned adapter), so the wire `namespace` and `service` are both
 * `novelWorkspace` and the `method` is the adapter's own export name.
 */
export const characterListInvocation = editorInvocation('novelWorkspace', 'characterList', [projectParameter], z.array(characterCoreSchema));
export const characterReadInvocation = editorInvocation('novelWorkspace', 'characterRead', [projectParameter, entityParameter], characterCoreSchema);
export const characterCreateInvocation = editorInvocation('novelWorkspace', 'characterCreate', [projectParameter, inputParameter], characterCoreSchema);
export const characterUpdateInvocation = editorInvocation('novelWorkspace', 'characterUpdate', [projectParameter, entityParameter, patchParameter], characterCoreSchema);
export const worldviewListInvocation = editorInvocation('novelWorkspace', 'worldviewList', [projectParameter], z.array(worldEntrySchema));
export const worldviewReadInvocation = editorInvocation('novelWorkspace', 'worldviewRead', [projectParameter, entityParameter], worldEntrySchema);
export const worldviewCreateInvocation = editorInvocation('novelWorkspace', 'worldviewCreate', [projectParameter, inputParameter], worldEntrySchema);
export const worldviewRewriteInvocation = editorInvocation('novelWorkspace', 'worldviewRewrite', [projectParameter, entityParameter, inputParameter], worldviewRewriteResultSchema);
export const outlineReadInvocation = editorInvocation('novelWorkspace', 'outlineRead', [projectParameter], outlineSchema);
export const outlineSaveInvocation = editorInvocation('novelWorkspace', 'outlineSave', [projectParameter, inputParameter], outlineSchema);
export const outlineBeatCardsInvocation = editorInvocation('novelWorkspace', 'outlineBeatCards', [projectParameter], z.array(outlineBeatCardSchema));
export const relationshipReadInvocation = editorInvocation('novelWorkspace', 'relationshipRead', [projectParameter], z.array(relationshipSchema));
export const relationshipSaveInvocation = editorInvocation('novelWorkspace', 'relationshipSave', [projectParameter, inputParameter], relationshipSchema);
export const stateCurrentInvocation = editorInvocation('novelWorkspace', 'stateCurrent', [projectParameter], worldStateSchema);
export const stateSnapshotsInvocation = editorInvocation('novelWorkspace', 'stateSnapshots', [projectParameter], z.array(worldStateSchema));
export const stateRollbackInvocation = editorInvocation('novelWorkspace', 'stateRollback', [projectParameter, seqParameter], worldStateSchema);
export const stateDiffInvocation = editorInvocation('novelWorkspace', 'stateDiff', [projectParameter, fromSeqParameter, toSeqParameter], stateDiffSchema);
export const canonQueryInvocation = editorInvocation('novelWorkspace', 'canonQuery', [projectParameter, filterParameter], z.array(canonEventViewSchema));
export const canonCorrectionProposeInvocation = editorInvocation('novelWorkspace', 'canonCorrectionPropose', [projectParameter, targetIdParameter, inputParameter], confirmationRecordSchema);
export const canonCorrectionAcceptInvocation = editorInvocation('novelWorkspace', 'canonCorrectionAccept', [projectParameter, proposalIdParameter], canonCorrectionAcceptResultSchema);
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

/**
 * Single Host face for the package. The Typert registry rejects a duplicate
 * `<package>#<face>` identity, so the I2 probe and the I33+ workspace
 * invocations must be registered as one contribution (see §0.1.3 I2 and the
 * `register()` contract in `dsh-typert-registry`).
 */
export const hostContribution: TypertContribution = {
  package: 'novel-creation-tool', face: 'host', schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: [probeInvocation, workspaceViewModelInvocation, ...editorInvocations, ...projectLifecycleInvocations],
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
  projectList(): Promise<import('./core/schema/base.js').ProjectMeta[]>;
  projectCreate(input: import('./core/project/index.js').CreateProjectInput): Promise<import('./core/schema/base.js').ProjectMeta>;
  projectOpen(projectId: string): Promise<import('./core/schema/project-lifecycle.js').ProjectOpenResult>;
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
  projects?: NovelProjectService,
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
    projectList: () => {
      if (!projects) throw new Error('Project lifecycle Host service is required');
      return projects.listProjects();
    },
    projectCreate: (input) => {
      if (!projects) throw new Error('Project lifecycle Host service is required');
      return projects.createProject(input);
    },
    projectOpen: (projectId) => {
      if (!projects) throw new Error('Project lifecycle Host service is required');
      return projects.openProject(projectId);
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

/**
 * Attach the `typertRemote` binding the DSH gateway requires to dispatch a
 * strict descriptor to a Host service (see `dsh-api-gateway` `validateBinding`).
 * The service object is returned unchanged for chaining into `ctx.provide`.
 */
export function bindRemote<T extends object>(service: T, serviceKey: string, namespace: string): T {
  Object.defineProperty(service, 'typertRemote', {
    value: { service, serviceKey, namespace },
    enumerable: false,
    writable: true,
    configurable: true,
  });
  return service;
}
