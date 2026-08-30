import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stableSceneId } from '../queue/task.js';
import {
  STATISTICS_DIRECTORY,
  STATISTICS_FILE,
  STATISTICS_VERSION,
  StatisticsRepository,
  buildStatistics,
  buildStatisticsOverview,
  chapterDetail,
  filterSceneCards,
  filterTasks,
  type StatisticsSources,
} from './index.js';
import type { Chapter } from '../schema/text.js';
import type { Outline } from '../schema/outline.js';
import type { OutlineProgress } from '../schema/outline-progress.js';
import type { StatisticsTaskInput } from './index.js';

/**
 * I72 可重建派生统计（design §14.10「写作进度」/ R14-7）核心单元测试。
 *
 * 覆盖：确定性重建（同输入同输出）、章节/场景字数（countProseUnits 口径）、
 * 目标完成度（B5 场景卡 vs C5 联动场景）、场景卡状态、POV 分布（C5 已写 +
 * B5 卡片目标）、任务历史（I65 账本）、空作品无假进度（零值/零分母不产
 * NaN）、筛选有界、仓库 build/drop/load 往返与坏文件 fail closed。
 */

const CHAPTERS: readonly Chapter[] = [
  {
    id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft',
    scenes: [
      { id: 'scene-1', index: 0, content: '米拉推开旧灯塔的门，看见半张烧焦的海图。', summary: '进入灯塔', beats: [], canonEvents: [], notes: '', branches: [] },
      { id: 'scene-2', index: 1, content: 'The lighthouse keeper speaks.', summary: '守塔人', beats: [], canonEvents: [], notes: '', branches: [] },
    ],
  },
  {
    id: 'chapter-2', index: 2, title: '北港', pov: 'kai', status: 'draft',
    scenes: [
      { id: 'scene-3', index: 0, content: '北港码头，kai 整理海图。', summary: '码头', beats: [], canonEvents: [], notes: '', branches: [] },
    ],
  },
];

const OUTLINE: Outline = {
  id: 'outline-demo', version: 1, structure: 'three-act', logline: '米拉追寻海图之谜。', themes: ['成长'],
  acts: [
    {
      id: 'act-1', index: 0, title: '开端', goal: '建立旧灯塔场景',
      beats: [
        {
          id: 'beat-1', title: '午夜灯塔', description: '米拉夜访旧灯塔。', charactersInvolved: ['mira'],
          conflictType: 'external', prerequisites: [], optional: false,
          detailBeats: [
            { id: 'detail-1', title: '发现海图', summary: '米拉发现半张海图。', pov: 'mira', wordTarget: 500, points: [], status: 'done' },
            { id: 'detail-2', title: '守塔人', summary: '守塔人开口。', pov: 'mira', wordTarget: 300, points: [], status: 'writing' },
          ],
        },
        {
          id: 'beat-2', title: '码头', description: 'kai 整理海图。', charactersInvolved: ['kai'],
          conflictType: 'external', prerequisites: [], optional: false,
          detailBeats: [
            { id: 'detail-3', title: '整理海图', summary: 'kai 在码头整理海图。', pov: 'kai', wordTarget: 400, points: [], status: 'planned' },
          ],
        },
      ],
    },
  ],
  foreshadowing: [], endings: [],
};

const PROGRESS: OutlineProgress = {
  outlineId: 'outline-demo', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: ['beat-1'], deviations: [], tensionLevel: 30,
};

const TASKS: readonly StatisticsTaskInput[] = [
  { id: 'qt-scene-a', sceneId: 'scene-a', chapterId: 'chapter-1', cardTitle: '发现海图', cardPov: 'mira', status: 'completed', attempts: 1, budgetUnits: 120, error: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
  { id: 'qt-scene-b', sceneId: 'scene-b', chapterId: 'chapter-1', cardTitle: '守塔人', cardPov: 'mira', status: 'candidate-ready', attempts: 2, budgetUnits: 80, error: null, createdAt: '2026-01-03T00:00:00.000Z', updatedAt: '2026-01-04T00:00:00.000Z' },
  { id: 'qt-scene-c', sceneId: 'scene-c', chapterId: 'chapter-1', cardTitle: '整理海图', cardPov: 'kai', status: 'failed', attempts: 3, budgetUnits: null, error: '预算超限', createdAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-06T00:00:00.000Z' },
];

function sources(overrides: Partial<StatisticsSources> = {}): StatisticsSources {
  const sceneCardMappings = OUTLINE.acts.flatMap((act) => act.beats.flatMap((beat) => beat.detailBeats.map((card) => ({
    detailBeatId: card.id,
    sceneId: stableSceneId(act.id, beat.id, card.id),
    source: 'default' as const,
  }))));
  return {
    chapters: CHAPTERS,
    outline: OUTLINE,
    progress: PROGRESS,
    tasks: TASKS,
    queue: { runState: 'paused', consumedUnits: 200 },
    ...overrides,
    sceneCardMappings: overrides.sceneCardMappings ?? sceneCardMappings,
  };
}

describe('I72 core/statistics 可重建派生统计', () => {
  it('确定性：同输入两次构建逐字段一致（重建一致性验收）', () => {
    const first = buildStatistics(sources());
    const second = buildStatistics(sources());
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('章节/场景字数：units 与 countProseUnits 同一口径，chars 为原始长度', () => {
    const projection = buildStatistics(sources());
    expect(projection.chapters).toHaveLength(2);
    const chapter1 = projection.chapters[0];
    expect(chapter1.chapterId).toBe('chapter-1');
    expect(chapter1.scenes).toHaveLength(2);
    // scene-1 全中文：18 个表意字符（标点不计）→ units 18，chars 为原始 UTF-16 长度。
    const scene1 = chapter1.scenes[0];
    expect(scene1.sceneId).toBe('scene-1');
    expect(scene1.units).toBe(18);
    expect(scene1.chars).toBe(20);
    // scene-2 含拉丁：The lighthouse keeper speaks. → 4 词 + 无 CJK = 4 units。
    const scene2 = chapter1.scenes[1];
    expect(scene2.units).toBe(4);
    expect(chapter1.units).toBe(22);
    expect(chapter1.chars).toBe(scene1.chars + scene2.chars);
    expect(projection.chapters[1].units).toBe(9);
  });

  it('目标完成度消费 canonical mapping：default、manual override 与 suppressed-default 不误计正文', () => {
    const projection = buildStatistics(sources());
    const detail1 = projection.cards.find((card) => card.cardId === 'detail-1');
    // detail-1 → stableSceneId(act-1, beat-1, detail-1)，正文中不存在 → written 0。
    expect(detail1?.sceneId).toBe(stableSceneId('act-1', 'beat-1', 'detail-1'));
    expect(detail1?.writtenUnits).toBe(0);
    expect(detail1?.completionRatio).toBe(0);
    // 手动把 scene-1 的 id 换成 detail-1 的稳定 id → 联动生效。
    const linked = sources({
      chapters: CHAPTERS.map((chapter) => chapter.id === 'chapter-1'
        ? { ...chapter, scenes: chapter.scenes.map((scene) => scene.id === 'scene-1' ? { ...scene, id: stableSceneId('act-1', 'beat-1', 'detail-1') } : scene) }
        : chapter),
    });
    const linkedProjection = buildStatistics(linked);
    const linkedCard = linkedProjection.cards.find((card) => card.cardId === 'detail-1');
    expect(linkedCard?.writtenUnits).toBe(18);
    expect(linkedCard?.completionRatio).toBe(18 / 500);
    const overview = buildStatisticsOverview(linkedProjection);
    expect(overview.completionRatio).toBe(18 / (500 + 300 + 400));

    const ownership = sources({ sceneCardMappings: [
      { detailBeatId: 'detail-1', sceneId: 'scene-1', source: 'suppressed' },
      { detailBeatId: 'detail-2', sceneId: 'scene-1', source: 'manual' },
      { detailBeatId: 'detail-3', sceneId: stableSceneId('act-1', 'beat-2', 'detail-3'), source: 'default' },
    ] });
    const ownedProjection = buildStatistics(ownership);
    expect(ownedProjection.cards.find((card) => card.cardId === 'detail-1')?.writtenUnits).toBe(0);
    expect(ownedProjection.cards.find((card) => card.cardId === 'detail-2')?.writtenUnits).toBe(18);

    // 超目标夹到 1（不显示 >100% 假进度）。
    const overshoot = sources({
      chapters: [{ ...CHAPTERS[0], scenes: [{ ...CHAPTERS[0].scenes[0], id: stableSceneId('act-1', 'beat-1', 'detail-1'), content: '米'.repeat(700) }] }],
    });
    const overshootCard = buildStatistics(overshoot).cards.find((card) => card.cardId === 'detail-1');
    expect(overshootCard?.completionRatio).toBe(1);
  });

  it('缺失或重复 canonical mapping fail closed，不回退到 stableSceneId', () => {
    expect(() => buildStatistics(sources({ sceneCardMappings: [] }))).toThrow(/Missing statistics scene-card mapping/);
    const mapping = { detailBeatId: 'detail-1', sceneId: 'scene-1', source: 'manual' as const };
    expect(() => buildStatistics(sources({ sceneCardMappings: [mapping, mapping] }))).toThrow(/Duplicate statistics scene-card mapping/);
  });

  it('场景卡状态与节完成度：来自 B5 detailBeats.status 与 C6 completedBeats', () => {
    const projection = buildStatistics(sources());
    const overview = buildStatisticsOverview(projection);
    expect(overview.cardStatusCounts).toEqual({ planned: 1, writing: 1, done: 1 });
    expect(overview.beatCount).toBe(2);
    expect(overview.completedBeatCount).toBe(1);
    expect(overview.beatCompletionRatio).toBe(0.5);
    expect(overview.currentBeat).toBe('beat-1');
    expect(projection.beatCompleted).toEqual(['beat-1']);
  });

  it('POV 分布：已写按章节 pov 聚合，目标按卡片 pov 聚合', () => {
    const overview = buildStatisticsOverview(buildStatistics(sources()));
    const mira = overview.povStats.find((stat) => stat.pov === 'mira');
    expect(mira?.chapters).toBe(1);
    expect(mira?.scenes).toBe(2);
    expect(mira?.units).toBe(22);
    const kai = overview.povStats.find((stat) => stat.pov === 'kai');
    expect(kai?.units).toBe(9);
    const cardMira = overview.cardPovStats.find((stat) => stat.pov === 'mira');
    expect(cardMira?.cards).toBe(2);
    expect(cardMira?.wordTarget).toBe(800);
    const cardKai = overview.cardPovStats.find((stat) => stat.pov === 'kai');
    expect(cardKai?.wordTarget).toBe(400);
  });

  it('任务历史：来自 I65 账本；按 updatedAt desc→id asc 排序，队列摘要带 owner 权威 runState/consumedUnits', () => {
    const projection = buildStatistics(sources());
    expect(projection.tasks.map((task) => task.id)).toEqual(['qt-scene-c', 'qt-scene-b', 'qt-scene-a']);
    expect(projection.queue.runState).toBe('paused');
    expect(projection.queue.consumedUnits).toBe(200);
    expect(projection.queue.taskCounts).toEqual({ queued: 0, running: 0, 'candidate-ready': 1, failed: 1, cancelled: 0, completed: 1 });
    expect(projection.queue.totalTasks).toBe(3);
  });

  it('筛选：场景卡按 act/beat/status 叠加过滤且有界；任务按 status 过滤且有界', () => {
    const projection = buildStatistics(sources());
    const byAct = filterSceneCards(projection, { actId: 'act-1' });
    expect(byAct.total).toBe(3);
    const byBeat = filterSceneCards(projection, { actId: 'act-1', beatId: 'beat-1' });
    expect(byBeat.total).toBe(2);
    expect(byBeat.cards.map((card) => card.cardId)).toEqual(['detail-1', 'detail-2']);
    const byStatus = filterSceneCards(projection, { status: 'planned' });
    expect(byStatus.total).toBe(1);
    expect(byStatus.cards[0].cardId).toBe('detail-3');
    const bounded = filterSceneCards(projection, { limit: 1 });
    expect(bounded.total).toBe(3);
    expect(bounded.cards).toHaveLength(1);
    const completedTasks = filterTasks(projection, { status: 'completed' });
    expect(completedTasks.total).toBe(1);
    expect(completedTasks.tasks[0].id).toBe('qt-scene-a');
    const taskBounded = filterTasks(projection, { limit: 2 });
    expect(taskBounded.total).toBe(3);
    expect(taskBounded.tasks).toHaveLength(2);
  });

  it('章节详情：单章含场景明细；未知章节 fail closed', () => {
    const projection = buildStatistics(sources());
    const detail = chapterDetail(projection, 'chapter-1');
    expect(detail?.sceneCount).toBe(2);
    expect(detail?.scenes[0].units).toBe(18);
    expect(chapterDetail(projection, 'chapter-unknown')).toBeUndefined();
  });

  it('空作品无假进度：无章节/大纲/任务时全部为零且不产 NaN；overview.empty 标记空作品视图', () => {
    const projection = buildStatistics({ chapters: [], outline: undefined, progress: undefined, sceneCardMappings: [], tasks: [], queue: { runState: 'idle', consumedUnits: 0 } });
    expect(projection.chapters).toEqual([]);
    expect(projection.cards).toEqual([]);
    expect(projection.tasks).toEqual([]);
    const overview = buildStatisticsOverview(projection);
    expect(overview.empty).toBe(true);
    expect(overview.chapterCount).toBe(0);
    expect(overview.sceneCount).toBe(0);
    expect(overview.totalUnits).toBe(0);
    expect(overview.totalChars).toBe(0);
    expect(overview.cardCount).toBe(0);
    expect(overview.totalWordTarget).toBe(0);
    expect(overview.completionRatio).toBe(0);
    expect(overview.beatCount).toBe(0);
    expect(overview.beatCompletionRatio).toBe(0);
    expect(overview.povStats).toEqual([]);
    expect(overview.cardPovStats).toEqual([]);
    expect(overview.acts).toEqual([]);
    expect(overview.chapters).toEqual([]);
    expect(overview.queue.taskCounts).toEqual({ queued: 0, running: 0, 'candidate-ready': 0, failed: 0, cancelled: 0, completed: 0 });
    expect(JSON.stringify(overview)).not.toContain('NaN');
    expect(JSON.stringify(overview)).not.toContain('Infinity');
  });

  it('概览：章节行有界（大规模作品只显示前 N 行，总数不丢）；幕/节筛选树来自卡片', () => {
    const manyChapters: Chapter[] = [];
    for (let index = 0; index < 150; index += 1) {
      manyChapters.push({ id: `chapter-${index}`, index: index + 1, title: `章 ${index}`, pov: 'mira', status: 'draft', scenes: [] });
    }
    const overview = buildStatisticsOverview(buildStatistics(sources({ chapters: manyChapters })));
    expect(overview.chapterCount).toBe(150);
    expect(overview.chapters).toHaveLength(100);
    expect(overview.acts.map((act) => act.id)).toEqual(['act-1']);
    expect(overview.acts[0].beats.map((beat) => beat.id)).toEqual(['beat-1', 'beat-2']);
  });

  it('仓库：build 落盘 → load 同投影 → drop 删除 → load undefined → 重建一致；坏文件 fail closed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'novel-statistics-test-'));
    try {
      const repository = new StatisticsRepository(directory);
      const built = await repository.build(sources(), 'demo');
      expect(built.version).toBe(STATISTICS_VERSION);
      expect(built.projectId).toBe('demo');
      const loaded = await repository.load();
      expect(loaded?.projection).toEqual(built.projection);
      expect((await repository.drop())).toBe(true);
      expect(await repository.load()).toBeUndefined();
      expect(await repository.drop()).toBe(false);
      const rebuilt = await repository.build(sources(), 'demo');
      expect(rebuilt.projection).toEqual(built.projection);
      // 坏版本 fail closed（重建引导，不静默吞错）。
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(join(directory, STATISTICS_DIRECTORY), { recursive: true });
      await writeFile(join(directory, STATISTICS_DIRECTORY, STATISTICS_FILE), JSON.stringify({ version: 99, projectId: 'demo', projection: { chapters: [] } }), 'utf8');
      await expect(repository.load()).rejects.toThrow(/rebuild it/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
