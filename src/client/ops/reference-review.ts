import { unwrap } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import type { ReferenceAuditListInput, ReferenceAuditOwner, ReferenceAuditRecord, ReferenceAuditStatus } from '../../core/schema/reference-audit.js';
import type { ReferenceCorrectionCandidate, ReferenceCorrectionPendingItem } from '../../core/schema/reference-correction.js';
import type { ReferenceReviewEditOps, ReferenceReviewLayerState } from '../layers/reference-review.js';
import type { OpsPorts, OpsRuntime } from './context.js';

type ReferenceReviewPort = Pick<OpsPorts, 'referenceAuditNamespace' | 'referenceCorrectionNamespace'>;

function listInput(state: ReferenceReviewLayerState, cursor?: string): ReferenceAuditListInput {
  return {
    ...(state.owner === 'all' ? {} : { owner: state.owner }),
    ...(state.recordStatus === 'all' ? {} : { status: state.recordStatus }),
    ...(cursor === undefined ? {} : { cursor }),
  };
}

export function createReferenceReviewOps(runtime: OpsRuntime, port: ReferenceReviewPort): ReferenceReviewEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const patch = (value: Partial<ReferenceReviewLayerState>): void => act.referenceReviewPatch(value);
  const request = (cursor: string | undefined, append: boolean): void => {
    const namespace = port.referenceAuditNamespace;
    if (namespace === undefined || projectId === undefined) { patch({ status: 'error', message: '引用审查服务不可用' }); return; }
    const key = `reference-review:list:${cursor ?? 'first'}`;
    if (!beginOp(key)) return;
    patch({ status: 'loading', message: undefined });
    void unwrap(namespace.list(projectId, listInput(snapshot.referenceReview, cursor))).then((raw) => {
      endOp(key);
      if (!isActive()) return;
      const result = raw as { records?: readonly ReferenceAuditRecord[]; nextCursor?: string | null };
      const records = result.records ?? [];
      const current = append ? snapshot.referenceReview.records : [];
      const merged = [...current, ...records].filter((record, index, all) => all.findIndex((item) => item.recordId === record.recordId) === index);
      patch({ status: 'ready', records: merged, nextCursor: result.nextCursor ?? null, message: undefined });
      const correction = port.referenceCorrectionNamespace;
      if (!append && correction !== undefined) {
        void unwrap(correction.pending(projectId)).then((pending) => {
          if (!isActive()) return;
          const first = (pending as readonly ReferenceCorrectionPendingItem[] | undefined)?.[0];
          patch({
            correctionStatus: first === undefined ? 'idle' : 'ready',
            correctionCandidate: first?.candidate,
            correctionProposalId: first?.proposalId,
            correctionMessage: first === undefined ? undefined : '已恢复待确认的引用修正候选。',
          });
        }, () => undefined);
      }
    }, (cause: Error) => {
      endOp(key);
      if (!isActive()) return;
      patch({ status: 'error', message: toUserMessage(cause) });
    });
  };
  return {
    refresh() { request(undefined, false); },
    loadMore() {
      const cursor = snapshot.referenceReview.nextCursor;
      if (cursor !== null) request(cursor, true);
    },
    setOwner(owner: ReferenceAuditOwner | 'all') { patch({ owner }); },
    setStatus(status: ReferenceAuditStatus | 'all') { patch({ recordStatus: status }); },
    clearFilters() { patch({ owner: 'all', recordStatus: 'all' }); },
    toggleError(recordId: string) {
      const marked = snapshot.referenceReview.markedErrors;
      patch({ markedErrors: marked.includes(recordId) ? marked.filter((id) => id !== recordId) : [...marked, recordId] });
    },
    setCorrectionInstruction(instruction: string) { patch({ correctionInstruction: instruction, correctionMessage: undefined }); },
    proposeCorrection() {
      const target = port.referenceCorrectionNamespace;
      const state = snapshot.referenceReview;
      if (target === undefined || projectId === undefined) { patch({ correctionStatus: 'error', correctionMessage: '引用修正服务不可用' }); return; }
      if (state.markedErrors.length === 0 || state.correctionInstruction.trim() === '') return;
      const key = `reference-correction:propose:${state.markedErrors.join(',')}`;
      if (!beginOp(key)) return;
      patch({ correctionStatus: 'proposing', correctionCandidate: undefined, correctionProposalId: undefined, correctionMessage: undefined });
      void unwrap(target.propose(projectId, { recordIds: [...state.markedErrors], instruction: state.correctionInstruction.trim() }, undefined)).then((raw) => {
        endOp(key);
        if (!isActive()) return;
        const result = raw as { candidate: ReferenceCorrectionCandidate; proposalId: string };
        patch({ correctionStatus: 'ready', correctionCandidate: result.candidate, correctionProposalId: result.proposalId, correctionMessage: '候选已提交，确认后才会写回。' });
      }, (cause: Error) => {
        endOp(key);
        if (!isActive()) return;
        patch({ correctionStatus: 'error', correctionCandidate: undefined, correctionProposalId: undefined, correctionMessage: toUserMessage(cause) });
      });
    },
    acceptCorrection() {
      const target = port.referenceCorrectionNamespace;
      const state = snapshot.referenceReview;
      const proposalId = state.correctionProposalId ?? state.correctionCandidate?.candidateId;
      if (target === undefined || projectId === undefined || proposalId === undefined) return;
      const key = `reference-correction:accept:${proposalId}`;
      if (!beginOp(key)) return;
      patch({ correctionStatus: 'acting', correctionMessage: undefined });
      void unwrap(target.accept(projectId, proposalId)).then((raw) => {
        endOp(key);
        if (!isActive()) return;
        const result = raw as { status: 'applied' | 'already-applied'; changedOwners: readonly string[] };
        const sourceRecordIds = new Set(state.correctionCandidate?.sourceRecordIds ?? []);
        patch({ correctionStatus: 'idle', correctionCandidate: undefined, correctionProposalId: undefined, markedErrors: state.markedErrors.filter((id) => !sourceRecordIds.has(id)), correctionMessage: result.status === 'applied' ? `已确认并应用引用修正（${result.changedOwners.join('、')}）。` : '该引用修正此前已生效（幂等确认，未重复写入）。' });
        request(undefined, false);
      }, (cause: Error) => {
        endOp(key);
        if (!isActive()) return;
        patch({ correctionStatus: 'error', correctionMessage: toUserMessage(cause) });
      });
    },
    rejectCorrection() {
      const target = port.referenceCorrectionNamespace;
      const state = snapshot.referenceReview;
      const proposalId = state.correctionProposalId ?? state.correctionCandidate?.candidateId;
      if (target === undefined || projectId === undefined || proposalId === undefined) return;
      const key = `reference-correction:reject:${proposalId}`;
      if (!beginOp(key)) return;
      patch({ correctionStatus: 'acting', correctionMessage: undefined });
      void unwrap(target.reject(projectId, proposalId)).then(() => {
        endOp(key);
        if (!isActive()) return;
        patch({ correctionStatus: 'idle', correctionCandidate: undefined, correctionProposalId: undefined, correctionMessage: '已拒绝引用修正候选；叙事层零写。' });
      }, (cause: Error) => {
        endOp(key);
        if (!isActive()) return;
        patch({ correctionStatus: 'error', correctionMessage: toUserMessage(cause) });
      });
    },
    dismissCorrection() { patch({ correctionStatus: 'idle', correctionCandidate: undefined, correctionProposalId: undefined, correctionMessage: undefined, correctionInstruction: '' }); },
    dismiss() { patch({ status: 'idle', records: [], nextCursor: null, markedErrors: [], correctionStatus: 'idle', correctionCandidate: undefined, correctionProposalId: undefined, correctionInstruction: '', correctionMessage: undefined, message: undefined }); },
  };
}
