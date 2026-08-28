// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// progress 层编辑动作 = I68 进度与灵感 ops（R14-3）：刷新/偏差记录与调和/灵感时刻/选定→Gate 提案→确认/拒绝，经 progressNamespace。

import { unwrap } from '../shared.js';
import type { ProgressApplyOutcomeShape, ProgressAuditRecordShape, ProgressDirectionShape, ProgressEditOps, ProgressLayerState, ProgressPendingProposalShape, ProgressProjectionShape, ProgressSelectOutcomeShape } from '../layers/progress.js';
import type { OpsPorts, OpsRuntime } from './context.js';
type ProgressPort = Pick<OpsPorts, 'progressNamespace'>;

export function createProgressOps(runtime: OpsRuntime, port: ProgressPort): ProgressEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const progressNamespace = port.progressNamespace;
      const progressPatch = (patch: Partial<ProgressLayerState>): void => act.progressPatch(patch);
      const refresh = (): void => {
        const target = progressNamespace;
        if (!target || projectId === undefined) { progressPatch({ status: 'error', message: '进度与灵感服务不可用' }); return; }
        if (!beginOp('progress:refresh')) return;
        const release = (): void => endOp('progress:refresh');
        progressPatch({ status: 'loading', message: undefined });
        // 投影 + 待确认 + 审计并行读取（都为只读 Remote）。
        void Promise.all([
          unwrap(target.projection(projectId)),
          unwrap(target.pending(projectId)),
          unwrap(target.audit(projectId)),
        ]).then(([projection, pendingEnvelope, auditEnvelope]) => {
          release();
          if (!isActive()) return;
          progressPatch({
            status: 'ready',
            projection: projection as ProgressProjectionShape,
            pending: (pendingEnvelope as { proposals?: ProgressPendingProposalShape[] } | undefined)?.proposals ?? [],
            audit: (auditEnvelope as { records?: ProgressAuditRecordShape[] } | undefined)?.records ?? [],
            message: undefined,
          });
        }, (cause: Error) => { release(); if (!isActive()) return; progressPatch({ status: 'error', message: (cause as Error).message }); });
      };
      return {
        refresh,
        inspire(): void {
          const target = progressNamespace;
          if (!target || projectId === undefined || snapshot.progress.acting || snapshot.progress.inspiring) return;
          if (!beginOp('progress:inspire')) return;
          const release = (): void => endOp('progress:inspire');
          progressPatch({ inspiring: true, message: undefined, directions: undefined, selectedDirectionId: undefined });
          void unwrap(target.inspire(projectId, snapshot.progress.prompt.trim() || undefined)).then((outcome) => {
            release();
            if (!isActive()) return;
            const result = outcome as { projectId: string; directions: ProgressDirectionShape[] };
            progressPatch({ inspiring: false, directions: result.directions, message: `灵感时刻产出 ${result.directions.length} 个方向（零写；选定并经确认后才会调整 B5/C6）。` });
          }, (cause: Error) => { release(); if (!isActive()) return; progressPatch({ inspiring: false, message: (cause as Error).message }); });
        },
        setPrompt(value: string) { progressPatch({ prompt: value }); },
        selectDirection(directionId: string) {
          const state = snapshot.progress;
          const next = state.selectedDirectionId === directionId ? undefined : directionId;
          progressPatch({ selectedDirectionId: next, message: undefined });
        },
        proposeApply(): void {
          const target = progressNamespace;
          const state = snapshot.progress;
          if (!target || projectId === undefined || state.status !== 'ready' || state.acting) return;
          const selected = state.directions?.find((direction) => direction.id === state.selectedDirectionId);
          if (selected === undefined) return;
          if (!beginOp('progress:propose')) return;
          const release = (): void => endOp('progress:propose');
          progressPatch({ acting: true, message: undefined });
          void unwrap(target.select(projectId, { direction: selected })).then((outcome) => {
            release();
            if (!isActive()) return;
            const result = outcome as ProgressSelectOutcomeShape;
            progressPatch({
              acting: false,
              selectedDirectionId: undefined,
              message: `方向「${result.direction.title}」已提交待确认（${result.proposalId}）。确认后只改授权的 B5/C6；拒绝则零写。`,
            });
            void unwrap(target.pending(projectId)).then((pendingEnvelope) => {
              if (!isActive()) return;
              progressPatch({ pending: (pendingEnvelope as { proposals?: ProgressPendingProposalShape[] }).proposals ?? [] });
            }, () => undefined);
          }, (cause: Error) => { release(); if (!isActive()) return; progressPatch({ acting: false, message: (cause as Error).message }); });
        },
        accept(proposalId: string): void {
          const target = progressNamespace;
          if (!target || projectId === undefined || snapshot.progress.acting) return;
          if (!beginOp(`progress:accept:${proposalId}`)) return;
          const release = (): void => endOp(`progress:accept:${proposalId}`);
          progressPatch({ acting: true, message: undefined });
          void unwrap(target.apply(projectId, proposalId)).then((outcome) => {
            release();
            if (!isActive()) return;
            const result = outcome as ProgressApplyOutcomeShape;
            progressPatch({
              acting: false,
              projection: result.projection,
              pending: snapshot.progress.pending.filter((proposal) => proposal.proposalId !== proposalId),
              audit: result.audit,
              message: result.applied
                ? '已确认并应用灵感方向（只改授权的 B5 立意/主题与 C6 偏差记录）。'
                : '该方向此前已应用（幂等确认，未重复写 B5/C6）。',
            });
          }, (cause: Error) => { release(); if (!isActive()) return; progressPatch({ acting: false, message: (cause as Error).message }); });
        },
        reject(proposalId: string): void {
          const target = progressNamespace;
          if (!target || projectId === undefined || snapshot.progress.acting) return;
          if (!beginOp(`progress:reject:${proposalId}`)) return;
          const release = (): void => endOp(`progress:reject:${proposalId}`);
          progressPatch({ acting: true, message: undefined });
          void unwrap(target.reject(projectId, proposalId)).then(() => {
            release();
            if (!isActive()) return;
            progressPatch({
              acting: false,
              pending: snapshot.progress.pending.filter((proposal) => proposal.proposalId !== proposalId),
              message: `已拒绝方向提案 ${proposalId}（B5/C6 零写）。`,
            });
            void unwrap(target.audit(projectId)).then((auditEnvelope) => {
              if (!isActive()) return;
              progressPatch({ audit: (auditEnvelope as { records?: ProgressAuditRecordShape[] }).records ?? [] });
            }, () => undefined);
          }, (cause: Error) => { release(); if (!isActive()) return; progressPatch({ acting: false, message: (cause as Error).message }); });
        },
        setDeviationDraft(patch: Partial<{ planned: string; actual: string; reason: string }>) {
          progressPatch({ deviationDraft: { ...snapshot.progress.deviationDraft, ...patch } });
        },
        recordDeviation(): void {
          const target = progressNamespace;
          const state = snapshot.progress;
          if (!target || projectId === undefined || state.status !== 'ready' || state.acting) return;
          if (state.deviationDraft.planned.trim() === '' || state.deviationDraft.actual.trim() === '' || state.deviationDraft.reason.trim() === '') return;
          if (!beginOp('progress:record-deviation')) return;
          const release = (): void => endOp('progress:record-deviation');
          progressPatch({ acting: true, message: undefined });
          void unwrap(target.recordDeviation(projectId, {
            planned: state.deviationDraft.planned.trim(),
            actual: state.deviationDraft.actual.trim(),
            reason: state.deviationDraft.reason.trim(),
          })).then((projection) => {
            release();
            if (!isActive()) return;
            progressPatch({ acting: false, projection: projection as ProgressProjectionShape, deviationDraft: { planned: '', actual: '', reason: '' }, message: '偏差已记录（只写 C6；B5 未改变）。' });
          }, (cause: Error) => { release(); if (!isActive()) return; progressPatch({ acting: false, message: (cause as Error).message }); });
        },
        reconcileDeviation(deviationId: string): void {
          const target = progressNamespace;
          if (!target || projectId === undefined || snapshot.progress.acting) return;
          if (!beginOp(`progress:reconcile:${deviationId}`)) return;
          const release = (): void => endOp(`progress:reconcile:${deviationId}`);
          progressPatch({ acting: true, message: undefined });
          void unwrap(target.reconcileDeviation(projectId, deviationId)).then((projection) => {
            release();
            if (!isActive()) return;
            progressPatch({ acting: false, projection: projection as ProgressProjectionShape, message: `偏差 ${deviationId} 已标记为调和（只写 C6）。` });
          }, (cause: Error) => { release(); if (!isActive()) return; progressPatch({ acting: false, message: (cause as Error).message }); });
        },
        dismiss() { progressPatch({ status: 'idle', projection: undefined, message: undefined, directions: undefined, inspiring: false, prompt: '', selectedDirectionId: undefined, pending: [], audit: [], deviationDraft: { planned: '', actual: '', reason: '' }, acting: false }); },
      };
}
