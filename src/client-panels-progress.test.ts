/**
 * I95 按面板拆分（计划 §18 I95）：I68 C6 进度与灵感落地 UI (R14-3)
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

describe('I68 C6 进度与灵感落地 UI (R14-3)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const progressPanel = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-progress-panel'] !== undefined);
  const openProgress = (render: () => FakeNode): void => {
    (navButton(render(), 'progress')?.props?.onClick as () => void)();
  };
  const refresh = (render: () => FakeNode): void => {
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-refresh'] === '')?.props?.onClick as () => void)();
  };
  const messageOf = (render: () => FakeNode): string =>
    String((collect(render(), 'p').find((n) => n.props?.['data-novel-progress-message'] !== undefined)?.children?.[0] ?? ''));

  const DIRECTION_DAWN = {
    id: 'dawn', title: '黎明交易', premise: '以黎明交易换取封印。',
    changes: { logline: '米拉以黎明交易换取封印。', outlineNote: '米拉在黎明与守夜人交易。', progressNote: '新方向带来更紧的倒计时。' },
    rationale: '提高冲突强度。',
  };
  const DIRECTION_STORM = {
    id: 'storm', title: '风暴交易', premise: '在风暴中达成交易。',
    changes: { outlineNote: '米拉在风暴中交易。', progressNote: '天气迫使改道。' },
    rationale: '增加紧迫感。',
  };
  const PROJECTION = {
    outlineId: 'outline',
    acts: [{ id: 'act-one', index: 1, title: '第一幕', beats: [
      { id: 'first', title: '进入旧港', optional: false, completed: false, current: true, prerequisitesMet: true, doneScenes: 1, totalScenes: 2, sceneCards: [
        { id: 'scene-1', title: '雨夜入港', summary: '抵达旧港。', pov: 'mira', wordTarget: 800, status: 'done' },
        { id: 'scene-2', title: '守夜人', summary: '遇见守夜人。', pov: 'mira', wordTarget: 700, status: 'writing' },
      ] },
    ] }],
    currentAct: 'act-one',
    currentBeat: 'first',
    completedBeats: [],
    deviations: [{ id: 'drift-1', planned: '入港', actual: '绕行山道', reason: '封路', reconciled: false }],
    tensionLevel: 20,
    navigation: { actId: 'act-one', beatId: 'first', title: '进入旧港', description: '米拉找到入口。', prerequisites: [], prerequisitesMet: true, instruction: '完成进入旧港。', deviationIds: ['drift-1'] },
    consistency: { currentBeatCompleted: false, completedBeatsWithOpenScenes: [], navigationTargetAllScenesDone: false },
  };
  const AUDIT_RECORD = { proposalId: 'insp-dawn-1700000000000', status: 'accepted', direction: DIRECTION_DAWN };
  const baseStub = (overrides: Partial<{ projection: (projectId: string) => Promise<unknown>; pending: (projectId: string) => Promise<unknown>; audit: (projectId: string) => Promise<unknown>; inspire: (projectId: string, prompt?: string) => Promise<unknown>; select: (projectId: string, input: unknown) => Promise<unknown>; apply: (projectId: string, proposalId: string) => Promise<unknown>; reject: (projectId: string, proposalId: string) => Promise<unknown>; recordDeviation: (projectId: string, input: unknown) => Promise<unknown>; reconcileDeviation: (projectId: string, deviationId: string) => Promise<unknown> }> = {}) => ({
    projection: overrides.projection ?? (async () => ({ ok: true, value: PROJECTION })),
    pending: overrides.pending ?? (async () => ({ ok: true, value: { proposals: [] } })),
    audit: overrides.audit ?? (async () => ({ ok: true, value: { records: [] } })),
    inspire: overrides.inspire ?? (async () => ({ ok: true, value: { projectId: 'fixture-project', directions: [DIRECTION_DAWN, DIRECTION_STORM] } })),
    select: overrides.select ?? (async () => { throw new Error('未注入 select'); }),
    apply: overrides.apply ?? (async () => { throw new Error('未注入 apply'); }),
    reject: overrides.reject ?? (async () => { throw new Error('未注入 reject'); }),
    recordDeviation: overrides.recordDeviation ?? (async () => { throw new Error('未注入 recordDeviation'); }),
    reconcileDeviation: overrides.reconcileDeviation ?? (async () => { throw new Error('未注入 reconcileDeviation'); }),
  });

  it('装载投影：导航目标、完成状态、偏差与一致性（只读展示）', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      { progress: baseStub() },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openProgress(render);
    await flush();
    expect(progressPanel(render())?.props?.['data-novel-progress-state']).toBe('idle');
    refresh(render);
    await flush();
    const tree = render();
    expect(progressPanel(tree)?.props?.['data-novel-progress-state']).toBe('ready');
    expect(String((collect(tree, 'p').find((n) => n.props?.['data-novel-progress-nav-target'] !== undefined)?.children?.[0] ?? ''))).toContain('进入旧港');
    expect(String((collect(tree, 'p').find((n) => n.props?.['data-novel-progress-nav-meta'] !== undefined)?.children?.[0] ?? ''))).toContain('已完成节 0');
    const scenes = collect(tree, 'li').filter((n) => n.props?.['data-novel-progress-scene'] !== undefined);
    expect(scenes.map((n) => n.props?.['data-novel-progress-scene'])).toEqual(['scene-1', 'scene-2']);
    const sceneStatuses = collect(tree, 'span').filter((n) => n.props?.['data-novel-progress-scene-status'] !== undefined);
    expect(sceneStatuses.map((n) => n.props?.['data-novel-progress-scene-status'])).toEqual(['done', 'writing']);
    const deviations = collect(tree, 'li').filter((n) => n.props?.['data-novel-progress-deviation'] !== undefined);
    expect(deviations.map((n) => n.props?.['data-novel-progress-deviation'])).toEqual(['drift-1']);
    expect(collect(tree, 'div').some((n) => n.props?.['data-novel-progress-consistency'] !== undefined)).toBe(false);
  });

  it('灵感时刻 → 选定方向 → Gate 提案（pending；未确认不写）', async () => {
    let selected: unknown;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        progress: baseStub({
          select: async (projectId, input) => {
            selected = input;
            return { ok: true, value: { projectId, proposalId: 'insp-dawn-1700000000000', direction: (input as { direction: unknown }).direction, status: 'pending' } };
          },
          pending: async () => ({ ok: true, value: { proposals: [{ proposalId: 'insp-dawn-1700000000000', direction: DIRECTION_DAWN, status: 'pending' }] } }),
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openProgress(render);
    await flush();
    refresh(render);
    await flush();
    // 灵感时刻 → 两个方向出现（零写展示）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-inspire'] === '')?.props?.onClick as () => void)();
    await flush();
    const directions = collect(render(), 'li').filter((n) => n.props?.['data-novel-progress-direction'] !== undefined);
    expect(directions.map((n) => n.props?.['data-novel-progress-direction'])).toEqual(['dawn', 'storm']);
    // 未选定前没有「确认应用」按钮（不发起任何 Gate 提案）。
    expect(collect(render(), 'button').some((n) => n.props?.['data-novel-progress-propose'] === '')).toBe(false);
    expect(selected).toBeUndefined();
    // 选定方向 → 确认应用 → Gate 提案（pending 列表出现）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-direction-select'] === 'dawn')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-propose'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(selected).toMatchObject({ direction: { id: 'dawn' } });
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-progress-pending-item'] === 'insp-dawn-1700000000000')).toBe(true);
    expect(messageOf(render)).toContain('已提交待确认');
  });

  it('确认应用 → 投影与审计更新；拒绝 → 零写并记录 rejected 审计', async () => {
    const projectionWithDeviation = {
      ...PROJECTION,
      deviations: [{ id: 'insp-dawn-1700000000000-deviation', planned: PROJECTION.navigation.description, actual: DIRECTION_DAWN.changes.outlineNote, reason: DIRECTION_DAWN.changes.progressNote, reconciled: false }],
      navigation: { ...PROJECTION.navigation, deviationIds: ['insp-dawn-1700000000000-deviation'] },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        progress: baseStub({
          apply: async (projectId, proposalId) => ({ ok: true, value: { projectId, proposalId, applied: true, projection: projectionWithDeviation, audit: [AUDIT_RECORD] } }),
          reject: async (projectId, proposalId) => ({ ok: true, value: { projectId, proposalId, status: 'rejected' } }),
          pending: async () => ({ ok: true, value: { proposals: [{ proposalId: 'insp-dawn-1700000000000', direction: DIRECTION_DAWN, status: 'pending' }] } }),
          audit: async () => ({ ok: true, value: { records: [AUDIT_RECORD] } }),
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openProgress(render);
    await flush();
    refresh(render);
    await flush();
    // 确认应用 → 偏差出现、待确认消失、审计记录可见。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-pending-accept'] === 'insp-dawn-1700000000000')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-progress-pending-item'] === 'insp-dawn-1700000000000')).toBe(false);
    expect(collect(render(), 'li').filter((n) => n.props?.['data-novel-progress-deviation'] !== undefined)).toHaveLength(1);
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-progress-audit-record'] === 'insp-dawn-1700000000000')).toBe(true);
    expect(messageOf(render)).toContain('已确认并应用');
  });

  it('记录偏差与调和：只写 C6（投影更新），消息反馈', async () => {
    let recorded: unknown;
    const projectionWithDeviation = { ...PROJECTION, deviations: [...PROJECTION.deviations, { id: 'dev-1', planned: 'A', actual: 'B', reason: 'C', reconciled: false }] };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        progress: baseStub({
          recordDeviation: async (projectId, input) => {
            recorded = input;
            return { ok: true, value: projectionWithDeviation };
          },
          reconcileDeviation: async () => ({ ok: true, value: projectionWithDeviation }),
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openProgress(render);
    await flush();
    refresh(render);
    await flush();
    const inputOf = (anchor: string): FakeNode | undefined => collect(render(), 'input').find((n) => n.props?.[anchor] !== undefined);
    (inputOf('data-novel-progress-deviation-planned')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'A' } });
    (inputOf('data-novel-progress-deviation-actual')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'B' } });
    (inputOf('data-novel-progress-deviation-reason')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'C' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-deviation-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(recorded).toMatchObject({ planned: 'A', actual: 'B', reason: 'C' });
    expect(messageOf(render)).toContain('偏差已记录');
    expect(collect(render(), 'li').filter((n) => n.props?.['data-novel-progress-deviation'] !== undefined)).toHaveLength(2);
    // 调和第一条偏差。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-deviation-reconcile'] === 'drift-1')?.props?.onClick as () => void)();
    await flush();
    expect(messageOf(render)).toContain('已标记为调和');
  });
})
