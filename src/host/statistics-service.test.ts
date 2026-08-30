import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectRepository } from '../core/project/index.js';
import { stableSceneId } from '../core/queue/index.js';
import { createStatisticsService } from './statistics-service.js';
import { createTextService } from './text-service.js';
import { createOutlineService } from './outline-service.js';
import { createSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { QueueStatusView, QueueTaskView } from './queue-service.js';

/**
 * I72 写作进度 Host facade —— 真实 C5/B5/C6 服务消费者夹具（design §14.10 / R14-7）。
 *
 * 验收覆盖：
 * - build 从 live source-of-truth 重建派生统计并返回分项计数；
 * - 概览聚合（章节字数/目标完成度/场景卡状态/POV 分布/队列摘要）正确；
 * - 场景卡筛选（act/beat/status）与任务历史筛选（status）有界且确定；
 * - 章节详情（含场景字数明细）；未知章节 fail closed；
 * - drop → stats 无统计 → 查询 fail closed 引导重建 → rebuild 概览一致；
 * - 空作品（无正文/大纲）无假进度；C6 缺失按空执行态统计。
 */

const tempRoots: string[] = [];
async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i72-statistics-service-'));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function taskView(overrides: Partial<QueueTaskView>): QueueTaskView {
  return {
    id: 'qt-x', sceneId: 'scene-x', chapterId: 'chapter-1', cardTitle: '任务', cardPov: 'mira',
    status: 'completed', candidateId: null, attempts: 1, error: null, budgetUnits: 60,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('I72 statistics Host service', () => {
  it('builds, overviews, filters, drops and rebuilds with consistent derived statistics', async () => {
    const root = await tempRoot();
    await new ProjectRepository(root).createProject({ projectId: 'demo', name: '进度演示' });

    const text = createTextService(root);
    const outline = createOutlineService(root);
    for (const service of [text, outline]) await service.open('demo');

    await outline.save('demo', {
      id: 'outline-demo', structure: 'three-act', logline: '米拉追寻海图之谜。', themes: ['成长'],
      acts: [{
        id: 'act-1', index: 0, title: '开端', goal: '建立旧灯塔场景',
        beats: [{
          id: 'beat-1', title: '午夜灯塔', description: '米拉夜访旧灯塔。', charactersInvolved: ['mira'],
          conflictType: 'external', prerequisites: [], optional: false,
          detailBeats: [
            { id: 'detail-1', title: '发现海图', summary: '米拉发现半张海图。', pov: 'mira', wordTarget: 500, points: [], status: 'done' },
            { id: 'detail-2', title: '守塔人', summary: '守塔人开口。', pov: 'mira', wordTarget: 400, points: [], status: 'writing' },
          ],
        }],
      }],
      foreshadowing: [], endings: [],
    });
    await outline.saveProgress('demo', {
      outlineId: 'outline-demo', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: ['beat-1'], deviations: [], tensionLevel: 30,
    });
    // 已写正文：detail-1 联动场景（id = stableSceneId，与 I65 队列同一派生）。
    await text.createChapter('demo', { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft' });
    await text.appendScene('demo', 'chapter-1', {
      id: stableSceneId('act-1', 'beat-1', 'detail-1'), content: '米拉推开旧灯塔的门，看见半张烧焦的海图。', summary: '进入灯塔', beats: [], canonEvents: [], notes: '',
    });

    const queue = {
      status: async (): Promise<QueueStatusView> => ({
        projectId: 'demo', runState: 'paused', config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: false },
        consumedUnits: 120, updatedAt: '2026-01-04T00:00:00.000Z', error: null,
        tasks: [
          taskView({ id: 'qt-detail-1', sceneId: stableSceneId('act-1', 'beat-1', 'detail-1'), cardTitle: '发现海图', status: 'completed', budgetUnits: 60, updatedAt: '2026-01-03T00:00:00.000Z' }),
          taskView({ id: 'qt-detail-2', sceneId: stableSceneId('act-1', 'beat-1', 'detail-2'), cardTitle: '守塔人', status: 'candidate-ready', attempts: 2, budgetUnits: 60, updatedAt: '2026-01-02T00:00:00.000Z' }),
        ],
      }),
    };

    const service = createStatisticsService({ projectsRoot: root, text, outline, sceneOutlineBinding: createSceneOutlineBindingService(text, outline, root), queue });
    await service.open('demo');

    // build：派生统计 + 分项计数。
    const built = await service.build('demo');
    expect(built.indexExists).toBe(true);
    expect(built.counts).toEqual({ chapters: 1, scenes: 1, cards: 2, tasks: 2 });

    // 概览：字数（countProseUnits 口径）/ 目标完成度 / 场景卡状态 / 节完成度 / POV / 队列摘要。
    const overview = await service.overview('demo');
    expect(overview.empty).toBe(false);
    expect(overview.chapterCount).toBe(1);
    expect(overview.sceneCount).toBe(1);
    expect(overview.totalUnits).toBe(18);
    expect(overview.totalChars).toBe(20);
    expect(overview.cardCount).toBe(2);
    expect(overview.totalWordTarget).toBe(900);
    expect(overview.cardWrittenUnits).toBe(18);
    expect(overview.completionRatio).toBe(18 / 900);
    expect(overview.cardStatusCounts).toEqual({ planned: 0, writing: 1, done: 1 });
    expect(overview.beatCount).toBe(1);
    expect(overview.completedBeatCount).toBe(1);
    expect(overview.beatCompletionRatio).toBe(1);
    expect(overview.currentBeat).toBe('beat-1');
    const miraPov = overview.povStats.find((stat) => stat.pov === 'mira');
    expect(miraPov?.units).toBe(18);
    expect(overview.queue.runState).toBe('paused');
    expect(overview.queue.consumedUnits).toBe(120);
    expect(overview.queue.taskCounts).toEqual({ queued: 0, running: 0, 'candidate-ready': 1, failed: 0, cancelled: 0, completed: 1 });
    expect(overview.acts).toHaveLength(1);
    expect(overview.chapters).toHaveLength(1);

    // 场景卡筛选：按 beat + status 叠加。
    const beatCards = await service.sceneCards('demo', { actId: 'act-1', beatId: 'beat-1' });
    expect(beatCards.total).toBe(2);
    expect(beatCards.cards.map((card) => card.cardId)).toEqual(['detail-1', 'detail-2']);
    const doneCards = await service.sceneCards('demo', { status: 'done' });
    expect(doneCards.total).toBe(1);
    expect(doneCards.cards[0].writtenUnits).toBe(18);
    expect(doneCards.cards[0].completionRatio).toBe(18 / 500);

    // 任务历史：按 status 筛选 + 有界。
    const readyTasks = await service.tasks('demo', { status: 'candidate-ready' });
    expect(readyTasks.total).toBe(1);
    expect(readyTasks.tasks[0].id).toBe('qt-detail-2');
    const allTasks = await service.tasks('demo', { limit: 1 });
    expect(allTasks.total).toBe(2);
    expect(allTasks.tasks).toHaveLength(1);
    expect(allTasks.tasks[0].id).toBe('qt-detail-1'); // updatedAt desc

    // 章节详情（含场景字数明细）+ 未知章节 fail closed。
    const detail = await service.chapterDetail('demo', 'chapter-1');
    expect(detail.chapter.scenes[0].units).toBe(18);
    await expect(service.chapterDetail('demo', 'chapter-unknown')).rejects.toThrow(/未知章节/);

    // drop → stats 无统计 → overview fail closed → rebuild 概览一致。
    expect((await service.drop('demo')).indexExists).toBe(false);
    expect((await service.stats('demo')).indexExists).toBe(false);
    await expect(service.overview('demo')).rejects.toThrow(/未构建/);
    const rebuilt = await service.build('demo');
    expect(rebuilt.counts).toEqual({ chapters: 1, scenes: 1, cards: 2, tasks: 2 });
    expect(await service.overview('demo')).toEqual(overview);
  });

  it('persists a real manual override and excludes its suppressed default from the wrong card', async () => {
    const root = await tempRoot();
    await new ProjectRepository(root).createProject({ projectId: 'binding-stats', name: '绑定统计' });
    const text = createTextService(root);
    const outline = createOutlineService(root);
    await text.open('binding-stats');
    await outline.open('binding-stats');
    await text.createChapter('binding-stats', { id: 'chapter-1', index: 1, title: 'Chapter', pov: 'mira', status: 'draft' });
    const occupiedSceneId = stableSceneId('act-1', 'beat-1', 'wrong-card');
    await text.appendScene('binding-stats', 'chapter-1', {
      id: occupiedSceneId, content: 'This body belongs only to the manual card.', summary: '', beats: [], canonEvents: [], notes: '',
    });
    const manualCard = { id: 'manual-card', title: 'Manual owner', summary: 'Manual.', pov: 'mira', wordTarget: 100, points: [], status: 'writing' as const };
    const wrongCard = { id: 'wrong-card', title: 'Suppressed default', summary: 'Wrong.', pov: 'mira', wordTarget: 100, points: [], status: 'planned' as const };
    const outlineDocument = {
      id: 'outline-binding', structure: 'free' as const, logline: 'Manual ownership.', themes: [], foreshadowing: [], endings: [],
      acts: [{ id: 'act-1', index: 0, title: 'Act', goal: 'Own.', beats: [{
        id: 'beat-1', title: 'Beat', description: 'Bind.', charactersInvolved: [], conflictType: 'external' as const, prerequisites: [], optional: false,
        detailBeats: [manualCard],
      }] }],
    };
    await outline.save('binding-stats', outlineDocument);
    const binding = createSceneOutlineBindingService(text, outline, root);
    const initial = await binding.read('binding-stats');
    await binding.save('binding-stats', { sceneId: occupiedSceneId, detailBeatId: manualCard.id, expectedFingerprint: initial.fingerprint });
    await outline.save('binding-stats', {
      ...outlineDocument,
      acts: [{ ...outlineDocument.acts[0], beats: [{ ...outlineDocument.acts[0].beats[0], detailBeats: [manualCard, wrongCard] }] }],
    });

    const queue = {
      status: async (): Promise<QueueStatusView> => ({
        projectId: 'binding-stats', runState: 'idle', config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: false },
        consumedUnits: 0, updatedAt: '2026-01-01T00:00:00.000Z', error: null, tasks: [],
      }),
    };
    const service = createStatisticsService({ projectsRoot: root, text, outline, sceneOutlineBinding: binding, queue });
    await service.open('binding-stats');
    await service.build('binding-stats');

    const cards = await service.sceneCards('binding-stats');
    const manual = cards.cards.find((card) => card.cardId === manualCard.id);
    const suppressed = cards.cards.find((card) => card.cardId === wrongCard.id);
    expect(manual?.sceneId).toBe(occupiedSceneId);
    expect(manual?.writtenUnits).toBeGreaterThan(0);
    expect(suppressed).toMatchObject({ sceneId: occupiedSceneId, writtenUnits: 0, completionRatio: 0 });
    expect((await service.overview('binding-stats')).cardWrittenUnits).toBe(manual?.writtenUnits);
  });

  it('空作品（无正文/大纲/任务）无假进度；C6 缺失按空执行态统计', async () => {
    const root = await tempRoot();
    await new ProjectRepository(root).createProject({ projectId: 'empty', name: '空作品' });
    const text = createTextService(root);
    const outline = createOutlineService(root);
    for (const service of [text, outline]) await service.open('empty');

    const queue = {
      status: async (): Promise<QueueStatusView> => ({
        projectId: 'empty', runState: 'idle', config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: false },
        consumedUnits: 0, updatedAt: '2026-01-01T00:00:00.000Z', error: null, tasks: [],
      }),
    };
    const service = createStatisticsService({ projectsRoot: root, text, outline, sceneOutlineBinding: createSceneOutlineBindingService(text, outline, root), queue });
    await service.open('empty');
    const built = await service.build('empty');
    expect(built.counts).toEqual({ chapters: 0, scenes: 0, cards: 0, tasks: 0 });
    const overview = await service.overview('empty');
    expect(overview.empty).toBe(true);
    expect(overview.totalUnits).toBe(0);
    expect(overview.completionRatio).toBe(0);
    expect(overview.beatCompletionRatio).toBe(0);
    expect(overview.povStats).toEqual([]);
    expect(overview.acts).toEqual([]);
    expect(overview.queue.runState).toBe('idle');
    expect(JSON.stringify(overview)).not.toContain('NaN');
    // 场景卡/任务筛选空结果：total 0，不报错。
    expect((await service.sceneCards('empty')).total).toBe(0);
    expect((await service.tasks('empty')).total).toBe(0);
  });

  it('大纲就绪但 C6 缺失：completedBeats/currentBeat 按空处理（不因执行态缺失失败）', async () => {
    const root = await tempRoot();
    await new ProjectRepository(root).createProject({ projectId: 'no-c6', name: '无执行态' });
    const text = createTextService(root);
    const outline = createOutlineService(root);
    for (const service of [text, outline]) await service.open('no-c6');

    await outline.save('no-c6', {
      id: 'outline-demo', structure: 'three-act', logline: '无执行态演示。', themes: [],
      acts: [{
        id: 'act-1', index: 0, title: '开端', goal: 'g',
        beats: [{
          id: 'beat-1', title: '节一', description: 'd', charactersInvolved: [], conflictType: 'external',
          prerequisites: [], optional: false, detailBeats: [{ id: 'detail-1', title: '卡一', summary: 's', pov: 'mira', wordTarget: 100, points: [], status: 'planned' }],
        }],
      }],
      foreshadowing: [], endings: [],
    });
    const queue = {
      status: async (): Promise<QueueStatusView> => ({
        projectId: 'no-c6', runState: 'idle', config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: false },
        consumedUnits: 0, updatedAt: '2026-01-01T00:00:00.000Z', error: null, tasks: [],
      }),
    };
    const service = createStatisticsService({ projectsRoot: root, text, outline, sceneOutlineBinding: createSceneOutlineBindingService(text, outline, root), queue });
    await service.open('no-c6');
    await service.build('no-c6');
    const overview = await service.overview('no-c6');
    expect(overview.beatCount).toBe(1);
    expect(overview.completedBeatCount).toBe(0);
    expect(overview.beatCompletionRatio).toBe(0);
    expect(overview.currentBeat).toBeNull();
    expect(overview.cardCount).toBe(1);
  });
});
