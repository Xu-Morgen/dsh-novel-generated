import { unwrap } from '../shared.js';
import { sha256Hex } from '../sha256.js';
import { computeEditRange, type ChapterReadShape, type ChaptersEditOps, type SceneEditorState, type SceneReadShape } from '../layers/chapters.js';
import type { OpsPorts, OpsRuntime } from './context.js';
type EditorPort = Pick<OpsPorts, 'workspace'>;
import type { ChaptersInternal } from './chapters-internal.js';

/**
 * I95 正文编辑 ops 片（计划 §18 I95：ops/chapters 随 layers 拆分——正文段）：
 * 章节/场景导航 + I61 受控编辑（save/reparse/脏文本保护）。跨片依赖经
 * `ChaptersInternal` 晚绑定（discardDraft 调 selectChapter），组合根负责接线。
 */
export function createEditorOps(runtime: OpsRuntime, port: EditorPort, internal: ChaptersInternal) {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const workspace = port.workspace;
  const editorPatch = (patch: Partial<SceneEditorState>): void => act.sceneEditor(patch);
  const reparseLocked = (state: SceneEditorState): boolean => state.reparse.kind === 'proposed' || state.reparse.kind === 'accepting';
  const hashText = sha256Hex;

  const loadScene = (sceneId: string, chapterId: string): void => {
    const target = workspace;
    if (!target || projectId === undefined) return;
    if (!beginOp(`chapters:scene:${sceneId}`)) return;
    const release = (): void => endOp(`chapters:scene:${sceneId}`);
    act.chaptersSelectScene(sceneId);
    void unwrap(target.sceneRead(projectId, chapterId, sceneId)).then((scene) => {
      release();
      if (!isActive()) return;
      const shape = (scene as { scene?: SceneReadShape }).scene;
      act.chaptersScene('ready', scene, undefined);
      // I61：场景装载/重载后以原文初始化编辑器（baseHash 基准 = original）。
      act.sceneEditorReset();
      act.sceneEditor({ mode: 'read', original: shape?.content ?? '', draft: shape?.content ?? '', dirty: false });
    }, (cause: Error) => { release(); if (!isActive()) return; act.chaptersScene('error', undefined, (cause as Error).message); act.sceneEditorReset(); act.chaptersBranches({ status: 'idle', list: [], diff: { status: 'idle', lines: [] } }); });
  };

  const selectChapter = (chapterId: string): void => {
    // I61 脏文本保护：草稿未保存时先弹离开确认，把切换推迟到裁决后。
    const editor = snapshot.chapters.editor;
    if (editor.dirty && !editor.leaveConfirm) { editorPatch({ leaveConfirm: true, pendingNavigation: { chapterId } }); return; }
    const target = workspace;
    if (!target || projectId === undefined) return;
    if (!beginOp(`chapters:chapter:${chapterId}`)) return;
    const release = (): void => endOp(`chapters:chapter:${chapterId}`);
    act.chaptersSelectChapter(chapterId);
    void unwrap(target.chapterRead(projectId, chapterId)).then((read) => {
      release();
      if (!isActive()) return;
      const shape = read as ChapterReadShape;
      act.chaptersRead('ready', shape, undefined);
      if (shape.scenes.length > 0) loadScene(shape.scenes[0].id, chapterId);
      else act.chaptersScene('idle', undefined, undefined);
    }, (cause: Error) => { release(); if (!isActive()) return; act.chaptersRead('error', undefined, (cause as Error).message); });
  };

  const selectScene = (sceneId: string): void => {
    const chapterId = snapshot.chapters.selectedChapterId;
    if (chapterId === undefined) return;
    const editor = snapshot.chapters.editor;
    if (editor.dirty && !editor.leaveConfirm) { editorPatch({ leaveConfirm: true, pendingNavigation: { chapterId, sceneId } }); return; }
    loadScene(sceneId, chapterId);
  };

  const save = (reparse: boolean): void => {
    const target = workspace;
    const editor = snapshot.chapters.editor;
    if (!target || projectId === undefined) return;
    if (editor.saving || reparseLocked(editor)) return;
    if (!beginOp(reparse ? 'chapters:save:reparse' : 'chapters:save')) return;
    const release = (): void => endOp(reparse ? 'chapters:save:reparse' : 'chapters:save');
    const chapterId = snapshot.chapters.selectedChapterId;
    const sceneId = snapshot.chapters.selectedSceneId;
    if (chapterId === undefined || sceneId === undefined) { release(); editorPatch({ error: '请先选择场景' }); return; }
    const diff = computeEditRange(editor.original, editor.draft);
    if (diff.kind === 'none') { release(); editorPatch({ error: '没有需要保存的修改' }); return; }
    editorPatch({ saving: true, error: '', saveMessage: '' });
    // baseHash = 装载时正文哈希：Host 核对当前文本一致才允许写（脏文本保护）。
    void hashText(editor.original).then((baseHash) => {
      if (reparse) {
        void unwrap(target.sceneReparsePropose(projectId, chapterId, sceneId, diff.range, diff.replacement, baseHash)).then((proposal) => {
          release();
          if (!isActive()) return;
          const p = proposal as { proposalId?: string; status?: string };
          if (!p.proposalId) { editorPatch({ saving: false, error: '重解析提案失败：缺少 proposalId' }); return; }
          // 幂等提议：同一编辑重复提议返回既有提案（可能是已拒绝/已处理）。
          if (p.status === 'rejected') { editorPatch({ saving: false, saveMessage: '', reparse: { kind: 'rejected' } }); return; }
          if (p.status === 'accepted') { editorPatch({ saving: false, saveMessage: '', reparse: { kind: 'done', message: '该重解析提案此前已确认并应用' } }); return; }
          editorPatch({ saving: false, saveMessage: '', reparse: { kind: 'proposed', proposalId: p.proposalId, range: diff.range, replacement: diff.replacement, baseHash } });
        }, (cause: Error) => { release(); if (!isActive()) return; editorPatch({ saving: false, error: (cause as Error).message }); });
      } else {
        void unwrap(target.sceneEdit(projectId, chapterId, sceneId, diff.range, diff.replacement, baseHash)).then((result) => {
          release();
          if (!isActive()) return;
          const r = result as { scene?: SceneReadShape };
          const content = r.scene?.content ?? editor.draft;
          act.chaptersScene('ready', { scene: r.scene }, undefined);
          editorPatch({ saving: false, saveMessage: '已保存', dirty: false, original: content, draft: content, error: '' });
        }, (cause: Error) => { release(); if (!isActive()) return; editorPatch({ saving: false, error: (cause as Error).message }); });
      }
    }, (cause: Error) => { release(); if (!isActive()) return; editorPatch({ saving: false, error: (cause as Error).message }); });
  };

  const acceptReparse = (): void => {
    const target = workspace;
    const editor = snapshot.chapters.editor;
    const r = editor.reparse;
    if (!target || projectId === undefined || r.kind !== 'proposed') return;
    if (!beginOp('chapters:reparse:accept')) return;
    const release = (): void => endOp('chapters:reparse:accept');
    const chapterId = snapshot.chapters.selectedChapterId;
    const sceneId = snapshot.chapters.selectedSceneId;
    if (chapterId === undefined || sceneId === undefined) { release(); editorPatch({ reparse: { kind: 'error', message: '请先选择场景' } }); return; }
    editorPatch({ reparse: { kind: 'accepting', proposalId: r.proposalId, range: r.range, replacement: r.replacement, baseHash: r.baseHash } });
    // accept 再带 baseHash：Host 在 propose→accept 窗口内核对正文未变（脏文本保护）。
    void unwrap(target.sceneReparseAccept(projectId, chapterId, sceneId, r.range, r.replacement, r.proposalId, r.baseHash)).then((result) => {
      release();
      if (!isActive()) return;
      const res = result as { scene?: SceneReadShape; layers?: string[] };
      const content = res.scene?.content ?? editor.draft;
      act.chaptersScene('ready', { scene: res.scene }, undefined);
      editorPatch({ saving: false, dirty: false, original: content, draft: content, error: '', saveMessage: '', reparse: { kind: 'done', message: `已重解析并同步：${(res.layers ?? []).join(' / ')}` } });
    }, (cause: Error) => { release(); if (!isActive()) return; editorPatch({ reparse: { kind: 'error', message: (cause as Error).message } }); });
  };

  const rejectReparse = (): void => {
    const target = workspace;
    const r = snapshot.chapters.editor.reparse;
    if (!target || projectId === undefined || r.kind !== 'proposed') return;
    if (!beginOp('chapters:reparse:reject')) return;
    const release = (): void => endOp('chapters:reparse:reject');
    void unwrap(target.sceneReparseReject(projectId, r.proposalId)).then(() => { release(); if (!isActive()) return; editorPatch({ reparse: { kind: 'rejected' } }); }, (cause: Error) => { release(); if (!isActive()) return; editorPatch({ reparse: { kind: 'error', message: (cause as Error).message } }); });
  };

  const discardDraft = (): void => {
    const pending = snapshot.chapters.editor.pendingNavigation;
    editorPatch({ leaveConfirm: false, pendingNavigation: undefined, dirty: false, saveMessage: '', error: '' });
    if (pending !== undefined) {
      if (pending.sceneId !== undefined && pending.chapterId === snapshot.chapters.selectedChapterId) loadScene(pending.sceneId, pending.chapterId);
      else selectChapter(pending.chapterId);
    }
  };

  const ops: Pick<ChaptersEditOps,
    'selectChapter' | 'selectScene' | 'openScene' | 'retryChapter' | 'retryScene' | 'startEdit' | 'textChange' | 'save' | 'acceptReparse' | 'rejectReparse' | 'discardDraft' | 'cancelLeave'> = {
    selectChapter,
    selectScene,
    retryChapter() {
      const chapterId = snapshot.chapters.selectedChapterId;
      if (chapterId !== undefined) selectChapter(chapterId);
    },
    retryScene() {
      const sceneId = snapshot.chapters.selectedSceneId;
      const chapterId = snapshot.chapters.selectedChapterId;
      if (sceneId !== undefined && chapterId !== undefined) loadScene(sceneId, chapterId);
    },
    startEdit() { editorPatch({ mode: 'edit' }); },
    textChange(value) {
      const editor = snapshot.chapters.editor;
      editorPatch({ draft: value, dirty: value !== editor.original, saveMessage: '', error: '' });
    },
    save,
    acceptReparse,
    rejectReparse,
    discardDraft,
    cancelLeave() { editorPatch({ leaveConfirm: false, pendingNavigation: undefined }); },
    // I71 搜索结果跳转（R14-6）：打开指定章节/场景（脏文本保护复用离开确认）。
    openScene(chapterId, sceneId) {
      const editor = snapshot.chapters.editor;
      if (editor.dirty && !editor.leaveConfirm) { editorPatch({ leaveConfirm: true, pendingNavigation: { chapterId, sceneId } }); return; }
      const target = workspace;
      if (!target || projectId === undefined) return;
      if (!beginOp(`chapters:jump:${chapterId}`)) return;
      const release = (): void => endOp(`chapters:jump:${chapterId}`);
      act.chaptersSelectChapter(chapterId);
      void unwrap(target.chapterRead(projectId, chapterId)).then((read) => {
        release();
        if (!isActive()) return;
        act.chaptersRead('ready', read as ChapterReadShape, undefined);
        loadScene(sceneId, chapterId);
      }, (cause: Error) => { release(); if (!isActive()) return; act.chaptersRead('error', undefined, (cause as Error).message); });
    },
  };
  return { ops, loadScene, selectChapter };
}
