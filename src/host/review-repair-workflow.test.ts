import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTextAnchor } from '../core/schema/link.js';
import { textContentHash } from '../core/text/codec.js';
import type { ReviewIssue } from '../core/review/issue.js';
import { createTextService } from './text-service.js';
import { createReviewRepairWorkflow } from './review-repair-workflow.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'novel-i128-review-repair-'));
  roots.push(root);
  const text = createTextService(root);
  await text.open('book');
  await text.createChapter('book', { id: 'chapter-1', index: 1, title: '灯塔', pov: 'mira', status: 'draft' });
  await text.appendScene('book', 'chapter-1', { id: 'scene-1', content: '米拉突然抬头。', summary: '开场', beats: [], canonEvents: [], notes: '' });
  const prose = '米拉突然抬头。';
  const sourceHash = textContentHash(prose);
  const anchor = createTextAnchor(prose, 2, 4, sourceHash);
  const issue: ReviewIssue = {
    id: 'iss-repair-1', category: 'style', severity: 'soft', kind: 'forbidden-expression',
    message: '正文包含禁用表达。', references: ['突然'],
    location: { chapterId: 'chapter-1', sceneId: 'scene-1', anchor },
    provenance: { detector: 'forbidden-expression', sourceHash, issueFingerprint: 'iss-repair-1' },
    status: 'open',
  };
  const calls: Array<{ projectId: string; input: unknown }> = [];
  const writing = {
    async propose(projectId: string, input: unknown) {
      calls.push({ projectId, input });
      return { candidate: {
        id: 'candidate-repair-1', intent: 'rewrite' as const,
        target: { projectId, chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash },
        prompt: '修复', text: '米拉抬起头。', chunkCount: 1, createdAt: '2026-08-31T00:00:00.000Z',
      } };
    },
  };
  const review = { current(projectId: string, issueId: string) {
    if (projectId !== 'book' || issueId !== issue.id) throw new Error('unknown review');
    return issue;
  } };
  return { text, issue, sourceHash, writing, review, calls, workflow: createReviewRepairWorkflow({ review, text, writing }) };
}

describe('I128 ReviewRepairWorkflow', () => {
  it('validates the current C5 anchor and returns a lineage-bound rewrite candidate without writing prose', async () => {
    const { text, issue, sourceHash, writing, review, calls, workflow } = await fixture();
    const result = await workflow.propose('book', { issueId: issue.id, instruction: '保持动作简洁' });
    expect(result).toMatchObject({
      projectId: 'book', issueId: issue.id, issueFingerprint: issue.id,
      target: { chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash },
      lineage: { kind: 'review-repair', issueId: issue.id, sourceHash },
      candidate: { id: 'candidate-repair-1', intent: 'rewrite' },
    });
    expect(result.anchor?.quote).toBe('突然');
    expect((calls[0]?.input as { prompt: string }).prompt).toContain('正文包含禁用表达');
    expect((calls[0]?.input as { prompt: string }).prompt).toContain('保持动作简洁');
    await expect(text.readChapter('book', 'chapter-1')).resolves.toMatchObject({ scenes: [{ content: '米拉突然抬头。' }] });
  });

  it('rejects stale hashes, mismatched quotes, missing locations, and cross-project requests before candidate production', async () => {
    const stale = await fixture();
    await stale.text.replaceRange('book', 'chapter-1', 'scene-1', { start: 0, end: 2 }, '林恩');
    await expect(stale.workflow.propose('book', { issueId: stale.issue.id })).rejects.toThrow(/失效|变化/);
    expect(stale.calls).toHaveLength(0);

    const wrongQuote = await fixture();
    const invalidIssue = { ...wrongQuote.issue, location: { ...wrongQuote.issue.location!, anchor: { ...wrongQuote.issue.location!.anchor!, quote: '不在正文' } } } as ReviewIssue;
    const invalidWorkflow = createReviewRepairWorkflow({
      review: { current: () => invalidIssue }, text: wrongQuote.text, writing: wrongQuote.writing,
    });
    await expect(invalidWorkflow.propose('book', { issueId: invalidIssue.id })).rejects.toThrow(/锚点已失效/);
    expect(wrongQuote.calls).toHaveLength(0);

    const noLocation = await fixture();
    const globalIssue = { ...noLocation.issue, location: undefined, provenance: undefined } as ReviewIssue;
    const globalWorkflow = createReviewRepairWorkflow({ review: { current: () => globalIssue }, text: noLocation.text, writing: noLocation.writing });
    await expect(globalWorkflow.propose('book', { issueId: globalIssue.id })).rejects.toThrow(/缺少正文定位/);
    expect(noLocation.calls).toHaveLength(0);

    await expect(noLocation.workflow.propose('other-book', { issueId: noLocation.issue.id })).rejects.toThrow(/unknown review/);
    expect(noLocation.calls).toHaveLength(0);
  });

  it('lets hard issues produce candidates but propagates model failure with zero C5 writes', async () => {
    const fixtureData = await fixture();
    const hardIssue = { ...fixtureData.issue, severity: 'hard' as const };
    const calls: unknown[] = [];
    const workflow = createReviewRepairWorkflow({
      review: { current: () => hardIssue },
      text: fixtureData.text,
      writing: { propose: async (...args: unknown[]) => { calls.push(args); throw new Error('fake backend failed'); } },
    });
    await expect(workflow.propose('book', { issueId: hardIssue.id })).rejects.toThrow(/fake backend failed/);
    expect(calls).toHaveLength(1);
    await expect(fixtureData.text.readChapter('book', 'chapter-1')).resolves.toMatchObject({ scenes: [{ content: '米拉突然抬头。' }] });
  });
});
