import { describe, expect, it } from 'vitest';
import { textDeletionImpactSchema, textDeletionProposeInputSchema, textDeletionTargetSchema } from './text-deletion.js';

const hash = 'a'.repeat(64);
const base = {
  kind: 'scene' as const,
  chapterId: 'chapter-a',
  sceneId: 'scene-a',
  sceneCount: 1,
  branchCount: 0,
  proseCharacters: 12,
  sources: [{ sceneId: 'scene-a', sourceHash: hash, branches: [] }],
  projectFingerprint: hash,
  targetFingerprint: hash,
  bindings: [],
  activeQueue: [],
  activeCandidates: [],
  historicalReferences: [],
  opaqueHistoryCount: 0,
  blockers: [],
  impactFingerprint: hash,
};

describe('I106 text deletion schema', () => {
  it('accepts explicit chapter/scene targets and rejects ambiguous or cross-shaped targets', () => {
    expect(textDeletionTargetSchema.parse({ kind: 'chapter', chapterId: 'chapter-a' })).toEqual({ kind: 'chapter', chapterId: 'chapter-a' });
    expect(textDeletionTargetSchema.parse({ kind: 'scene', chapterId: 'chapter-a', sceneId: 'scene-a' })).toEqual({ kind: 'scene', chapterId: 'chapter-a', sceneId: 'scene-a' });
    expect(() => textDeletionTargetSchema.parse({ kind: 'chapter', chapterId: 'chapter-a', sceneId: 'scene-a' })).toThrow();
    expect(() => textDeletionTargetSchema.parse({ kind: 'scene', chapterId: 'chapter-a' })).toThrow();
    expect(() => textDeletionTargetSchema.parse({ kind: 'scene', chapterId: 'chapter-a', sceneId: 'scene-a', projectId: 'other' })).toThrow();
  });

  it('rejects duplicate blockers and keeps proposal input strict', () => {
    expect(() => textDeletionImpactSchema.parse({ ...base, blockers: ['active-queue', 'active-queue'] })).toThrow(/Duplicate deletion blocker/);
    expect(() => textDeletionImpactSchema.parse({ ...base, sceneId: undefined })).toThrow(/Scene impact requires sceneId/);
    expect(() => textDeletionProposeInputSchema.parse({ target: { kind: 'scene', chapterId: 'chapter-a', sceneId: 'scene-a' }, expectedImpactFingerprint: hash, extra: true })).toThrow();
  });
});
