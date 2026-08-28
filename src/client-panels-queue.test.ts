/**
 * I95 按面板拆分（计划 §18 I95）：I65 生成队列 UI (R13-6)
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

describe('I65 生成队列 UI (R13-6)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const queuePanel = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-queue-panel'] !== undefined);
  const openQueue = (render: () => FakeNode): void => {
    (navButton(render(), 'queue')?.props?.onClick as () => void)();
  };

  const QUEUE_STATUS = {
    projectId: 'fixture-project',
    runState: 'completed',
    config: { wordBudget: 200, maxRetries: 1, stopOnSoftWarnings: false },
    consumedUnits: 20,
    updatedAt: '2026-01-01T00:00:00.000Z',
    error: null,
    tasks: [
      { id: 'qt-scene-a', sceneId: 'scene-a', chapterId: 'chapter-1', cardTitle: '发现海图', cardPov: 'mira', status: 'candidate-ready', candidateId: 'cand-1', attempts: 1, error: null, budgetUnits: 10, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'qt-scene-b', sceneId: 'scene-b', chapterId: 'chapter-1', cardTitle: '灯塔守夜', cardPov: 'mira', status: 'failed', candidateId: null, attempts: 1, error: 'backend exploded', budgetUnits: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ],
  };
  const CARDS = [
    { actId: 'act-1', beatId: 'beat-1', beatTitle: '午夜旧灯塔', detailBeat: { id: 'detail-1', title: '发现海图', summary: 's', pov: 'mira', wordTarget: 20, points: [], status: 'writing' } },
    { actId: 'act-1', beatId: 'beat-1', beatTitle: '午夜旧灯塔', detailBeat: { id: 'detail-2', title: '灯塔守夜', summary: 's', pov: 'mira', wordTarget: 20, points: [], status: 'writing' } },
  ];

  it('刷新队列后展示运行态/预算/任务列表；失败任务可重试；开始/暂停/取消按钮按 runState 可用', async () => {
    const starts: unknown[] = [];
    let retried: string | undefined;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { outlineBeatCards: async () => CARDS },
      {
        queue: {
          status: async () => ({ ok: true, value: QUEUE_STATUS }),
          start: async (projectId, input) => { starts.push({ projectId, input }); return { ok: true, value: QUEUE_STATUS }; },
          pause: async () => ({ ok: true, value: QUEUE_STATUS }),
          resume: async () => ({ ok: true, value: QUEUE_STATUS }),
          cancel: async () => ({ ok: true, value: QUEUE_STATUS }),
          retry: async (projectId, taskId) => { retried = taskId; return { ok: true, value: QUEUE_STATUS }; },
          cancelTask: async () => ({ ok: true, value: QUEUE_STATUS }),
          recover: async () => ({ ok: true, value: QUEUE_STATUS }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openQueue(render);
    await flush();
    // 刷新 → ready：运行态 + 预算 + 任务列表（待裁决 + 失败）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-queue-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(queuePanel(render())?.props?.['data-novel-queue-state']).toBe('ready');
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-queue-summary'] !== undefined)?.children?.[0] ?? ''))).toContain('已完成');
    expect(collect(render(), 'li').filter((n) => n.props?.['data-novel-queue-task'] !== undefined)).toHaveLength(2);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-queue-task-badge'] === 'candidate-ready')).toBe(true);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-queue-task-badge'] === 'failed')).toBe(true);
    // 场景卡勾选范围（B5 beatCards 投影）。
    expect(collect(render(), 'input').filter((n) => n.props?.['data-novel-queue-card-check'] !== undefined)).toHaveLength(2);
    // 失败任务重试按钮。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-queue-retry'] === 'qt-scene-b')?.props?.onClick as () => void)();
    await flush();
    expect(retried).toBe('qt-scene-b');
    // runState=completed 时：开始可用、暂停/继续/取消禁用。
    const startButton = () => collect(render(), 'button').find((n) => n.props?.['data-novel-queue-start'] !== undefined);
    expect(startButton()?.props?.disabled).toBe(false);
    expect(collect(render(), 'button').find((n) => n.props?.['data-novel-queue-pause'] !== undefined)?.props?.disabled).toBe(true);
    // 点击开始：携带勾选范围（默认全选）与配置草稿。
    (startButton()?.props?.onClick as () => void)();
    await flush();
    expect(starts).toHaveLength(1);
    const input = (starts[0] as { input: { cardIds?: string[]; maxRetries?: number; stopOnSoftWarnings?: boolean } }).input;
    expect(input.cardIds).toEqual(['detail-1', 'detail-2']);
  });

  it('队列 Remote 拒绝时显示错误态并可重试（不 brick 面板）', async () => {
    let calls = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { outlineBeatCards: async () => CARDS },
      {
        queue: {
          status: async () => { calls += 1; if (calls === 1) throw new Error('队列账本损坏：queue-journal.yaml 解析失败'); return { ok: true, value: QUEUE_STATUS }; },
          start: async () => ({ ok: true, value: QUEUE_STATUS }),
          pause: async () => ({ ok: true, value: QUEUE_STATUS }),
          resume: async () => ({ ok: true, value: QUEUE_STATUS }),
          cancel: async () => ({ ok: true, value: QUEUE_STATUS }),
          retry: async () => ({ ok: true, value: QUEUE_STATUS }),
          cancelTask: async () => ({ ok: true, value: QUEUE_STATUS }),
          recover: async () => ({ ok: true, value: QUEUE_STATUS }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openQueue(render);
    await flush();
    // 首次 status 失败 → error 态 + 可读错误。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-queue-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(queuePanel(render())?.props?.['data-novel-queue-state']).toBe('error');
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-queue-error-text'] !== undefined)?.children?.[0] ?? ''))).toContain('队列账本损坏');
    // 重试成功 → ready。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-queue-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(queuePanel(render())?.props?.['data-novel-queue-state']).toBe('ready');
  });

  it('I88：Fiber 卸载后队列轮询链归零（负向断言，review §3.3）', async () => {
    let statusCalls = 0;
    const RUNNING_STATUS = { ...QUEUE_STATUS, runState: 'running' as const };
    const { registrations, overlayCleanups } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { outlineBeatCards: async () => CARDS },
      {
        queue: {
          status: async () => { statusCalls += 1; return { ok: true, value: RUNNING_STATUS }; },
          start: async () => ({ ok: true, value: RUNNING_STATUS }),
          pause: async () => ({ ok: true, value: RUNNING_STATUS }),
          resume: async () => ({ ok: true, value: RUNNING_STATUS }),
          cancel: async () => ({ ok: true, value: RUNNING_STATUS }),
          retry: async () => ({ ok: true, value: RUNNING_STATUS }),
          cancelTask: async () => ({ ok: true, value: RUNNING_STATUS }),
          recover: async () => ({ ok: true, value: RUNNING_STATUS }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openQueue(render);
    await flush();
    // 刷新（running）→ 立即拉取一次并进入轮询（refresh 自身拉取 + 轮询控制器
    // 立即 tick 一次 = 2 次 status 调用）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-queue-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(statusCalls).toBe(2);
    // 卸载（等价 Fiber dispose）：disposer 停表 + isActive 翻转，轮询链必须归零。
    for (const cleanup of overlayCleanups.splice(0)) cleanup();
    await new Promise((resolve) => { setTimeout(resolve, QUEUE_POLL_INTERVAL_MS + 250); });
    expect(statusCalls).toBe(2);
  });
})
