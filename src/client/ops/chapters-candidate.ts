import { unwrap } from '../shared.js';
import type { CandidatePanelState, CandidateReviewShape, ChaptersEditOps } from '../layers/chapters.js';
import type { WritingAdjudicationOutcome } from '../store/types.js';
import type { OpsContext } from './context.js';
import type { ChaptersInternal } from './chapters-internal.js';

/**
 * I95 候选审阅 ops 片（计划 §18 I95：ops/chapters 随 layers 拆分——候选段，
 * 原 210-293 行）：I63 生成后候选提议/预览/裁决（R13-4）。跨片依赖经
 * `ChaptersInternal` 晚绑定（reloadChapters 调 selectChapter）。
 */
export function createCandidateOps(ctx: OpsContext, internal: ChaptersInternal) {
  const { act, snapshot, beginOp, endOp, isActive } = ctx;
  const projectId = ctx.projectId;
  const workspace = ctx.workspace;
  const writing = ctx.writing;
  const candidatePatch = (patch: Partial<CandidatePanelState>): void => act.chaptersCandidate(patch);
  // accept 成功后刷新章节树与当前章节，让新场景/替换后的场景立即可见。
  const reloadChapters = (): void => {
    const target = workspace;
    if (!target || projectId === undefined) return;
    void unwrap(target.chapterList(projectId)).then((list) => {
      if (!isActive()) return;
      act.setChapters('ready', list as unknown[]);
      const chapterId = snapshot.chapters.selectedChapterId;
      if (chapterId !== undefined) internal.selectChapter(chapterId);
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

  const ops: Pick<ChaptersEditOps, 'proposeWriting' | 'rewritePromptChange' | 'proposeRewrite' | 'adjudicateCandidate' | 'dismissCandidate'> = {
    proposeWriting,
    rewritePromptChange(value) { candidatePatch({ rewritePrompt: value }); },
    proposeRewrite,
    adjudicateCandidate,
    dismissCandidate() { candidatePatch({ ui: { kind: 'idle' }, rewritePrompt: '' }); },
  };
  return { ops };
}
