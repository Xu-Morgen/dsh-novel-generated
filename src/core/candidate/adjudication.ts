import { entityIdSchema } from '../schema/base.js';

/**
 * I63 候选裁决账本（design §14.9「候选优先」/ R13-4）。
 *
 * 幂等裁决不变式（验收「双击幂等」「rewrite 产生后继候选且旧候选不可静默接受」）：
 * - 候选一经 accept 固化：重复 accept 返回 `duplicate`（消费方不重复写）；
 *   accepted 之后 reject/rewrite 一律失败。
 * - reject 幂等：重复 reject 返回 `duplicate`（消费方零写）；rejected 之后 accept 失败，
 *   必须 rewrite 生成后继候选（旧候选不可静默接受）。
 * - rewrite 把旧候选置为 `superseded` 并记录后继 id；superseded 候选不可再 accept /
 *   reject / rewrite（只能裁决其后继）。
 * - 账本只记录裁决状态（candidateId → status），不持有候选正文/请求/校验结果；
 *   候选与请求由 I63 消费方（writing service）按 candidateId 持有。
 * - 本账本是进程内状态：候选不持久化（I62 合同），持久化归属 I65 队列 owner，
 *   Fiber 卸载即失（与候选生命周期一致）。
 */

export const adjudicationStatusSchema = { values: ['pending', 'accepted', 'rejected', 'superseded'] as const };
export type AdjudicationStatus = (typeof adjudicationStatusSchema.values)[number];

export interface CandidateAdjudicationRecord {
  readonly candidateId: string;
  readonly projectId: string;
  readonly status: AdjudicationStatus;
  /** rewrite 后继候选 id；status=superseded 时必填。 */
  readonly supersededBy?: string;
  /** accept 落地时间（幂等重复 accept 返回同一记录）。 */
  readonly acceptedAt?: string;
}

export type AdjudicationApplication =
  | { readonly kind: 'applied' }
  | { readonly kind: 'duplicate' };

/**
 * 候选裁决状态机。所有操作对同 id 重复调用幂等：
 * - accept：pending → accepted；重复 accept 返回 duplicate。
 * - reject：pending → rejected；重复 reject 返回 duplicate。
 * - supersede：pending → superseded（rewrite 后继）；accepted/superseded 拒绝。
 */
export class CandidateAdjudicationLedger {
  private readonly records = new Map<string, CandidateAdjudicationRecord>();

  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  statusOf(candidateId: string): AdjudicationStatus {
    return this.records.get(candidateId)?.status ?? 'pending';
  }

  isSuperseded(candidateId: string): boolean {
    return this.statusOf(candidateId) === 'superseded';
  }

  /** 候选必须尚未裁决（pending）；unknown 视为 pending（从未裁决）。 */
  requirePending(candidateId: string): void {
    const status = this.statusOf(candidateId);
    if (status === 'accepted') throw new Error(`Candidate already accepted: ${candidateId}`);
    if (status === 'rejected') throw new Error(`Candidate already rejected: ${candidateId}`);
    if (status === 'superseded') throw new Error(`Candidate superseded: ${candidateId}`);
  }

  accept(candidateId: string, projectId: string): AdjudicationApplication {
    const existing = this.records.get(candidateId);
    if (existing !== undefined && existing.status === 'accepted') return { kind: 'duplicate' };
    this.requirePending(candidateId);
    entityIdSchema.parse(projectId);
    this.records.set(candidateId, { candidateId, projectId, status: 'accepted', acceptedAt: this.now() });
    return { kind: 'applied' };
  }

  reject(candidateId: string, projectId: string): AdjudicationApplication {
    const existing = this.records.get(candidateId);
    if (existing !== undefined && existing.status === 'rejected') return { kind: 'duplicate' };
    this.requirePending(candidateId);
    entityIdSchema.parse(projectId);
    this.records.set(candidateId, { candidateId, projectId, status: 'rejected' });
    return { kind: 'applied' };
  }

  /** 旧候选被后继候选替代（rewrite）：superseded 的旧候选不可再裁决；
   *  rejected/pending 候选都可被后继替代（拒绝后要求重写是合法路径）。 */
  supersede(candidateId: string, successorId: string, projectId: string): void {
    const existing = this.records.get(candidateId);
    if (existing !== undefined && existing.status === 'superseded') {
      throw new Error(`Candidate already superseded: ${candidateId} → ${existing.supersededBy}`);
    }
    if (existing !== undefined && existing.status === 'accepted') {
      throw new Error(`Candidate already accepted: ${candidateId}`);
    }
    entityIdSchema.parse(projectId);
    this.records.set(candidateId, { candidateId, projectId, status: 'superseded', supersededBy: successorId });
  }

  record(candidateId: string): CandidateAdjudicationRecord | undefined {
    const record = this.records.get(candidateId);
    return record === undefined ? undefined : Object.freeze({ ...record });
  }

  /** 项目内全部裁决记录（只读副本；审计/测试用）。 */
  list(projectId: string): readonly CandidateAdjudicationRecord[] {
    entityIdSchema.parse(projectId);
    return [...this.records.values()]
      .filter((record) => record.projectId === projectId)
      .map((record) => Object.freeze({ ...record }));
  }
}
