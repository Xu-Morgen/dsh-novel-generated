import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReviewAuditJournal } from './ledger.js';

const NOW = () => '2026-01-01T00:00:00.000Z';
const LATER = () => '2026-01-02T00:00:00.000Z';

function tempProject(): string {
  return mkdtempSync(join(tmpdir(), 'novel-review-ledger-'));
}

describe('I64 软警告显式裁决审计账本', () => {
  it('record 幂等：新裁决 applied，同裁决重复 duplicate，换裁决更新最新记录', async () => {
    const dir = tempProject();
    try {
      const journal = await ReviewAuditJournal.open(dir);
      expect(await journal.record('demo', 'iss-1', 'continue', NOW)).toEqual({ kind: 'applied' });
      expect(await journal.record('demo', 'iss-1', 'continue', NOW)).toEqual({ kind: 'duplicate' });
      expect(journal.decisionOf('demo', 'iss-1')).toBe('continue');
      // 换裁决：更新为该 issue 最新裁决（decidedAt 刷新）。
      expect(await journal.record('demo', 'iss-1', 'rewrite-requested', LATER)).toEqual({ kind: 'applied' });
      const records = journal.list('demo');
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ projectId: 'demo', issueId: 'iss-1', decision: 'rewrite-requested', decidedAt: '2026-01-02T00:00:00.000Z' });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('持久化：重开 journal 后记录仍在（跨刷新/重启可审计）', async () => {
    const dir = tempProject();
    try {
      const first = await ReviewAuditJournal.open(dir);
      await first.record('demo', 'iss-soft', 'continue', NOW);
      await first.record('demo', 'iss-hard', 'rewrite-requested', NOW);
      const reopened = await ReviewAuditJournal.open(dir);
      expect(reopened.list('demo').map((record) => [record.issueId, record.decision]))
        .toEqual([['iss-soft', 'continue'], ['iss-hard', 'rewrite-requested']]);
      // 磁盘文件可读且不包含任何 live 层对象（只含裁决字段）。
      const raw = readFileSync(join(dir, 'review-audit.yaml'), 'utf8');
      expect(raw).toContain('iss-soft');
      expect(raw).not.toContain('content:');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('按项目隔离：不同 project 的 issueId 记录互不可见', async () => {
    const dir = tempProject();
    try {
      const journal = await ReviewAuditJournal.open(dir);
      await journal.record('book-a', 'iss-1', 'continue', NOW);
      await journal.record('book-b', 'iss-1', 'rewrite-requested', NOW);
      expect(journal.decisionOf('book-a', 'iss-1')).toBe('continue');
      expect(journal.decisionOf('book-b', 'iss-1')).toBe('rewrite-requested');
      expect(journal.list('book-a')).toHaveLength(1);
      expect(journal.list('book-b')).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('坏账本文件 fail-closed：损坏内容拒绝打开（不静默当作空账本）', async () => {
    const dir = tempProject();
    try {
      // 先写入非法 YAML 结构，再尝试打开。
      const { writeFileSync } = await import('node:fs');
      writeFileSync(join(dir, 'review-audit.yaml'), 'records: [not-a-record]\n', 'utf8');
      await expect(ReviewAuditJournal.open(dir)).rejects.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
