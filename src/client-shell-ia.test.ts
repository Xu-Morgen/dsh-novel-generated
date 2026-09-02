/**
 * I95 按面板拆分（计划 §18 I95）：I58 任务型创作台信息架构 (R12-5)
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
describe('I58 任务型创作台信息架构 (R12-5)', () => {
  const navGroupOf = (tree: FakeNode, id: string): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-nav-group'] === id);
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const viewPanelOf = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'div').find((node) => node.props?.['data-novel-view-panel'] === view);
  const routeOf = (tree: FakeNode): unknown => tree.props?.['data-novel-route'];

  it('renders the four task groups with the author workflow and preserved capability mapping', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    const itemsOf = (group: FakeNode | undefined): unknown[] => collect(group, 'button').filter((n) => n.props?.['data-novel-view'] !== undefined).map((n) => n.props?.['data-novel-view']);
    // 四组及组标签（创作流程/故事资料/进阶工具/设置）。
    expect(['workflow', 'story', 'advanced', 'settings'].every((id) => navGroupOf(tree, id) !== undefined)).toBe(true);
    expect(String(((navGroupOf(tree, 'workflow')?.children?.[0] as FakeNode | undefined)?.children?.[0] ?? ''))).toBe('创作流程');
    expect(String(((navGroupOf(tree, 'story')?.children?.[0] as FakeNode | undefined)?.children?.[0] ?? ''))).toBe('故事资料');
    expect(String(((navGroupOf(tree, 'advanced')?.children?.[0] as FakeNode | undefined)?.children?.[0] ?? ''))).toBe('进阶工具');
    expect(String(((navGroupOf(tree, 'settings')?.children?.[0] as FakeNode | undefined)?.children?.[0] ?? ''))).toBe('设置');
    // 主流程独占 workflow；旧 onboarding 仅保留 deep-link route，不再进入导航。
    expect(itemsOf(navGroupOf(tree, 'workflow'))).toEqual(['workflow']);
    expect(itemsOf(navGroupOf(tree, 'story'))).toEqual(['characters', 'worldview', 'relationship', 'state', 'canon', 'knowledge', 'timeline', 'ruleStyle']);
    expect(itemsOf(navGroupOf(tree, 'advanced'))).toEqual(['outline', 'chapters', 'review', 'queue', 'search', 'statistics', 'progress', 'importExport']);
    expect(itemsOf(navGroupOf(tree, 'settings'))).toEqual(['creationSettings', 'settings']);
  });

  it('navigates to every existing panel through the grouped nav with the stable data anchor', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const views = ['outline', 'progress', 'chapters', 'review', 'queue', 'search', 'statistics', 'characters', 'worldview', 'timeline', 'ruleStyle', 'relationship', 'state', 'canon', 'knowledge', 'creationSettings', 'importExport', 'settings'];
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
    // 进入故事资料的角色层：编辑新建草稿的名字。
    (navButton(render(), 'characters')?.props?.onClick as () => void)();
    await flush();
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
    for (const label of ['创作流程', '故事资料', '进阶工具', '设置']) {
      expect(navSource).toContain(`label: '${label}'`);
    }
  });
});
