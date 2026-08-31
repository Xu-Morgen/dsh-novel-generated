// chapters 层编辑动作组合根（I82 按层拆分 + I95 三片接线，计划 §18 I95）：
// I60/I61 C5 正文工作台 ops（R13-1/R13-2）：只读导航 + 受控编辑（editor 片）+
// I63 候选裁决（candidate 片）+ I70 版本/分支（branch 片）。
// 三片之间互相引用的内部函数经 ChaptersInternal 晚绑定，避免循环 import。

import type { ChaptersEditOps, ChaptersMode } from '../layers/chapters.js';
import type { OpsPorts, OpsRuntime } from './context.js';
import { createEditorOps } from './chapters-editor.js';
import { createBranchOps } from './chapters-branch.js';
import { createCandidateOps } from './chapters-candidate.js';
import type { ChaptersInternal } from './chapters-internal.js';
import { createChaptersManagementOps } from './chapters-management.js';

/** chapters 层窄 port：editor（workspace）+ candidate（workspace/writing）+ branch（branchNamespace）。 */
export type ChaptersPort = Pick<OpsPorts, 'workspace' | 'writing' | 'branchNamespace' | 'queueNamespace' | 'textMutation' | 'sceneOutlineBinding' | 'textDeletion' | 'outlineReconciliation'>;

export function createChaptersOps(runtime: OpsRuntime, ports: ChaptersPort, ref: { current?: ChaptersEditOps }): ChaptersEditOps {
  const internal: ChaptersInternal = { loadScene: () => undefined, branchesLoad: () => undefined, selectChapter: () => undefined };
  const editor = createEditorOps(runtime, { workspace: ports.workspace }, internal);
  const branch = createBranchOps(runtime, { branchNamespace: ports.branchNamespace }, internal);
  const candidate = createCandidateOps(runtime, { workspace: ports.workspace, writing: ports.writing }, internal);
  // 晚绑定接线：三片在各自闭包内通过 internal 调用彼此的内部函数。
  internal.loadScene = editor.loadScene;
  internal.branchesLoad = branch.branchesLoad;
  internal.selectChapter = editor.selectChapter;
  const management = createChaptersManagementOps(runtime, ports);
  const setMode = (mode: ChaptersMode): void => {
    runtime.act.chaptersMode(mode);
    // I107：模式容器是唯一的 Remote 激活点；隐藏版本/素材面板不注册重复
    // 读取。场景导航会把对应状态重置为 idle，显式重新进入即可确定性刷新。
    if (mode === 'versions' && (runtime.snapshot.chapters.branches.status === 'idle' || runtime.snapshot.chapters.branches.status === 'error')) {
      branch.branchesLoad();
    } else if (mode === 'materials' && (runtime.snapshot.chapters.management.status === 'idle' || runtime.snapshot.chapters.management.status === 'error')) {
      management.refreshManagement();
    }
  };
  const chaptersOpsResult: ChaptersEditOps = { ...editor.ops, ...candidate.ops, ...branch.ops, ...management, setMode };
  ref.current = chaptersOpsResult;
  return chaptersOpsResult;
}

export type { ChaptersEditOps } from '../layers/chapters.js';
export { createEditorOps } from './chapters-editor.js';
export { createBranchOps } from './chapters-branch.js';
export { createCandidateOps } from './chapters-candidate.js';
export { createChaptersManagementOps } from './chapters-management.js';
