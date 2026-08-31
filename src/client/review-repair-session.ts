import type { ReviewRepairProposalShape } from './shared.js';

/**
 * I129 审校修复会话状态（design §14.14.2 D25 / R18-3b）。
 *
 * 这是 Client 当前 Fiber 的瞬态状态机，不是 Host 的 resolved 账本：候选接受后只
 * 关联一次新的 review scan，只有同一 issue fingerprint 从新投影消失才进入
 * `resolved`；完整重扫、重开面板、切换作品或重启都由 fresh/reset 丢弃。
 */
export type ReviewRepairSessionStatus =
  | 'idle'
  | 'generating'
  | 'ready'
  | 'accepting'
  | 'rejecting'
  | 'rescanning'
  | 'resolved'
  | 'unresolved'
  | 'uncertain'
  | 'rejected'
  | 'error';

export interface ReviewRepairResolvedEvidence {
  readonly issueId: string;
  readonly issueFingerprint: string;
  readonly candidateId: string;
  readonly acceptedAt: string;
  readonly rescannedAt: string;
  readonly target: ReviewRepairProposalShape['target'];
  readonly anchor?: ReviewRepairProposalShape['anchor'];
}

export interface ReviewRepairSessionState {
  readonly status: ReviewRepairSessionStatus;
  readonly issueId?: string;
  readonly candidate?: ReviewRepairProposalShape;
  readonly acceptedAt?: string;
  readonly resolved?: ReviewRepairResolvedEvidence;
  readonly message?: string;
}

export function freshReviewRepairSession(): ReviewRepairSessionState {
  return Object.freeze({ status: 'idle' as const });
}

export function beginReviewRepairGeneration(issueId?: string): ReviewRepairSessionState {
  return Object.freeze({ status: 'generating' as const, ...(issueId === undefined ? {} : { issueId }) });
}

export function settleReviewRepairCandidate(candidate: ReviewRepairProposalShape): ReviewRepairSessionState {
  return Object.freeze({ status: 'ready' as const, issueId: candidate.issueId, candidate, message: undefined });
}

export function beginReviewRepairAccept(state: ReviewRepairSessionState): ReviewRepairSessionState {
  if (state.candidate === undefined || (state.status !== 'ready' && state.status !== 'error')) {
    throw new Error('当前没有可接受的审校修复候选');
  }
  return Object.freeze({ ...state, status: 'accepting' as const, message: undefined, resolved: undefined });
}

export function beginReviewRepairReject(state: ReviewRepairSessionState): ReviewRepairSessionState {
  if (state.candidate === undefined || (state.status !== 'ready' && state.status !== 'error')) {
    throw new Error('当前没有可拒绝的审校修复候选');
  }
  return Object.freeze({ ...state, status: 'rejecting' as const, message: undefined, resolved: undefined });
}

export function beginReviewRepairRescan(state: ReviewRepairSessionState, acceptedAt: string): ReviewRepairSessionState {
  if (state.candidate === undefined) throw new Error('复扫需要保留修复候选证据');
  if (state.status !== 'accepting' && state.status !== 'uncertain' && state.status !== 'unresolved') {
    throw new Error('当前状态不能启动审校复扫');
  }
  return Object.freeze({ ...state, status: 'rescanning' as const, acceptedAt, message: undefined, resolved: undefined });
}

export function correlateReviewRepairScan(
  state: ReviewRepairSessionState,
  issueFingerprints: readonly string[],
  rescannedAt: string,
): ReviewRepairSessionState {
  if (state.status !== 'rescanning' || state.candidate === undefined || state.acceptedAt === undefined) {
    throw new Error('当前状态没有待关联的修复复扫');
  }
  const issueFingerprint = state.candidate.issueFingerprint;
  if (issueFingerprints.includes(issueFingerprint)) {
    return Object.freeze({
      ...state,
      status: 'unresolved' as const,
      message: '复扫后同一问题仍存在，未标记为已解决；请重新生成候选或手动修改正文。',
      resolved: undefined,
    });
  }
  return Object.freeze({
    ...state,
    status: 'resolved' as const,
    message: '复扫未发现同一问题，本次修复仅在当前会话标记为已解决。',
    resolved: Object.freeze({
      issueId: state.candidate.issueId,
      issueFingerprint,
      candidateId: state.candidate.candidate.id,
      acceptedAt: state.acceptedAt,
      rescannedAt,
      target: state.candidate.target,
      ...(state.candidate.anchor === undefined ? {} : { anchor: state.candidate.anchor }),
    }),
  });
}

/** 复扫失败或取消必须显示不确定，不能把未确认的状态伪装成 resolved。 */
export function failReviewRepairSession(state: ReviewRepairSessionState, phase: 'generation' | 'accept' | 'rescan', message: string): ReviewRepairSessionState {
  return Object.freeze({
    ...state,
    status: phase === 'rescan' ? 'uncertain' as const : 'error' as const,
    message: message || (phase === 'rescan' ? '修复已接受，但复扫失败，解决状态不确定。' : '审校修复失败'),
    resolved: undefined,
  });
}

export function cancelReviewRepairSession(state: ReviewRepairSessionState): ReviewRepairSessionState {
  if (state.status === 'rescanning') {
    return failReviewRepairSession(state, 'rescan', '复扫已取消；修复已接受，但解决状态不确定，请重试复扫。');
  }
  if (state.status === 'generating') return freshReviewRepairSession();
  return state;
}

export function rejectReviewRepairSession(state: ReviewRepairSessionState): ReviewRepairSessionState {
  if (state.candidate === undefined) throw new Error('当前没有可拒绝的审校修复候选');
  return Object.freeze({ ...state, status: 'rejected' as const, message: '已拒绝修复候选，未修改正文。', resolved: undefined });
}
