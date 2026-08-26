import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderChapterMarkdown, TextRepository } from './index.js';

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

  it('renders a readable docs/<chapter>.md with paragraphs on every chapter write', async () => {
    const root = await temporaryRoot();
    const repository = new TextRepository(root);
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章 火车上', pov: 'lin', status: 'draft' });
    // 两段正文（空行分隔）+ 一个多行场景。
    await repository.appendScene('chapter-1', scene('scene-1', '第一段。\n\n第二段。'));
    await repository.appendScene('chapter-1', scene('scene-2', '“你好。”\n记者笑道。'));

    const docs = join(root, 'docs', 'chapter-1.md');
    const rendered = await readFile(docs, 'utf8');
    expect(rendered).toContain('# 第一章 火车上');
    expect(rendered).toContain('## 场景 1 · scene-1 summary');
    expect(rendered).toContain('第一段。\n\n第二段。');
    expect(rendered).toContain('## 场景 2 · scene-2 summary');
    expect(rendered).toContain('“你好。”\n\n记者笑道。');

    // 局部替换后镜像同步更新。
    await repository.replaceRange('chapter-1', 'scene-1', { start: 0, end: 3 }, '新开头');
    const updated = await readFile(docs, 'utf8');
    expect(updated).toContain('新开头。');
    expect(updated).not.toContain('第一段。');
  });

  it('renderChapterMarkdown produces paragraphs from newline-separated prose', () => {
    const rendered = renderChapterMarkdown({
      id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft',
      scenes: [{ id: 'scene-1', index: 0, content: '第一段。\n第二段。\n\n第三段。', summary: '相遇', beats: [], canonEvents: [], notes: '' }],
    });
    expect(rendered).toContain('# 第一章');
    expect(rendered).toContain('## 场景 1 · 相遇');
    expect(rendered).toContain('第一段。\n\n第二段。\n\n第三段。');
  });
});
