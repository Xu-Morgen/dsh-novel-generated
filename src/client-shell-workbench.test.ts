/**
 * I95 按面板拆分（计划 §18 I95）：I46 创作台 workbench shell
 */
/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：创作台外壳 / 视觉体系 / 停靠侧板 /
 * 任务导航 / 响应式与可访问性（I46 / I54 / I58 / I59）。断言原样迁移，锚点不变。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { CINNABAR, CINNABAR_DARK, GRID, SERIF_STACK, WORKBENCH_STYLES } from './client/styles.js';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { root: { kind: 'single'; scope: 'root' }; }
}


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);
describe('I46 创作台 workbench shell', () => {
  it('registers the overlay panel and a discoverable floating circular launch entry, never a single slot', async () => {
    const { entry, registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    expect(entry.inject).toEqual(['slots', 'remote']);
    expect(Object.keys(registrations).sort()).toEqual(['shell.overlay']);
    // 不替换 root/sidebar/conversation/details 单槽（D11）。
    for (const single of ['root', 'sidebar', 'conversation', 'details']) {
      expect(registrations[single]).toBeUndefined();
    }
    expect(registrations['shell.overlay']).toHaveLength(1);
    expect(registrations['shell.overlay'][0].options).toMatchObject({ id: 'novel-creation-tool-workspace', label: '创作台' });
  });

  it('renders the brand header and the four task-group navigation in the ready state', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    expect(tree.props?.['data-novel-workspace']).toBe('ready');
    expect(tree.props?.['data-novel-route']).toBe('characters');
    expect(collect(tree, 'header').some((n) => n.props?.['data-novel-brand'] !== undefined)).toBe(true);
    expect(collect(tree, 'h2').some((n) => (n.children ?? []).includes('创作台'))).toBe(true);
    // I58：导航从九项扁平改为四组任务导航（写作/策划/连续性/作品设置，R12-5）。
    const groups = collect(tree, 'section').filter((n) => n.props?.['data-novel-nav-group'] !== undefined);
    expect(groups.map((n) => n.props?.['data-novel-nav-group'])).toEqual(['writing', 'planning', 'continuity', 'settings']);
    const groupLabels = collect(tree, 'h3').filter((n) => n.props?.['data-novel-nav-group-label'] !== undefined);
    expect(groupLabels.map((n) => n.props?.['data-novel-nav-group-label'])).toEqual(['writing', 'planning', 'continuity', 'settings']);
    expect(groupLabels.map((n) => String((n.children?.[0] ?? '')))).toEqual(['写作', '策划', '连续性', '作品设置']);
    // 六层按钮仍可达（data-novel-layer 数据锚点不变，顺序随分组变化）。
    expect(layerButtons(tree).map((n) => n.props?.['data-novel-layer'])).toEqual([
      'outline', 'characters', 'worldview', 'relationship', 'state', 'canon',
    ]);
    // 稳定 data 锚点：十八个视图按钮各带 data-novel-view（I60 新增正文 C5，I64 新增审校中心，I65 新增生成队列，I66 新增知情，I67 新增规则与文风，I68 新增进度与灵感 C6，I69 新增导入导出与备份，I71 新增搜索与追踪，I72 新增写作进度）。
    const viewButtons = collect(tree, 'button').filter((n) => n.props?.['data-novel-view'] !== undefined);
    expect(viewButtons.map((n) => n.props?.['data-novel-view'])).toEqual([
      'outline', 'progress', 'chapters', 'review', 'queue', 'search', 'statistics', 'characters', 'worldview', 'timeline', 'ruleStyle', 'relationship', 'state', 'canon', 'knowledge', 'onboarding', 'creationSettings', 'importExport', 'settings',
    ]);
    // 技术层编号只作辅助徽标（B5/C6/C5/B3/B2/B1/B4/C1/C2/C4/C3），非层视图无徽标。
    const badges = collect(tree, 'span').filter((n) => n.props?.['data-novel-nav-badge'] !== undefined);
    expect(badges.map((n) => n.props?.['data-novel-nav-badge'])).toEqual(['B5', 'C6', 'C5', 'B3', 'B2', 'B1/B4', 'C1', 'C2', 'C4', 'C3']);
  });

  it('fails loud when the required DSH defineStore runtime is unavailable', () => {
    expect(() => factory((spec) => (spec === 'react' ? fakeReact : undefined))).toThrow('defineStore is unavailable');
  });

  it('does not load project layers before explicit selection when renderer injection is delayed', async () => {
    let characterLoads = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { characterList: async () => { characterLoads += 1; return []; } },
      { deferStoreInjection: true, openProjectId: null },
    );
    await flush();
    expect(characterLoads).toBe(0);

    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    expect(render().props?.['data-novel-workspace']).toBe('ready');
    expect(characterLoads).toBe(0);
    const picker = collect(render(), 'button').find((node) => node.props?.['data-novel-project-open'] === 'fixture-project');
    (picker?.props?.onClick as () => void)();
    await flush();
    expect(characterLoads).toBe(1);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-layer-panel'] === 'characters' && node.props?.['data-novel-layer-state'] === 'ready')).toBe(true);
  });

  it('drops pending Remote work when the overlay Fiber disposes before resolution', async () => {
    let resolveModel!: (value: unknown) => void;
    let modelStarts = 0;
    let characterLoads = 0;
    const model = new Promise<unknown>((resolve) => { resolveModel = resolve; });
    const { overlayCleanups } = mount(
      () => { modelStarts += 1; return model; },
      { characterList: async () => { characterLoads += 1; return []; } },
      { deferStoreInjection: true },
    );
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    expect(modelStarts).toBe(1);

    overlayCleanups[0]();
    resolveModel({ ok: true, value: READY_MODEL });
    await flush();
    expect(characterLoads).toBe(0);
  });

  it('shows the loading state before the Host view model resolves', async () => {
    let resolveModel!: (value: unknown) => void;
    const model = new Promise<unknown>((resolve) => { resolveModel = resolve; });
    const { registrations } = mount(() => model);
    await flush();
    expect((registrations['shell.overlay'][0].component() as FakeNode).props?.['data-novel-workspace']).toBe('loading');
    resolveModel({ ok: true, value: READY_MODEL });
    await flush();
    expect((registrations['shell.overlay'][0].component() as FakeNode).props?.['data-novel-workspace']).toBe('ready');
  });

  it('shows the error state when the Host Remote fails', async () => {
    const { registrations } = mount(() => Promise.reject(new Error('offline')));
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    expect(tree.props?.['data-novel-workspace']).toBe('error');
    expect(collect(tree, 'section').some((n) => n.props?.role === 'alert')).toBe(true);
  });

  it('renders real B3/B2/B5/C1/C2/C4 form panels with no empty placeholder, and navigates across all six', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    const panel = (tree: FakeNode): FakeNode | undefined =>
      collect(tree, 'section').find((n) => n.props?.['data-novel-layer-panel'] !== undefined);

    expect(panel(render())?.props?.['data-novel-layer-panel']).toBe('characters');
    // I47：角色层渲染真表单（ready），非空态占位。
    expect(panel(render())?.props?.['data-novel-layer-state']).toBe('ready');

    const ids = ['characters', 'worldview', 'outline', 'relationship', 'state', 'canon'];
    for (const id of ids) {
      const button = layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === id);
      expect(button, `nav button for ${id}`).toBeDefined();
      (button?.props?.onClick as () => void)();
      expect(panel(render())?.props?.['data-novel-layer-panel']).toBe(id);
      // I47/I48/I49：六层均渲染真面板（ready），不再有空态占位。
      expect(panel(render())?.props?.['data-novel-layer-state']).toBe('ready');
    }
  });

  it('collapses and closes the panel, and the floating circular launch entry reopens it', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const renderOverlay = () => registrations['shell.overlay'][0].component() as FakeNode | null;

    const collapseButton = collect(renderOverlay() as FakeNode, 'button')
      .find((n) => n.props?.['aria-expanded'] !== undefined);
    (collapseButton?.props?.onClick as () => void)();
    // 折叠后内容区（body）隐藏，但品牌头栏仍在。
    const collapsed = renderOverlay() as FakeNode;
    expect(collapsed.props?.['data-novel-workspace']).toBe('ready');
    expect(collect(collapsed, 'nav')).toHaveLength(0);

    const closeButton = collect(renderOverlay() as FakeNode, 'button')
      .find((n) => n.props?.['aria-label'] === '关闭创作台');
    (closeButton?.props?.onClick as () => void)();
    // 关闭后：overlay 渲染悬浮圆形入口（圆形 class + 打开创作台语义），面板本身消失。
    const launch = renderOverlay() as FakeNode;
    expect(launch.tag).toBe('button');
    expect(launch.props?.['data-novel-launch']).toBe('');
    expect(String(launch.props?.['className'] ?? '')).toContain('nv-launch');
    expect(String(launch.props?.['aria-label'] ?? '')).toBe('打开创作台');

    // 点击悬浮圆形入口重新打开面板。
    (launch.props?.onClick as () => void)();
    expect(renderOverlay()).not.toBeNull();
    expect((renderOverlay() as FakeNode).props?.['data-novel-workspace']).toBe('ready');
  });

  it('drags the nav resizer to resize the sidebar width within bounds', async () => {
    const { NAV_WIDTH_MIN, NAV_WIDTH_MAX, NAV_WIDTH_DEFAULT } = await import('./client.js');
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    const navVar = (tree: FakeNode): string | undefined =>
      (tree.props?.style as Record<string, string> | undefined)?.['--nv-nav-width'];
    // 默认宽度经根节点 CSS 变量下发。
    expect(navVar(render())).toBe(`${NAV_WIDTH_DEFAULT}px`);

    const resizer = collect(render(), 'div').find((n) => n.props?.['data-novel-nav-resizer'] !== undefined);
    expect(resizer).toBeDefined();
    expect(resizer?.props?.['role']).toBe('separator');
    expect(resizer?.props?.['aria-orientation']).toBe('vertical');

    // pointerdown 捕获起点 → move 增量更新 → up 结束；宽度钳制在 [MIN, MAX]。
    const pointer = (clientX: number) => ({ clientX, pointerId: 1, preventDefault: () => {}, currentTarget: { setPointerCapture: () => {} } });
    (resizer?.props?.onPointerDown as (e: { clientX: number }) => void)?.(pointer(100));
    (resizer?.props?.onPointerMove as (e: { clientX: number }) => void)?.(pointer(140));
    expect(navVar(render())).toBe(`${NAV_WIDTH_DEFAULT + 40}px`);
    // 拖出上界 → 钳制到 MAX。
    (resizer?.props?.onPointerMove as (e: { clientX: number }) => void)?.(pointer(10000));
    expect(navVar(render())).toBe(`${NAV_WIDTH_MAX}px`);
    // 拖出下界 → 钳制到 MIN。
    (resizer?.props?.onPointerMove as (e: { clientX: number }) => void)?.(pointer(-10000));
    expect(navVar(render())).toBe(`${NAV_WIDTH_MIN}px`);
    (resizer?.props?.onPointerUp as () => void)?.();
  });

  it('drags the panel left edge to resize the whole workbench width within bounds', async () => {
    const { PANEL_WIDTH_MIN, PANEL_WIDTH_MAX, PANEL_WIDTH_DEFAULT } = await import('./client.js');
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    const panelVar = (tree: FakeNode): string | undefined =>
      (tree.props?.style as Record<string, string> | undefined)?.['--nv-panel-width'];
    // 默认面板宽度经根节点 CSS 变量下发。
    expect(panelVar(render())).toBe(`${PANEL_WIDTH_DEFAULT}px`);

    const resizer = collect(render(), 'div').find((n) => n.props?.['data-novel-panel-resizer'] !== undefined);
    expect(resizer).toBeDefined();
    expect(resizer?.props?.['role']).toBe('separator');
    expect(resizer?.props?.['aria-orientation']).toBe('vertical');

    // 左边缘拖动：面板贴右，左边缘左移（clientX 减小）→ 宽度增加；右移 → 宽度减小；钳制在 [MIN, MAX]。
    const pointer = (clientX: number) => ({ clientX, pointerId: 1, preventDefault: () => {}, currentTarget: { setPointerCapture: () => {} } });
    (resizer?.props?.onPointerDown as (e: { clientX: number }) => void)?.(pointer(700));
    (resizer?.props?.onPointerMove as (e: { clientX: number }) => void)?.(pointer(600));
    expect(panelVar(render())).toBe(`${PANEL_WIDTH_DEFAULT + 100}px`);
    // 拖出上界 → 钳制到 MAX。
    (resizer?.props?.onPointerMove as (e: { clientX: number }) => void)?.(pointer(-10000));
    expect(panelVar(render())).toBe(`${PANEL_WIDTH_MAX}px`);
    // 拖出下界 → 钳制到 MIN。
    (resizer?.props?.onPointerMove as (e: { clientX: number }) => void)?.(pointer(10000));
    expect(panelVar(render())).toBe(`${PANEL_WIDTH_MIN}px`);
    (resizer?.props?.onPointerUp as () => void)?.();
  });

  it('auto-collapses the side nav when the panel is dragged below the narrow threshold', async () => {
    const { PANEL_NAV_AUTO_COLLAPSE, PANEL_WIDTH_DEFAULT } = await import('./client.js');
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    const collapsed = (tree: FakeNode): boolean => tree.props?.['data-novel-nav-collapsed'] === '';
    // 默认 860px ≥ 阈值 → 不折叠。
    expect(PANEL_WIDTH_DEFAULT).toBeGreaterThanOrEqual(PANEL_NAV_AUTO_COLLAPSE);
    expect(collapsed(render())).toBe(false);

    const resizer = collect(render(), 'div').find((n) => n.props?.['data-novel-panel-resizer'] !== undefined);
    expect(resizer).toBeDefined();
    const pointer = (clientX: number) => ({ clientX, pointerId: 1, preventDefault: () => {}, currentTarget: { setPointerCapture: () => {} } });
    // 面板贴右：clientX > 起点 → 左边缘右移 → 宽度减小；clientX < 起点 → 宽度增加。
    (resizer?.props?.onPointerDown as (e: { clientX: number }) => void)?.(pointer(1200));
    (resizer?.props?.onPointerMove as (e: { clientX: number }) => void)?.(pointer(1200));
    expect(collapsed(render())).toBe(false);
    // 拖到过窄（宽度 < 阈值）→ 自动折叠标记出现。
    (resizer?.props?.onPointerMove as (e: { clientX: number }) => void)?.(pointer(1350));
    expect(collapsed(render())).toBe(true);
    // 再拖宽 → 恢复。
    (resizer?.props?.onPointerMove as (e: { clientX: number }) => void)?.(pointer(1250));
    expect(collapsed(render())).toBe(false);
    (resizer?.props?.onPointerUp as () => void)?.();
  });
});
