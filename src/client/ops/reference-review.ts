import { unwrap } from '../shared.js';
import type { ReferenceAuditListInput, ReferenceAuditOwner, ReferenceAuditRecord, ReferenceAuditStatus } from '../../core/schema/reference-audit.js';
import type { ReferenceReviewEditOps, ReferenceReviewLayerState } from '../layers/reference-review.js';
import type { OpsPorts, OpsRuntime } from './context.js';

type ReferenceReviewPort = Pick<OpsPorts, 'referenceAuditNamespace'>;

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
    }, (cause: Error) => {
      endOp(key);
      if (!isActive()) return;
      patch({ status: 'error', message: cause.message });
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
    dismiss() { patch({ status: 'idle', records: [], nextCursor: null, markedErrors: [], message: undefined }); },
  };
}
