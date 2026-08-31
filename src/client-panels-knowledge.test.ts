/**
 * I95 按面板拆分（计划 §18 I95）：I66 知情与揭示管理面 UI (R14-1)
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

describe('I66 知情与揭示管理面 UI (R14-1)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const knowledgePanel = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-knowledge-panel'] !== undefined);
  const factNodes = (tree: FakeNode): FakeNode[] =>
    collect(tree, 'li').filter((node) => node.props?.['data-novel-knowledge-fact'] !== undefined);
  const openKnowledge = (render: () => FakeNode): void => {
    (navButton(render(), 'knowledge')?.props?.onClick as () => void)();
  };
  const refresh = (render: () => FakeNode): void => {
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-refresh'] === '')?.props?.onClick as () => void)();
  };

  const PROJECTION = {
    projectId: 'fixture-project',
    entries: [
      { id: 'k-1', fact: '灯塔守夜人失踪真相', kind: 'secret', status: 'hidden', holders: [], revealPlan: { revealTo: ['lin'], revealAt: '第三幕' }, povHint: 'POV 边界：尚无角色知晓；计划揭示 林（第三幕）。' },
      { id: 'k-2', fact: '铜钥匙能开旧箱', kind: 'plotpoint', status: 'partially-revealed', holders: ['mira'], revealPlan: { revealTo: [], revealAt: '第二幕' }, povHint: 'POV 边界：当前 米拉 知晓；生成注入只按角色 POV 过滤。' },
    ],
    characters: [
      { characterId: 'mira', name: '米拉', knows: ['k-2'] },
      { characterId: 'lin', name: '林', knows: [] },
    ],
    summary: { total: 2, hidden: 1, partiallyRevealed: 1, revealed: 0, withPlan: 1 },
  };
  const baseStub = (overrides: Partial<{ list: (projectId: string) => Promise<unknown>; pending: () => Promise<unknown>; propose: (projectId: string, input: unknown) => Promise<unknown>; accept: (projectId: string, proposalId: string) => Promise<unknown>; reject: (projectId: string, proposalId: string) => Promise<unknown> }> = {}) => ({
    list: overrides.list ?? (async () => ({ ok: true, value: PROJECTION })),
    pending: overrides.pending ?? (async () => ({ ok: true, value: [] })),
    propose: overrides.propose ?? (async () => { throw new Error('未注入 propose'); }),
    accept: overrides.accept ?? (async () => { throw new Error('未注入 accept'); }),
    reject: overrides.reject ?? (async () => { throw new Error('未注入 reject'); }),
    read: async () => { throw new Error('未注入 read'); },
  });

  it('刷新后事实视图展示事实（kind/status/holders/规划揭示/POV 边界提示）并可切到角色视图', async () => {
    const lists: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      { knowledge: baseStub({ list: async (projectId) => { lists.push(projectId); return { ok: true, value: PROJECTION }; } }) },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openKnowledge(render);
    await flush();
    expect(knowledgePanel(render())?.props?.['data-novel-knowledge-state']).toBe('idle');
    refresh(render);
    await flush();
    expect(lists).toEqual(['fixture-project']);
    const panel = knowledgePanel(render());
    expect(panel?.props?.['data-novel-knowledge-state']).toBe('ready');
    // 汇总含隐藏/部分揭示/已揭示/规划揭示。
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-knowledge-summary'] !== undefined)?.children?.[0] ?? ''))).toContain('共 2 条事实（隐藏 1 / 部分揭示 1 / 已揭示 0；1 条规划揭示）');
    // 事实视图（默认）：kind/status 徽标、holders、规划揭示、POV 边界提示。
    const facts = factNodes(render());
    expect(facts.map((n) => n.props?.['data-novel-knowledge-fact'])).toEqual(['k-1', 'k-2']);
    expect(facts.map((n) => n.props?.['data-novel-knowledge-fact-status'])).toEqual(['hidden', 'partially-revealed']);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-knowledge-fact-kind'] === 'secret')).toBe(true);
    expect(collect(render(), 'p').some((n) => String(n.children?.[0] ?? '').includes('计划揭示：林（第三幕）'))).toBe(true);
    expect(collect(render(), 'p').some((n) => n.props?.['data-novel-knowledge-pov-hint'] !== undefined && String(n.children?.[0] ?? '').includes('POV 边界'))).toBe(true);
    // 切到角色视图：角色卡 + 已知事实数 + 空角色提示。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-view-tab'] === 'characters')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((n) => n.props?.['data-novel-knowledge-view'] === 'characters')).toBe(true);
    const characters = collect(render(), 'li').filter((n) => n.props?.['data-novel-knowledge-character'] !== undefined);
    expect(characters.map((n) => n.props?.['data-novel-knowledge-character'])).toEqual(['mira', 'lin']);
    expect(characters.map((n) => String((collect(n, 'span').find((c) => c.props?.['data-novel-knowledge-character-count'] !== undefined)?.children?.[0] ?? '')))).toEqual(['已知 1 条', '已知 0 条']);
    expect(collect(render(), 'p').some((n) => n.props?.['data-novel-knowledge-character-empty'] !== undefined)).toBe(true);
  });

  it('揭示提案：选中事实 → 勾选 holder → 发起 reveal 提案（pending，未确认零写）', async () => {
    const proposed: Array<{ kind: string; entryId: string; holders: string[]; status?: string }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        knowledge: baseStub({
          propose: async (projectId, input) => {
            const value = input as { kind: string; entryId: string; holders: string[]; status?: string };
            proposed.push(value);
            return { ok: true, value: { projectId, proposalId: 'kprop-1', kind: value.kind, status: 'pending', preview: { ...PROJECTION.entries[0], holders: value.holders, status: 'revealed', revealPlan: { revealTo: [], revealAt: '第二幕' }, povHint: 'POV 边界：当前 米拉 知晓；…' } } };
          },
          pending: async () => ({ ok: true, value: [{ proposalId: 'kprop-1', kind: 'reveal', entryId: 'k-1', holders: ['mira'], status: 'revealed', revealAt: '第二幕' }] }),
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openKnowledge(render);
    await flush();
    refresh(render);
    await flush();
    // 打开 k-1 的操作表单：holder 勾选只列尚未知情的角色（米拉、林）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-fact-action'] === 'k-1')?.props?.onClick as () => void)();
    await flush();
    const holderChecks = () => collect(render(), 'input').filter((n) => n.props?.['data-novel-knowledge-holder-check'] !== undefined);
    expect(holderChecks().map((n) => n.props?.['data-novel-knowledge-holder-check'])).toEqual(['mira', 'lin']);
    (collect(render(), 'input').find((n) => n.props?.['data-novel-knowledge-holder-check'] === 'mira')?.props?.onChange as () => void)();
    await flush();
    (collect(render(), 'select').find((n) => n.props?.['data-novel-knowledge-status'] !== undefined)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'revealed' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-propose'] === 'reveal')?.props?.onClick as () => void)();
    await flush();
    expect(proposed).toEqual([{ kind: 'reveal', entryId: 'k-1', holders: ['mira'], status: 'revealed' }]);
    // 提案进入待确认列表（Gate pending；确认前 C3 零写由 Host 保证）。
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-knowledge-pending-item'] === 'kprop-1')).toBe(true);
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-knowledge-message'] !== undefined)?.children?.[0] ?? ''))).toContain('提案已提交待确认：揭示');
  });

  it('确认应用：accept 提交 proposalId，投影刷新、pending 移除、已生效幂等提示', async () => {
    const accepted: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        knowledge: baseStub({
          pending: async () => ({ ok: true, value: [{ proposalId: 'kprop-1', kind: 'reveal', entryId: 'k-1', holders: ['mira'], status: 'revealed' }] }),
          accept: async (projectId, proposalId) => {
            accepted.push(proposalId);
            const applied = { ...PROJECTION, entries: [{
              ...PROJECTION.entries[0],
              holders: ['mira'],
              status: 'revealed',
              revealPlan: { revealTo: [], revealAt: '第二幕' },
              povHint: 'POV 边界：当前 米拉 知晓；…',
            }, PROJECTION.entries[1]] };
            return { ok: true, value: { projectId, proposalId, applied: true, projection: applied } };
          },
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openKnowledge(render);
    await flush();
    refresh(render);
    await flush();
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-knowledge-pending-item'] === 'kprop-1')).toBe(true);
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-accept'] === 'kprop-1')?.props?.onClick as () => void)();
    await flush();
    expect(accepted).toEqual(['kprop-1']);
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-knowledge-pending-item'] === 'kprop-1')).toBe(false);
    // 投影刷新：k-1 状态徽标变为 revealed。
    expect(factNodes(render()).find((n) => n.props?.['data-novel-knowledge-fact'] === 'k-1')?.props?.['data-novel-knowledge-fact-status']).toBe('revealed');
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-knowledge-message'] !== undefined)?.children?.[0] ?? ''))).toContain('已确认并应用');
  });

  it('拒绝提案：reject 提交 proposalId，pending 移除并提示 C3 零写', async () => {
    const rejected: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        knowledge: baseStub({
          pending: async () => ({ ok: true, value: [{ proposalId: 'kprop-2', kind: 'holder-add', entryId: 'k-2', holders: ['lin'] }] }),
          reject: async (projectId, proposalId) => { rejected.push(proposalId); return { ok: true, value: { projectId, proposalId, status: 'rejected' } }; },
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openKnowledge(render);
    await flush();
    refresh(render);
    await flush();
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-knowledge-pending-item'] === 'kprop-2')).toBe(true);
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-reject'] === 'kprop-2')?.props?.onClick as () => void)();
    await flush();
    expect(rejected).toEqual(['kprop-2']);
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-knowledge-pending-item'] === 'kprop-2')).toBe(false);
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-knowledge-message'] !== undefined)?.children?.[0] ?? ''))).toContain('已拒绝提案，未修改知情记录');
  });

  it('Host 拒绝逆向 status 提案时展示错误信息且面板不 brick；已知情角色不出现在 holder 勾选', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        knowledge: baseStub({
          propose: async () => { throw new Error('Knowledge status cannot regress: k-1'); },
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openKnowledge(render);
    await flush();
    refresh(render);
    await flush();
    // 已知情 holder（k-2 已被米拉知晓）不出现在勾选列表。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-fact-action'] === 'k-2')?.props?.onClick as () => void)();
    await flush();
    const holderChecks = () => collect(render(), 'input').filter((n) => n.props?.['data-novel-knowledge-holder-check'] !== undefined);
    expect(holderChecks().map((n) => n.props?.['data-novel-knowledge-holder-check'])).toEqual(['lin']);
    // 发起提案被 Host 拒绝 → 错误信息展示（逆向 status 失败，R14-1）。
    (collect(render(), 'input').find((n) => n.props?.['data-novel-knowledge-holder-check'] === 'lin')?.props?.onChange as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-propose'] === 'holder-add')?.props?.onClick as () => void)();
    await flush();
    expect(knowledgePanel(render())?.props?.['data-novel-knowledge-state']).toBe('ready');
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-knowledge-message'] !== undefined)?.children?.[0] ?? ''))).toContain('操作未完成，请重试');
  });
})
