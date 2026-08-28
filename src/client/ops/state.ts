// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// state 层编辑动作 = C2 状态层编辑动作（快照选择/差异比对/回滚，经 Host stateDiff/stateRollback；I49 行为等价，I82 拆分）。

import { unwrap } from '../shared.js';
import type { StateDiffShape, StateEditOps, StateSnapshotShape } from '../layers/state.js';
import type { OpsContext } from './context.js';

export function createStateOps(ctx: OpsContext): StateEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = ctx;
  const projectId = ctx.projectId;
  const workspace = ctx.workspace;
  return {
      select: (seq) => { const e = snapshot.stateEditor; let fromSeq = e.fromSeq; let toSeq = e.toSeq; if (fromSeq === undefined) fromSeq = seq; else if (toSeq === undefined && seq !== fromSeq) toSeq = seq; else { fromSeq = seq; toSeq = undefined; } act.stateDraft({ selectedSeq: seq, fromSeq, toSeq, diff: undefined }); },
      showDiff: () => {
        const e = snapshot.stateEditor;
        if (!beginOp('state:diff')) return;
        const release = (): void => endOp('state:diff');
        if (!workspace || projectId === undefined) { release(); act.stateDraft({ error: '创作台远程服务不可用' }); return; }
        if (e.fromSeq === undefined || e.toSeq === undefined) { release(); act.stateDraft({ error: '请从时间线选择两个快照再比对' }); return; }
        void unwrap(workspace.stateDiff(projectId, e.fromSeq, e.toSeq)).then((diff) => { release(); act.stateDraft({ diff: diff as StateDiffShape, error: '' }); }, (cause: Error) => { release(); act.stateDraft({ error: cause.message, diff: undefined }); });
      },
      rollback: () => {
        const e = snapshot.stateEditor;
        if (!beginOp('state:rollback')) return;
        const release = (): void => endOp('state:rollback');
        if (!workspace || projectId === undefined) { release(); act.stateDraft({ error: '创作台远程服务不可用' }); return; }
        if (e.selectedSeq === undefined) { release(); act.stateDraft({ error: '请先选择要回滚到的快照' }); return; }
        void unwrap(workspace.stateRollback(projectId, e.selectedSeq)).then((rolled) => { release(); if (!isActive()) return; const next = rolled as StateSnapshotShape; act.stateDraft({ selectedSeq: next.seq, diff: undefined, error: '' }); void unwrap(workspace!.stateSnapshots(projectId)).then((snapshots) => act.setState('ready', snapshots as unknown[]), (cause: Error) => { act.setState('error', [], cause.message); act.stateDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.stateDraft({ error: cause.message }); });
      },
  };
}
