import { describe, expect, it } from 'vitest';
import type { Chapter } from '../schema/text.js';
import { projectChapterList, toChapterListItem, toChapterReadResult, toSceneReadResult } from './projection.js';

const chapter = (id: string, index: number, scenes: Chapter['scenes']): Chapter => ({
  id, index, title: `Chapter ${index}`, pov: 'lin', status: 'draft', scenes,
});

const scene = (id: string, index: number, content: string, summary = `${id} summary`) => ({
  id, index, content, summary, beats: [`beat-${id}`], canonEvents: ['event-1'], notes: 'note',
});

describe('I60 C5 只读投影', () => {
  it('章节树列表项只含元数据与场景数，绝不含正文 content', () => {
    const item = toChapterListItem(chapter('chapter-1', 1, [scene('scene-1', 0, 'secret prose')]));
    expect(item).toEqual({ id: 'chapter-1', index: 1, title: 'Chapter 1', pov: 'lin', status: 'draft', sceneCount: 1 });
    expect(JSON.stringify(item)).not.toContain('secret prose');
  });

  it('多章顺序按 index 升序（与文件名字典序无关），index 相同按 id 稳定', () => {
    const chapters = [
      chapter('chapter-c', 10, []),
      chapter('chapter-b', 2, []),
      chapter('chapter-a', 1, []),
      chapter('chapter-z', 2, []),
    ];
    expect(projectChapterList(chapters).map((item) => [item.id, item.index])).toEqual([
      ['chapter-a', 1], ['chapter-b', 2], ['chapter-z', 2], ['chapter-c', 10],
    ]);
  });

  it('章节读取只含场景摘要，不携带正文 content（最小读取合同）', () => {
    const read = toChapterReadResult(chapter('chapter-1', 1, [scene('scene-1', 0, 'body text'), scene('scene-2', 1, 'more text')]));
    expect(read.scenes).toEqual([
      { id: 'scene-1', index: 0, summary: 'scene-1 summary' },
      { id: 'scene-2', index: 1, summary: 'scene-2 summary' },
    ]);
    expect(JSON.stringify(read)).not.toContain('body text');
    expect(JSON.stringify(read)).not.toContain('more text');
  });

  it('场景读取是唯一携带正文的投影，且带 chapter 上下文引用', () => {
    const read = toSceneReadResult(chapter('chapter-1', 3, [scene('scene-1', 0, '第一段。\n\n第二段。')]), scene('scene-1', 0, '第一段。\n\n第二段。'));
    expect(read.chapter).toEqual({ id: 'chapter-1', index: 3, title: 'Chapter 3', pov: 'lin' });
    expect(read.scene).toEqual({
      id: 'scene-1', index: 0, summary: 'scene-1 summary', content: '第一段。\n\n第二段。',
      beats: ['beat-scene-1'], canonEvents: ['event-1'], notes: 'note',
    });
    expect(JSON.stringify(read)).toContain('第一段。');
  });

  it('空章：列表项 sceneCount 为 0，章节读取场景数组为空', () => {
    const empty = chapter('chapter-empty', 2, []);
    expect(toChapterListItem(empty).sceneCount).toBe(0);
    expect(toChapterReadResult(empty).scenes).toEqual([]);
  });
});
