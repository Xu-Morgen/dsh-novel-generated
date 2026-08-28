/**
 * I95 按面板拆分（计划 §18 I95）：I46 visual system and Fiber cleanup (R10-2 / R10-3)
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
