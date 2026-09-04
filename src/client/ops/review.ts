// 本文件由 makeOps 按层拆分生成（I82，架构审查 §5.1 / §9 #5）：
// review 层编辑动作 = I64 一致性审校中心 ops（R13-5）+ I129 修复会话闭环，经 Host Remote。

import { unwrap } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import type { BookReadinessResult, BookReadinessPageInput } from '../../core/schema/book-readiness.js';
import type { ReviewAdjudicationOutcomeShape, ReviewAuditRecordShape, ReviewEditOps, ReviewLayerState, ReviewProjectionShape } from '../layers/review.js';
import {
  beginReviewRepairAccept,
  beginReviewRepairGeneration,
  beginReviewRepairRescan,
  beginReviewRepairReject,
  cancelReviewRepairSession,
  correlateReviewRepairScan,
  failReviewRepairSession,
  freshReviewRepairSession,
  rejectReviewRepairSession,
  settleReviewRepairCandidate,
  type ReviewRepairSessionState,
} from '../review-repair-session.js';
import type { OpsPorts, OpsRuntime } from './context.js';

type ReviewPort = Pick<OpsPorts, 'reviewNamespace' | 'reviewRepairNamespace' | 'writing'>;

// Ops 工厂会随 render 重建；token 绑定同一 Fiber 的 baked actions，保证取消/替换后
// 晚到的生成或复扫结果不能污染新会话（与 I122 polish session 同一生命周期纪律）。
const reviewRepairRunTokens = new WeakMap<object, number>();

export function createReviewOps(runtime: OpsRuntime, port: ReviewPort): ReviewEditOps {
  const { act, snapshot, beginOp, endOp, isActive } = runtime;
  const projectId = runtime.projectId;
  const reviewNamespace = port.reviewNamespace;
  const reviewRepairNamespace = port.reviewRepairNamespace;
  const writing = port.writing;
  const reviewPatch = (patch: Partial<ReviewLayerState>): void => act.reviewPatch(patch);
  const currentRepairRunToken = (): number => reviewRepairRunTokens.get(act as object) ?? 0;
  const bumpRepairRunToken = (): number => {
    const next = currentRepairRunToken() + 1;
    reviewRepairRunTokens.set(act as object, next);
    return next;
  };
  const repairRunIsCurrent = (token: number): boolean => currentRepairRunToken() === token;

  const toggleFilter = (kind: 'categories' | 'severities' | 'statuses', value: string): void => {
    const filter = snapshot.review.filter;
    const next = (filter[kind] as readonly string[]).includes(value)
      ? (filter[kind] as readonly string[]).filter((item) => item !== value)
      : [...(filter[kind] as readonly string[]), value];
    reviewPatch({ filter: { ...filter, [kind]: next } });
  };

  /** 读取 Host 最新投影；相关复扫必须使用同一 Promise 关联 issue fingerprint。 */
  const runScan = (correlation?: { readonly session: ReviewRepairSessionState; readonly token: number }): void => {
    const target = reviewNamespace;
    if (!target || projectId === undefined) {
      if (correlation) {
        const session = failReviewRepairSession(correlation.session, 'rescan', '审校服务不可用');
        reviewPatch({ status: 'ready', message: session.message, repairSession: session });
      } else {
        reviewPatch({ status: 'error', message: '审校服务不可用', repairSession: freshReviewRepairSession() });
      }
      return;
    }
    const candidateId = correlation?.session.candidate?.candidate.id;
    const key = candidateId === undefined ? 'review:scan' : `review:repair:rescan:${candidateId}`;
    if (!beginOp(key)) return;
    const release = (): void => endOp(key);
    const scanToken = correlation?.token ?? bumpRepairRunToken();
    let rescanning: ReviewRepairSessionState | undefined;
    if (correlation) {
      const acceptedAt = correlation.session.acceptedAt;
      if (acceptedAt === undefined) {
        release();
        const session = failReviewRepairSession(correlation.session, 'rescan', '缺少接受时间证据');
        reviewPatch({ status: 'ready', message: session.message, repairSession: session });
        return;
      }
      rescanning = beginReviewRepairRescan(correlation.session, acceptedAt);
      reviewPatch({ status: 'scanning', message: undefined, repairSession: rescanning });
    } else {
      // 手动完整重扫会清除当前会话 resolved；Host 投影仍是唯一问题真相。
      reviewPatch({ status: 'scanning', message: undefined, repairSession: freshReviewRepairSession() });
    }
    // 投影 + 审计记录并行读取（都为只读 Remote）。
    void Promise.all([
      unwrap(target.scan(projectId, undefined)),
      unwrap(target.records(projectId)),
    ]).then(([projection, recordList]) => {
      release();
      if (!isActive() || !repairRunIsCurrent(scanToken)) return;
      // I77：records wire 契约即裸数组（组合根不再包 envelope）。
      const records = (recordList as ReviewAuditRecordShape[] | undefined) ?? [];
      const typedProjection = projection as ReviewProjectionShape;
      const session = correlation === undefined
        ? freshReviewRepairSession()
        : correlateReviewRepairScan(rescanning as ReviewRepairSessionState, typedProjection.issues.map((issue) => issue.id), typedProjection.scannedAt);
      reviewPatch({ status: 'ready', projection: typedProjection, records, selected: [], message: session.message, repairSession: session });
    }, (cause: Error) => {
      release();
      if (!isActive() || !repairRunIsCurrent(scanToken)) return;
      if (correlation !== undefined) {
        const session = failReviewRepairSession(rescanning as ReviewRepairSessionState, 'rescan', toUserMessage(cause));
        reviewPatch({ status: 'ready', message: session.message, repairSession: session });
      } else {
        reviewPatch({ status: 'error', message: toUserMessage(cause), repairSession: freshReviewRepairSession() });
      }
    });
  };

  const runBookCheck = (scan: boolean): void => {
    const target = reviewNamespace;
    if (!target || projectId === undefined) {
      reviewPatch({ bookReadiness: { status: 'error', message: '审校服务不可用' } });
      return;
    }
    const key = scan ? 'review:book-scan' : 'review:book-readiness';
    if (!beginOp(key)) return;
    const release = (): void => endOp(key);
    const page: BookReadinessPageInput = { offset: 0, limit: 64 };
    reviewPatch({ bookReadiness: { status: 'loading' } });
    void Promise.resolve().then(() => scan
      ? unwrap(target.bookScan(projectId, page, undefined))
      : unwrap(target.bookReadiness(projectId, page))).then((result) => {
      release();
      if (!isActive()) return;
      reviewPatch({ bookReadiness: { status: 'ready', result: result as BookReadinessResult } });
    }, (cause: Error) => {
      release();
      if (!isActive()) return;
      reviewPatch({ bookReadiness: { status: 'error', message: toUserMessage(cause) } });
    });
  };

  return {
    scan(): void {
      runScan();
    },
    bookReadiness(): void { runBookCheck(false); },
    bookScan(): void { runBookCheck(true); },
    toggleFilter,
    clearFilters() { reviewPatch({ filter: { categories: [], severities: [], statuses: [] } }); },
    selectIssue(issueId: string) {
      const selected = snapshot.review.selected;
      reviewPatch({ selected: selected.includes(issueId) ? selected.filter((item) => item !== issueId) : [...selected, issueId] });
    },
    adjudicate(decision: 'continue' | 'rewrite-requested'): void {
      const target = reviewNamespace;
      const state = snapshot.review;
      if (!target || projectId === undefined || state.status !== 'ready') return;
      if (state.selected.length === 0 || state.acting) return;
      bumpRepairRunToken();
      if (!beginOp(`review:adjudicate:${decision}`)) return;
      const release = (): void => endOp(`review:adjudicate:${decision}`);
      reviewPatch({ acting: true, message: undefined, repairSession: freshReviewRepairSession() });
      void unwrap(target.adjudicate(projectId, { decision, issueIds: [...state.selected] })).then((outcome) => {
        release();
        if (!isActive()) return;
        const result = outcome as ReviewAdjudicationOutcomeShape;
        reviewPatch({
          acting: false,
          projection: result.projection,
          records: result.records,
          selected: [],
          message: `已记录 ${result.applied.length} 项${decision === 'continue' ? '「显式继续」' : '「请求重写」'}（重复 ${result.duplicate.length} 项）。`,
          repairSession: freshReviewRepairSession(),
        });
      }, (cause: Error) => { release(); if (!isActive()) return; reviewPatch({ acting: false, message: toUserMessage(cause) }); });
    },
    repair(issueId: string): void {
      const target = reviewRepairNamespace;
      if (!target || projectId === undefined) { reviewPatch({ repairSession: { status: 'error', message: '审校修复服务不可用' } }); return; }
      const key = `review:repair:${issueId}`;
      if (!beginOp(key)) return;
      const release = (): void => endOp(key);
      const token = bumpRepairRunToken();
      const generating = beginReviewRepairGeneration(issueId);
      reviewPatch({ repairSession: generating });
      void unwrap(target.propose(projectId, { issueId }, undefined)).then((proposal) => {
        release();
        if (!isActive() || !repairRunIsCurrent(token)) return;
        reviewPatch({ repairSession: settleReviewRepairCandidate(proposal) });
      }, (cause: Error) => {
        release();
        if (!isActive() || !repairRunIsCurrent(token)) return;
        reviewPatch({ repairSession: failReviewRepairSession(generating, 'generation', toUserMessage(cause)) });
      });
    },
    acceptRepair(): void {
      const state = snapshot.review.repairSession;
      const candidate = state.candidate;
      if (!writing || !reviewNamespace || projectId === undefined || candidate === undefined) return;
      if (state.status !== 'ready' && state.status !== 'error') return;
      const key = `review:repair:accept:${candidate.candidate.id}`;
      if (!beginOp(key)) return;
      const release = (): void => endOp(key);
      const token = bumpRepairRunToken();
      let accepting: ReviewRepairSessionState;
      try {
        accepting = beginReviewRepairAccept(state);
      } catch (cause) {
        release();
        reviewPatch({ repairSession: failReviewRepairSession(state, 'accept', toUserMessage(cause)) });
        return;
      }
      reviewPatch({ repairSession: accepting });
      void unwrap(writing.adjudicate(candidate.candidate.id, 'accept', undefined)).then((outcome) => {
        release();
        if (!isActive() || !repairRunIsCurrent(token)) return;
        if (outcome.status !== 'written') {
          const message = outcome.status === 'generation-rejected' || outcome.status === 'prewrite-rejected'
            ? '候选校验未通过，正文未修改；请重新生成修复候选。'
            : outcome.status === 'pending-compensation'
              ? '候选落地未完成，正文未确认写入；请重试或重新生成候选。'
              : '候选未写入正文，请重新生成修复候选。';
          reviewPatch({ repairSession: failReviewRepairSession(accepting, 'accept', message), message });
          return;
        }
        const session = Object.freeze({ ...accepting, acceptedAt: new Date().toISOString() });
        runScan({ session, token });
      }, (cause: Error) => {
        release();
        if (!isActive() || !repairRunIsCurrent(token)) return;
        const message = toUserMessage(cause, '接受候选失败，正文未确认写入。');
        reviewPatch({ repairSession: failReviewRepairSession(accepting, 'accept', message), message });
      });
    },
    rejectRepair(): void {
      const state = snapshot.review.repairSession;
      const candidate = state.candidate;
      if (!writing || projectId === undefined || candidate === undefined) return;
      if (state.status !== 'ready' && state.status !== 'error') return;
      const key = `review:repair:reject:${candidate.candidate.id}`;
      if (!beginOp(key)) return;
      const release = (): void => endOp(key);
      const token = bumpRepairRunToken();
      let rejecting: ReviewRepairSessionState;
      try {
        rejecting = beginReviewRepairReject(state);
      } catch (cause) {
        release();
        reviewPatch({ repairSession: failReviewRepairSession(state, 'accept', toUserMessage(cause)) });
        return;
      }
      reviewPatch({ repairSession: rejecting });
      void unwrap(writing.adjudicate(candidate.candidate.id, 'reject', undefined)).then((outcome) => {
        release();
        if (!isActive() || !repairRunIsCurrent(token)) return;
        if (outcome.status !== 'rejected') {
          reviewPatch({ repairSession: failReviewRepairSession(rejecting, 'accept', '候选拒绝未完成，正文未修改。'), message: '候选拒绝未完成，正文未修改。' });
          return;
        }
        reviewPatch({ repairSession: rejectReviewRepairSession(rejecting), message: '已拒绝修复候选，未修改正文。' });
      }, (cause: Error) => {
        release();
        if (!isActive() || !repairRunIsCurrent(token)) return;
        const message = toUserMessage(cause);
        reviewPatch({ repairSession: failReviewRepairSession(rejecting, 'accept', message), message });
      });
    },
    retryRepairScan(): void {
      const state = snapshot.review.repairSession;
      if (state.candidate === undefined || state.acceptedAt === undefined || (state.status !== 'uncertain' && state.status !== 'unresolved')) return;
      const token = bumpRepairRunToken();
      runScan({ session: state, token });
    },
    cancelRepair(): void {
      const state = snapshot.review.repairSession;
      if (state.status === 'generating') {
        bumpRepairRunToken();
        runtime.cancelMethod?.('novel-creation-tool/novelReviewRepair/propose');
        if (state.issueId !== undefined) endOp(`review:repair:${state.issueId}`);
        // Generation has no Host write; dropping its late result is a complete Client cancel.
        reviewPatch({ repairSession: freshReviewRepairSession() });
        return;
      }
      if (state.status === 'rescanning' && state.candidate !== undefined) {
        bumpRepairRunToken();
        runtime.cancelMethod?.('novel-creation-tool/novelReview/scan');
        endOp(`review:repair:rescan:${state.candidate.candidate.id}`);
        const session = cancelReviewRepairSession(state);
        reviewPatch({ status: 'ready', message: session.message, repairSession: session });
      }
    },
    dismiss() {
      bumpRepairRunToken();
      reviewPatch({ status: 'idle', projection: undefined, message: undefined, selected: [], acting: false, records: [], repairSession: freshReviewRepairSession() });
    },
  };
}
