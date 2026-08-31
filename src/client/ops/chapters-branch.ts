import { unwrap } from '../shared.js';
import type { BranchPanelState, ChaptersEditOps } from '../layers/chapters.js';
import type { BranchAggregate, BranchAggregateScene } from '../../core/schema/branch-aggregate.js';
import type { OpsPorts, OpsRuntime } from './context.js';
type BranchPort = Pick<OpsPorts, 'branchNamespace'>;
import type { ChaptersInternal } from './chapters-internal.js';

/**
 * I95 版本/分支 ops 片（计划 §18 I95：ops/chapters 随 layers 拆分——分支段，
 * 原 21-91 行）：I70 分支列表装载/命名存档/选用/对比。跨片依赖经
 * `ChaptersInternal` 晚绑定（branchChoose 切换后经 loadScene 重载场景）。
 */
export function createBranchOps(runtime: OpsRuntime, port: BranchPort, internal: ChaptersInternal) {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const branchNamespace = port.branchNamespace;
  const branchesPatch = (patch: Partial<BranchPanelState>): void => act.chaptersBranches(patch);
  const versionsLoad = (): void => {
    const target = branchNamespace;
    if (!target || projectId === undefined) return;
    if (!beginOp('branches:aggregate')) return;
    const release = (): void => endOp('branches:aggregate');
    branchesPatch({ aggregate: { status: 'loading', message: undefined }, message: undefined });
    void unwrap(target.aggregate(projectId)).then((tree) => {
      release();
      if (!isActive()) return;
      branchesPatch({ aggregate: { status: 'ready', tree, message: undefined } });
    }, (cause: Error) => {
      release();
      if (!isActive()) return;
      branchesPatch({ aggregate: { status: 'error', message: (cause as Error).message } });
    });
  };
  const findVersionScene = (tree: BranchAggregate | undefined, chapterId: string, sceneId: string): BranchAggregateScene | undefined =>
    tree?.chapters.find((chapter) => chapter.id === chapterId)?.scenes.find((scene) => scene.id === sceneId);
  const versionSelect = (chapterId: string, sceneId: string, branchId?: string): void => {
    branchesPatch({ versionSelection: { chapterId, sceneId, ...(branchId === undefined ? {} : { branchId }) }, message: undefined });
  };
  const versionDiff = (chapterId: string, sceneId: string, branchId: string): void => {
    const target = branchNamespace;
    const tree = snapshot.chapters.branches.aggregate.tree;
    const scene = findVersionScene(tree, chapterId, sceneId);
    if (!target || projectId === undefined || scene === undefined || !scene.branches.some((branch) => branch.id === branchId)) {
      branchesPatch({ message: '版本树中的目标已失效，请刷新版本树' });
      return;
    }
    const key = `branches:version-diff:${chapterId}:${sceneId}:${branchId}`;
    if (!beginOp(key)) return;
    const release = (): void => endOp(key);
    branchesPatch({ diff: { status: 'loading', lines: [] }, versionDiffTarget: { chapterId, sceneId, branchId }, message: undefined });
    void unwrap(target.diff(projectId, chapterId, sceneId, branchId, undefined)).then((result) => {
      release();
      if (!isActive()) return;
      branchesPatch({ diff: { status: 'ready', fromLabel: result.from.label, toLabel: result.to.label, lines: result.lines } });
    }, (cause: Error) => {
      release();
      if (!isActive()) return;
      branchesPatch({ diff: { status: 'error', lines: [], message: (cause as Error).message } });
    });
  };
  const versionChoose = (chapterId: string, sceneId: string, branchId: string): void => {
    const target = branchNamespace;
    const tree = snapshot.chapters.branches.aggregate.tree;
    const scene = findVersionScene(tree, chapterId, sceneId);
    const chosen = scene?.branches.find((branch) => branch.chosen);
    const branch = scene?.branches.find((item) => item.id === branchId);
    if (!target || projectId === undefined || scene === undefined || branch === undefined || chosen === undefined) {
      branchesPatch({ message: '版本树中的目标已失效，请刷新版本树' });
      return;
    }
    if (branch.chosen) {
      versionSelect(chapterId, sceneId, branchId);
      return;
    }
    const key = `branches:version-choose:${chapterId}:${sceneId}:${branchId}`;
    if (!beginOp(key)) return;
    const release = (): void => endOp(key);
    branchesPatch({ acting: true, message: undefined, versionSelection: { chapterId, sceneId, branchId } });
    void unwrap(target.chooseFresh(projectId, chapterId, sceneId, branchId, chosen.hash)).then((result) => {
      release();
      if (!isActive()) return;
      branchesPatch({ acting: false, message: '已切换版本，正在刷新版本树' });
      // 只有当前编辑场景需要重载正文；跨场景切换不会抢走作者当前焦点。
      if (result.content !== snapshot.chapters.editor.original && snapshot.chapters.selectedChapterId === chapterId && snapshot.chapters.selectedSceneId === sceneId) {
        internal.loadScene(sceneId, chapterId);
      }
      versionsLoad();
    }, (cause: Error) => {
      release();
      if (!isActive()) return;
      branchesPatch({ acting: false, message: (cause as Error).message });
    });
  };
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
      branchesPatch({ status: 'ready', list: result.branches, message: undefined });
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
      branchesPatch({ acting: false, status: 'ready', list: result.branches, labelDraft: '', message: '已存档当前版本' });
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
      branchesPatch({ acting: false, status: 'ready', list: result.branches, message: '已切换版本（只改正文，未同步结构层；如需同步请显式重解析）' });
      // 切换后正文变化：重载场景，让编辑器以新原文初始化（baseHash 随之更新）。
      if (result.content !== snapshot.chapters.editor.original && sceneId !== undefined) internal.loadScene(sceneId, chapterId);
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
      branchesPatch({ diff: { status: 'ready', fromLabel: result.from.label, toLabel: result.to.label, lines: result.lines } });
    }, (cause: Error) => { release(); if (!isActive()) return; branchesPatch({ diff: { status: 'error', lines: [], message: (cause as Error).message } }); });
  };
  const branchCloseDiff = (): void => branchesPatch({ diff: { status: 'idle', lines: [] }, versionDiffTarget: undefined });

  const ops: Pick<ChaptersEditOps, 'branchesLoad' | 'branchLabelChange' | 'branchSave' | 'branchChoose' | 'branchDiff' | 'branchCloseDiff' | 'versionsLoad' | 'versionSelect' | 'versionDiff' | 'versionChoose'> = {
    branchesLoad: () => branchesLoad(),
    branchLabelChange(value) { branchesPatch({ labelDraft: value }); },
    branchSave,
    branchChoose,
    branchDiff,
    branchCloseDiff,
    versionsLoad,
    versionSelect,
    versionDiff,
    versionChoose,
  };
  return { ops, branchesLoad, versionsLoad };
}
