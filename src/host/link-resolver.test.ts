import { describe, expect, it } from 'vitest';
import { createTextAnchor } from '../core/schema/link.js';
import { textContentHash } from '../core/text/codec.js';
import { createLinkTargetResolver } from './link-resolver.js';
import type { Chapter } from '../core/schema/text.js';

const chapter: Chapter = {
  id: 'chapter-1', index: 1, title: '灯塔', pov: 'mira', status: 'draft',
  scenes: [{ id: 'scene-1', index: 0, content: '米拉走进灯塔。', summary: '进入', beats: [], canonEvents: [], notes: '', branches: [] }],
};

describe('I124 Host link target resolver', () => {
  const resolver = createLinkTargetResolver({
    text: { readChapter: async (_projectId: string, chapterId: string) => {
      if (chapterId !== chapter.id) throw new Error('Unknown chapter');
      return chapter;
    } },
    entityExists: async (_projectId, kind, entityId) => kind === 'character' && entityId === 'mira',
  });

  it('returns ready only when project, target, and anchor freshness all match', async () => {
    const content = chapter.scenes[0].content;
    const result = await resolver.resolve('book', {
      projectId: 'book', kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-1',
      anchor: createTextAnchor(content, 0, 2, textContentHash(content)),
    });
    expect(result).toMatchObject({ status: 'ready', link: { kind: 'text', sceneId: 'scene-1' } });
  });

  it('fails closed for invalid, cross-project, unknown, stale, and unknown entity targets', async () => {
    await expect(resolver.resolve('book', { projectId: 'other', kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-1' })).resolves.toMatchObject({ status: 'error', code: 'cross-project' });
    await expect(resolver.resolve('book', { projectId: 'book', kind: 'text', chapterId: 'missing', sceneId: 'scene-1' })).resolves.toMatchObject({ status: 'error', code: 'unknown-target' });
    await expect(resolver.resolve('book', { projectId: 'book', kind: 'text', chapterId: 'chapter-1', sceneId: 'missing' })).resolves.toMatchObject({ status: 'error', code: 'unknown-target' });
    await expect(resolver.resolve('book', {
      projectId: 'book', kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-1',
      anchor: { start: 0, end: 2, quote: '米拉', sourceHash: 'b'.repeat(64) },
    })).resolves.toMatchObject({ status: 'error', code: 'stale' });
    await expect(resolver.resolve('book', { projectId: 'book', kind: 'character', entityId: 'missing' })).resolves.toMatchObject({ status: 'error', code: 'unknown-target' });
    await expect(resolver.resolve('book', { projectId: 'book', kind: 'not-a-kind', entityId: 'x' })).resolves.toMatchObject({ status: 'error', code: 'invalid-link' });
  });

  it('resolves live non-text existence without copying its projection', async () => {
    await expect(resolver.resolve('book', { projectId: 'book', kind: 'character', entityId: 'mira' })).resolves.toMatchObject({ status: 'ready' });
  });
});
