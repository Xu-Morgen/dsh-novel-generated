/**
 * I95 按面板拆分（计划 §18 I95）：I58 导航模型 resolveWorkbenchView（刷新/重开保持合法 active view）
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
describe('I58 导航模型 resolveWorkbenchView（刷新/重开保持合法 active view）', () => {
  it('converges unknown or stale views to a legal default and keeps legal views', async () => {
    const { NAV_GROUPS, NAV_ITEMS, resolveWorkbenchView, isWorkbenchViewId, isStableView } = await import('./client/nav.js');
    expect(NAV_ITEMS).toHaveLength(19);
    expect(NAV_GROUPS.map((g) => g.id)).toEqual(['workflow', 'story', 'advanced', 'settings']);
    // 非法/陈旧/空值一律回退默认视图（workflow）。
    expect(resolveWorkbenchView('bogus-view')).toBe('workflow');
    expect(resolveWorkbenchView(undefined)).toBe('workflow');
    expect(resolveWorkbenchView(null)).toBe('workflow');
    expect(resolveWorkbenchView(42)).toBe('workflow');
    expect(isWorkbenchViewId('bogus-view')).toBe(false);
    // 合法视图原样保留。
    for (const view of NAV_ITEMS.map((item) => item.view)) {
      expect(isWorkbenchViewId(view)).toBe(true);
      expect(resolveWorkbenchView(view)).toBe(view);
    }
    // I159：旧 route ID 只用于 deep-link 收敛，不再出现在进阶导航。
    expect(isWorkbenchViewId('onboarding')).toBe(true);
    expect(resolveWorkbenchView('onboarding')).toBe('onboarding');
    // 技术层编号只作徽标：十个层/正文项有 badge，非层视图无 badge。
    const badges = NAV_ITEMS.filter((item) => item.badge !== undefined).map((item) => item.badge);
    expect(badges).toEqual(['B3', 'B2', 'C1', 'C2', 'C4', 'C3', 'B1/B4', 'B5', 'C5', 'C6']);
    const noBadge = NAV_ITEMS.filter((item) => item.badge === undefined).map((item) => item.view);
    expect(noBadge).toEqual(['workflow', 'timeline', 'review', 'queue', 'search', 'statistics', 'importExport', 'creationSettings', 'settings']);
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
    expect(isStableView('workflow')).toBe(true);
    expect(isStableView('settings')).toBe(false);
  });
});
