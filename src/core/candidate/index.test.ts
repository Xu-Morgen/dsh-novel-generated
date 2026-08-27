import { describe, expect, it } from 'vitest';
import {
  assertCandidateFresh,
  candidateTargetSchema,
  hashText,
  isCandidateStale,
  parseWritingCandidate,
  validateCandidateTarget,
  writingCandidateSchema,
  writingIntentSchema,
} from './index.js';

/** 四种 intent 各自合法的候选样例。 */
function target(intent: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base: Record<string, unknown> = { projectId: 'demo' };
  if (intent === 'rewrite') Object.assign(base, { chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: hashText('源正文') });
  if (intent === 'continue' || intent === 'scene-card') Object.assign(base, { chapterId: 'chapter-1', sceneId: 'scene-next' });
  return { ...base, ...overrides };
}

function candidate(intent: string, target: Record<string, unknown>): Record<string, unknown> {
  return { id: 'cand-1', intent, target, prompt: 'p', text: '正文', chunkCount: 1, createdAt: '2024-01-01T00:00:00.000Z' };
}

describe('I62 candidate contract', () => {
  it('freezes the four-intent enum and rejects unknown intents', () => {
    expect(writingIntentSchema.options).toEqual(['generate', 'continue', 'scene-card', 'rewrite']);
    expect(writingIntentSchema.safeParse('explain').success).toBe(false);
  });

  it('parses a strict valid rewrite candidate and freezes it', () => {
    const parsed = parseWritingCandidate(candidate('rewrite', target('rewrite')));
    expect(parsed.intent).toBe('rewrite');
    expect(parsed.target.sourceHash).toBe(hashText('源正文'));
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.target)).toBe(true);
    // strict：多余字段拒绝
    expect(writingCandidateSchema.safeParse({ ...candidate('rewrite', target('rewrite')), extra: 1 }).success).toBe(false);
  });

  it('rejects invalid target shapes: bad hash, bad id, extra fields', () => {
    expect(candidateTargetSchema.safeParse({ projectId: 'demo', chapterId: 'c', sceneId: 's', sourceHash: 'nope' }).success).toBe(false);
    expect(candidateTargetSchema.safeParse({ projectId: '../escape' }).success).toBe(false);
    expect(candidateTargetSchema.safeParse({ projectId: 'demo', extra: 1 }).success).toBe(false);
  });

  it('enforces intent→target binding (rewrite requires sourceHash; continue/scene-card require chapter+scene)', () => {
    expect(() => validateCandidateTarget('rewrite', { projectId: 'demo', chapterId: 'c', sceneId: 's' })).toThrow(/requires sourceHash/);
    expect(() => validateCandidateTarget('rewrite', { projectId: 'demo', sceneId: 's', sourceHash: hashText('x') })).toThrow(/requires chapterId/);
    expect(() => validateCandidateTarget('rewrite', { projectId: 'demo', chapterId: 'c', sourceHash: hashText('x') })).toThrow(/requires sceneId/);
    expect(() => validateCandidateTarget('continue', { projectId: 'demo', sceneId: 's' })).toThrow(/requires chapterId/);
    expect(() => validateCandidateTarget('scene-card', { projectId: 'demo', chapterId: 'c' })).toThrow(/requires sceneId/);
    // generate 只绑定 projectId 即合法
    expect(() => validateCandidateTarget('generate', { projectId: 'demo' })).not.toThrow();
  });

  it('parseWritingCandidate rejects candidates whose target violates the intent binding', () => {
    const bad = candidate('rewrite', { projectId: 'demo' });
    expect(() => parseWritingCandidate(bad)).toThrow(/requires chapterId/);
  });

  it('declares staleness only when the bound source hash no longer matches', () => {
    const rewrite = parseWritingCandidate(candidate('rewrite', target('rewrite')));
    expect(isCandidateStale(rewrite, '源正文')).toBe(false);
    expect(isCandidateStale(rewrite, '改写后的正文')).toBe(true);
    expect(() => assertCandidateFresh(rewrite, '改写后的正文')).toThrow(/stale/);
    expect(() => assertCandidateFresh(rewrite, '源正文')).not.toThrow();
  });

  it('never marks an unbound (new-scene) candidate stale by source change', () => {
    const fresh = parseWritingCandidate(candidate('continue', target('continue')));
    expect(fresh.target.sourceHash).toBeUndefined();
    expect(isCandidateStale(fresh, '任何正文')).toBe(false);
  });
});
