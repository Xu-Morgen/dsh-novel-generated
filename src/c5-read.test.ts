import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TextRepository, renderChapterMarkdown } from './core/text/index.js';
import { createTextService } from './host/text-service.js';
import { createWorkspaceEditorService } from './remote.js';

/**
 * I60 C5 最小只读 Remote 验收（design §5.12 / R13-1）：
 * 多章顺序、空章、未知引用、跨项目拒绝、重开一致；只返回最小 owned JSON；
 * 现有 docs/ 派生镜像语义不变。
 *
 * 通过真实 temp projects root + I6 TextRepository 建立 C5 数据，再经
 * createWorkspaceEditorService 的 C5 只读方法断言 —— 这是 Host adapter 的
 * 消费者夹具（AGENTS §2 地基切片必配消费者夹具）。
 */

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i60-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const scene = (id: string, content: string, summary = `${id} summary`) => ({
  id, content, summary, beats: [`beat-${id}`], canonEvents: [], notes: '',
});

/** 六层 stub：C5 只读方法不触达它们；仅满足 createWorkspaceEditorService 签名。 */
const dummy = { list: async () => [], read: async () => ({}), create: async () => ({}), update: async () => ({}) } as never;

function makeService(projectsRoot: string) {
  return createWorkspaceEditorService(
    dummy, dummy, dummy, dummy, dummy, dummy, dummy, undefined, undefined, createTextService(projectsRoot),
  );
}

describe('I60 C5 章节/场景只读 Remote', () => {
  it('多章顺序：chapterList 按章节 index 升序返回，且不含任何正文', async () => {
    const root = await temporaryRoot();
    const text = createTextService(root);
    await text.open('book');
    const repository = new TextRepository(join(root, 'book'));
    await repository.open();
    // 故意乱序创建：index 3 先落盘，文件名字典序 ≠ 叙事顺序。
    await repository.createChapter({ id: 'chapter-c', index: 3, title: '终章', pov: 'lin', status: 'draft' });
    await repository.createChapter({ id: 'chapter-a', index: 1, title: '第一章', pov: 'lin', status: 'draft' });
    await repository.createChapter({ id: 'chapter-b', index: 2, title: '第二章', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-a', scene('scene-1', '第一章正文', '相遇'));

    const service = makeService(root);
    const list = await service.chapterList('book');
    expect(list.map((item) => [item.id, item.index])).toEqual([
      ['chapter-a', 1], ['chapter-b', 2], ['chapter-c', 3],
    ]);
    expect(JSON.stringify(list)).not.toContain('第一章正文');
  });

  it('空章：列表项 sceneCount 为 0，章节读取场景为空，正文读取拒绝未知场景', async () => {
    const root = await temporaryRoot();
    const text = createTextService(root);
    await text.open('book');
    const repository = new TextRepository(join(root, 'book'));
    await repository.open();
    await repository.createChapter({ id: 'chapter-empty', index: 1, title: '空章', pov: 'lin', status: 'draft' });

    const service = makeService(root);
    const list = await service.chapterList('book');
    expect(list).toHaveLength(1);
    expect(list[0].sceneCount).toBe(0);
    const read = await service.chapterRead('book', 'chapter-empty');
    expect(read.scenes).toEqual([]);
    await expect(service.sceneRead('book', 'chapter-empty', 'scene-ghost')).rejects.toThrow(/Unknown scene: scene-ghost/);
  });

  it('最小 owned JSON：chapterRead 只含场景摘要，sceneRead 是唯一携带正文的投影', async () => {
    const root = await temporaryRoot();
    const text = createTextService(root);
    await text.open('book');
    const repository = new TextRepository(join(root, 'book'));
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-1', scene('scene-1', '第一段。\n\n第二段。', '相遇'));
    await repository.appendScene('chapter-1', scene('scene-2', '另一段正文。', '分别'));

    const service = makeService(root);
    const read = await service.chapterRead('book', 'chapter-1');
    expect(read.scenes).toEqual([
      { id: 'scene-1', index: 0, summary: '相遇' },
      { id: 'scene-2', index: 1, summary: '分别' },
    ]);
    expect(JSON.stringify(read)).not.toContain('第一段。');
    const sceneRead = await service.sceneRead('book', 'chapter-1', 'scene-2');
    expect(sceneRead.chapter).toEqual({ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin' });
    expect(sceneRead.scene.content).toBe('另一段正文。');
    expect(JSON.stringify(sceneRead)).not.toContain('第一段。');
  });

  it('未知引用：未知章节与非法章节 id 显式失败，不触碰任何数据', async () => {
    const root = await temporaryRoot();
    const text = createTextService(root);
    await text.open('book');
    const repository = new TextRepository(join(root, 'book'));
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-1', scene('scene-1', '正文'));

    const service = makeService(root);
    await expect(service.chapterRead('book', 'chapter-ghost')).rejects.toThrow(/Unknown chapter: chapter-ghost/);
    await expect(service.sceneRead('book', 'chapter-ghost', 'scene-1')).rejects.toThrow(/Unknown chapter/);
    await expect(service.chapterRead('book', '../escape')).rejects.toThrow(/Invalid project ID/);
    // 场景 id 只做章内查找（不接触文件系统），未知/非法值显式失败。
    await expect(service.sceneRead('book', 'chapter-1', 'scene-ghost')).rejects.toThrow(/Unknown scene: scene-ghost/);
    await expect(service.sceneRead('book', 'chapter-1', '../escape')).rejects.toThrow(/Unknown scene/);
  });

  it('跨项目拒绝：项目 B 读取项目 A 的章节/场景必然失败，互不串读', async () => {
    const root = await temporaryRoot();
    const text = createTextService(root);
    await text.open('book-a');
    await text.open('book-b');
    const repositoryA = new TextRepository(join(root, 'book-a'));
    await repositoryA.open();
    await repositoryA.createChapter({ id: 'chapter-1', index: 1, title: 'A 的章节', pov: 'lin', status: 'draft' });
    await repositoryA.appendScene('chapter-1', scene('scene-1', 'A 的正文'));

    const service = makeService(root);
    expect(await service.chapterList('book-b')).toEqual([]);
    await expect(service.chapterRead('book-b', 'chapter-1')).rejects.toThrow(/Unknown chapter: chapter-1/);
    await expect(service.sceneRead('book-b', 'chapter-1', 'scene-1')).rejects.toThrow(/Unknown chapter/);
    // 项目 A 自身读取不受影响。
    const sceneRead = await service.sceneRead('book-a', 'chapter-1', 'scene-1');
    expect(sceneRead.scene.content).toBe('A 的正文');
  });

  it('重开一致：新 service 实例重开后列表/读取与首次一致', async () => {
    const root = await temporaryRoot();
    const text = createTextService(root);
    await text.open('book');
    const repository = new TextRepository(join(root, 'book'));
    await repository.open();
    await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-1', scene('scene-1', '正文', '相遇'));

    const first = makeService(root);
    const before = await first.chapterList('book');
    // 重开（全新 TextRepository + 全新 service）后读取一致。
    const second = makeService(root);
    const after = await second.chapterList('book');
    expect(after).toEqual(before);
    expect(await second.sceneRead('book', 'chapter-1', 'scene-1')).toEqual(await first.sceneRead('book', 'chapter-1', 'scene-1'));
  });

  it('docs/ 派生镜像语义不变：章节写入仍同步渲染 docs/<id>.md，只读 Remote 不影响镜像', async () => {
    const root = await temporaryRoot();
    const text = createTextService(root);
    await text.open('book');
    const repository = new TextRepository(join(root, 'book'));
    await repository.open();
    const chapter = await repository.createChapter({ id: 'chapter-1', index: 1, title: '第一章 火车上', pov: 'lin', status: 'draft' });
    await repository.appendScene('chapter-1', scene('scene-1', '第一段。\n\n第二段。', '相遇'));

    // 镜像仍是每次章节写入后的派生产物（I6/I39 语义，引擎不读它）。
    const mirrorPath = join(root, 'book', 'docs', 'chapter-1.md');
    const rendered = await readFile(mirrorPath, 'utf8');
    expect(rendered).toBe(renderChapterMarkdown({ ...chapter, scenes: [{ id: 'scene-1', index: 0, content: '第一段。\n\n第二段。', summary: '相遇', beats: ['beat-scene-1'], canonEvents: [], notes: '', branches: [] }] }));
    expect(rendered).toContain('# 第一章 火车上');
    expect(rendered).toContain('第一段。\n\n第二段。');

    // 经只读 Remote 读取后镜像字节不变（读取零写）。
    const service = makeService(root);
    await service.chapterList('book');
    await service.chapterRead('book', 'chapter-1');
    await service.sceneRead('book', 'chapter-1', 'scene-1');
    expect(await readFile(mirrorPath, 'utf8')).toBe(rendered);
  });
});
