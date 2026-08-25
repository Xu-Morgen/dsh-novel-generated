import type { NovelCharacterService } from './character-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelProjectService } from './project-service.js';
import type { CharacterCore, CharacterCoreInput, CharacterCorePatch } from '../core/schema/characters.js';
import type { WorldEntry, WorldEntryInput } from '../core/schema/worldview.js';
import type { Outline, OutlineBeatCard, OutlineInput } from '../core/schema/outline.js';
import type { Relationship, RelationshipInput } from '../core/schema/relationship.js';
import type { WorldState } from '../core/schema/state.js';
import type { CanonEventView, CanonQuery } from '../core/canon/index.js';
import type { StateDiff } from '../core/state/index.js';
import type { CanonCorrectionInput } from '../core/schema/canon.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';
import { workspaceViewModel, type WorkspaceViewModel } from './remote/editor.js';

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
  projectList(): Promise<import('../core/schema/base.js').ProjectMeta[]>;
  projectCreate(input: import('../core/project/index.js').CreateProjectInput): Promise<import('../core/schema/base.js').ProjectMeta>;
  projectOpen(projectId: string): Promise<import('../core/schema/project-lifecycle.js').ProjectOpenResult>;
}

/** Host adapter; domain services remain the only layer write owners. */
export function createWorkspaceEditorService(characters: NovelCharacterService, worldview: NovelWorldviewService, outline?: NovelOutlineService, relationship?: NovelRelationshipService, state?: NovelStateService, canon?: NovelCanonService, confirmation?: NovelConfirmationService, projects?: NovelProjectService): WorkspaceEditorService {
  if (!outline || !relationship) throw new Error('B5/C1 Host services are required');
  return {
    viewModel: workspaceViewModel,
    characterList: (id) => characters.list(id), characterRead: (id, entity) => characters.read(id, entity), characterCreate: (id, input) => characters.create(id, input), characterUpdate: (id, entity, patch) => characters.update(id, entity, patch),
    worldviewList: (id) => worldview.list(id), worldviewRead: (id, entity) => worldview.read(id, entity), worldviewCreate: (id, input) => worldview.create(id, input), worldviewRewrite: (id, entity, input) => worldview.rewrite(id, entity, input),
    outlineRead: (id) => outline.read(id), outlineSave: (id, input) => outline.save(id, input), outlineBeatCards: (id) => outline.beatCards(id), relationshipRead: (id) => relationship.read(id), relationshipSave: (id, input) => relationship.save(id, input),
    stateCurrent: (id) => { if (!state) throw new Error('C2 Host service is required'); return state.current(id); }, stateSnapshots: (id) => { if (!state) throw new Error('C2 Host service is required'); return state.snapshots(id); }, stateRollback: (id, seq) => { if (!state) throw new Error('C2 Host service is required'); return state.rollback(id, seq); }, stateDiff: (id, from, to) => { if (!state) throw new Error('C2 Host service is required'); return state.diff(id, from, to); },
    canonQuery: (id, filter) => { if (!canon) throw new Error('C4 Host service is required'); return canon.query(id, filter); },
    canonCorrectionPropose: (id, targetId, input) => { if (!confirmation) throw new Error('Confirmation Host service is required'); return confirmation.propose(id, { id: input.id, kind: 'canon-supersede', payload: { targetId, correction: input } }); },
    canonCorrectionAccept: async (id, proposalId) => { if (!confirmation || !canon) throw new Error('C4 and Confirmation Host services are required'); const record = await confirmation.accept(id, proposalId); if (record.kind !== 'canon-supersede') throw new Error('Invalid canon correction proposal kind'); const payload = record.payload as { targetId?: string; correction?: CanonCorrectionInput }; if (!payload.targetId || !payload.correction) throw new Error('Invalid canon correction proposal payload'); const existing = canon.query(id).find((event) => event.id === payload.correction?.id); return { confirmation: record, event: existing ?? await canon.supersede(id, payload.targetId, payload.correction) }; },
    projectList: () => { if (!projects) throw new Error('Project lifecycle Host service is required'); return projects.listProjects(); }, projectCreate: (input) => { if (!projects) throw new Error('Project lifecycle Host service is required'); return projects.createProject(input); }, projectOpen: (id) => { if (!projects) throw new Error('Project lifecycle Host service is required'); return projects.openProject(id); },
  };
}
