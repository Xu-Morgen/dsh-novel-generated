import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I72 写作进度面板 smoke（design §14.10「写作进度」/ R14-7）。
 *
 * 交付物核验：
 * - 构建产物（lib）：core/statistics（buildStatistics/buildStatisticsOverview/
 *   filterSceneCards/filterTasks/chapterDetail/StatisticsRepository）、
 *   host/statistics-service（createStatisticsService）、host/remote/statistics
 *   （statisticsInvocations/statisticsRemoteContribution）存在且导出关键符号。
 * - 源码：index.ts 装配 novelStatistics；remote.ts 注册 statisticsInvocations；
 *   client.ts 挂载 statisticsRemoteContribution；shared.ts 声明
 *   StatisticsNamespace；nav.ts 注册 statistics 视图；client/layers/statistics.ts
 *   无 core/zod（无领域 fallback）；派生目录 .statistics 不进可移植档案白名单。
 * - Host 行为（lib 真实服务消费者夹具）：
 *   1) 真实 C5/B5/C6 项目 + I65 队列账本投影：build 派生统计（.statistics/
 *      statistics.json）→ overview 聚合（章节字数/目标完成度/场景卡状态/POV
 *      分布/队列摘要）→ sceneCards/tasks 筛选 → chapterDetail → drop（stats 无
 *      统计）→ overview fail closed → rebuild 概览一致；
 *   2) 空作品无假进度（全部为零、无 NaN）；
 *   3) 大规模项目响应：120 场景重建 + 概览在阈值内完成且概览一致。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I72 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  for (const file of ['lib/core/statistics/index.js', 'lib/host/statistics-service.js', 'lib/host/remote/statistics.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const core = read('lib/core/statistics/index.js');
  for (const symbol of ['buildStatistics', 'buildStatisticsOverview', 'filterSceneCards', 'filterTasks', 'chapterDetail', 'StatisticsRepository', 'STATISTICS_DIRECTORY', 'STATISTICS_VERSION']) {
    if (!core.includes(symbol)) fail(`lib core/statistics missing ${symbol}`);
  }
  const service = read('lib/host/statistics-service.js');
  for (const symbol of ['createStatisticsService', 'overview', 'chapterDetail', 'sceneCards', 'tasks', 'build', 'drop', 'stats']) {
    if (!service.includes(symbol)) fail(`lib statistics-service missing ${symbol}`);
  }
  const remote = read('lib/host/remote/statistics.js');
  for (const symbol of ['statisticsRebuildInvocation', 'statisticsDropInvocation', 'statisticsStatsInvocation', 'statisticsOverviewInvocation', 'statisticsChapterDetailInvocation', 'statisticsSceneCardsInvocation', 'statisticsTasksInvocation', 'statisticsInvocations', 'statisticsRemoteContribution']) {
    if (!remote.includes(symbol)) fail(`lib statistics remote missing ${symbol}`);
  }
}

// Part 2 — 源码：装配 + Client 无领域 fallback + 派生目录不进可移植档案。
{
  const index = read('src/index.ts');
  const remoteTs = read('src/remote.ts');
  const client = read('src/client.ts');
  const shared = read('src/client/shared.ts');
  const nav = read('src/client/nav.ts');
  const statisticsLayer = read('src/client/layers/statistics.ts');
  const exportSource = read('src/core/export/index.ts');
  if (!index.includes("ctx.provide('novelStatistics'") || !index.includes('createStatisticsService') || !index.includes('queue: queueService')) {
    fail('index.ts missing novelStatistics wiring');
  }
  if (!remoteTs.includes('...statisticsInvocations') || !remoteTs.includes('statisticsRemoteContribution')) {
    fail('remote.ts missing statisticsInvocations registration');
  }
  // I83 起 Remote 挂载经 mount.ts 参数化工厂（client.ts 持声明式规格）。
  const mount = read('src/client/mount.ts');
  if (!mount.includes('export function mountRemote') || !client.includes('statisticsRemoteContribution') || !client.includes("'remote.novelStatistics'")) {
    fail('client mount wiring missing statistics Remote mount');
  }
  if (!shared.includes('StatisticsNamespace')) fail('shared.ts missing StatisticsNamespace');
  if (!nav.includes("view: 'statistics'") || !nav.includes("'statistics'")) fail('nav.ts missing statistics view');
  // 进度面板（Client）无领域 fallback：不导入 core / zod。
  if (statisticsLayer.includes('../core/') || statisticsLayer.includes("from 'zod'")) {
    fail('client statistics panel must not import core schema or zod (no domain fallback)');
  }
  if (!statisticsLayer.includes('data-novel-statistics-panel') || !statisticsLayer.includes('statisticsPanel')) {
    fail('statistics.ts missing statistics panel UI');
  }
  // 派生统计目录不在可移植档案 LAYER_PATHS 白名单内（不成为档案/真相的一部分）。
  // I81 拆分后常量声明落在 statistics/types.ts 契约层（index.ts 只做兼容 re-export）。
  const coreStatisticsTypes = read('src/core/statistics/types.ts');
  assert.ok(coreStatisticsTypes.includes("STATISTICS_DIRECTORY = '.statistics'"), 'core statistics must declare the .statistics derived directory');
  assert.ok(!exportSource.includes("'.statistics'"), 'portable export must not include the derived .statistics directory');
}

// Part 3 — Host 行为（lib 构建产物）：真实项目消费者夹具。
{
  const { ProjectRepository } = await import('../lib/core/project/index.js');
  const { createTextService } = await import('../lib/host/text-service.js');
  const { createOutlineService } = await import('../lib/host/outline-service.js');
  const { createStatisticsService } = await import('../lib/host/statistics-service.js');
  const { stableSceneId } = await import('../lib/core/queue/index.js');

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i72-smoke-'));
  try {
    await new ProjectRepository(projectsRoot).createProject({ projectId: 'demo', name: '进度演示' });

    const text = createTextService(projectsRoot);
    const outline = createOutlineService(projectsRoot);
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
    await text.createChapter('demo', { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft' });
    await text.appendScene('demo', 'chapter-1', {
      id: stableSceneId('act-1', 'beat-1', 'detail-1'), content: '米拉推开旧灯塔的门，看见半张烧焦的海图。', summary: '进入灯塔', beats: [], canonEvents: [], notes: '',
    });

    const taskView = (id, sceneId, cardTitle, status, budgetUnits, updatedAt) => ({
      id, sceneId, chapterId: 'chapter-1', cardTitle, cardPov: 'mira', status,
      candidateId: null, attempts: 1, error: null, budgetUnits,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt,
    });
    const queue = {
      status: async () => ({
        projectId: 'demo', runState: 'paused', config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: false },
        consumedUnits: 120, updatedAt: '2026-01-04T00:00:00.000Z', error: null,
        tasks: [
          taskView('qt-detail-1', stableSceneId('act-1', 'beat-1', 'detail-1'), '发现海图', 'completed', 60, '2026-01-03T00:00:00.000Z'),
          taskView('qt-detail-2', stableSceneId('act-1', 'beat-1', 'detail-2'), '守塔人', 'candidate-ready', 60, '2026-01-02T00:00:00.000Z'),
        ],
      }),
    };

    const service = createStatisticsService({ projectsRoot, text, outline, queue });
    await service.open('demo');

    // 1) build → overview → 筛选 → 详情 → drop → fail closed → rebuild 一致。
    const built = await service.build('demo');
    assert.equal(built.indexExists, true, 'build 后统计存在');
    assert.deepEqual(built.counts, { chapters: 1, scenes: 1, cards: 2, tasks: 2 }, '分项计数');

    const overview = await service.overview('demo');
    assert.equal(overview.empty, false, '非空作品');
    assert.equal(overview.totalUnits, 18, '章节字数（countProseUnits 口径）');
    assert.equal(overview.totalWordTarget, 900, '目标字数合计');
    assert.equal(overview.cardWrittenUnits, 18, '场景卡联动已写');
    assert.ok(Math.abs(overview.completionRatio - 18 / 900) < 1e-9, '目标完成度');
    assert.deepEqual(overview.cardStatusCounts, { planned: 0, writing: 1, done: 1 }, '场景卡状态');
    assert.equal(overview.beatCompletionRatio, 1, '节完成度');
    assert.equal(overview.povStats[0].pov, 'mira', 'POV 分布');
    assert.equal(overview.queue.runState, 'paused', '队列 runState 来自 owner');
    assert.equal(overview.queue.consumedUnits, 120, '队列预算来自 owner');
    assert.equal(overview.queue.taskCounts.completed, 1, '任务状态分布');

    const doneCards = await service.sceneCards('demo', { status: 'done' });
    assert.equal(doneCards.total, 1, '场景卡状态筛选');
    assert.equal(doneCards.cards[0].cardId, 'detail-1', '场景卡联动');
    assert.equal(doneCards.cards[0].writtenUnits, 18, '场景卡已写字数');

    const readyTasks = await service.tasks('demo', { status: 'candidate-ready' });
    assert.equal(readyTasks.total, 1, '任务状态筛选');
    assert.equal(readyTasks.tasks[0].id, 'qt-detail-2', '任务历史行');

    const detail = await service.chapterDetail('demo', 'chapter-1');
    assert.equal(detail.chapter.scenes[0].units, 18, '章节场景明细');

    // 派生统计文件落盘于 .statistics/statistics.json。
    assert.ok(existsSync(join(projectsRoot, 'demo', '.statistics', 'statistics.json')), '派生统计文件存在');
    // drop → stats 无统计 → overview fail closed → rebuild 概览一致。
    assert.equal((await service.drop('demo')).indexExists, false, 'drop 后无统计');
    assert.equal((await service.stats('demo')).indexExists, false, 'stats 反映无统计');
    await service.overview('demo').then(() => fail('未构建时必须 fail closed'), () => undefined);
    const rebuilt = await service.build('demo');
    assert.deepEqual(rebuilt.counts, { chapters: 1, scenes: 1, cards: 2, tasks: 2 }, '重建计数一致');
    assert.deepEqual(await service.overview('demo'), overview, '重建后概览一致');

    // 2) 空作品无假进度。
    await new ProjectRepository(projectsRoot).createProject({ projectId: 'empty', name: '空作品' });
    const emptyText = createTextService(projectsRoot);
    const emptyOutline = createOutlineService(projectsRoot);
    for (const svc of [emptyText, emptyOutline]) await svc.open('empty');
    const emptyQueue = {
      status: async () => ({
        projectId: 'empty', runState: 'idle', config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: false },
        consumedUnits: 0, updatedAt: '2026-01-01T00:00:00.000Z', error: null, tasks: [],
      }),
    };
    const emptyService = createStatisticsService({ projectsRoot, text: emptyText, outline: emptyOutline, queue: emptyQueue });
    await emptyService.open('empty');
    await emptyService.build('empty');
    const emptyOverview = await emptyService.overview('empty');
    assert.equal(emptyOverview.empty, true, '空作品视图标记');
    assert.equal(emptyOverview.totalUnits, 0, '空作品零字数');
    assert.equal(emptyOverview.completionRatio, 0, '空作品零完成度（无假进度）');
    assert.equal(emptyOverview.beatCompletionRatio, 0, '空作品零节完成度');
    assert.ok(!JSON.stringify(emptyOverview).includes('NaN'), '空作品无 NaN');

    // 3) 大规模项目响应：120 场景重建 + 概览在阈值内完成且确定。
    for (let index = 0; index < 3; index += 1) {
      const chapterId = `chapter-bulk-${index + 1}`;
      await text.createChapter('demo', { id: chapterId, index: index + 2, title: `批量章 ${index + 1}`, pov: 'mira', status: 'draft' });
      for (let scene = 0; scene < 40; scene += 1) {
        await text.appendScene('demo', chapterId, {
          id: `bulk-${index + 1}-${scene}`, content: `场景 ${index + 1}-${scene}：米拉在北港码头整理海图。`, summary: `批量场景 ${scene}`, beats: [], canonEvents: [], notes: '',
        });
      }
    }
    const started = Date.now();
    const bulkIndex = await service.build('demo');
    const bulkOverview = await service.overview('demo');
    const elapsed = Date.now() - started;
    assert.ok(bulkIndex.counts.scenes >= 120, `大规模场景计数（${bulkIndex.counts.scenes}）`);
    assert.equal(bulkOverview.sceneCount, bulkIndex.counts.scenes, '概览与统计计数一致');
    assert.ok(elapsed < 2500, `大规模重建+概览在阈值内完成（${elapsed}ms）`);
    assert.deepEqual((await service.overview('demo')).chapters, bulkOverview.chapters, '大规模概览确定');

    console.log('I72 smoke: 可重建派生统计（C5/B5/C6/任务记录一致性 + drop/rebuild 一致 + 空作品无假进度 + 大规模响应 + Client 无领域 fallback）全部通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
