/**
 * I95 按面板拆分（计划 §18 I95）：I54 右侧停靠侧板（D20 / §14.8 / R12-1）
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
