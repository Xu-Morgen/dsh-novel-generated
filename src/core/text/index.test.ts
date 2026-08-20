import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TextRepository } from './index.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i6-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const scene = (id: string, content: string) => ({
  id, content, summary: `${id} summary`, beats: [`beat-${id}`], canonEvents: [], notes: '',
});

describe('I6 TextRepository', () => {
  it('round-trips chapter metadata and scene text across reopening', async () => {
    const root = await temporaryRoot();
    const repository = new TextRepository(root);
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: 'The Gate', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-1', scene('scene-1', 'First paragraph.'));
    await repository.appendScene('chapter-1', scene('scene-2', 'Second paragraph.'));

    const reopened = new TextRepository(root);
    await reopened.open();
    expect(await reopened.readChapter('chapter-1')).toMatchObject({
      id: 'chapter-1', index: 1, title: 'The Gate', pov: 'lin', status: 'draft',
      scenes: [
        { id: 'scene-1', index: 0, content: 'First paragraph.' },
        { id: 'scene-2', index: 1, content: 'Second paragraph.' },
      ],
    });
    expect(await reopened.readCompleteChapter('chapter-1')).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('serializes concurrent scene appends into stable indexes', async () => {
    const repository = new TextRepository(await temporaryRoot());
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: 'Chapter', pov: 'lin', status: 'draft' });
    await Promise.all([
      repository.appendScene('chapter-1', scene('scene-a', 'A')),
      repository.appendScene('chapter-1', scene('scene-b', 'B')),
      repository.appendScene('chapter-1', scene('scene-c', 'C')),
    ]);
    expect((await repository.readChapter('chapter-1')).scenes.map((item) => [item.id, item.index])).toEqual([
      ['scene-a', 0], ['scene-b', 1], ['scene-c', 2],
    ]);
  });

  it('replaces only the selected half-open range and preserves surrounding text', async () => {
    const repository = new TextRepository(await temporaryRoot());
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: 'Chapter', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-1', scene('scene-1', 'prefix TARGET suffix'));
    const changed = await repository.replaceRange('chapter-1', 'scene-1', { start: 7, end: 13 }, 'replacement');
    expect(changed.content).toBe('prefix replacement suffix');
    expect(await repository.readCompleteChapter('chapter-1')).toBe('prefix replacement suffix');
  });

  it('rejects invalid chapter, scene, and range references without changing the file', async () => {
    const repository = new TextRepository(await temporaryRoot());
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: 'Chapter', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-1', scene('scene-1', 'immutable text'));
    await expect(repository.readChapter('../escape')).rejects.toThrow(/Invalid project ID/);
    await expect(repository.replaceRange('chapter-1', 'scene-1', { start: -1, end: 2 }, 'x')).rejects.toThrow(/Invalid text range/);
    await expect(repository.replaceRange('chapter-1', 'scene-1', { start: 0, end: 99 }, 'x')).rejects.toThrow(/exceeds/);
    await expect(repository.replaceRange('chapter-1', 'missing', { start: 0, end: 1 }, 'x')).rejects.toThrow(/Unknown scene/);
    expect((await repository.readChapter('chapter-1')).scenes[0].content).toBe('immutable text');
  });

  it('rejects malformed or non-contiguous persisted chapters', async () => {
    const root = await temporaryRoot();
    const repository = new TextRepository(root);
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: 'Chapter', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-1', scene('scene-1', 'text'));
    const path = join(root, 'text', 'chapter-1.json');
    const document = JSON.parse(await readFile(path, 'utf8'));
    document.scenes[0].index = 4;
    await writeFile(path, JSON.stringify(document), 'utf8');
    await expect(repository.readChapter('chapter-1')).rejects.toThrow(/Invalid chapter document/);
  });
});
