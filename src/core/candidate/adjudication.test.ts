import { describe, expect, it } from 'vitest';
import { CandidateAdjudicationLedger } from './adjudication.js';

describe('I63 候选裁决账本（幂等裁决状态机）', () => {
  it('accept 幂等：首次 applied，重复 accept 返回 duplicate 且记录不重复', () => {
    const ledger = new CandidateAdjudicationLedger(() => '2026-01-01T00:00:00.000Z');
    expect(ledger.accept('cand-1', 'demo')).toEqual({ kind: 'applied' });
    expect(ledger.accept('cand-1', 'demo')).toEqual({ kind: 'duplicate' });
    expect(ledger.record('cand-1')).toMatchObject({ candidateId: 'cand-1', projectId: 'demo', status: 'accepted', acceptedAt: '2026-01-01T00:00:00.000Z' });
    expect(ledger.list('demo')).toHaveLength(1);
  });

  it('reject 幂等：重复 reject 返回 duplicate，零写路径可重复触发', () => {
    const ledger = new CandidateAdjudicationLedger();
    expect(ledger.reject('cand-2', 'demo')).toEqual({ kind: 'applied' });
    expect(ledger.reject('cand-2', 'demo')).toEqual({ kind: 'duplicate' });
    expect(ledger.statusOf('cand-2')).toBe('rejected');
  });

  it('accepted 之后 reject/rewrite 失败（裁决一经固化不可倒退）', () => {
    const ledger = new CandidateAdjudicationLedger();
    ledger.accept('cand-3', 'demo');
    expect(() => ledger.reject('cand-3', 'demo')).toThrow(/already accepted/);
    expect(() => ledger.supersede('cand-3', 'cand-4', 'demo')).toThrow(/already accepted/);
  });

  it('rejected 之后 accept 失败（旧候选不可静默接受，须 rewrite 后继）', () => {
    const ledger = new CandidateAdjudicationLedger();
    ledger.reject('cand-5', 'demo');
    expect(() => ledger.accept('cand-5', 'demo')).toThrow(/already rejected/);
  });

  it('rewrite 链：旧候选 superseded，后继可继续被 supersede；旧候选再裁决一律失败', () => {
    const ledger = new CandidateAdjudicationLedger();
    ledger.supersede('cand-a', 'cand-b', 'demo');
    expect(ledger.isSuperseded('cand-a')).toBe(true);
    expect(ledger.record('cand-a')?.supersededBy).toBe('cand-b');
    // 旧候选不可静默接受 / 拒绝 / 再次重写。
    expect(() => ledger.accept('cand-a', 'demo')).toThrow(/superseded/);
    expect(() => ledger.reject('cand-a', 'demo')).toThrow(/superseded/);
    expect(() => ledger.supersede('cand-a', 'cand-c', 'demo')).toThrow(/already superseded/);
    // 后继是 pending，可继续裁决。
    expect(ledger.statusOf('cand-b')).toBe('pending');
    ledger.supersede('cand-b', 'cand-c', 'demo');
    expect(ledger.record('cand-b')?.supersededBy).toBe('cand-c');
  });

  it('记录按项目隔离', () => {
    const ledger = new CandidateAdjudicationLedger();
    ledger.accept('cand-1', 'book-a');
    ledger.reject('cand-2', 'book-b');
    expect(ledger.list('book-a').map((record) => record.candidateId)).toEqual(['cand-1']);
    expect(ledger.list('book-b').map((record) => record.candidateId)).toEqual(['cand-2']);
    expect(ledger.statusOf('cand-1')).toBe('accepted');
    expect(ledger.statusOf('cand-2')).toBe('rejected');
  });
});
