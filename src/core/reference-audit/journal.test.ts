import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { ReferenceAuditJournal } from './journal.js';

const NOW = () => '2026-01-01T00:00:00.000Z';
const LATER = () => '2026-01-02T00:00:00.000Z';
const HASH = 'a'.repeat(64);

function input(operationId = 'reference-1') {
  return {
    projectId: 'demo', operationId,
    source: { kind: 'candidate-accept' as const, candidateId: 'candidate-1', status: 'accepted' as const },
    targets: [
      { owner: 'c1' as const, entityId: 'relationship-1', field: 'relationship', beforeHash: HASH, afterHash: 'b'.repeat(64) },
      { owner: 'c4' as const, entityId: 'event-1', field: 'canon-event', afterHash: 'c'.repeat(64) },
    ],
  };
}

describe('I116 ReferenceAuditJournal', () => {
  it('atomically appends, deduplicates concurrent retries, persists, and paginates deterministically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i116-audit-'));
    try {
      const journal = await ReferenceAuditJournal.open(root);
      const [first, duplicate] = await Promise.all([journal.ensurePending(input(), NOW), journal.ensurePending(input(), LATER)]);
      expect(first).toMatchObject({ recordId: 'reference-1', status: 'pending', attempt: 1, createdAt: NOW() });
      expect(duplicate).toEqual(first);
      expect(journal.list('demo', { limit: 1 })).toMatchObject({ records: [first], nextCursor: null });

      const reopened = await ReferenceAuditJournal.open(root);
      expect(reopened.list('demo', { status: 'pending', limit: 1 }).records).toHaveLength(1);
      const failed = await reopened.markFailed('demo', 'reference-1', 'C3 writer failed', LATER);
      expect(failed).toMatchObject({ status: 'failed', attempt: 1, error: 'C3 writer failed' });
      const retry = await reopened.retry('demo', 'reference-1', LATER);
      expect(retry).toMatchObject({ status: 'pending', attempt: 2 });
      expect(retry).not.toHaveProperty('error');
      const applied = await reopened.markApplied('demo', 'reference-1', LATER);
      expect(applied).toMatchObject({ status: 'applied', attempt: 2 });
      expect(await reopened.markApplied('demo', 'reference-1', NOW)).toEqual(applied);
      expect(reopened.list('demo', { status: 'applied', limit: 1 })).toMatchObject({ records: [applied], nextCursor: null });

      const second = await reopened.ensurePending(input('reference-2'), NOW);
      expect(reopened.list('demo', { limit: 1 })).toMatchObject({ records: [applied], nextCursor: '1' });
      expect(reopened.list('demo', { cursor: '1', limit: 1 })).toMatchObject({ records: [second], nextCursor: null });
      expect(reopened.list('other')).toEqual({ projectId: 'other', records: [], nextCursor: null });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('fails closed for corrupt journals and strict/unsafe state transitions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i116-audit-corrupt-'));
    try {
      const journal = await ReferenceAuditJournal.open(root);
      await journal.ensurePending(input(), NOW);
      await expect(journal.markApplied('demo', 'missing')).rejects.toThrow(/unknown/i);
      await expect(journal.markApplied('demo', 'reference-1')).resolves.toMatchObject({ status: 'applied' });
      await expect(journal.markFailed('demo', 'reference-1', 'must not regress')).resolves.toMatchObject({ status: 'applied' });
      await expect(journal.ensurePending({ ...input('reference-1'), targets: [] })).rejects.toThrow(/different payload/i);

      await writeFile(join(root, 'reference-audit.yaml'), 'records: [not-a-record]\n', 'utf8');
      await expect(ReferenceAuditJournal.open(root)).rejects.toThrow(/invalid reference audit journal/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
