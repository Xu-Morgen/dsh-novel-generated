import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stableSceneId } from '../core/queue/task.js';
import type { ReviewProjection } from '../core/review/issue.js';
import { createBookCompletionService } from './book-completion-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { createOutlineService } from './outline-service.js';
import { createSceneOutlineBindingService } from './scene-outline-binding-service.js';
import { createTextService } from './text-service.js';

const roots: string[] = [];
const ISO = '2026-08-31T00:00:00.000Z';

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-book-completion-'));
  roots.push(root);
  return root;
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture() {
  const root = await temporaryRoot();
  const text = createTextService(root);
  const outline = createOutlineService(root);
  const confirmation = createConfirmationService(root);
  await text.open('project');
  await outline.open('project');
  await confirmation.open('project');
  const sceneId = stableSceneId('act-1', 'beat-1', 'card-1');
  await text.createChapter('project', { id: 'chapter-1', index: 1, title: '第一章', pov: 'hero', status: 'draft' });
  await text.appendScene('project', 'chapter-1', { id: sceneId, content: '完整正文。', summary: '开场', beats: [], canonEvents: [], notes: '' });
  await outline.save('project', {
    id: 'outline', structure: 'free', logline: '完成门测试。', themes: [], foreshadowing: [], endings: [],
    acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '开始。', beats: [{
      id: 'beat-1', title: '节点一', description: '写完第一场。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false,
      detailBeats: [{ id: 'card-1', title: '场景卡一', summary: '开场', pov: 'hero', wordTarget: 100, points: ['开场'], status: 'done' }],
    }] }],
  });
  await outline.saveProgress('project', { outlineId: 'outline', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: ['beat-1'], deviations: [], tensionLevel: 20 });
  const binding = createSceneOutlineBindingService(text, outline, root);
  const review = { scan: async (): Promise<ReviewProjection> => ({
    projectId: 'project', scannedAt: ISO, issues: [], summary: { total: 0, hard: 0, soft: 0, byCategory: { rule: 0, canon: 0, knowledge: 0, relationship: 0, style: 0 } },
  }) };
  const writing = { listActiveCandidates: async () => [] };
  return { root, text, outline, confirmation, binding, review, writing, sceneId };
}

describe('I137 BookCompletionService', () => {
  it('从 C5/B5/C6/绑定真相重算开放发布门，并分页返回章节摘要', async () => {
    const data = await fixture();
    const service = createBookCompletionService(data);
    const result = await service.readiness('project', { offset: 0, limit: 1 });

    expect(result).toMatchObject({ projectId: 'project', status: 'ready', gateOpen: true, review: { status: 'not-run' } });
    expect(result.page).toMatchObject({ offset: 0, limit: 1, total: 1, nextOffset: null });
    expect(result.page.chapters[0]).toMatchObject({ chapterId: 'chapter-1', sceneCount: 1, proseSceneCount: 1, boundSceneCount: 1, requiredCardCount: 1, completedCardCount: 1 });
    expect(result.issues).toEqual([]);
  });

  it('缺正文、未完成细纲卡与未完成 C6 节点会关闭门，且重开服务后结果一致', async () => {
    const data = await fixture();
    const current = await data.outline.read('project');
    await data.outline.save('project', {
      ...current,
      acts: [{ ...current.acts[0], beats: [{ ...current.acts[0].beats[0], detailBeats: [{ ...current.acts[0].beats[0].detailBeats[0], status: 'writing' }] }] }],
    });
    await data.outline.saveProgress('project', { ...(await data.outline.readProgress('project')), completedBeats: [] });
    await data.text.replaceRange('project', 'chapter-1', data.sceneId, { start: 0, end: 5 }, '');
    const first = await createBookCompletionService(data).readiness('project');
    const second = await createBookCompletionService(data).readiness('project');

    expect(first.gateOpen).toBe(false);
    expect(first.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining(['incomplete-card', 'missing-prose', 'incomplete-beat']));
    expect(second).toMatchObject({ status: first.status, gateOpen: first.gateOpen, issues: first.issues, counts: first.counts });
  });

  it('保留软警告的显式继续状态，但 pending 定稿与硬审校仍关闭发布门', async () => {
    const data = await fixture();
    await data.confirmation.propose('project', { id: 'finalization-1', kind: 'finalization.apply', payload: {} });
    const hardReview: ReviewProjection = {
      projectId: 'project', scannedAt: ISO,
      issues: [
        { id: 'review-hard', category: 'canon', severity: 'hard', kind: 'canon-conflict', message: '硬冲突', references: ['事实'], location: { chapterId: 'chapter-1', sceneId: data.sceneId }, status: 'open' },
        { id: 'review-soft', category: 'style', severity: 'soft', kind: 'style-deviation', message: '软警告', references: [], location: { chapterId: 'chapter-1', sceneId: data.sceneId }, status: 'continued' },
      ],
      summary: { total: 2, hard: 1, soft: 1, byCategory: { rule: 0, canon: 1, knowledge: 0, relationship: 0, style: 1 } },
    };
    const service = createBookCompletionService({ ...data, review: { scan: async () => hardReview } });
    const result = await service.scan('project', undefined, { modelRef: 'test', credentialRef: 'managed' });

    expect(result.gateOpen).toBe(false);
    expect(result.review).toEqual({ status: 'completed', total: 2, hard: 1, warning: 1 });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'pending-finalization', status: 'pending', severity: 'hard' }),
      expect.objectContaining({ kind: 'hard-review', status: 'open', severity: 'hard', sourceIssueId: 'review-hard' }),
      expect.objectContaining({ kind: 'review-warning', status: 'continued', severity: 'warning', sourceIssueId: 'review-soft' }),
    ]));
  });

  it('审校失败只失败本次读取，不写正文或故事层', async () => {
    const data = await fixture();
    const before = { text: await data.text.projectFingerprint('project'), outline: await data.outline.contentFingerprint('project'), binding: (await data.binding.read('project')).fingerprint };
    const service = createBookCompletionService({ ...data, review: { scan: async () => { throw new Error('detector failed'); } } });
    await expect(service.scan('project', { offset: 0, limit: 1 }, undefined)).rejects.toThrow('detector failed');
    expect(await data.text.projectFingerprint('project')).toBe(before.text);
    expect(await data.outline.contentFingerprint('project')).toBe(before.outline);
    expect((await data.binding.read('project')).fingerprint).toBe(before.binding);
  });
});
