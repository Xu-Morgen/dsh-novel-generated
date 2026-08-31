import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTextAnchor } from '../schema/link.js';
import type { Chapter } from '../schema/text.js';
import {
  TEXT_LINK_INDEX_DIRECTORY,
  TEXT_LINK_INDEX_FILE,
  TextLinkIndexRepository,
  buildTextLinkIndex,
  findTextOccurrences,
  invalidateTextLinkIndex,
  rebuildTextLinkIndex,
  relinkTextAnchor,
  type TextLinkIndexFile,
} from './index.js';
import { textContentHash } from '../text/codec.js';

const chapter: Chapter = {
  id: 'chapter-1', index: 1, title: '灯塔', pov: 'mira', status: 'draft',
  scenes: [{ id: 'scene-1', index: 0, content: '米拉走进灯塔。守夜人留下海图。', summary: '进入', beats: [], canonEvents: [], notes: '', branches: [] }],
};
const source = { id: 'issue-1', chapterId: 'chapter-1', sceneId: 'scene-1', quote: '走进灯塔' };
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('I126 deterministic text-link rebuild', () => {
  it('uses UTF-16 offsets and produces byte-stable output for identical C5 input', () => {
    const unicodeText = 'A😀米拉';
    expect(findTextOccurrences(unicodeText, '米拉')).toEqual([3]);
    const unicodeChapter = { ...chapter, scenes: [{ ...chapter.scenes[0], content: unicodeText }] };
    const first = buildTextLinkIndex('book', [unicodeChapter], [{ ...source, quote: '米拉' }]);
    const second = buildTextLinkIndex('book', [unicodeChapter], [{ ...source, quote: '米拉' }]);
    expect(second).toEqual(first);
    expect(first.index.records[0].link.anchor).toEqual({ start: 3, end: 5, quote: '米拉', sourceHash: textContentHash(unicodeText) });
  });

  it('does not guess repeated or missing quotes, and retains source requests for a later rebuild', () => {
    const duplicate = { ...chapter, scenes: [{ ...chapter.scenes[0], content: '走进灯塔，然后再次走进灯塔。' }] };
    const result = buildTextLinkIndex('book', [duplicate], [source, { ...source, id: 'missing', quote: '不存在' }]);
    expect(result.index.records).toEqual([]);
    expect(result.index.sources.map((item) => item.id)).toEqual(['issue-1', 'missing']);
    expect(result.issues.map((issue) => [issue.id, issue.code])).toEqual([
      ['issue-1', 'ambiguous-quote'], ['missing', 'missing-quote'],
    ]);
    const fixed = { ...duplicate, scenes: [{ ...duplicate.scenes[0], content: '走进灯塔，然后离开。' }] };
    const rebuilt = rebuildTextLinkIndex('book', [fixed], result.index);
    expect(rebuilt.issues.map((issue) => issue.id)).toEqual(['missing']);
    expect(rebuilt.index.records.map((record) => record.id)).toEqual(['issue-1']);
  });

  it('relinks a unique quote but fails closed for missing and ambiguous candidates', () => {
    const oldText = '米拉走进灯塔。';
    const anchor = createTextAnchor(oldText, 2, 6, textContentHash(oldText));
    expect(relinkTextAnchor(anchor, '米拉谨慎地走进灯塔。')).toMatchObject({ status: 'relinked', anchor: { start: 5, quote: '走进灯塔' } });
    expect(relinkTextAnchor(anchor, '米拉离开码头。')).toMatchObject({ status: 'error', code: 'missing-quote' });
    expect(relinkTextAnchor(anchor, '走进灯塔，然后再次走进灯塔。')).toMatchObject({ status: 'error', code: 'ambiguous-quote' });
  });

  it('marks existing anchors stale without retaining them as a valid range fallback', () => {
    const built = buildTextLinkIndex('book', [chapter], [source]).index;
    const stale = invalidateTextLinkIndex(built);
    expect(stale.records[0].status).toBe('stale');
    expect(stale.records[0].link.anchor).toEqual(built.records[0].link.anchor);
  });

  it('persists a versioned derived index and supports drop then rebuild', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i126-links-'));
    tempRoots.push(root);
    const repository = new TextLinkIndexRepository(root);
    const built = buildTextLinkIndex('book', [chapter], [source]).index;
    await repository.build(built);
    expect(await repository.load()).toEqual(built);
    expect(await readFile(join(root, TEXT_LINK_INDEX_DIRECTORY, TEXT_LINK_INDEX_FILE), 'utf8')).toContain('"version":1');
    expect(await repository.drop()).toBe(true);
    expect(await repository.load()).toBeUndefined();
    await repository.build(built);
    expect(await repository.load()).toEqual(built);
    const corrupt = { ...built, version: 99 } as unknown as TextLinkIndexFile;
    await expect(repository.build(corrupt)).rejects.toThrow();
  });
});
