import { describe, expect, it } from 'vitest';
import type { BookReadinessResult } from '../core/schema/book-readiness.js';
import type { Chapter } from '../core/schema/text.js';
import { createManuscriptCompiler } from './manuscript-compiler.js';

const ISO = '2026-08-31T00:00:00.000Z';
const HASH = 'a'.repeat(64);

function ready(textFingerprint = HASH): BookReadinessResult {
  return {
    projectId: 'project', status: 'ready', gateOpen: true, computedAt: ISO,
    page: { offset: 0, limit: 64, total: 2, nextOffset: null, chapters: [] },
    counts: { chapters: 2, scenes: 3, requiredCards: 0, completedCards: 0, boundCards: 0, proseScenes: 3, hardIssues: 0, warningIssues: 0 },
    review: { status: 'completed', total: 0, hard: 0, warning: 0 }, issues: [],
    fingerprints: { text: textFingerprint, outline: HASH, binding: HASH },
  };
}

const chapters: Chapter[] = [
  {
    id: 'chapter-1', index: 1, title: '第一章', pov: 'hero', status: 'draft', scenes: [
      { id: 'scene-1', index: 0, content: '第一场正文。', summary: '', beats: [], canonEvents: [], notes: '', branches: [] },
      { id: 'scene-3', index: 1, content: '第二场正文。', summary: '', beats: [], canonEvents: [], notes: '', branches: [] },
    ],
  },
  {
    id: 'chapter-2', index: 2, title: '第二章', pov: 'hero', status: 'draft', scenes: [
      { id: 'scene-2', index: 0, content: '第二章正文。', summary: '', beats: [], canonEvents: [], notes: '', branches: [{ id: 'old-2', label: '旧稿', content: '旧分支不应混入。', chosen: false }, { id: 'chosen-2', label: '定稿', content: '第二章正文。', chosen: true }] },
    ],
  },
];

function compiler(scan: BookReadinessResult = ready(), afterFingerprint = scan.fingerprints.text) {
  return createManuscriptCompiler({
    completion: { scan: async () => scan },
    text: { listChapters: async () => chapters, projectFingerprint: async () => afterFingerprint },
  });
}

describe('I138 ManuscriptCompiler', () => {
  it('按 C5 的真实章节/场景顺序生成唯一 TXT/Markdown 主稿，排除旧分支与技术元数据', async () => {
    const service = compiler();
    const txt = await service.compile('project', { format: 'txt' });
    const md = await service.compile('project', { format: 'md' });

    expect(txt.fileName).toBe('manuscript.txt');
    expect(md.fileName).toBe('manuscript.md');
    expect(txt.chapterCount).toBe(2);
    expect(txt.sceneCount).toBe(3);
    expect(txt.content).toContain('目录\n\n1. 第一章\n2. 第二章');
    expect(txt.content.indexOf('第一章正文。')).toBeLessThan(txt.content.indexOf('第二章正文。'));
    expect(txt.content).not.toContain('旧分支不应混入');
    expect(txt.content).not.toContain('scene-1');
    expect(md.content).toContain('- [第二章](#第二章)');
    expect(md.content).toContain('## 第二章');
    expect(md.content).not.toContain('old-2');
    expect(md.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(await service.compile('project', { format: 'md' })).toEqual(md);
  });

  it('发布门关闭或 receipt 指纹过期时拒绝编译，且不写任何作品层', async () => {
    const blocked: BookReadinessResult = { ...ready(), status: 'blocked', gateOpen: false, issues: [{ id: 'blocked', kind: 'missing-prose', severity: 'hard', status: 'open', message: '缺正文' }] };
    await expect(compiler(blocked).compile('project', { format: 'txt' })).rejects.toThrow('发布门阻断');

    const oldReceipt = ready('b'.repeat(64));
    const stale = compiler(ready(HASH), HASH);
    await expect(stale.compile('project', { format: 'txt', readinessReceipt: {
      gateOpen: true, computedAt: ISO, textFingerprint: oldReceipt.fingerprints.text,
      outlineFingerprint: HASH, bindingFingerprint: HASH, review: { status: 'completed', total: oldReceipt.review.total, hard: oldReceipt.review.hard, warning: oldReceipt.review.warning },
    } })).rejects.toThrow('receipt 已过期');
  });

  it('正文在发布门扫描后发生变化时 fail closed', async () => {
    const service = compiler(ready(HASH), 'b'.repeat(64));
    await expect(service.compile('project', { format: 'md' })).rejects.toThrow('正文在编译期间发生变化');
  });
});
