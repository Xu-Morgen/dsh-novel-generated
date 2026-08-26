import type { NovelCharacterService } from './character-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelProjectService } from './project-service.js';
import type { NovelHostUploadService } from './upload-service.js';
import type { NovelTextService } from './text-service.js';
import type { UploadChunkResult, UploadFinalizeResult, UploadStartInput, UploadStartResult } from '../core/schema/upload.js';
import type { CharacterCore, CharacterCoreInput, CharacterCorePatch } from '../core/schema/characters.js';
import type { WorldEntry, WorldEntryInput } from '../core/schema/worldview.js';
import type { Outline, OutlineBeatCard, OutlineInput } from '../core/schema/outline.js';
import type { Relationship, RelationshipInput } from '../core/schema/relationship.js';
import type { WorldState } from '../core/schema/state.js';
import type { CanonEventView, CanonQuery } from '../core/canon/index.js';
import type { StateDiff } from '../core/state/index.js';
import type { CanonCorrectionInput } from '../core/schema/canon.js';
import type { ConfirmationRecord } from '../core/schema/confirm.js';
import type { ChapterListItem, ChapterReadResult, SceneReadResult } from '../core/text/projection.js';
import { projectChapterList, toChapterReadResult, toSceneReadResult } from '../core/text/projection.js';
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
  /** I60 C5 只读 Remote（design §5.12 / R13-1）：只返回最小 owned JSON 投影。 */
  chapterList(projectId: string): Promise<ChapterListItem[]>;
  chapterRead(projectId: string, chapterId: string): Promise<ChapterReadResult>;
  sceneRead(projectId: string, chapterId: string, sceneId: string): Promise<SceneReadResult>;
  projectList(): Promise<import('../core/schema/base.js').ProjectMeta[]>;
  projectCreate(input: import('../core/project/index.js').CreateProjectInput): Promise<import('../core/schema/base.js').ProjectMeta>;
  projectOpen(projectId: string): Promise<import('../core/schema/project-lifecycle.js').ProjectOpenResult>;
  uploadStart(input: UploadStartInput): Promise<UploadStartResult>;
  uploadChunk(uploadId: string, index: number, base64: string): Promise<UploadChunkResult>;
  uploadFinalize(uploadId: string): Promise<UploadFinalizeResult>;
  uploadCancel(uploadId: string): Promise<void>;
}

/** Host adapter; domain services remain the only layer write owners. */
export function createWorkspaceEditorService(characters: NovelCharacterService, worldview: NovelWorldviewService, outline?: NovelOutlineService, relationship?: NovelRelationshipService, state?: NovelStateService, canon?: NovelCanonService, confirmation?: NovelConfirmationService, projects?: NovelProjectService, upload?: NovelHostUploadService, text?: NovelTextService): WorkspaceEditorService {
  if (!outline || !relationship) throw new Error('B5/C1 Host services are required');
  // I60：C5 只读走 I6 `novelText` owner；open 幂等（目录已存在时只登记 repository）。
  const requireText = (): NovelTextService => {
    if (!text) throw new Error('C5 Host service is required');
    return text;
  };
  return {
    viewModel: workspaceViewModel,
    characterList: (id) => characters.list(id), characterRead: (id, entity) => characters.read(id, entity), characterCreate: (id, input) => characters.create(id, input), characterUpdate: (id, entity, patch) => characters.update(id, entity, patch),
    worldviewList: (id) => worldview.list(id), worldviewRead: (id, entity) => worldview.read(id, entity), worldviewCreate: (id, input) => worldview.create(id, input), worldviewRewrite: (id, entity, input) => worldview.rewrite(id, entity, input),
    outlineRead: (id) => outline.read(id), outlineSave: (id, input) => outline.save(id, input), outlineBeatCards: (id) => outline.beatCards(id), relationshipRead: (id) => relationship.read(id), relationshipSave: (id, input) => relationship.save(id, input),
    stateCurrent: (id) => { if (!state) throw new Error('C2 Host service is required'); return state.current(id); }, stateSnapshots: (id) => { if (!state) throw new Error('C2 Host service is required'); return state.snapshots(id); }, stateRollback: (id, seq) => { if (!state) throw new Error('C2 Host service is required'); return state.rollback(id, seq); }, stateDiff: (id, from, to) => { if (!state) throw new Error('C2 Host service is required'); return state.diff(id, from, to); },
    canonQuery: (id, filter) => { if (!canon) throw new Error('C4 Host service is required'); return canon.query(id, filter); },
    canonCorrectionPropose: (id, targetId, input) => { if (!confirmation) throw new Error('Confirmation Host service is required'); return confirmation.propose(id, { id: input.id, kind: 'canon-supersede', payload: { targetId, correction: input } }); },
    canonCorrectionAccept: async (id, proposalId) => { if (!confirmation || !canon) throw new Error('C4 and Confirmation Host services are required'); const record = await confirmation.accept(id, proposalId); if (record.kind !== 'canon-supersede') throw new Error('Invalid canon correction proposal kind'); const payload = record.payload as { targetId?: string; correction?: CanonCorrectionInput }; if (!payload.targetId || !payload.correction) throw new Error('Invalid canon correction proposal payload'); const existing = canon.query(id).find((event) => event.id === payload.correction?.id); return { confirmation: record, event: existing ?? await canon.supersede(id, payload.targetId, payload.correction) }; },
    // I60：只读投影 —— 跨项目拒绝由「按 projectId 隔离的 repository + Unknown chapter」
    // 保证（项目 B 读项目 A 的章节 id 必然不存在）；未知场景引用显式抛错。
    chapterList: async (id) => { const t = requireText(); await t.open(id); return projectChapterList(await t.listChapters(id)); },
    chapterRead: async (id, chapterId) => { const t = requireText(); await t.open(id); return toChapterReadResult(await t.readChapter(id, chapterId)); },
    sceneRead: async (id, chapterId, sceneId) => { const t = requireText(); await t.open(id); const chapter = await t.readChapter(id, chapterId); const scene = chapter.scenes.find((item) => item.id === sceneId); if (!scene) throw new Error(`Unknown scene: ${sceneId}`); return toSceneReadResult(chapter, scene); },
    projectList: () => { if (!projects) throw new Error('Project lifecycle Host service is required'); return projects.listProjects(); }, projectCreate: (input) => { if (!projects) throw new Error('Project lifecycle Host service is required'); return projects.createProject(input); }, projectOpen: (id) => { if (!projects) throw new Error('Project lifecycle Host service is required'); return projects.openProject(id); },
    uploadStart: (input) => { if (!upload) throw new Error('Upload Host service is required'); return upload.uploadStart(input); }, uploadChunk: (uploadId, index, base64) => { if (!upload) throw new Error('Upload Host service is required'); return upload.uploadChunk(uploadId, index, base64); }, uploadFinalize: (uploadId) => { if (!upload) throw new Error('Upload Host service is required'); return upload.uploadFinalize(uploadId); }, uploadCancel: async (uploadId) => { if (!upload) throw new Error('Upload Host service is required'); await upload.uploadCancel(uploadId); },
  };
}
