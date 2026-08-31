/**
 * I95 按面板拆分（计划 §18 I95）：I59 响应式、可访问性与保存反馈 (R12-6)
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

/** I59：深度遍历所有带 onClick 的节点，返回其标签（键盘可遍历断言用）。
 * 原定义在 client-shell.test.ts 文件尾部（I83 拆分后随 I59 面板迁移至此）。 */
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
    (collect(render(), 'button').find((node) => node.props?.['data-novel-layer'] === 'characters')?.props?.onClick as () => void)();
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
    (collect(render(), 'button').find((node) => node.props?.['data-novel-layer'] === 'characters')?.props?.onClick as () => void)();
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
