import { describe, expect, it } from 'vitest';
import { assertTextAnchor, createTextAnchor, entityLinkSchema } from './link.js';

describe('I124 EntityLink/TextAnchor contract', () => {
  it('uses UTF-16 code-unit offsets and preserves the exact quoted text', () => {
    const text = '甲😀乙';
    const anchor = createTextAnchor(text, 1, 3, 'a'.repeat(64));
    expect(anchor).toEqual({ start: 1, end: 3, quote: '😀', sourceHash: 'a'.repeat(64) });
    expect(() => assertTextAnchor(text, anchor)).not.toThrow();
    expect(() => assertTextAnchor('甲🙂乙', anchor)).toThrow(/quote/);
  });

  it('rejects reversed/out-of-bounds ranges and non-strict link shapes', () => {
    expect(() => createTextAnchor('abc', 2, 2, 'a'.repeat(64))).toThrow(/range/);
    expect(() => createTextAnchor('abc', 0, 4, 'a'.repeat(64))).toThrow(/range/);
    expect(() => entityLinkSchema.parse({ projectId: 'book', kind: 'text', chapterId: 'ch-1', sceneId: 'sc-1', extra: true })).toThrow();
    expect(() => entityLinkSchema.parse({ projectId: 'book', kind: 'unknown', entityId: 'entry-1' })).toThrow();
  });

  it('keeps text and entity targets in one discriminated strict contract', () => {
    expect(entityLinkSchema.parse({ projectId: 'book', kind: 'text', chapterId: 'ch-1', sceneId: 'sc-1' })).toEqual({
      projectId: 'book', kind: 'text', chapterId: 'ch-1', sceneId: 'sc-1',
    });
    expect(entityLinkSchema.parse({ projectId: 'book', kind: 'character', entityId: 'mira' })).toEqual({
      projectId: 'book', kind: 'character', entityId: 'mira',
    });
  });
});
