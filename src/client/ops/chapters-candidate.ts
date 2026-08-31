import { unwrap } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import type { CandidatePanelState, ChaptersEditOps } from '../layers/chapters.js';
import type { OpsPorts, OpsRuntime } from './context.js';
type CandidatePort = Pick<OpsPorts, 'workspace' | 'writing'>;
import type { ChaptersInternal } from './chapters-internal.js';
import { sha256Hex } from '../sha256.js';
import type { PolishMode } from '../../core/candidate/index.js';
import { completePolishScene, failPolishSession, orderPolishScenes, selectNextPolishScene, startPolishSession, stopPolishSession, type PolishSessionState } from '../polish-session.js';

// 渲染会重建 ops 工厂，但同一 Fiber 的 store actions 身份稳定；令牌以弱引用
// 绑定 actions，才能让停止/切场景跨渲染失效晚到的 Remote 结果，同时不持有 Fiber。
const polishRunTokens = new WeakMap<object, number>();

/**
 * I95 候选审阅 ops 片（计划 §18 I95：ops/chapters 随 layers 拆分——候选段，
 * 原 210-293 行）：I63 生成后候选提议/预览/裁决（R13-4）。跨片依赖经
 * `ChaptersInternal` 晚绑定（reloadChapters 调 selectChapter）。
 */
export function createCandidateOps(runtime: OpsRuntime, port: CandidatePort, internal: ChaptersInternal) {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const workspace = port.workspace;
  const writing = port.writing;
  const candidatePatch = (patch: Partial<CandidatePanelState>): void => act.chaptersCandidate(patch);
  const candidatePatchForRevision = (patch: Partial<CandidatePanelState>, navigationRevision: number): void => act.chaptersCandidateForRevision(patch, navigationRevision);
  const workflowPatchForRevision = (patch: Parameters<typeof act.chaptersWorkflowForRevision>[0], navigationRevision: number): void => act.chaptersWorkflowForRevision(patch, navigationRevision);
  const polishPatch = (state: PolishSessionState): void => act.chaptersPolish(state);
  const polishPatchForRevision = (state: PolishSessionState, navigationRevision: number): void => act.chaptersPolishForRevision(state, navigationRevision);
  let targetSequence = 0;
  const currentPolishRunToken = (): number => polishRunTokens.get(act as object) ?? 0;
  const bumpPolishRunToken = (): number => {
    const next = currentPolishRunToken() + 1;
    polishRunTokens.set(act as object, next);
    return next;
  };
  const freshSceneId = (): string => `scene-${Date.now()}-${++targetSequence}`;
  // accept 成功后刷新章节树与当前章节，让新场景/替换后的场景立即可见。
  const reloadChapters = (): void => {
    const target = workspace;
    if (!target || projectId === undefined) return;
    void unwrap(target.chapterList(projectId)).then((list) => {
      if (!isActive()) return;
      act.setChapters('ready', list as unknown[]);
      const chapterId = snapshot.chapters.selectedChapterId;
      if (chapterId !== undefined) internal.selectChapter(chapterId);
    }, (cause: Error) => { if (isActive()) act.setChapters('error', [], toUserMessage(cause)); });
  };
  // 候选生成后先取得兼容的正文审阅，再取得 I110 五层结构化预览；两者
  // 都完成后才进入 ready，避免作者在 plan 尚未冻结时触发 accept。
  const previewAfterPropose = (candidateId: string, navigationRevision: number, onReady: () => void, guard: () => boolean = () => true): void => {
    const target = writing;
    if (!target) { candidatePatch({ ui: { kind: 'error', message: '候选审阅服务不可用' } }); return; }
    void unwrap(target.preview(candidateId)).then((review) => {
      if (!isActive() || !guard()) return;
      void unwrap(target.previewLayers(candidateId)).then((layerPreview) => {
        if (!isActive() || !guard()) return;
        candidatePatchForRevision({ ui: { kind: 'ready', review, layerPreview } }, navigationRevision);
        const generationBaseline = layerPreview.generationBaseline.kind === 'baseline'
          ? layerPreview.generationBaseline.generationBaselineId
          : undefined;
        workflowPatchForRevision({ status: 'ready', sceneId: review.target.sceneId, sourceHash: review.target.sourceHash, baselineId: generationBaseline, traceSectionCount: review.trace?.sections.length, message: '候选已就绪，请审阅正文与变更。' }, navigationRevision);
        onReady();
      }, (cause: Error) => { if (isActive() && guard()) { const message = toUserMessage(cause); candidatePatchForRevision({ ui: { kind: 'error', message } }, navigationRevision); workflowPatchForRevision({ status: 'error', message }, navigationRevision); } });
    }, (cause: Error) => { if (isActive() && guard()) { const message = toUserMessage(cause); candidatePatchForRevision({ ui: { kind: 'error', message } }, navigationRevision); workflowPatchForRevision({ status: 'error', message }, navigationRevision); } });
  };
  const proposeWriting = (intent: 'continue' | 'scene-card'): void => {
    const target = writing;
    if (!target || projectId === undefined) { candidatePatch({ ui: { kind: 'error', message: '候选审阅服务不可用' } }); return; }
    const chapterId = snapshot.chapters.selectedChapterId;
    const navigationRevision = snapshot.chapters.navigationRevision;
    if (chapterId === undefined) { candidatePatch({ ui: { kind: 'error', message: '请先选择目标章节' } }); return; }
    if (!beginOp(`writing:propose:${intent}`)) return;
    const release = (): void => endOp(`writing:propose:${intent}`);
    candidatePatch({ ui: { kind: 'proposing', intent } });
    workflowPatchForRevision({ status: 'loading', projectId, chapterId, message: '正在生成候选…' }, navigationRevision);
    void unwrap(target.proposeAt(projectId, { intent, chapterId, sceneId: freshSceneId() }, undefined)).then((result) => {
      release();
      if (!isActive()) return;
      previewAfterPropose(result.candidate.id, navigationRevision, () => undefined);
      }, (cause: Error) => { release(); if (!isActive()) return; const message = toUserMessage(cause); candidatePatchForRevision({ ui: { kind: 'error', message } }, navigationRevision); workflowPatchForRevision({ status: 'error', message }, navigationRevision); });
  };
  const proposeRewrite = (): void => {
    const target = writing;
    const chapterId = snapshot.chapters.selectedChapterId;
    const sceneId = snapshot.chapters.selectedSceneId;
    const prompt = snapshot.chapters.candidate.rewritePrompt;
    const navigationRevision = snapshot.chapters.navigationRevision;
    if (!target || projectId === undefined) { candidatePatch({ ui: { kind: 'error', message: '候选审阅服务不可用' } }); return; }
    if (chapterId === undefined || sceneId === undefined) { candidatePatch({ ui: { kind: 'error', message: '请先选择要重写的场景' } }); return; }
    if (prompt.trim() === '') return;
    if (!beginOp('writing:propose:rewrite')) return;
    const release = (): void => endOp('writing:propose:rewrite');
    candidatePatch({ ui: { kind: 'proposing', intent: 'rewrite' } });
    workflowPatchForRevision({ status: 'loading', projectId, chapterId, sceneId, message: '正在生成重写候选…' }, navigationRevision);
    void unwrap(target.propose(projectId, { intent: 'rewrite', chapterId, sceneId, prompt }, undefined)).then((result) => {
      release();
      if (!isActive()) return;
      previewAfterPropose(result.candidate.id, navigationRevision, () => undefined);
    }, (cause: Error) => { release(); if (!isActive()) return; const message = toUserMessage(cause); candidatePatchForRevision({ ui: { kind: 'error', message } }, navigationRevision); workflowPatchForRevision({ status: 'error', message }, navigationRevision); });
  };
  /** I122：章节润色只启动一个当前 scene 的 rewrite candidate；不建批次请求。 */
  const proposePolishScene = (session: PolishSessionState, navigationRevision: number): void => {
    const target = writing;
    const chapterId = session.chapterId;
    const sceneId = session.currentSceneId;
    const mode = session.mode;
    if (!target || projectId === undefined || chapterId === undefined || sceneId === undefined || mode === undefined) {
      polishPatchForRevision(failPolishSession(session, '润色目标或服务不可用'), navigationRevision);
      return;
    }
    const runToken = currentPolishRunToken();
    const operationKey = `writing:polish:${chapterId}:${sceneId}`;
    if (!beginOp(operationKey)) return;
    const release = (): void => endOp(operationKey);
    const guard = (): boolean => currentPolishRunToken() === runToken;
    candidatePatchForRevision({ ui: { kind: 'proposing', intent: 'rewrite' } }, navigationRevision);
    workflowPatchForRevision({ status: 'loading', projectId, chapterId, sceneId, message: '正在生成当前场景润色候选…' }, navigationRevision);
    void unwrap(target.propose(projectId, {
      intent: 'rewrite', chapterId, sceneId,
      prompt: '请在不改变故事事实、人物关系、叙事视角与事件顺序的前提下润色当前场景正文。',
      polishMode: mode,
    }, undefined)).then((result) => {
      release();
      if (!isActive() || !guard()) return;
      previewAfterPropose(result.candidate.id, navigationRevision, () => undefined, guard);
    }, (cause: Error) => {
      release();
      if (!isActive() || !guard()) return;
      const message = toUserMessage(cause);
      candidatePatchForRevision({ ui: { kind: 'error', message } }, navigationRevision);
      polishPatchForRevision(failPolishSession(session, message), navigationRevision);
      workflowPatchForRevision({ status: 'error', message }, navigationRevision);
    });
  };

  const focusPolishScene = (chapterId: string, sceneId: string): number => {
    const current = snapshot.chapters;
    const revision = current.navigationRevision + (current.selectedSceneId === sceneId && current.selectedChapterId === chapterId ? 0 : 1);
    if (revision !== current.navigationRevision) internal.loadScene(sceneId, chapterId);
    return revision;
  };

  const startPolish = (mode: PolishMode = 'language'): void => {
    const target = writing;
    const chapterId = snapshot.chapters.selectedChapterId;
    const read = snapshot.chapters.chapter.read;
    if (!target || projectId === undefined) {
      polishPatch(failPolishSession(snapshot.chapters.polish, '候选审阅服务不可用'));
      return;
    }
    if (chapterId === undefined || read === undefined) {
      polishPatch(failPolishSession(snapshot.chapters.polish, '请先选择已读取的章节'));
      return;
    }
    if (snapshot.chapters.polish.status === 'running') return;
    const scenes = orderPolishScenes(read.scenes);
    let session: PolishSessionState;
    try {
      const firstSceneId = scenes[0]?.id;
      if (firstSceneId === undefined) throw new Error('当前章节没有可润色的场景');
      const navigationRevision = focusPolishScene(chapterId, firstSceneId);
      session = startPolishSession({ projectId, chapterId, scenes, mode, navigationRevision });
    } catch (cause) {
      polishPatch(failPolishSession(snapshot.chapters.polish, toUserMessage(cause)));
      return;
    }
    bumpPolishRunToken();
    polishPatchForRevision(session, session.navigationRevision);
    proposePolishScene(session, session.navigationRevision);
  };

  const nextPolishScene = (): void => {
    const session = snapshot.chapters.polish;
    if (session.status !== 'running' || session.currentSceneId !== undefined || session.chapterId === undefined) return;
    const nextSceneId = session.sceneIds[session.completedCount];
    if (nextSceneId === undefined) return;
    const navigationRevision = focusPolishScene(session.chapterId, nextSceneId);
    const next = selectNextPolishScene(session, navigationRevision);
    bumpPolishRunToken();
    polishPatchForRevision(next, navigationRevision);
    proposePolishScene(next, navigationRevision);
  };

  const stopPolish = (): void => {
    const session = snapshot.chapters.polish;
    if (session.status !== 'running') return;
    bumpPolishRunToken();
    polishPatch(stopPolishSession(session));
    candidatePatch({ ui: { kind: 'idle' } });
    workflowPatchForRevision({ status: 'cancelled', message: '章节润色已停止，未启动后续场景。' }, snapshot.chapters.navigationRevision);
  };

  const restartPolish = (mode?: PolishMode): void => {
    if (snapshot.chapters.polish.status === 'running') return;
    startPolish(mode ?? snapshot.chapters.polish.mode ?? 'language');
  };

  const adjudicateCandidate = (decision: 'accept' | 'reject' | 'rewrite'): void => {
    const target = writing;
    const ui = snapshot.chapters.candidate.ui;
    if (!target || projectId === undefined || ui.kind !== 'ready') return;
    const candidateId = ui.review.candidateId;
    const navigationRevision = snapshot.chapters.navigationRevision;
    // I59 双击幂等：同候选同裁决在 Remote 返回前至多提交一次。
    if (!beginOp(`writing:adjudicate:${candidateId}:${decision}`)) return;
    const release = (): void => endOp(`writing:adjudicate:${candidateId}:${decision}`);
    candidatePatchForRevision({ ui: { kind: 'acting', review: ui.review, layerPreview: ui.layerPreview, action: decision } }, navigationRevision);
    void unwrap(target.adjudicate(candidateId, decision, undefined)).then((result) => {
      release();
      if (!isActive()) return;
      const outcome = result;
      if (outcome.status === 'written') {
        candidatePatchForRevision({ ui: { kind: 'done', message: `已接受并保存正文（已同步 ${outcome.layers.length} 项关联信息）` } }, navigationRevision);
        const polish = snapshot.chapters.polish;
        if (polish.status === 'running' && polish.currentSceneId === outcome.scene.sceneId && polish.chapterId === outcome.scene.chapterId) {
          polishPatchForRevision(completePolishScene(polish, outcome.scene.sceneId), navigationRevision);
        }
        void sha256Hex(outcome.scene.content).then((sourceHash) => {
          if (isActive()) workflowPatchForRevision({ status: 'saved', projectId, chapterId: outcome.scene.chapterId, sceneId: outcome.scene.sceneId, sourceHash, message: '正文已保存，可继续下一场景。' }, navigationRevision);
        });
        // 章节润色会话需要在本次接受后继续持有 scene 游标；重新 selectChapter
        // 会按导航语义清空 Client 会话，因此只让普通单候选流程刷新投影。
        if (snapshot.chapters.polish.status !== 'running') reloadChapters();
      } else if (outcome.status === 'rejected') {
        candidatePatchForRevision({ ui: { kind: 'done', message: '已拒绝候选，未写入任何内容' } }, navigationRevision);
        const polish = snapshot.chapters.polish;
        if (polish.status === 'running' && polish.currentSceneId === ui.review.target.sceneId) polishPatchForRevision(failPolishSession(polish, '当前场景润色候选已拒绝'), navigationRevision);
        workflowPatchForRevision({ status: 'rejected', message: '候选已拒绝，未写入正文。' }, navigationRevision);
      } else if (outcome.status === 'rewritten') {
        // 后继候选：立即审阅新候选（旧候选已被 Host 置为 superseded，不可静默接受）。
        const runToken = currentPolishRunToken();
        previewAfterPropose(outcome.candidate.id, navigationRevision, () => undefined, snapshot.chapters.polish.status === 'running' ? () => currentPolishRunToken() === runToken : undefined);
      } else if (outcome.status === 'generation-rejected' || outcome.status === 'prewrite-rejected') {
        candidatePatchForRevision({ ui: { kind: 'error', message: '校验未通过：存在硬冲突，未写入任何内容。请重写候选。' } }, navigationRevision);
        const polish = snapshot.chapters.polish;
        if (polish.status === 'running') polishPatchForRevision(failPolishSession(polish, '当前场景润色候选未通过校验'), navigationRevision);
        workflowPatchForRevision({ status: 'error', message: '校验未通过，未写入正文。' }, navigationRevision);
      } else if (outcome.status === 'pending-compensation') {
        candidatePatchForRevision({ ui: { kind: 'error', message: `写回中断（${outcome.failedStage}），未完成。请重试或重写。` } }, navigationRevision);
        const polish = snapshot.chapters.polish;
        if (polish.status === 'running') polishPatchForRevision(failPolishSession(polish, '当前场景润色落地未完成'), navigationRevision);
        workflowPatchForRevision({ status: 'error', message: '写作落地未完成，请重试或重写。' }, navigationRevision);
      }
    }, (cause: Error) => {
      release();
      if (!isActive()) return;
      const message = toUserMessage(cause);
      candidatePatchForRevision({ ui: { kind: 'error', message } }, navigationRevision);
      const polish = snapshot.chapters.polish;
      if (polish.status === 'running' && polish.currentSceneId === ui.review.target.sceneId) polishPatchForRevision(failPolishSession(polish, message), navigationRevision);
      workflowPatchForRevision({ status: 'error', message }, navigationRevision);
    });
  };

  /**
   * I135 main path: only the chosen C5 prose is written. The legacy accept
   * command remains available above for compatibility, but the author-facing
   * button deliberately calls this additive Host method.
   */
  const adoptDraftCandidate = (): void => {
    const target = writing;
    const ui = snapshot.chapters.candidate.ui;
    if (!target || projectId === undefined || ui.kind !== 'ready') return;
    const candidateId = ui.review.candidateId;
    const navigationRevision = snapshot.chapters.navigationRevision;
    if (!beginOp(`writing:adoptDraft:${candidateId}`)) return;
    const release = (): void => endOp(`writing:adoptDraft:${candidateId}`);
    candidatePatchForRevision({ ui: { kind: 'acting', review: ui.review, layerPreview: ui.layerPreview, action: 'adopt' } }, navigationRevision);
    void unwrap(target.adoptDraft(candidateId)).then((result) => {
      release();
      if (!isActive()) return;
      candidatePatchForRevision({ ui: { kind: 'done', message: result.status === 'already-adopted' ? '候选已是草稿，正文保持不变。' : '候选已接受为草稿，可继续编辑正文。' } }, navigationRevision);
      const polish = snapshot.chapters.polish;
      if (polish.status === 'running' && polish.currentSceneId === result.sceneId && polish.chapterId === result.chapterId) {
        polishPatchForRevision(completePolishScene(polish, result.sceneId), navigationRevision);
      }
      workflowPatchForRevision({ status: 'saved', projectId, chapterId: result.chapterId, sceneId: result.sceneId, sourceHash: result.sourceHash, message: '草稿已保存；请编辑正文后再生成定稿预览。' }, navigationRevision);
      // 润色会话必须保留当前游标；普通候选接受仍刷新章节投影。
      if (snapshot.chapters.polish.status !== 'running') reloadChapters();
    }, (cause: Error) => {
      release();
      if (!isActive()) return;
      const message = toUserMessage(cause);
      candidatePatchForRevision({ ui: { kind: 'error', message } }, navigationRevision);
      workflowPatchForRevision({ status: 'error', message }, navigationRevision);
    });
  };

  const ops: Pick<ChaptersEditOps, 'proposeWriting' | 'rewritePromptChange' | 'proposeRewrite' | 'adoptDraftCandidate' | 'adjudicateCandidate' | 'dismissCandidate' | 'startPolish' | 'nextPolishScene' | 'stopPolish' | 'restartPolish'> = {
    proposeWriting,
    rewritePromptChange(value) { candidatePatch({ rewritePrompt: value }); },
    proposeRewrite,
    adoptDraftCandidate,
    adjudicateCandidate,
    dismissCandidate() { candidatePatch({ ui: { kind: 'idle' }, rewritePrompt: '' }); act.chaptersWorkflow({ status: 'idle', message: undefined, sourceHash: undefined, traceSectionCount: undefined }); },
    startPolish,
    nextPolishScene,
    stopPolish,
    restartPolish,
  };
  return { ops };
}
