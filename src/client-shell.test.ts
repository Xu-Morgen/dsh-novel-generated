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

describe('I46 visual system and Fiber cleanup (R10-2 / R10-3)', () => {
  it('injects the package stylesheet through ctx.effect and removes it on unload', async () => {
    const { styleNodes, styleEffects } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    expect(styleNodes).toHaveLength(1);
    expect(styleNodes[0].attrs['data-novel-workbench']).toBe('styles');
    expect(styleNodes[0].textContent).toBe(WORKBENCH_STYLES);
    styleEffects[0]();
    expect(styleNodes[0].removed).toBe(true);
  });

  it('withdraws the overlay registration when the Fiber unloads', async () => {
    const { registrations, overlayCleanups } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    overlayCleanups[0]();
    expect(registrations['shell.overlay']).toHaveLength(0);
    expect(registrations['sidebar.footer.action']).toBeUndefined();
  });

  it('styles the floating circular launch entry, the nav resizer and button/text spacing (UI 打磨)', () => {
    // 悬浮圆形入口：position fixed 右上角 + border-radius 50%（不在 .nv-workbench 内也要有焦点环与暗色适配）。
    expect(WORKBENCH_STYLES).toMatch(/\.nv-launch \{[^}]*position: fixed/);
    expect(WORKBENCH_STYLES).toMatch(/\.nv-launch \{[^}]*top: calc\(var\(--nv-grid\) \* 2\)/);
    expect(WORKBENCH_STYLES).toMatch(/\.nv-launch \{[^}]*right: calc\(var\(--nv-grid\) \* 2\)/);
    expect(WORKBENCH_STYLES).toMatch(/\.nv-launch \{[^}]*border-radius: 50%/);
    expect(WORKBENCH_STYLES).toContain('.nv-launch:focus-visible');
    expect(WORKBENCH_STYLES).toContain('body[data-ds-dark-theme] .nv-launch');
    // 侧栏可拖动宽度：resizer 存在 + 根节点 CSS 变量驱动 nav 宽度。
    expect(WORKBENCH_STYLES).toMatch(/\.nv-workbench__nav \{[^}]*width: var\(--nv-nav-width, 160px\)/);
    expect(WORKBENCH_STYLES).toContain('.nv-workbench__nav-resizer');
    expect(WORKBENCH_STYLES).toContain('cursor: col-resize');
    // 面板整体宽度可拖动：左边缘拖柄 + 根节点 CSS 变量驱动面板宽度。
    expect(WORKBENCH_STYLES).toContain('.nv-workbench__panel-resizer');
    expect(WORKBENCH_STYLES).toContain('cursor: ew-resize');
    expect(WORKBENCH_STYLES).toContain('width: min(var(--nv-panel-width, 860px), 100vw)');
    // 面板过窄自动折叠侧边路由栏：data-novel-nav-collapsed 驱动纵向堆叠 + 横向滚动横条。
    expect(WORKBENCH_STYLES).toContain('.nv-workbench[data-novel-nav-collapsed] .nv-workbench__body-row');
    expect(WORKBENCH_STYLES).toMatch(/\.nv-workbench\[data-novel-nav-collapsed\] \.nv-workbench__nav \{[^}]*overflow-x: auto/);
    expect(WORKBENCH_STYLES).toMatch(/\.nv-workbench\[data-novel-nav-collapsed\] \.nv-workbench__nav-item \{[^}]*display: inline-block/);
    // 按钮与文字间距：品牌头栏 gap、导航项内边距、徽标与文字间距。
    expect(WORKBENCH_STYLES).toMatch(/\.nv-workbench__brand \{[^}]*gap: calc\(var\(--nv-grid\) \* 1\.5\)/);
    expect(WORKBENCH_STYLES).toMatch(/\.nv-workbench__nav-item \{[^}]*padding: calc\(var\(--nv-grid\) \* 1\) calc\(var\(--nv-grid\) \* 1\.25\)/);
    expect(WORKBENCH_STYLES).toMatch(/\.nv-workbench__nav-item-badge \{[^}]*margin-left: calc\(var\(--nv-grid\) \* 0\.75\)/);
  });

  it('styles consume host --dsw-alias-* tokens, serif stack, 8px grid and dark/light adaptation', () => {
    expect(WORKBENCH_STYLES).toMatch(/var\(--dsw-alias-/);
    expect(WORKBENCH_STYLES).toContain('--dsw-alias-bg-base');
    expect(WORKBENCH_STYLES).toContain('--dsw-alias-label-primary');
    expect(WORKBENCH_STYLES).toContain('--dsw-alias-border-l1');
    expect(WORKBENCH_STYLES).toContain('--dsw-alias-interactive-bg-hover');
    expect(WORKBENCH_STYLES).toContain('--dsw-alias-state-error-primary');
    expect(WORKBENCH_STYLES).toContain('body[data-ds-dark-theme]');
    expect(WORKBENCH_STYLES).toContain(SERIF_STACK);
    expect(WORKBENCH_STYLES).toContain(GRID);
    expect(WORKBENCH_STYLES).toContain(CINNABAR);
    expect(WORKBENCH_STYLES).toContain(CINNABAR_DARK);
  });

  it('carries zero external fonts or network assets', () => {
    expect(WORKBENCH_STYLES).not.toMatch(/@import/);
    expect(WORKBENCH_STYLES).not.toMatch(/@font-face/);
    expect(WORKBENCH_STYLES).not.toMatch(/fonts\.google/);
    expect(WORKBENCH_STYLES).not.toMatch(/url\(\s*['"]?https?:/);
    expect(WORKBENCH_STYLES).not.toMatch(/https?:\/\//);
  });

  it('renders only through React.createElement + el(), with no JSX runtime in source', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const client = readFileSync(resolve(root, 'src/client.ts'), 'utf8');
    const styles = readFileSync(resolve(root, 'src/client/styles.ts'), 'utf8');
    for (const [name, source] of [['src/client.ts', client], ['src/client/styles.ts', styles]] as const) {
      expect(source, `${name} must not import a JSX runtime`).not.toMatch(/jsx-runtime|jsxs|from\s+['"]react\/jsx/);
    }
    expect(client).toContain('React.createElement');
    expect(client).toContain('function el(');
  });
});

describe('I46 keeps the verified SlotCore registration reversible', () => {
  it('register + disposer leaves no occupant', () => {
    const core = new SlotCore();
    const disposer = core.register({ name: 'root' }, () => null);
    expect(core.entries('root')).toHaveLength(1);
    disposer();
    expect(core.entries('root')).toHaveLength(0);
  });
});

describe('I54 右侧停靠侧板（D20 / §14.8 / R12-1）', () => {
  it('docks the workbench right, full-height and non-modal in shell.overlay', () => {
    // 贴右全高：position:fixed + top/right/bottom:0；width:min(var(--nv-panel-width,860px),100vw)
    // 让窄屏占满主视区仍同一 Slot（UI 打磨：面板宽度经 --nv-panel-width 下发，左边缘拖柄可调）。
    expect(WORKBENCH_STYLES).toContain('position: fixed');
    expect(WORKBENCH_STYLES).toContain('top: 0');
    expect(WORKBENCH_STYLES).toContain('right: 0');
    expect(WORKBENCH_STYLES).toContain('bottom: 0');
    expect(WORKBENCH_STYLES).toContain('height: 100%');
    expect(WORKBENCH_STYLES).toContain('width: min(var(--nv-panel-width, 860px), 100vw)');
    // 非模态：面板自身 pointer-events:auto（overlay 层本身 click-through），无遮罩。
    expect(WORKBENCH_STYLES).toContain('pointer-events: auto');
  });

  it('retires the centered floating-window geometry and shadow metaphor', () => {
    // 居中浮窗的确定性标记必须全部消失：居中 min/max 宽高、80vh 上限、窗口圆角、四向投影。
    expect(WORKBENCH_STYLES).not.toContain('min-width: 520px');
    expect(WORKBENCH_STYLES).not.toContain('max-width: 860px');
    expect(WORKBENCH_STYLES).not.toContain('min-height: 360px');
    expect(WORKBENCH_STYLES).not.toContain('max-height: 80vh');
    expect(WORKBENCH_STYLES).not.toContain('border-radius: calc(var(--nv-grid) * 1.5)');
    expect(WORKBENCH_STYLES).not.toMatch(/0 24px 60px/);
  });

  it('keeps exactly one shell.overlay body plus the floating circular launch entry, never a single slot', async () => {
    const { entry, registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    expect(entry.inject).toEqual(['slots', 'remote']);
    expect(Object.keys(registrations).sort()).toEqual(['shell.overlay']);
    expect(registrations['shell.overlay']).toHaveLength(1);
    expect(registrations['shell.overlay'][0].options).toMatchObject({ id: 'novel-creation-tool-workspace', label: '创作台' });
    // 禁止接管 root/sidebar/conversation/details 单槽（D20）。
    for (const single of ['root', 'sidebar', 'conversation', 'details']) {
      expect(registrations[single]).toBeUndefined();
    }
  });
});

describe('I58 任务型创作台信息架构 (R12-5)', () => {
  const navGroupOf = (tree: FakeNode, id: string): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-nav-group'] === id);
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const viewPanelOf = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'div').find((node) => node.props?.['data-novel-view-panel'] === view);
  const routeOf = (tree: FakeNode): unknown => tree.props?.['data-novel-route'];

  it('renders the four task groups with the exact migration mapping (六层 + 初始化 + 设置页不丢失)', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    // 四组及组标签（写作/策划/连续性/作品设置）。
    expect(['writing', 'planning', 'continuity', 'settings'].every((id) => navGroupOf(tree, id) !== undefined)).toBe(true);
    expect(String(((navGroupOf(tree, 'writing')?.children?.[0] as FakeNode | undefined)?.children?.[0] ?? ''))).toBe('写作');
    expect(String(((navGroupOf(tree, 'planning')?.children?.[0] as FakeNode | undefined)?.children?.[0] ?? ''))).toBe('策划');
    expect(String(((navGroupOf(tree, 'continuity')?.children?.[0] as FakeNode | undefined)?.children?.[0] ?? ''))).toBe('连续性');
    expect(String(((navGroupOf(tree, 'settings')?.children?.[0] as FakeNode | undefined)?.children?.[0] ?? ''))).toBe('作品设置');
    // 迁移映射：写作={大纲,进度与灵感,正文,审校中心,生成队列,搜索与追踪,写作进度} 策划={角色,世界观,规则与文风} 连续性={关系,状态,正史,知情} 设置={初始化,创作设置,导入导出与备份,LLM 设置}。
    const itemsOf = (group: FakeNode | undefined): unknown[] => collect(group, 'button').filter((n) => n.props?.['data-novel-view'] !== undefined).map((n) => n.props?.['data-novel-view']);
    expect(itemsOf(navGroupOf(tree, 'writing'))).toEqual(['outline', 'progress', 'chapters', 'review', 'queue', 'search', 'statistics']);
    expect(itemsOf(navGroupOf(tree, 'planning'))).toEqual(['characters', 'worldview', 'timeline', 'ruleStyle']);
    expect(itemsOf(navGroupOf(tree, 'continuity'))).toEqual(['relationship', 'state', 'canon', 'knowledge']);
    expect(itemsOf(navGroupOf(tree, 'settings'))).toEqual(['onboarding', 'creationSettings', 'importExport', 'settings']);
  });

  it('navigates to every existing panel through the grouped nav with the stable data anchor', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const views = ['outline', 'progress', 'chapters', 'review', 'queue', 'search', 'statistics', 'characters', 'worldview', 'timeline', 'ruleStyle', 'relationship', 'state', 'canon', 'knowledge', 'onboarding', 'creationSettings', 'importExport', 'settings'];
    for (const view of views) {
      const button = navButton(render(), view);
      expect(button, `nav button for ${view}`).toBeDefined();
      (button?.props?.onClick as () => void)();
      await flush();
      const tree = render();
      expect(routeOf(tree), `route anchor for ${view}`).toBe(view);
      expect(viewPanelOf(tree, view), `view panel for ${view}`).toBeDefined();
    }
    // 层视图仍渲染真面板（data-novel-layer-panel + ready），非空态占位。
    for (const layer of ['characters', 'worldview', 'outline', 'relationship', 'state', 'canon']) {
      (navButton(render(), layer)?.props?.onClick as () => void)();
      await flush();
      const panel = collect(render(), 'section').find((n) => n.props?.['data-novel-layer-panel'] === layer);
      expect(panel?.props?.['data-novel-layer-state'], `layer panel ${layer} ready`).toBe('ready');
    }
  });

  it('keeps editor drafts while switching views (状态不丢)', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    // 默认在角色层：编辑新建草稿的名字。
    const nameInput = () => collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput()?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara' } });
    expect((nameInput()?.props?.value)).toBe('Mara');
    // 切到正史（连续性组）再切回角色层：草稿保留。
    (navButton(render(), 'canon')?.props?.onClick as () => void)();
    await flush();
    expect(routeOf(render())).toBe('canon');
    (navButton(render(), 'characters')?.props?.onClick as () => void)();
    await flush();
    expect(routeOf(render())).toBe('characters');
    expect((nameInput()?.props?.value)).toBe('Mara');
  });

  it('keeps a legal active view across collapse/expand (折叠不丢 view)', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'canon')?.props?.onClick as () => void)();
    await flush();
    expect(routeOf(render())).toBe('canon');
    // 折叠 → 展开：active view 与面板均保持。
    const collapse = collect(render(), 'button').find((n) => n.props?.['aria-expanded'] !== undefined);
    (collapse?.props?.onClick as () => void)();
    expect(collect(render(), 'nav')).toHaveLength(0);
    (collapse?.props?.onClick as () => void)();
    await flush();
    expect(routeOf(render())).toBe('canon');
    expect(viewPanelOf(render(), 'canon')).toBeDefined();
  });

  it('retires the nine-item flat navigation: grouped sections only, zero old markers', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    // 所有导航项都归属某个组 section，不存在脱离分组的扁平九项。
    const nav = collect(tree, 'nav').find((n) => n.props?.['data-novel-nav'] !== undefined);
    const navItems = collect(nav, 'button').filter((n) => n.props?.['data-novel-view'] !== undefined);
    const grouped = navItems.filter((n) => collect(nav, 'section').some((s) => s.props?.['data-novel-nav-group'] !== undefined && collect(s, 'button').includes(n)));
    expect(grouped).toHaveLength(19);
    // 源码零引用：旧扁平导航 aria-label 与四互斥页签状态字段全部退役。
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const client = readFileSync(resolve(root, 'src/client.ts'), 'utf8');
    const navSource = readFileSync(resolve(root, 'src/client/nav.ts'), 'utf8');
    expect(client).not.toContain('创作台层级');
    expect(client).not.toContain('showOnboarding');
    expect(client).not.toContain('showCreationSettings');
    for (const label of ['写作', '策划', '连续性', '作品设置']) {
      expect(navSource).toContain(`label: '${label}'`);
    }
  });
});

describe('I58 导航模型 resolveWorkbenchView（刷新/重开保持合法 active view）', () => {
  it('converges unknown or stale views to a legal default and keeps legal views', async () => {
    const { NAV_GROUPS, NAV_ITEMS, resolveWorkbenchView, isWorkbenchViewId, isStableView } = await import('./client/nav.js');
    expect(NAV_ITEMS).toHaveLength(19);
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['writing', 'planning', 'continuity', 'settings']);
    // 非法/陈旧/空值一律回退默认视图（characters）。
    expect(resolveWorkbenchView('bogus-view')).toBe('characters');
    expect(resolveWorkbenchView(undefined)).toBe('characters');
    expect(resolveWorkbenchView(null)).toBe('characters');
    expect(resolveWorkbenchView(42)).toBe('characters');
    expect(isWorkbenchViewId('bogus-view')).toBe(false);
    // 合法视图原样保留。
    for (const view of NAV_ITEMS.map((item) => item.view)) {
      expect(isWorkbenchViewId(view)).toBe(true);
      expect(resolveWorkbenchView(view)).toBe(view);
    }
    // 技术层编号只作徽标：十个层/正文项有 badge，非层视图无 badge。
    const badges = NAV_ITEMS.filter((item) => item.badge !== undefined).map((item) => item.badge);
    expect(badges).toEqual(['B5', 'C6', 'C5', 'B3', 'B2', 'B1/B4', 'C1', 'C2', 'C4', 'C3']);
    const noBadge = NAV_ITEMS.filter((item) => item.badge === undefined).map((item) => item.view);
    expect(noBadge).toEqual(['review', 'queue', 'search', 'statistics', 'timeline', 'onboarding', 'creationSettings', 'importExport', 'settings']);
    // I60/I64/I65/I66/I67/I68/I69/I71/I72：层视图、正文视图、审校中心、生成队列、知情、规则/文风、进度/灵感、导入导出、搜索与写作进度视图是稳定视图（重复点击保持），设置类视图回退默认。
    expect(isStableView('chapters')).toBe(true);
    expect(isStableView('review')).toBe(true);
    expect(isStableView('queue')).toBe(true);
    expect(isStableView('search')).toBe(true);
    expect(isStableView('statistics')).toBe(true);
    expect(isStableView('timeline')).toBe(true);
    expect(isStableView('knowledge')).toBe(true);
    expect(isStableView('ruleStyle')).toBe(true);
    expect(isStableView('progress')).toBe(true);
    expect(isStableView('importExport')).toBe(true);
    expect(isStableView('characters')).toBe(true);
    expect(isStableView('settings')).toBe(false);
  });
});

describe('I59 响应式、可访问性与保存反馈 (R12-6)', () => {
  // ---- 样式：focus-visible / 无裸 outline:none / 响应式断点 / 明暗回归 ----
  it('提供 :focus-visible 焦点环且无裸 outline:none；暗色主题随 token 提亮', () => {
    expect(WORKBENCH_STYLES).toContain('.nv-workbench :focus-visible');
    expect(WORKBENCH_STYLES).toContain('outline: 2px solid var(--nv-cinnabar)');
    expect(WORKBENCH_STYLES).toContain('outline-offset: 2px');
    // 唯一允许的 outline:none 只出现在 :focus:not(:focus-visible)（纯鼠标聚焦替代）。
    const occurrences = WORKBENCH_STYLES.match(/outline:\s*none/g) ?? [];
    expect(occurrences).toHaveLength(1);
    expect(WORKBENCH_STYLES).toContain(':focus:not(:focus-visible)');
    // 输入框鼠标聚焦仍有替代焦点指示（朱砂边框）。
    expect(WORKBENCH_STYLES).toContain('.nv-field__input:focus');
    expect(WORKBENCH_STYLES).toContain('border-color: var(--nv-cinnabar)');
    // 明暗主题回归：焦点环消费 --nv-cinnabar，暗色规则仍翻转该 token。
    expect(WORKBENCH_STYLES).toContain('body[data-ds-dark-theme] .nv-workbench');
    expect(WORKBENCH_STYLES).toContain(`--nv-cinnabar: ${CINNABAR_DARK}`);
  });

  it('声明响应式断点：窄屏纵向堆叠 + 导航横向滚动（无不可达内容），仍同一 Slot', async () => {
    const { RESPONSIVE_BREAKPOINT_NAV, RESPONSIVE_BREAKPOINT_COMPACT } = await import('./client/styles.js');
    expect(RESPONSIVE_BREAKPOINT_NAV).toBeLessThan(860); // 窄于停靠侧板默认宽度
    expect(RESPONSIVE_BREAKPOINT_NAV).toBeGreaterThan(RESPONSIVE_BREAKPOINT_COMPACT);
    expect(WORKBENCH_STYLES).toContain(`@media (max-width: ${RESPONSIVE_BREAKPOINT_NAV}px)`);
    expect(WORKBENCH_STYLES).toContain(`@media (max-width: ${RESPONSIVE_BREAKPOINT_COMPACT}px)`);
    // 左右分栏改为纵向堆叠。
    expect(WORKBENCH_STYLES).toMatch(/\.nv-workbench__body-row \{\s*\n\s*flex-direction: column;/);
    expect(WORKBENCH_STYLES).toMatch(/\.nv-editor__columns,\s*\n\s*\.nv-outline__columns \{\s*\n\s*flex-direction: column;/);
    // 导航退化为横向滚动横条（窄屏可达）。
    expect(WORKBENCH_STYLES).toMatch(/\.nv-workbench__nav \{[^}]*overflow-x: auto/);
    // 主列仍纵向滚动（内容不被裁切）。
    expect(WORKBENCH_STYLES).toMatch(/\.nv-workbench__main \{[^}]*overflow-y: auto/);
    // 窄屏仍由同一 shell.overlay Slot 管理：client.ts 只注册一个 overlay。
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const client = readFileSync(resolve(root, 'src/client.ts'), 'utf8');
    expect(client.match(/slots\.inject\('shell\.overlay'/g) ?? []).toHaveLength(1);
  });

  // ---- focus 模块：焦点进入/恢复的 DOM 行为与降级 ----
  it('focusSelector 命中即聚焦，无 DOM/不可聚焦时安全 no-op', async () => {
    const { focusSelector, safeDocument, scheduleFocus } = await import('./client/focus.js');
    delete (globalThis as unknown as { document?: unknown }).document;
    expect(safeDocument()).toBeUndefined();
    expect(focusSelector('[data-novel-launch]')).toBe(false);
    // 命中可聚焦节点 → 聚焦并返回 true。
    let captured = '';
    let focused = false;
    (globalThis as unknown as { document: unknown }).document = {
      querySelector: (selector: string) => { captured = selector; return { focus() { focused = true; } }; },
    } as Document;
    expect(focusSelector('[data-novel-launch]')).toBe(true);
    expect(captured).toBe('[data-novel-launch]');
    expect(focused).toBe(true);
    // 命中但不可聚焦 → no-op。
    (globalThis as unknown as { document: unknown }).document = { querySelector: () => ({}) } as unknown as Document;
    expect(focusSelector('[data-novel-launch]')).toBe(false);
    // scheduleFocus 在无定时器/无 DOM 下静默不抛。
    expect(() => scheduleFocus('[data-novel-focus-target]')).not.toThrow();
  });

  // ---- 键盘：Esc 与焦点锚点（mounted）----
  it('键盘可遍历：所有交互入口都是原生可聚焦标签（button/input/select/textarea），onClick 不挂在 div/li/section 上', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    const tags = clickableTags(tree);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((tag) => ['button', 'input', 'select', 'textarea', 'a'].includes(tag))).toBe(true);
    const nav = collect(tree, 'nav').find((n) => n.props?.['data-novel-nav'] !== undefined);
    expect(clickableTags(nav).every((tag) => tag === 'button')).toBe(true);
  });

  it('Esc 先取消脏表单离开确认，否则关闭面板；品牌头栏为焦点进入落点', async () => {
    const ALPHA = { id: 'alpha', name: 'Alpha' };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [ALPHA],
        projectOpen: async () => ({ project: ALPHA, layers: { characters: 'empty', worldview: 'empty', outline: 'uninitialized', relationship: 'empty', state: 'ready', canon: 'empty' } }),
      },
      { openProjectId: 'alpha' },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const scope = () => collect(render(), 'section').find((n) => n.props?.['data-novel-focus-scope'] === '');
    const esc = () => (scope()?.props?.onKeyDown as ((event: { key: string; preventDefault(): void }) => void) | undefined);
    // 焦点进入落点：品牌头栏 tabIndex=-1 + data-novel-focus-target。
    const brand = collect(render(), 'header').find((n) => n.props?.['data-novel-focus-target'] === '');
    expect(brand?.props?.tabIndex).toBe(-1);
    expect(scope()).toBeDefined();
    // 脏表单 → 返回作品列表 → Esc 取消离开确认，仍留在当前作品。
    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Dirty' } });
    (collect(render(), 'button').find((n) => n.props?.['data-novel-back-to-projects'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((n) => n.props?.['data-novel-leave-confirm'] !== undefined)).toBe(true);
    esc()?.({ key: 'Escape', preventDefault: () => {} });
    await flush();
    expect(collect(render(), 'div').some((n) => n.props?.['data-novel-leave-confirm'] !== undefined)).toBe(false);
    expect(render().props?.['data-novel-project-open']).toBe('alpha');
    // 无离开确认时 Esc 关闭面板：overlay 退回悬浮圆形入口（隐藏自己），焦点恢复锚点 data-novel-launch 保留。
    esc()?.({ key: 'Escape', preventDefault: () => {} });
    const closed = render();
    expect(closed.tag).toBe('button');
    expect(closed.props?.['data-novel-launch']).toBe('');
    expect(String(closed.props?.['className'] ?? '')).toContain('nv-launch');
  });

  // ---- 保存状态 + aria-live + 请求去重（mounted）----
  it('LLM 设置：保存中/已保存状态可播报（aria-live），双击至多一次 Remote', async () => {
    const saves: Array<{ input: unknown }> = [];
    let resolveSave: ((value: unknown) => void) | undefined;
    const savePromise = new Promise((resolve) => { resolveSave = resolve; });
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        llmConfig: {
          load: async () => ({ providerId: 'novel-custom', baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', hasKey: true, maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high' }),
          save: async (input) => { saves.push({ input }); return savePromise; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const saveButton = () => collect(render(), 'button').find((node) => node.props?.['data-novel-llm-save'] === '');
    // 双击同一按钮：至多一次 Remote（R12-6 防重复提交）。
    (saveButton()?.props?.onClick as () => void)();
    (saveButton()?.props?.onClick as () => void)();
    expect(saves).toHaveLength(1);
    // 保存中：按钮忙碌文案 + disabled + saving 状态行（role=status + aria-live=polite）。
    expect(String(saveButton()?.children?.[0] ?? '')).toBe('保存中…');
    expect(saveButton()?.props?.disabled).toBe(true);
    const savingLine = collect(render(), 'p').find((node) => node.props?.['data-novel-save-status'] === 'llm');
    expect(savingLine?.props?.['data-novel-save-state']).toBe('saving');
    expect(savingLine?.props?.role).toBe('status');
    expect(savingLine?.props?.['aria-live']).toBe('polite');
    // 保存成功：已保存状态行可播报，既有 data-novel-llm-message 锚点保留。
    resolveSave?.({ ok: true, value: { ok: true, modelRef: 'novel-custom/gpt-4o' } });
    await flush();
    const savedLine = collect(render(), 'p').find((node) => node.props?.['data-novel-save-status'] === 'llm');
    expect(savedLine?.props?.['data-novel-save-state']).toBe('saved');
    expect(savedLine?.props?.['aria-live']).toBe('polite');
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-llm-message'] !== undefined)).toBe(true);
  });

  it('角色层：保存中 busy + 已保存状态行，双击至多一次 characterCreate', async () => {
    const creates: Array<{ projectId: string; input: unknown }> = [];
    let resolveCreate: ((value: unknown) => void) | undefined;
    const createPromise = new Promise((resolve) => { resolveCreate = resolve; });
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        characterList: async () => [],
        characterCreate: async (projectId, input) => { creates.push({ projectId, input }); return createPromise; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara' } });
    const saveButton = () => collect(render(), 'button').find((node) => node.props?.['data-novel-character-save'] === '');
    (saveButton()?.props?.onClick as () => void)();
    (saveButton()?.props?.onClick as () => void)();
    expect(creates).toHaveLength(1);
    expect(String(saveButton()?.children?.[0] ?? '')).toBe('保存中…');
    expect(saveButton()?.props?.disabled).toBe(true);
    const savingLine = collect(render(), 'p').find((node) => node.props?.['data-novel-save-status'] === 'characters');
    expect(savingLine?.props?.['data-novel-save-state']).toBe('saving');
    expect(savingLine?.props?.['aria-live']).toBe('polite');
    // 保存成功 → 已保存状态行。
    resolveCreate?.({ id: 'mara', name: 'Mara', aliases: [], kind: 'protagonist' });
    await flush();
    const savedLine = collect(render(), 'p').find((node) => node.props?.['data-novel-save-status'] === 'characters');
    expect(savedLine?.props?.['data-novel-save-state']).toBe('saved');
    expect(String(savedLine?.children?.[0] ?? '')).toBe('已保存');
  });

  it('六层 apply：应用中忙碌，双击至多一次 finalApply；结果 dl 可播报', async () => {
    let finalApplies = 0;
    let resolveApply: ((value: unknown) => void) | undefined;
    const applyPromise = new Promise((resolve) => { resolveApply = resolve; });
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: analyzerStub(I56_LAYERS),
        onboarding: {
          adjudicate: async () => ({ id: 'proposal-1', status: 'accepted' }),
          finalApply: async () => { finalApplies += 1; return applyPromise; },
        },
      },
    );
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const clickVerdict = (layer: string, decision: string) => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      (button?.props?.onClick as () => void)();
    };
    clickVerdict('characters', 'accept');
    await flush();
    for (const layer of ['worldview', 'outline', 'relationship', 'state', 'canon']) {
      clickVerdict(layer, 'skip');
      await flush();
    }
    const apply = () => collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-apply'] === '');
    expect(apply()?.props?.disabled).toBe(false);
    // 双击 apply：至多一次 finalApply，按钮进入应用中忙碌态。
    (apply()?.props?.onClick as () => void)();
    (apply()?.props?.onClick as () => void)();
    expect(finalApplies).toBe(1);
    expect(String(apply()?.children?.[0] ?? '')).toBe('应用中…');
    expect(apply()?.props?.disabled).toBe(true);
    // 应用完成（无 blocked/pending/retryable）→ 离开审阅并刷新作品；结果 dl 带 aria-live。
    resolveApply?.({ projectId: 'fixture-project', onboardingSessionId: 'sess-1', appliedLayers: ['characters'], skippedLayers: ['worldview', 'outline', 'relationship', 'state', 'canon'], blockedLayers: [], pendingLayers: [], retryable: false, errors: [] });
    await flush();
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-onboarding-apply'] === '')).toBe(false);
  });

  it('分析 busy 面板可播报：aria-live + aria-busy + role=status，并随 Fiber 清理', async () => {
    const { registrations, overlayCleanups } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: {
          begin: async () => ({ onboardingSessionId: 'sess-1' }),
          status: async () => 'running',
          result: async () => ({}),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    const textarea = collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');
    const start = collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
    (start?.props?.onClick as () => void)();
    await flush();
    const busy = collect(render(), 'section').find((node) => node.props?.['data-novel-analysis-busy'] !== undefined);
    expect(busy?.props?.['aria-live']).toBe('polite');
    expect(busy?.props?.['aria-busy']).toBe('true');
    const status = collect(render(), 'p').find((node) => node.props?.['data-novel-analysis-status'] !== undefined);
    expect(status?.props?.role).toBe('status');
    // Fiber 清理：轮询定时器随卸载归零（不残留监听）。
    overlayCleanups[0]();
    await flush();
  });
});

/** I59：深度遍历所有带 onClick 的节点，返回其标签（键盘可遍历断言用）。 */
function clickableTags(node: unknown): string[] {
  const out: string[] = [];
  const visit = (current: unknown): void => {
    if (current == null || typeof current !== 'object') return;
    if (Array.isArray(current)) { for (const item of current) visit(item); return; }
    const n = current as FakeNode;
    if (n.props?.onClick !== undefined) out.push(n.tag);
    for (const child of n.children ?? []) visit(child);
  };
  visit(node);
  return out;
}

