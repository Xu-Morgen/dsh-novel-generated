import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createReferenceAuditService } from './reference-audit-service.js';

const HASH = 'a'.repeat(64);

describe('I116 NovelReferenceAuditService', () => {
  it('returns a bounded Host-owned projection and clears all handles on Fiber dispose', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i116-audit-service-'));
    try {
      let dispose: (() => void) | undefined;
      const service = createReferenceAuditService(root, (callback) => { dispose = callback; });
      const journal = await service.journalFor('demo');
      await journal.ensurePending({
        projectId: 'demo', operationId: 'audit-service-1',
        source: { kind: 'reparse-accept', proposalId: 'proposal-1', status: 'accepted' },
        targets: [{ owner: 'c3', entityId: 'secret-1', field: 'knowledge-entry', afterHash: HASH }],
      });
      const result = await service.list('demo', { status: 'pending', limit: 10 });
      expect(result).toMatchObject({ projectId: 'demo', nextCursor: null, records: [{ operationId: 'audit-service-1', targets: [{ owner: 'c3', entityId: 'secret-1' }] }] });
      expect(result.records[0]).not.toHaveProperty('content');
      await service.retry('demo', 'audit-service-1');
      dispose?.();
      await expect(service.list('demo')).rejects.toThrow(/disposed/);
      await expect(service.journalFor('demo')).rejects.toThrow(/disposed/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects unsafe project IDs before touching the project root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i116-audit-service-path-'));
    try {
      const service = createReferenceAuditService(root);
      await expect(service.list('../outside')).rejects.toThrow(/invalid project id/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
