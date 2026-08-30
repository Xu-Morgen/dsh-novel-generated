import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertTaskTransition,
  countProseUnits,
  queueJournalSchema,
  queueTaskId,
  queueTaskSchema,
  refreshQueueJournal,
  stableSceneId,
  isTerminalTaskStatus,
  type QueueJournalData,
} from './task.js';
import { QueueJournalFile } from './journal.js';
import { parseWritingCandidate, type WritingCandidate } from '../candidate/index.js';

/**
 * I65 可恢复自动生成队列 —— core/queue 纯模块回归 + 负向（design §14.9 / R13-6）。
 *
 * 覆盖：稳定场景 ID 的确定性/格式/跨路径唯一、任务稳定 ID、写作单位计数（CJK +
 * 拉丁）、任务状态机合法/非法迁移、账本 schema strict、账本文件 round-trip 与
 * 原子写入、candidate-ready 内联候选的 schema 往返（恢复锚点）。
 */

describe('core/queue stable scene id', () => {
  it('is deterministic, entityId-valid and <= 64 chars', () => {
    const a = stableSceneId('act-1', 'beat-1', 'detail-1');
    expect(a).toBe(stableSceneId('act-1', 'beat-1', 'detail-1'));
    expect(a).toMatch(/^scene-[a-f0-9]{16}$/);
    expect(a.length).toBeLessThanOrEqual(64);
    // 同一 card 在不同 beat/act 下 scene id 不同（chapter 内唯一）。
    expect(stableSceneId('act-1', 'beat-2', 'detail-1')).not.toBe(a);
    expect(stableSceneId('act-2', 'beat-1', 'detail-1')).not.toBe(a);
  });

  it('rejects invalid card path ids (fail-closed)', () => {
    expect(() => stableSceneId('act 1', 'beat-1', 'detail-1')).toThrow();
    expect(() => stableSceneId('act-1', '', 'detail-1')).toThrow();
  });

  it('derives a stable task id from the scene id', () => {
    const sceneId = stableSceneId('act-1', 'beat-1', 'detail-1');
    expect(queueTaskId(sceneId)).toBe(`qt-${sceneId}`);
    expect(queueTaskId(sceneId)).toMatch(/^qt-[a-z0-9][a-z0-9_-]*[a-z0-9]$/);
    expect(queueTaskId(sceneId)).toBe(queueTaskId(stableSceneId('act-1', 'beat-1', 'detail-1')));
  });
});

describe('core/queue prose units', () => {
  it('counts CJK characters and latin words deterministically', () => {
    expect(countProseUnits('米拉在码头找到铜钥匙。')).toBe(10);
    expect(countProseUnits('')).toBe(0);
    expect(countProseUnits('hello world')).toBe(2);
    expect(countProseUnits('米拉 hello 码头 world')).toBe(6);
    expect(countProseUnits('  \n\t ')).toBe(0);
  });
});

describe('core/queue task status machine', () => {
  it('allows the documented transitions', () => {
    expect(() => assertTaskTransition('queued', 'running')).not.toThrow();
    expect(() => assertTaskTransition('queued', 'cancelled')).not.toThrow();
    expect(() => assertTaskTransition('queued', 'completed')).not.toThrow();
    expect(() => assertTaskTransition('running', 'queued')).not.toThrow();
    expect(() => assertTaskTransition('running', 'candidate-ready')).not.toThrow();
    expect(() => assertTaskTransition('running', 'failed')).not.toThrow();
    expect(() => assertTaskTransition('candidate-ready', 'completed')).not.toThrow();
    expect(() => assertTaskTransition('candidate-ready', 'queued')).not.toThrow();
    expect(() => assertTaskTransition('failed', 'queued')).not.toThrow();
  });

  it('rejects illegal transitions (negative)', () => {
    expect(() => assertTaskTransition('cancelled', 'queued')).toThrow(/Invalid queue task transition/);
    expect(() => assertTaskTransition('completed', 'running')).toThrow(/Invalid queue task transition/);
    expect(() => assertTaskTransition('queued', 'candidate-ready')).toThrow(/Invalid queue task transition/);
    expect(() => assertTaskTransition('candidate-ready', 'running')).toThrow(/Invalid queue task transition/);
  });

  it('marks cancelled and completed as terminal', () => {
    expect(isTerminalTaskStatus('cancelled')).toBe(true);
    expect(isTerminalTaskStatus('completed')).toBe(true);
    expect(isTerminalTaskStatus('queued')).toBe(false);
    expect(isTerminalTaskStatus('candidate-ready')).toBe(false);
  });
});

describe('core/queue journal schema', () => {
  const candidate = (id: string): WritingCandidate => parseWritingCandidate({
    id,
    intent: 'scene-card' as const,
    target: { projectId: 'demo', chapterId: 'chapter-1', sceneId: 'scene-abc123' },
    prompt: '你是长篇小说章节写作器。…',
    text: '米拉在码头找到铜钥匙。',
    chunkCount: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
  });

  const journal = (overrides: Partial<QueueJournalData> = {}): QueueJournalData => ({
    version: 2,
    projectId: 'demo',
    runState: 'running',
    config: { wordBudget: 200, maxRetries: 1, stopOnSoftWarnings: false },
    consumedUnits: 10,
    tasks: [{
      version: 2,
      id: queueTaskId('scene-abc123'),
      projectId: 'demo',
      chapterId: 'chapter-1',
      sceneId: 'scene-abc123',
      actId: 'act-1',
      beatId: 'beat-1',
      cardId: 'detail-1',
      card: { id: 'detail-1', title: '发现海图', summary: '米拉发现半张烧焦海图', pov: 'mira', wordTarget: 20, points: ['发现海图'], status: 'writing' },
      navigation: { actId: 'act-1', beatId: 'beat-1', title: '午夜旧灯塔', description: 'd', prerequisites: [], prerequisitesMet: true, instruction: 'i', deviationIds: [] },
      intent: 'scene-card',
      status: 'candidate-ready',
      candidateId: 'cand-queue-1',
      attempts: 1,
      error: null,
      budgetUnits: 10,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      candidate: candidate('cand-queue-1'),
      settings: { modelRef: 'dsh/default', credentialRef: 'dsh/managed' },
      targetSnapshot: { chapterId: 'chapter-1', sceneId: 'scene-abc123', detailBeatId: 'detail-1', textFingerprint: '0'.repeat(64), outlineFingerprint: '1'.repeat(64), bindingFingerprint: '2'.repeat(64) },
    }],
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  it('parses a full journal with an inline candidate (recovery anchor)', () => {
    const parsed = queueJournalSchema.parse(journal());
    expect(parsed.runState).toBe('running');
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].candidate?.id).toBe('cand-queue-1');
    expect(parsed.tasks[0].candidate?.text).toBe('米拉在码头找到铜钥匙。');
    expect(parsed.tasks[0].settings?.credentialRef).toBe('dsh/managed');
  });

  it('atomically refreshes a same-card task and resets all generation state', () => {
    const source = journal();
    const refreshed = refreshQueueJournal(source, [{
      sourceTaskId: source.tasks[0].id,
      chapterId: 'chapter-2', sceneId: 'scene-rebound', actId: 'act-2', beatId: 'beat-2',
      card: { ...source.tasks[0].card, title: 'Fresh card title' },
      navigation: { ...source.tasks[0].navigation, actId: 'act-2', beatId: 'beat-2' },
      targetSnapshot: { chapterId: 'chapter-2', sceneId: 'scene-rebound', detailBeatId: 'detail-1', textFingerprint: '3'.repeat(64), outlineFingerprint: '4'.repeat(64), bindingFingerprint: '5'.repeat(64) },
      occupied: false,
      updatedAt: '2025-01-02T00:00:00.000Z',
    }]);
    expect(refreshed.tasks[0]).toMatchObject({
      id: queueTaskId('scene-rebound'), chapterId: 'chapter-2', sceneId: 'scene-rebound',
      actId: 'act-2', beatId: 'beat-2', status: 'queued', attempts: 0,
      candidateId: null, candidate: null, settings: null, error: null, budgetUnits: null,
    });
    expect(source.tasks[0]).toMatchObject({ status: 'candidate-ready', candidateId: 'cand-queue-1', sceneId: 'scene-abc123' });
  });

  it('rejects extra fields and malformed task shapes (strict, negative)', () => {
    expect(() => queueJournalSchema.parse({ ...journal(), extra: true })).toThrow();
    expect(() => queueJournalSchema.parse({ ...journal(), tasks: [{ ...journal().tasks[0], status: 'bogus' }] })).toThrow();
    expect(() => queueJournalSchema.parse({ ...journal(), consumedUnits: -1 })).toThrow();
    const { targetSnapshot: _snapshot, ...missingSnapshot } = journal().tasks[0] as QueueJournalData['tasks'][number] & { targetSnapshot: unknown };
    expect(() => queueTaskSchema.parse(missingSnapshot)).toThrow();
    expect(() => queueTaskSchema.parse({ ...journal().tasks[0], intent: 'rewrite' })).toThrow(/scene-card/);
  });
});

describe('core/queue journal file', () => {
  it('round-trips through disk with atomic write and fresh fallback', async () => {
    const root = mkdtempSync(join(tmpdir(), 'novel-queue-journal-'));
    // 项目目录名必须是合法 projectId（fresh 账本从目录名派生 projectId）。
    const dir = join(root, 'demo');
    mkdirSync(dir, { recursive: true });
    try {
      const file = QueueJournalFile.forProject(dir);
      const fresh = await file.read();
      expect(fresh.projectId).toBe('demo');
      expect(fresh.runState).toBe('idle');
      expect(fresh.tasks).toEqual([]);

      const data: QueueJournalData = {
        version: 2,
        projectId: 'demo',
        runState: 'paused',
        config: { wordBudget: 100, maxRetries: 2, stopOnSoftWarnings: true },
        consumedUnits: 0,
        tasks: [],
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      await file.write(data);
      const reread = await file.read();
      expect(reread).toEqual(data);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails closed on a corrupt journal file (negative)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'novel-queue-journal-'));
    const dir = join(root, 'demo');
    mkdirSync(dir, { recursive: true });
    try {
      writeFileSync(join(dir, 'queue-journal.yaml'), 'runState: [broken', 'utf8');
      await expect(QueueJournalFile.forProject(dir).read()).rejects.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
