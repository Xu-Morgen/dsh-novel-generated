// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// chapters 层编辑动作 = I60/I61 C5 正文工作台 ops（R13-1/R13-2）：只读导航 + 受控编辑 + I63 候选裁决 + I70 版本/分支。

import { unwrap } from '../shared.js';
import { sha256Hex } from '../sha256.js';
import type { BranchNamespace } from '../shared.js';
import { computeEditRange } from '../layers/chapters.js';
import type { BranchDiffLineShape, BranchPanelState, BranchSummaryShape, CandidatePanelState, CandidateReviewShape, ChapterReadShape, ChaptersEditOps, SceneEditorState, SceneReadShape } from '../layers/chapters.js';
import type { WritingAdjudicationOutcome } from '../store/types.js';
import type { OpsContext } from './context.js';

export function createChaptersOps(ctx: OpsContext, ref: { current?: ChaptersEditOps }): ChaptersEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = ctx;
  const projectId = ctx.projectId;
  const workspace = ctx.workspace;
  const writing = ctx.writing;
  const branchNamespace = ctx.branchNamespace;
      const editorPatch = (patch: Partial<SceneEditorState>): void => act.sceneEditor(patch);
      const reparseLocked = (state: SceneEditorState): boolean => state.reparse.kind === 'proposed' || state.reparse.kind === 'accepting';
      const hashText = sha256Hex;
      // ---- I70 版本/分支面板（R14-5）：列表装载 / 命名存档 / 选用 / 对比 ----
      const branchesPatch = (patch: Partial<BranchPanelState>): void => act.chaptersBranches(patch);
      // 注意：branchesLoad 必须显式接收 chapterId/sceneId —— makeOps 渲染闭包
      // 快照里 selected* 尚未更新（与 loadScene 同一陈旧闭包缺陷，见上注释）。
      const branchesLoad = (chapterId?: string, sceneId?: string): void => {
        const target = branchNamespace;
        const cid = chapterId ?? snapshot.chapters.selectedChapterId;
        const sid = sceneId ?? snapshot.chapters.selectedSceneId;
        if (!target || projectId === undefined || cid === undefined || sid === undefined) return;
        if (!beginOp(`branches:list:${sid}`)) return;
        const release = (): void => endOp(`branches:list:${sid}`);
        branchesPatch({ status: 'loading', message: undefined });
        void unwrap(target.list(projectId, cid, sid)).then((result) => {
          release();
          if (!isActive()) return;
          const list = ((result as { branches?: BranchSummaryShape[] }).branches ?? []) as BranchSummaryShape[];
          branchesPatch({ status: 'ready', list, message: undefined });
        }, (cause: Error) => { release(); if (!isActive()) return; branchesPatch({ status: 'error', message: (cause as Error).message }); });
      };
      const branchSave = (): void => {
        const target = branchNamespace;
        const current = snapshot.chapters.branches;
        const chapterId = snapshot.chapters.selectedChapterId;
        const sceneId = snapshot.chapters.selectedSceneId;
        if (!target || projectId === undefined || chapterId === undefined || sceneId === undefined) return;
        const label = current.labelDraft.trim();
        if (label === '') { branchesPatch({ message: '请先输入版本名称' }); return; }
        if (current.acting || !beginOp('branches:save')) return;
        const release = (): void => endOp('branches:save');
        branchesPatch({ acting: true, message: undefined });
        void unwrap(target.save(projectId, chapterId, sceneId, label)).then((result) => {
          release();
          if (!isActive()) return;
          const saved = (result as { branches?: BranchSummaryShape[] }).branches;
          branchesPatch({ acting: false, status: 'ready', list: (saved ?? current.list) as BranchSummaryShape[], labelDraft: '', message: '已存档当前版本' });
        }, (cause: Error) => { release(); if (!isActive()) return; branchesPatch({ acting: false, message: (cause as Error).message }); });
      };
      const branchChoose = (branchId: string): void => {
        const target = branchNamespace;
        const current = snapshot.chapters.branches;
        const chapterId = snapshot.chapters.selectedChapterId;
        const sceneId = snapshot.chapters.selectedSceneId;
        if (!target || projectId === undefined || chapterId === undefined || sceneId === undefined) return;
        if (current.acting || !beginOp(`branches:choose:${branchId}`)) return;
        const release = (): void => endOp(`branches:choose:${branchId}`);
        branchesPatch({ acting: true, message: undefined });
        void unwrap(target.choose(projectId, chapterId, sceneId, branchId)).then((result) => {
          release();
          if (!isActive()) return;
          const chosen = (result as { branches?: BranchSummaryShape[]; content?: string });
          branchesPatch({ acting: false, status: 'ready', list: (chosen.branches ?? current.list) as BranchSummaryShape[], message: '已切换版本（只改正文，未同步结构层；如需同步请显式重解析）' });
          // 切换后正文变化：重载场景，让编辑器以新原文初始化（baseHash 随之更新）。
          if (chosen.content !== undefined && chosen.content !== snapshot.chapters.editor.original && sceneId !== undefined) loadScene(sceneId, chapterId);
        }, (cause: Error) => { release(); if (!isActive()) return; branchesPatch({ acting: false, message: (cause as Error).message }); });
      };
      const branchDiff = (branchId: string): void => {
        const target = branchNamespace;
        const chapterId = snapshot.chapters.selectedChapterId;
        const sceneId = snapshot.chapters.selectedSceneId;
        if (!target || projectId === undefined || chapterId === undefined || sceneId === undefined) return;
        if (!beginOp(`branches:diff:${branchId}`)) return;
        const release = (): void => endOp(`branches:diff:${branchId}`);
        branchesPatch({ diff: { status: 'loading', lines: [] }, message: undefined });
        void unwrap(target.diff(projectId, chapterId, sceneId, branchId, undefined)).then((result) => {
          release();
          if (!isActive()) return;
          const diff = result as { from?: { label: string }; to?: { label: string }; lines?: BranchDiffLineShape[] };
          branchesPatch({ diff: { status: 'ready', fromLabel: diff.from?.label, toLabel: diff.to?.label, lines: (diff.lines ?? []) as BranchDiffLineShape[] } });
        }, (cause: Error) => { release(); if (!isActive()) return; branchesPatch({ diff: { status: 'error', lines: [], message: (cause as Error).message } }); });
      };
      const branchCloseDiff = (): void => branchesPatch({ diff: { status: 'idle', lines: [] } });
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
          // I70：装载后刷新该场景的版本列表（chosen 唯一投影）。
          branchesLoad(chapterId, sceneId);
        }, (cause: Error) => { release(); if (!isActive()) return; act.chaptersScene('error', undefined, (cause as Error).message); act.sceneEditorReset(); branchesPatch({ status: 'idle', list: [], diff: { status: 'idle', lines: [] } }); });
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
      // ---- I63 候选审阅与生成后裁决（R13-4）----
      const candidatePatch = (patch: Partial<CandidatePanelState>): void => act.chaptersCandidate(patch);
      // accept 成功后刷新章节树与当前章节，让新场景/替换后的场景立即可见。
      const reloadChapters = (): void => {
        const target = workspace;
        if (!target || projectId === undefined) return;
        void unwrap(target.chapterList(projectId)).then((list) => {
          if (!isActive()) return;
          act.setChapters('ready', list as unknown[]);
          const chapterId = snapshot.chapters.selectedChapterId;
          if (chapterId !== undefined) selectChapter(chapterId);
        }, (cause: Error) => { if (isActive()) act.setChapters('error', [], (cause as Error).message); });
      };
      // 候选生成后立即预览（正文 + diff + 校验结果），ready 才允许裁决。
      const previewAfterPropose = (candidateId: string, onReady: () => void): void => {
        const target = writing;
        if (!target) { candidatePatch({ ui: { kind: 'error', message: '候选审阅服务不可用' } }); return; }
        void unwrap(target.preview(candidateId)).then((review) => {
          if (!isActive()) return;
          candidatePatch({ ui: { kind: 'ready', review: review as CandidateReviewShape } });
          onReady();
        }, (cause: Error) => { if (isActive()) candidatePatch({ ui: { kind: 'error', message: (cause as Error).message } }); });
      };
      const proposeWriting = (intent: 'continue' | 'scene-card'): void => {
        const target = writing;
        if (!target || projectId === undefined) { candidatePatch({ ui: { kind: 'error', message: '候选审阅服务不可用' } }); return; }
        if (!beginOp(`writing:propose:${intent}`)) return;
        const release = (): void => endOp(`writing:propose:${intent}`);
        candidatePatch({ ui: { kind: 'proposing', intent } });
        void unwrap(target.propose(projectId, { intent }, undefined)).then((result) => {
          release();
          if (!isActive()) return;
          const candidate = (result as { candidate?: { id: string } }).candidate;
          if (!candidate?.id) { candidatePatch({ ui: { kind: 'error', message: '候选生成失败：缺少候选 id' } }); return; }
          previewAfterPropose(candidate.id, () => undefined);
        }, (cause: Error) => { release(); if (!isActive()) return; candidatePatch({ ui: { kind: 'error', message: (cause as Error).message } }); });
      };
      const proposeRewrite = (): void => {
        const target = writing;
        const chapterId = snapshot.chapters.selectedChapterId;
        const sceneId = snapshot.chapters.selectedSceneId;
        const prompt = snapshot.chapters.candidate.rewritePrompt;
        if (!target || projectId === undefined) { candidatePatch({ ui: { kind: 'error', message: '候选审阅服务不可用' } }); return; }
        if (chapterId === undefined || sceneId === undefined) { candidatePatch({ ui: { kind: 'error', message: '请先选择要重写的场景' } }); return; }
        if (prompt.trim() === '') return;
        if (!beginOp('writing:propose:rewrite')) return;
        const release = (): void => endOp('writing:propose:rewrite');
        candidatePatch({ ui: { kind: 'proposing', intent: 'rewrite' } });
        void unwrap(target.propose(projectId, { intent: 'rewrite', chapterId, sceneId, prompt }, undefined)).then((result) => {
          release();
          if (!isActive()) return;
          const candidate = (result as { candidate?: { id: string } }).candidate;
          if (!candidate?.id) { candidatePatch({ ui: { kind: 'error', message: '候选生成失败：缺少候选 id' } }); return; }
          previewAfterPropose(candidate.id, () => undefined);
        }, (cause: Error) => { release(); if (!isActive()) return; candidatePatch({ ui: { kind: 'error', message: (cause as Error).message } }); });
      };
      const adjudicateCandidate = (decision: 'accept' | 'reject' | 'rewrite'): void => {
        const target = writing;
        const ui = snapshot.chapters.candidate.ui;
        if (!target || projectId === undefined || ui.kind !== 'ready') return;
        const candidateId = ui.review.candidateId;
        // I59 双击幂等：同候选同裁决在 Remote 返回前至多提交一次。
        if (!beginOp(`writing:adjudicate:${candidateId}:${decision}`)) return;
        const release = (): void => endOp(`writing:adjudicate:${candidateId}:${decision}`);
        candidatePatch({ ui: { kind: 'acting', review: ui.review, action: decision } });
        void unwrap(target.adjudicate(candidateId, decision, undefined)).then((result) => {
          release();
          if (!isActive()) return;
          const outcome = result as WritingAdjudicationOutcome;
          if (outcome.status === 'written') {
            candidatePatch({ ui: { kind: 'done', message: `已接受并落盘：${outcome.scene.chapterId}/${outcome.scene.sceneId}（已同步 ${outcome.layers.length} 层）` } });
            reloadChapters();
          } else if (outcome.status === 'rejected') {
            candidatePatch({ ui: { kind: 'done', message: '已拒绝候选，未写入任何内容' } });
          } else if (outcome.status === 'rewritten') {
            // 后继候选：立即审阅新候选（旧候选已被 Host 置为 superseded，不可静默接受）。
            previewAfterPropose(outcome.candidate.id, () => undefined);
          } else if (outcome.status === 'generation-rejected' || outcome.status === 'prewrite-rejected') {
            candidatePatch({ ui: { kind: 'error', message: '校验未通过：存在硬冲突，未写入任何内容。请重写候选。' } });
          } else if (outcome.status === 'pending-compensation') {
            candidatePatch({ ui: { kind: 'error', message: `写回中断（${outcome.failedStage}），未完成。请重试或重写。` } });
          }
        }, (cause: Error) => { release(); if (!isActive()) return; candidatePatch({ ui: { kind: 'error', message: (cause as Error).message } }); });
      };
      const chaptersOpsResult: ChaptersEditOps = {
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
        proposeWriting,
        rewritePromptChange(value) { candidatePatch({ rewritePrompt: value }); },
        proposeRewrite,
        adjudicateCandidate,
        dismissCandidate() { candidatePatch({ ui: { kind: 'idle' }, rewritePrompt: '' }); },
        // I70 版本/分支面板（R14-5）。
        branchesLoad,
        branchLabelChange(value) { branchesPatch({ labelDraft: value }); },
        branchSave,
        branchChoose,
        branchDiff,
        branchCloseDiff,
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
      ref.current = chaptersOpsResult;
      return chaptersOpsResult;
}
