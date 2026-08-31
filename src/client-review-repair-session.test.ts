import { describe, expect, it } from 'vitest';
import {
  beginReviewRepairAccept,
  beginReviewRepairGeneration,
  beginReviewRepairRescan,
  cancelReviewRepairSession,
  correlateReviewRepairScan,
  failReviewRepairSession,
  freshReviewRepairSession,
  rejectReviewRepairSession,
  settleReviewRepairCandidate,
} from './client/review-repair-session.js';

const candidate = {
  projectId: 'book', issueId: 'issue-1', issueFingerprint: 'issue-1',
  target: { projectId: 'book', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) },
  lineage: { kind: 'review-repair', issueId: 'issue-1', issueFingerprint: 'issue-1', sourceHash: 'a'.repeat(64) },
  candidate: { id: 'candidate-1', intent: 'rewrite', target: { projectId: 'book', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) }, prompt: '修复', text: '修复后', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' },
} as const;

describe('I129 review repair session state machine', () => {
  it('only enters resolved when the correlated fingerprint disappears', () => {
    const ready = settleReviewRepairCandidate(candidate);
    const accepting = beginReviewRepairAccept(ready);
    const rescanning = beginReviewRepairRescan(accepting, '2026-01-01T00:00:00.000Z');
    const unresolved = correlateReviewRepairScan(rescanning, ['issue-1'], '2026-01-01T00:00:01.000Z');
    expect(unresolved.status).toBe('unresolved');
    expect(unresolved.resolved).toBeUndefined();

    const resolved = correlateReviewRepairScan(beginReviewRepairRescan(unresolved, rescanning.acceptedAt!), [], '2026-01-01T00:00:02.000Z');
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolved).toMatchObject({ issueFingerprint: 'issue-1', candidateId: 'candidate-1' });
  });

  it('keeps rescan failure/cancel uncertain and clears generation on cancel', () => {
    const ready = settleReviewRepairCandidate(candidate);
    const rescanning = beginReviewRepairRescan(beginReviewRepairAccept(ready), '2026-01-01T00:00:00.000Z');
    expect(failReviewRepairSession(rescanning, 'rescan', 'scan failed').status).toBe('uncertain');
    expect(cancelReviewRepairSession(rescanning)).toMatchObject({ status: 'uncertain', message: expect.stringContaining('取消') });
    expect(cancelReviewRepairSession(beginReviewRepairGeneration('issue-1'))).toEqual(freshReviewRepairSession());
  });

  it('keeps rejected candidates out of the resolved path', () => {
    const rejected = rejectReviewRepairSession(settleReviewRepairCandidate(candidate));
    expect(rejected.status).toBe('rejected');
    expect(rejected.resolved).toBeUndefined();
  });
});
