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
import type { NovelTextEditService } from './text-edit-service.js';
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
  /** I61 受控编辑（design §5.12 / R13-2）：固定范围逐字保存（只写 C5）+ 变更 diff 证据。 */
  sceneEdit(projectId: string, chapterId: string, sceneId: string, range: import('../core/edit/index.js').EditRange, replacement: string, baseHash?: string): Promise<{ scene: SceneReadResult['scene']; evidence: import('../core/edit/index.js').EditFingerprint }>;
  sceneReparsePropose(projectId: string, chapterId: string, sceneId: string, range: import('../core/edit/index.js').EditRange, replacement: string, baseHash?: string): Promise<import('./text-edit-service.js').ReparseProposeResult>;
  sceneReparseAccept(projectId: string, chapterId: string, sceneId: string, range: import('../core/edit/index.js').EditRange, replacement: string, proposalId: string, baseHash?: string): Promise<{ status: 'written'; scene: SceneReadResult['scene']; layers: readonly import('./text-edit-service.js').ReparseLayer[] }>;
  sceneReparseReject(projectId: string, proposalId: string): Promise<{ proposalId: string; status: 'rejected' }>;
  projectList(): Promise<import('../core/schema/base.js').ProjectMeta[]>;
  projectCreate(input: import('../core/project/index.js').CreateProjectInput): Promise<import('../core/schema/base.js').ProjectMeta>;
  projectOpen(projectId: string): Promise<import('../core/schema/project-lifecycle.js').ProjectOpenResult>;
  uploadStart(input: UploadStartInput): Promise<UploadStartResult>;
  uploadChunk(uploadId: string, index: number, base64: string): Promise<UploadChunkResult>;
  uploadFinalize(uploadId: string): Promise<UploadFinalizeResult>;
  uploadCancel(uploadId: string): Promise<void>;
}

/** Host adapter; domain services remain the only layer write owners. */
export function createWorkspaceEditorService(characters: NovelCharacterService, worldview: NovelWorldviewService, outline: NovelOutlineService, relationship: NovelRelationshipService, state: NovelStateService, canon: NovelCanonService, confirmation: NovelConfirmationService, projects: NovelProjectService, upload: NovelHostUploadService, text: NovelTextService, textEdit: NovelTextEditService): WorkspaceEditorService {
  return {
    viewModel: workspaceViewModel,
    characterList: (id) => characters.list(id), characterRead: (id, entity) => characters.read(id, entity), characterCreate: (id, input) => characters.create(id, input), characterUpdate: (id, entity, patch) => characters.update(id, entity, patch),
    worldviewList: (id) => worldview.list(id), worldviewRead: (id, entity) => worldview.read(id, entity), worldviewCreate: (id, input) => worldview.create(id, input), worldviewRewrite: (id, entity, input) => worldview.rewrite(id, entity, input),
    outlineRead: (id) => outline.read(id), outlineSave: (id, input) => outline.save(id, input), outlineBeatCards: (id) => outline.beatCards(id), relationshipRead: (id) => relationship.read(id), relationshipSave: (id, input) => relationship.save(id, input),
    stateCurrent: (id) => state.current(id), stateSnapshots: (id) => state.snapshots(id), stateRollback: (id, seq) => state.rollback(id, seq), stateDiff: (id, from, to) => state.diff(id, from, to),
    canonQuery: (id, filter) => canon.query(id, filter),
    canonCorrectionPropose: (id, targetId, input) => confirmation.propose(id, { id: input.id, kind: 'canon-supersede', payload: { targetId, correction: input } }),
    canonCorrectionAccept: async (id, proposalId) => { const record = await confirmation.accept(id, proposalId); if (record.kind !== 'canon-supersede') throw new Error('Invalid canon correction proposal kind'); const payload = record.payload as { targetId?: string; correction?: CanonCorrectionInput }; if (!payload.targetId || !payload.correction) throw new Error('Invalid canon correction proposal payload'); const existing = canon.query(id).find((event) => event.id === payload.correction?.id); return { confirmation: record, event: existing ?? await canon.supersede(id, payload.targetId, payload.correction) }; },
    // I60：只读投影 —— 跨项目拒绝由「按 projectId 隔离的 repository + Unknown chapter」
    // 保证（项目 B 读项目 A 的章节 id 必然不存在）；未知场景引用显式抛错。
    chapterList: async (id) => { await text.open(id); return projectChapterList(await text.listChapters(id)); },
    chapterRead: async (id, chapterId) => { await text.open(id); return toChapterReadResult(await text.readChapter(id, chapterId)); },
    sceneRead: async (id, chapterId, sceneId) => { await text.open(id); const chapter = await text.readChapter(id, chapterId); const scene = chapter.scenes.find((item) => item.id === sceneId); if (!scene) throw new Error(`Unknown scene: ${sceneId}`); return toSceneReadResult(chapter, scene); },
    // I61 受控编辑（R13-2）：文本写与 Gate 归 novelTextEdit；投影仍走最小 owned JSON。
    // sceneEdit 只写 C5；reparse 三方法经 I11 提案→accept/reject（未确认/拒绝零写）。
    // 写回后统一经 textService 重读并投影，保证 Client 只见合法 SceneReadShape。
    sceneEdit: async (id, chapterId, sceneId, range, replacement, baseHash) => {
      await textEdit.open(id);
      const result = await textEdit.edit(id, chapterId, sceneId, range, replacement, baseHash);
      const chapter = await text.readChapter(id, chapterId);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
      return Object.freeze({ scene: toSceneReadResult(chapter, scene).scene, evidence: result.evidence });
    },
    sceneReparsePropose: async (id, chapterId, sceneId, range, replacement, baseHash) => {
      await textEdit.open(id);
      return textEdit.reparsePropose(id, chapterId, sceneId, range, replacement, baseHash);
    },
    sceneReparseAccept: async (id, chapterId, sceneId, range, replacement, proposalId, baseHash) => {
      await textEdit.open(id);
      const result = await textEdit.reparseAccept(id, chapterId, sceneId, range, replacement, proposalId, baseHash);
      const chapter = await text.readChapter(id, chapterId);
      const scene = chapter.scenes.find((item) => item.id === sceneId);
      if (!scene) throw new Error(`Unknown scene: ${sceneId}`);
      return Object.freeze({ status: result.status, scene: toSceneReadResult(chapter, scene).scene, layers: result.layers });
    },
    sceneReparseReject: async (id, proposalId) => { await textEdit.open(id); return textEdit.reparseReject(id, proposalId); },
    projectList: () => projects.listProjects(), projectCreate: (input) => projects.createProject(input), projectOpen: (id) => projects.openProject(id),
    uploadStart: (input) => upload.uploadStart(input), uploadChunk: (uploadId, index, base64) => upload.uploadChunk(uploadId, index, base64), uploadFinalize: (uploadId) => upload.uploadFinalize(uploadId), uploadCancel: async (uploadId) => { await upload.uploadCancel(uploadId); },
  };
}
