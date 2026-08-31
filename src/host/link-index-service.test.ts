import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createLinkTargetResolver } from './link-resolver.js';
import { createLinkIndexService } from './link-index-service.js';
import { createTextService } from './text-service.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('I126 Host link index service', () => {
  it('invalidates on a real C5 edit, rejects the old anchor, and rebuilds from current prose', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i126-host-links-'));
    roots.push(root);
    let index: ReturnType<typeof createLinkIndexService> | undefined;
    const text = createTextService(root, {
      onTextChanged: async (projectId, change) => { await index?.invalidate(projectId, change); },
    });
    index = createLinkIndexService({ text, projectsRoot: root });
    await text.open('book');
    await text.createChapter('book', { id: 'chapter-1', index: 1, title: '灯塔', pov: 'mira', status: 'draft' });
    await text.appendScene('book', 'chapter-1', { id: 'scene-1', content: '米拉走进灯塔。', summary: '进入', beats: [], canonEvents: [], notes: '' });

    const built = await index.build('book', [{ id: 'issue-1', chapterId: 'chapter-1', sceneId: 'scene-1', quote: '走进灯塔' }]);
    expect(built.issues).toEqual([]);
    const oldLink = built.index.records[0].link;
    await text.replaceRange('book', 'chapter-1', 'scene-1', { start: 0, end: 2 }, '米拉谨慎地');
    expect((await index.load('book'))?.records[0].status).toBe('stale');

    const resolver = createLinkTargetResolver({ text });
    await expect(resolver.resolve('book', oldLink)).resolves.toMatchObject({ status: 'error', code: 'stale' });
    const rebuilt = await index.rebuild('book');
    expect(rebuilt.issues).toEqual([]);
    expect(rebuilt.index.records[0]).toMatchObject({ status: 'ready', link: { anchor: { start: 5, quote: '走进灯塔' } } });
    expect(rebuilt.index.records[0].link.anchor.sourceHash).not.toBe(oldLink.anchor?.sourceHash);
    await expect(resolver.resolve('book', rebuilt.index.records[0].link)).resolves.toMatchObject({ status: 'ready' });
  });

  it('never lets a derived invalidation failure veto a committed C5 write', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i126-host-links-failure-'));
    roots.push(root);
    const text = createTextService(root, { onTextChanged: async () => { throw new Error('derived store unavailable'); } });
    await text.open('book');
    await expect(text.createChapter('book', { id: 'chapter-1', index: 1, title: '灯塔', pov: 'mira', status: 'draft' })).resolves.toMatchObject({ id: 'chapter-1' });
    await expect(text.appendScene('book', 'chapter-1', { id: 'scene-1', content: '正文', summary: '场景', beats: [], canonEvents: [], notes: '' })).resolves.toMatchObject({ id: 'scene-1', content: '正文' });
  });
});
