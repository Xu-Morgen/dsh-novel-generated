/**
 * I95 按面板拆分（计划 §18 I95）：I72 写作进度面板 UI (R14-7)
 */
/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：后置写作能力面板 —— 候选审阅 /
 * 审校中心 / 生成队列 / 知情揭示 / 规则文风 / 进度灵感 / 导入导出 / 搜索追踪 /
 * 写作进度 / 剧情时间线（I63–I72 / 方案 A）。
 */


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';
import { QUEUE_POLL_INTERVAL_MS } from './client/ops/queue.js';

afterEach(cleanupClientTestEnv);

describe('I72 写作进度面板 UI (R14-7)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const statisticsPanelOf = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-statistics-panel'] !== undefined);
  const statisticsMessage = (render: () => FakeNode): string =>
    String((collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-message'] !== undefined)?.children?.[0] ?? ''));

  const STATS = {
    indexExists: true, builtAt: '2026-01-01T00:00:00.000Z',
    counts: { chapters: 1, scenes: 2, cards: 3, tasks: 2 },
  };
  const OVERVIEW = {
    empty: false, chapterCount: 1, sceneCount: 2, totalUnits: 22, totalChars: 49,
    cardCount: 3, totalWordTarget: 1200, cardWrittenUnits: 18, completionRatio: 18 / 1200,
    beatCount: 2, completedBeatCount: 1, beatCompletionRatio: 0.5, currentBeat: 'beat-1',
    cardStatusCounts: { planned: 1, writing: 1, done: 1 },
    povStats: [{ pov: 'mira', chapters: 1, scenes: 2, units: 22, chars: 49 }],
    cardPovStats: [{ pov: 'mira', cards: 2, wordTarget: 800 }, { pov: 'kai', cards: 1, wordTarget: 400 }],
    queue: { runState: 'paused', consumedUnits: 200, taskCounts: { queued: 0, running: 0, 'candidate-ready': 1, failed: 0, cancelled: 0, completed: 1 }, totalTasks: 2 },
    chapters: [{ chapterId: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', sceneCount: 2, units: 22, chars: 49 }],
    acts: [{ id: 'act-1', index: 0, title: '开端', beats: [{ id: 'beat-1', title: '午夜灯塔' }, { id: 'beat-2', title: '码头' }] }],
  };
  const CARD = {
    actId: 'act-1', actIndex: 0, actTitle: '开端', beatId: 'beat-1', beatTitle: '午夜灯塔',
    cardId: 'detail-1', title: '发现海图', pov: 'mira', wordTarget: 500, status: 'done',
    sceneId: 'scene-abc', writtenUnits: 18, completionRatio: 18 / 500,
  };
  const TASK = {
    id: 'qt-detail-1', sceneId: 'scene-abc', chapterId: 'chapter-1', cardTitle: '发现海图', cardPov: 'mira',
    status: 'completed', attempts: 1, budgetUnits: 60, error: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  };

  it('概览：重建 → 统计计数/章节字数/目标完成度/场景卡状态/POV 分布/队列摘要渲染', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          rebuild: async () => ({ ok: true, value: STATS }),
          overview: async () => ({ ok: true, value: OVERVIEW }),
          sceneCards: async () => ({ ok: true, value: { total: 3, cards: [] } }),
          tasks: async () => ({ ok: true, value: { total: 2, tasks: [] } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    expect(statisticsPanelOf(render())?.props?.['data-novel-statistics-state']).toBe('idle');
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-rebuild'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-stats'] !== undefined)?.children?.[0] ?? '')).toContain('章节 1 · 场景 2 · 场景卡 3 · 任务 2');
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-totals'] !== undefined)?.children?.[0] ?? '')).toContain('共 22 字');
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-completion-text'] !== undefined)?.children?.[0] ?? '')).toContain('18 / 1200 字');
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-beat-completion-text'] !== undefined)?.children?.[0] ?? '')).toContain('1 / 2 节');
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-cards'] !== undefined)?.children?.[0] ?? '')).toContain('计划 1 · 写作中 1 · 已完成 1');
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-queue'] !== undefined)?.children?.[0] ?? '')).toContain('paused');
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-queue'] !== undefined)?.children?.[0] ?? '')).toContain('任务 2 个');
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-statistics-pov-row'] === 'mira')).toBe(true);
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-statistics-chapter'] === 'chapter-1')).toBe(true);
    expect(statisticsMessage(render)).toContain('重建统计');
  });

  it('空作品视图：empty 标记时明确提示统计为零，不显示假进度', async () => {
    const EMPTY = {
      empty: true, chapterCount: 0, sceneCount: 0, totalUnits: 0, totalChars: 0,
      cardCount: 0, totalWordTarget: 0, cardWrittenUnits: 0, completionRatio: 0,
      beatCount: 0, completedBeatCount: 0, beatCompletionRatio: 0, currentBeat: null,
      cardStatusCounts: { planned: 0, writing: 0, done: 0 },
      povStats: [], cardPovStats: [],
      queue: { runState: 'idle', consumedUnits: 0, taskCounts: { queued: 0, running: 0, 'candidate-ready': 0, failed: 0, cancelled: 0, completed: 0 }, totalTasks: 0 },
      chapters: [], acts: [],
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          rebuild: async () => ({ ok: true, value: { ...STATS, counts: { chapters: 0, scenes: 0, cards: 0, tasks: 0 } } }),
          overview: async () => ({ ok: true, value: EMPTY }),
          sceneCards: async () => ({ ok: true, value: { total: 0, cards: [] } }),
          tasks: async () => ({ ok: true, value: { total: 0, tasks: [] } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-rebuild'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-empty'] !== undefined)?.children?.[0] ?? '')).toContain('空作品视图');
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-empty'] !== undefined)?.children?.[0] ?? '')).toContain('统计为零');
    expect(statisticsPanelOf(render())?.props?.['data-novel-statistics-state']).toBe('ready');
  });

  it('场景卡筛选：幕/节/状态变化 → Remote 提交筛选并渲染有界结果', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          rebuild: async () => ({ ok: true, value: STATS }),
          overview: async () => ({ ok: true, value: OVERVIEW }),
          // I86：fake 按真实 wire 位置参数（descriptor 顺序）接收，重新聚合为
          // 筛选对象供既有断言使用（binder 语义由 src/remote-binder.test.ts 覆盖）。
          sceneCards: async (_projectId, actId, beatId, status, limit) => {
            calls.push({
              ...(actId !== undefined ? { actId } : {}),
              ...(beatId !== undefined ? { beatId } : {}),
              ...(status !== undefined ? { status } : {}),
              ...(limit !== undefined ? { limit } : {}),
            });
            return { ok: true, value: { total: 1, cards: [CARD] } };
          },
          tasks: async () => ({ ok: true, value: { total: 2, tasks: [] } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-rebuild'] === '')?.props?.onClick as () => void)();
    await flush();
    // 选幕 → 重置节并加载（只带 actId）。
    (collect(render(), 'select').find((n) => n.props?.['data-novel-statistics-card-act'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'act-1' } });
    await flush();
    expect(calls[calls.length - 1]).toEqual({ actId: 'act-1' });
    // 选节 → 叠加 beatId。
    (collect(render(), 'select').find((n) => n.props?.['data-novel-statistics-card-beat'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'beat-1' } });
    await flush();
    expect(calls[calls.length - 1]).toEqual({ actId: 'act-1', beatId: 'beat-1' });
    // 选状态 → 叠加 status。
    (collect(render(), 'select').find((n) => n.props?.['data-novel-statistics-card-status'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'done' } });
    await flush();
    expect(calls[calls.length - 1]).toEqual({ actId: 'act-1', beatId: 'beat-1', status: 'done' });
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-card-total'] !== undefined)?.children?.[0] ?? '')).toContain('场景卡 1 张');
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-statistics-card'] === 'detail-1')).toBe(true);
  });

  it('任务历史：状态筛选 → Remote 提交并渲染；章节详情 → 场景字数明细', async () => {
    let taskCalls = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          rebuild: async () => ({ ok: true, value: STATS }),
          overview: async () => ({ ok: true, value: OVERVIEW }),
          sceneCards: async () => ({ ok: true, value: { total: 3, cards: [] } }),
          tasks: async (_projectId, _status, _limit) => {
            taskCalls += 1;
            return { ok: true, value: { total: 1, tasks: [TASK] } };
          },
          chapterDetail: async (_projectId, chapterId) => ({
            ok: true,
            value: { chapter: { chapterId, index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', sceneCount: 2, units: 22, chars: 49, scenes: [{ sceneId: 'scene-1', index: 0, summary: '进入灯塔', units: 18, chars: 20 }] } },
          }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-rebuild'] === '')?.props?.onClick as () => void)();
    await flush();
    // 任务历史：选状态 → 提交 status 筛选。
    const before = taskCalls;
    (collect(render(), 'select').find((n) => n.props?.['data-novel-statistics-task-status'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'completed' } });
    await flush();
    expect(taskCalls).toBe(before + 1);
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-task-total'] !== undefined)?.children?.[0] ?? '')).toContain('任务 1 个');
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-statistics-task'] === 'qt-detail-1')).toBe(true);
    // 章节详情：点章节 → Remote 提交 chapterId → 场景字数明细渲染。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-chapter-select'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-statistics-scene'] === 'scene-1')).toBe(true);
    expect(String(collect(render(), 'li').find((n) => n.props?.['data-novel-statistics-scene'] === 'scene-1')?.children?.[0] ?? '')).toContain('18 字');
  });

  it('派生统计生命周期：删除 → 未构建提示；刷新状态可见（可删除重建，非第二真相）', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          stats: async () => ({ ok: true, value: STATS }),
          drop: async () => ({ ok: true, value: { indexExists: false, counts: { chapters: 0, scenes: 0, cards: 0, tasks: 0 } } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-stats'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-stats'] !== undefined)?.children?.[0] ?? '')).toContain('章节 1 · 场景 2');
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-drop'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(statisticsMessage(render)).toContain('已删除派生统计');
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-stats'] !== undefined)?.children?.[0] ?? '')).toContain('未构建');
  });

  it('I101：并行子工作流互不阻塞——概览加载中仅概览按钮忙碌，刷新状态仍可发起', async () => {
    let releaseOverview: (() => void) | undefined;
    const overviewGate = new Promise<void>((resolve) => { releaseOverview = resolve; });
    const seen: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          stats: async () => { seen.push('stats'); return { ok: true, value: STATS }; },
          overview: async () => { seen.push('overview'); await overviewGate; return { ok: true, value: OVERVIEW }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    // 发起概览（挂起中）→ 概览按钮自身忙碌。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    const overviewButton = collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-refresh'] === '');
    const statsButton = collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-stats'] === '');
    expect(overviewButton?.props?.disabled).toBe(true);
    // 旧实现（单一 acting 互锁）下 stats 按钮同样被禁用；I101 后不再互锁。
    expect(statsButton?.props?.disabled).toBeFalsy();
    // 概览挂起期间刷新状态仍可发起并完成（不被互锁）。
    (statsButton?.props?.onClick as () => void)();
    await flush();
    expect(seen).toContain('overview');
    expect(seen).toContain('stats');
    releaseOverview?.();
    await flush();
  });
})
