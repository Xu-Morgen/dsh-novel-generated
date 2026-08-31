import { describe, expect, it } from 'vitest';
import { outlineGenerationScopeInputSchema, outlineGenerationScopeResultSchema } from './outline-generation-scope.js';

describe('I133 outline generation scope schemas', () => {
  it('accepts the four strict author selections and bounded pages', () => {
    expect(outlineGenerationScopeInputSchema.parse({ kind: 'act', actId: 'act-a', page: { offset: 0, limit: 32 } })).toEqual({
      kind: 'act', actId: 'act-a', page: { offset: 0, limit: 32 },
    });
    expect(outlineGenerationScopeInputSchema.parse({ kind: 'outline-beat', beatId: 'beat-a' })).toEqual({ kind: 'outline-beat', beatId: 'beat-a' });
    expect(outlineGenerationScopeInputSchema.parse({ kind: 'bound-chapter', chapterId: 'chapter-a' })).toEqual({ kind: 'bound-chapter', chapterId: 'chapter-a' });
    expect(outlineGenerationScopeInputSchema.parse({ kind: 'all' })).toEqual({ kind: 'all' });
  });

  it('rejects guessed labels, unknown fields, and unbounded pages', () => {
    expect(() => outlineGenerationScopeInputSchema.parse({ kind: 'act', actId: 'act-a', title: '第一幕' })).toThrow();
    expect(() => outlineGenerationScopeInputSchema.parse({ kind: 'chapter', chapterId: 'chapter-a' })).toThrow();
    expect(() => outlineGenerationScopeInputSchema.parse({ kind: 'all', page: { offset: 0, limit: 129 } })).toThrow();
  });

  it('locks readiness invariants and page totals', () => {
    const base = {
      projectId: 'project', scope: { kind: 'all' as const }, b5ContentFingerprint: 'a'.repeat(64),
      targets: [], targetBeatCount: 0, targetDetailBeatCount: 0,
      protectedSet: { actIds: [], beatIds: [], detailBeatIds: [], preserveStableIds: true as const, preserveOrder: true as const, outsideScopeWritable: false as const },
      mutationBudget: { maxNewDetailBeats: 0, allowExistingReplacement: false as const, allowReorder: false as const, allowScopeExpansion: false as const },
      page: { offset: 0, limit: 128, nextOffset: null, totalTargetBeatCount: 0, totalTargetDetailBeatCount: 0 },
    };
    expect(outlineGenerationScopeResultSchema.parse({ ...base, readiness: 'can-generate' }).readiness).toBe('can-generate');
    expect(() => outlineGenerationScopeResultSchema.parse({ ...base, readiness: 'cannot-generate' })).toThrow(/Blocked scope requires/);
    expect(() => outlineGenerationScopeResultSchema.parse({ ...base, readiness: 'can-generate', blockReason: 'stale-b5' })).toThrow(/Ready scope cannot/);
    expect(() => outlineGenerationScopeResultSchema.parse({ ...base, readiness: 'can-generate', targetBeatCount: 1 })).toThrow(/Target beat count/);
  });
});
