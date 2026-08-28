import { unwrap } from '../shared.js';
import type { BranchDiffLineShape, BranchPanelState, BranchSummaryShape, ChaptersEditOps } from '../layers/chapters.js';
import type { OpsContext } from './context.js';
import type { ChaptersInternal } from './chapters-internal.js';

/**
 * I95 版本/分支 ops 片（计划 §18 I95：ops/chapters 随 layers 拆分——分支段，
 * 原 21-91 行）：I70 分支列表装载/命名存档/选用/对比。跨片依赖经
 * `ChaptersInternal` 晚绑定（branchChoose 切换后经 loadScene 重载场景）。
 */
export function createBranchOps(ctx: OpsContext, internal: ChaptersInternal) {
  const { act, snapshot, beginOp, endOp, isActive } = ctx;
  const projectId = ctx.projectId;
  const branchNamespace = ctx.branchNamespace;
  const branchesPatch = (patch: Partial<BranchPanelState>): void => act.chaptersBranches(patch);
  // 注意：branchesLoad 必须显式接收 chapterId/sceneId —— makeOps 渲染闭包
  // 快照里 selected* 尚未更新（与 loadScene 同一陈旧闭包缺陷）。
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
      if (chosen.content !== undefined && chosen.content !== snapshot.chapters.editor.original && sceneId !== undefined) internal.loadScene(sceneId, chapterId);
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

  const ops: Pick<ChaptersEditOps, 'branchesLoad' | 'branchLabelChange' | 'branchSave' | 'branchChoose' | 'branchDiff' | 'branchCloseDiff'> = {
    branchesLoad: () => branchesLoad(),
    branchLabelChange(value) { branchesPatch({ labelDraft: value }); },
    branchSave,
    branchChoose,
    branchDiff,
    branchCloseDiff,
  };
  return { ops, branchesLoad };
}
