// chapters 层编辑动作组合根（I82 按层拆分 + I95 三片接线，计划 §18 I95）：
// I60/I61 C5 正文工作台 ops（R13-1/R13-2）：只读导航 + 受控编辑（editor 片）+
// I63 候选裁决（candidate 片）+ I70 版本/分支（branch 片）。
// 三片之间互相引用的内部函数经 ChaptersInternal 晚绑定，避免循环 import。

import type { ChaptersEditOps } from '../layers/chapters.js';
import type { OpsContext } from './context.js';
import { createEditorOps } from './chapters-editor.js';
import { createBranchOps } from './chapters-branch.js';
import { createCandidateOps } from './chapters-candidate.js';
import type { ChaptersInternal } from './chapters-internal.js';

export function createChaptersOps(ctx: OpsContext, ref: { current?: ChaptersEditOps }): ChaptersEditOps {
  const internal: ChaptersInternal = { loadScene: () => undefined, branchesLoad: () => undefined, selectChapter: () => undefined };
  const editor = createEditorOps(ctx, internal);
  const branch = createBranchOps(ctx, internal);
  const candidate = createCandidateOps(ctx, internal);
  // 晚绑定接线：三片在各自闭包内通过 internal 调用彼此的内部函数。
  internal.loadScene = editor.loadScene;
  internal.branchesLoad = branch.branchesLoad;
  internal.selectChapter = editor.selectChapter;
  const chaptersOpsResult: ChaptersEditOps = { ...editor.ops, ...candidate.ops, ...branch.ops };
  ref.current = chaptersOpsResult;
  return chaptersOpsResult;
}

export type { ChaptersEditOps } from '../layers/chapters.js';
export { createEditorOps } from './chapters-editor.js';
export { createBranchOps } from './chapters-branch.js';
export { createCandidateOps } from './chapters-candidate.js';
