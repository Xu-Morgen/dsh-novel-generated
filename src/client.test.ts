import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { afterEach, describe, expect, it } from 'vitest';
import factory from './client.js';
import { CINNABAR, CINNABAR_DARK, GRID, SERIF_STACK, WORKBENCH_STYLES } from './client/styles.js';

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { root: { kind: 'single'; scope: 'root' }; }
}

interface FakeNode { tag: string; props: Record<string, unknown> | null; children: unknown[]; }

/** Fake React: `createElement` only — any JSX runtime use would fail to compile/run. */
const fakeReact = {
  createElement: (tag: string, props: Record<string, unknown> | null, ...children: unknown[]): FakeNode =>
    ({ tag, props, children }),
};

/** Overridable subset of the `novelWorkspace` remote for I47/I48/I49 round-trip tests. */
interface WorkspaceOverrides {
  characterList?: () => Promise<unknown[]>;
  characterCreate?: (projectId: string, input: unknown) => Promise<unknown>;
  characterUpdate?: (projectId: string, id: string, patch: unknown) => Promise<unknown>;
  worldviewList?: () => Promise<unknown[]>;
  worldviewCreate?: (projectId: string, input: unknown) => Promise<unknown>;
  worldviewRewrite?: (projectId: string, id: string, input: unknown) => Promise<unknown>;
  outlineRead?: (projectId: string) => Promise<unknown>;
  outlineSave?: (projectId: string, input: unknown) => Promise<unknown>;
  relationshipRead?: (projectId: string) => Promise<unknown[]>;
  relationshipSave?: (projectId: string, input: unknown) => Promise<unknown>;
  stateSnapshots?: (projectId: string) => Promise<unknown[]>;
  stateRollback?: (projectId: string, seq: number) => Promise<unknown>;
  stateDiff?: (projectId: string, fromSeq: number, toSeq: number) => Promise<unknown>;
  canonQuery?: (projectId: string) => Promise<unknown[]>;
  canonCorrectionPropose?: (projectId: string, targetId: string, input: unknown) => Promise<unknown>;
  canonCorrectionAccept?: (projectId: string, proposalId: string) => Promise<unknown>;
}

/** Full `novelWorkspace` remote stub so render-time loads do not throw. */
const makeWorkspace = (viewModel: () => Promise<unknown>, overrides: WorkspaceOverrides = {}) => ({
  viewModel,
  characterList: overrides.characterList ?? (async () => []),
  characterRead: async () => ({}),
  characterCreate: overrides.characterCreate ?? (async () => ({})),
  characterUpdate: overrides.characterUpdate ?? (async () => ({})),
  worldviewList: overrides.worldviewList ?? (async () => []),
  worldviewRead: async () => ({}),
  worldviewCreate: overrides.worldviewCreate ?? (async () => ({})),
  worldviewRewrite: overrides.worldviewRewrite ?? (async () => ({})),
  outlineRead: overrides.outlineRead ?? (async () => ({ id: 'outline', structure: 'free', logline: '', themes: [], acts: [], foreshadowing: [], endings: [] })),
  outlineSave: overrides.outlineSave ?? (async () => ({})),
  outlineBeatCards: async () => [],
  relationshipRead: overrides.relationshipRead ?? (async () => []),
  relationshipSave: overrides.relationshipSave ?? (async () => ({})),
  stateCurrent: async () => ({}),
  stateSnapshots: overrides.stateSnapshots ?? (async () => []),
  stateRollback: overrides.stateRollback ?? (async () => ({})),
  stateDiff: overrides.stateDiff ?? (async () => ({ fromSeq: 0, toSeq: 0, changes: [] })),
  canonQuery: overrides.canonQuery ?? (async () => []),
  canonCorrectionPropose: overrides.canonCorrectionPropose ?? (async () => ({})),
  canonCorrectionAccept: overrides.canonCorrectionAccept ?? (async () => ({})),
});

const READY_MODEL = {
  product: 'novel-creation-tool' as const,
  version: '2.0.0' as const,
  ready: true as const,
  capabilities: ['generate', 'rewrite', 'continue', 'inspire'] as const,
};

/** Depth-first collect of every element whose tag matches `tag`. */
function collect(node: unknown, tag: string): FakeNode[] {
  const out: FakeNode[] = [];
  const visit = (current: unknown): void => {
    if (current == null || typeof current !== 'object') return;
    if (Array.isArray(current)) { for (const item of current) visit(item); return; }
    const n = current as FakeNode;
    if (n.tag === tag) out.push(n);
    for (const child of n.children ?? []) visit(child);
  };
  visit(node);
  return out;
}

/** Collect every element carrying `data-novel-layer`. */
function layerButtons(node: unknown): FakeNode[] {
  const out: FakeNode[] = [];
  const visit = (current: unknown): void => {
    if (current == null || typeof current !== 'object') return;
    if (Array.isArray(current)) { for (const item of current) visit(item); return; }
    const n = current as FakeNode;
    if (n.props?.['data-novel-layer'] !== undefined) out.push(n);
    for (const child of n.children ?? []) visit(child);
  };
  visit(node);
  return out;
}

/**
 * Mount the Client plugin against a minimal fake runtime: fake React, fake DOM,
 * fake slots/remote/effect. Returns everything a test needs to drive state and
 * assert Fiber-unload cleanup (Slot/样式/监听归零, R10-3).
 */
function mount(viewModel: () => Promise<unknown>, overrides: WorkspaceOverrides = {}) {
  const registrations: Record<string, Array<{ options: Record<string, unknown>; component: () => unknown }>> = {};
  const overlayCleanups: Array<() => void> = [];
  const footerCleanups: Array<() => void> = [];
  const styleEffects: Array<() => void> = [];
  const styleNodes: Array<{ attrs: Record<string, string>; textContent: string; removed: boolean }> = [];

  const fakeDocument = {
    createElement(tag: string) {
      const node = { tag, attrs: {} as Record<string, string>, textContent: '', removed: false,
        setAttribute(name: string, value: string) { this.attrs[name] = value; },
        remove() { this.removed = true; } };
      return node;
    },
    head: { appendChild(node: unknown) { styleNodes.push(node as never); } },
  };
  (globalThis as unknown as { document: unknown }).document = fakeDocument;

  const slots = {
    inject(key: string, cb: () => () => void) {
      const dispose = cb() ?? (() => {});
      (key === 'shell.overlay' ? overlayCleanups : footerCleanups).push(dispose);
      return () => {};
    },
    register(options: Record<string, unknown>, component: () => unknown) {
      const name = options.name as string;
      (registrations[name] ??= []).push({ options, component });
      return () => {
        const list = registrations[name];
        const index = list.findIndex((entry) => entry.component === component);
        if (index >= 0) list.splice(index, 1);
      };
    },
  };
  const effect = (cb: () => (() => void) | void) => {
    styleEffects.push(cb() ?? (() => {}));
    return () => {};
  };
  const workspace = makeWorkspace(viewModel, overrides);
  const remote = { $mount: async () => async () => {} };
  const get = (name: string) => (name === 'remote.novelWorkspace' ? workspace : undefined);
  const entry = factory((spec) => (spec === 'react' ? fakeReact : undefined));
  entry.apply({ slots, remote, get, effect } as never);
  return { entry, registrations, overlayCleanups, footerCleanups, styleEffects, styleNodes };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) { await Promise.resolve(); }
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  for (let i = 0; i < 8; i += 1) { await Promise.resolve(); }
};

afterEach(() => { delete (globalThis as unknown as { document?: unknown }).document; });

describe('I46 创作台 workbench shell', () => {
  it('registers the overlay panel and a discoverable sidebar launch entry, never a single slot', async () => {
    const { entry, registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    expect(entry.inject).toEqual(['slots', 'remote']);
    expect(Object.keys(registrations).sort()).toEqual(['shell.overlay', 'sidebar.footer.action']);
    // 不替换 root/sidebar/conversation/details 单槽（D11）。
    for (const single of ['root', 'sidebar', 'conversation', 'details']) {
      expect(registrations[single]).toBeUndefined();
    }
    expect(registrations['shell.overlay']).toHaveLength(1);
    expect(registrations['shell.overlay'][0].options).toMatchObject({ id: 'novel-creation-tool-workspace', label: '创作台' });
    expect(registrations['sidebar.footer.action'][0].options).toMatchObject({ id: 'novel-creation-tool-workspace', label: '创作台' });
  });

  it('renders the brand header and six-layer navigation in the ready state', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    expect(tree.props?.['data-novel-workspace']).toBe('ready');
    expect(collect(tree, 'header').some((n) => n.props?.['data-novel-brand'] !== undefined)).toBe(true);
    expect(collect(tree, 'h2').some((n) => (n.children ?? []).includes('创作台'))).toBe(true);
    expect(layerButtons(tree).map((n) => n.props?.['data-novel-layer'])).toEqual([
      'characters', 'worldview', 'outline', 'relationship', 'state', 'canon',
    ]);
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

  it('collapses and closes the panel, and the launch entry reopens it', async () => {
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
    expect(renderOverlay()).toBeNull();

    // 侧栏启动入口重新打开面板。
    const launch = registrations['sidebar.footer.action'][0].component() as FakeNode;
    expect(launch.tag).toBe('button');
    expect(launch.props?.['data-novel-launch']).toBe('');
    (launch.props?.onClick as () => void)();
    expect(renderOverlay()).not.toBeNull();
    expect((renderOverlay() as FakeNode).props?.['data-novel-workspace']).toBe('ready');
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

  it('withdraws both Slot registrations when the Fiber unloads', async () => {
    const { registrations, overlayCleanups, footerCleanups } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    overlayCleanups[0]();
    footerCleanups[0]();
    expect(registrations['shell.overlay']).toHaveLength(0);
    expect(registrations['sidebar.footer.action']).toHaveLength(0);
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

describe('I47 B3/B2 真表单 (R10-4)', () => {
  /** Find the first element with the given data attribute value. */
  const byData = (tree: FakeNode, attr: string, value: string): FakeNode | undefined => {
    let found: FakeNode | undefined;
    const visit = (current: unknown): void => {
      if (found || current == null || typeof current !== 'object') return;
      if (Array.isArray(current)) { for (const item of current) visit(item); return; }
      const n = current as FakeNode;
      if (n.props?.[attr] === value) { found = n; return; }
      for (const child of n.children ?? []) visit(child);
    };
    visit(tree);
    return found;
  };

  it('renders the character list and a full-field form, and create goes only through Host Remote', async () => {
    const calls: Array<{ method: string; projectId: string; input: unknown }> = [];
    const created: unknown = {
      id: 'mara', name: 'Mara', aliases: [], kind: 'protagonist',
      personality: '冷静', background: '孤儿', motivation: '复仇', goals: ['活下去'],
      flaws: ['多疑'], abilities: ['剑术'], speechStyle: '简短',
      staticTraits: [], arc: { startingPoint: '起点', desiredEnd: '终点', keyBeats: [] },
      relationships: [], knowledgeIds: [],
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        characterList: async () => [],
        characterCreate: async (projectId, input) => { calls.push({ method: 'create', projectId, input }); return created; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    // characters 层默认激活，列表为空但表单（新建）仍渲染。
    expect(byData(render(), 'data-novel-layer-panel', 'characters')).toBeDefined();
    expect(byData(render(), 'data-novel-character-new', '')).toBeDefined();

    // 填充名称并触发保存（新建路径走 characterCreate）。
    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara' } });
    const save = byData(render(), 'data-novel-character-save', '') as FakeNode;
    expect(save.props?.disabled).toBe(false);
    (save.props?.onClick as () => void)();
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('create');
    expect(calls[0].projectId).toBe('default');
    expect(calls[0].input).toMatchObject({
      id: 'mara', name: 'Mara', kind: 'extra',
      personality: '', background: '', motivation: '',
      goals: [], flaws: [], abilities: [], speechStyle: '',
    });
  });

  it('round-trips a character update through Host Remote and reloads the list', async () => {
    const existing = {
      id: 'mara', name: 'Mara', aliases: [], kind: 'protagonist',
      personality: '冷静', background: '孤儿', motivation: '复仇', goals: ['活下去'],
      flaws: ['多疑'], abilities: ['剑术'], speechStyle: '简短',
      staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] },
      relationships: [], knowledgeIds: [],
    };
    const updateCalls: Array<{ id: string; patch: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        characterList: async () => [existing],
        characterUpdate: async (_projectId, id, patch) => { updateCalls.push({ id, patch }); return { ...existing, name: 'Mara II', ...(patch as object) }; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    // 点选列表项载入详情。
    const item = byData(render(), 'data-novel-character-id', 'mara') as FakeNode;
    (item.props?.onClick as () => void)();

    // 修改姓名后保存，走 characterUpdate。
    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara II' } });
    ((byData(render(), 'data-novel-character-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe('mara');
    expect(updateCalls[0].patch).toMatchObject({ id: 'mara', name: 'Mara II' });
  });

  it('shows the Host error when an illegal character write is rejected', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        characterList: async () => [],
        characterCreate: async () => { throw new Error('Host rejected: name required'); },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'X' } });
    ((byData(render(), 'data-novel-character-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    const error = byData(render(), 'data-novel-error', 'character') as FakeNode;
    expect(error).toBeDefined();
    expect(error.props?.role).toBe('alert');
    expect((error.children ?? []).join('')).toContain('Host rejected');
  });

  it('worldview rewrite goes through worldviewRewrite (supersede), never in-place create', async () => {
    const existing = {
      id: 'realm', kind: 'concept', title: '王国', content: '旧设定',
      keywords: [], triggerMode: 'constant', weight: 0, parent: null,
      mutable: true, status: 'active', supersededBy: null,
    };
    const rewriteCalls: Array<{ id: string; input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        worldviewList: async () => [existing],
        worldviewRewrite: async (_projectId, id, input) => {
          rewriteCalls.push({ id, input });
          return { superseded: { ...existing, status: 'rewritten', supersededBy: (input as { id?: string }).id }, replacement: input };
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    // 切到世界观层。
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'worldview')?.props?.onClick as () => void)();

    const item = byData(render(), 'data-novel-worldview-id', 'realm') as FakeNode;
    (item.props?.onClick as () => void)();

    // 修改内容后保存，字段标注为「改写」且走 worldviewRewrite。
    const content = collect(render(), 'textarea')[0];
    (content.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '新设定' } });
    const save = byData(render(), 'data-novel-worldview-save', '') as FakeNode;
    expect((save.children ?? []).join('')).toBe('改写');
    (save.props?.onClick as () => void)();
    await flush();

    expect(rewriteCalls).toHaveLength(1);
    expect(rewriteCalls[0].id).toBe('realm');
    expect(rewriteCalls[0].input).toMatchObject({ title: '王国', content: '新设定' });
  });

  it('shows the Host error when an illegal worldview write is rejected', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        worldviewList: async () => [],
        worldviewCreate: async () => { throw new Error('Host rejected: title required'); },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    // 切到世界观层。
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'worldview')?.props?.onClick as () => void)();

    // 新建条目：输入标题后保存，Host 拒绝并回传错误。
    const titleInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (titleInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '王国' } });
    ((byData(render(), 'data-novel-worldview-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    const error = byData(render(), 'data-novel-error', 'worldview') as FakeNode;
    expect(error).toBeDefined();
    expect(error.props?.role).toBe('alert');
    expect((error.children ?? []).join('')).toContain('Host rejected');
  });

  it('owns no fs API: the client source imports no node:fs and no browser LLM seam', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const source = readFileSync(resolve(root, 'src/client.ts'), 'utf8');
    expect(source).not.toMatch(/node:fs|fs\.readFile|window\.fetch|OPENAI_API_KEY|harness\.handle|host\.call/);
  });
});

describe('I48 B5/C1 结构化编辑器 (R10-5)', () => {
  /** Find the first element with the given data attribute value. */
  const byData = (tree: FakeNode, attr: string, value: string): FakeNode | undefined => {
    let found: FakeNode | undefined;
    const visit = (current: unknown): void => {
      if (found || current == null || typeof current !== 'object') return;
      if (Array.isArray(current)) { for (const item of current) visit(item); return; }
      const n = current as FakeNode;
      if (n.props?.[attr] === value) { found = n; return; }
      for (const child of n.children ?? []) visit(child);
    };
    visit(tree);
    return found;
  };

  const OUTLINE = {
    id: 'outline', structure: 'free', logline: 'A saga.', themes: ['trust'],
    acts: [{
      id: 'act-1', index: 0, title: '开端', goal: '遇见英雄', beats: [{
        id: 'beat-1', title: '初见', description: '相遇', charactersInvolved: ['hero'],
        conflictType: 'relational', prerequisites: [], optional: false,
        detailBeats: [{ id: 'card-1', title: '雨夜', summary: '初遇', pov: 'hero', wordTarget: 500, points: ['牵手'], status: 'planned' }],
      }],
    }],
    foreshadowing: [], endings: [],
  };

  it('renders the outline hierarchy (act→beat) and scene-card view, saved only through outlineSave', async () => {
    const saveCalls: Array<{ projectId: string; input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        outlineRead: async () => OUTLINE,
        outlineSave: async (projectId, input) => { saveCalls.push({ projectId, input }); return input; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'outline')?.props?.onClick as () => void)();
    const tree = render();
    expect(byData(tree, 'data-novel-layer-panel', 'outline')).toBeDefined();
    expect(byData(tree, 'data-novel-layer-state', 'ready')).toBeDefined();
    // 层级锚点：幕、节、场景卡均渲染。
    expect(byData(tree, 'data-novel-outline-act', 'act-1')).toBeDefined();
    expect(byData(tree, 'data-novel-outline-beat', 'beat-1')).toBeDefined();
    expect(byData(tree, 'data-novel-detail-card', 'card-1')).toBeDefined();

    // 修改一句话梗概后保存。
    const loglineInput = collect(tree, 'input').find((n) => n.props?.['type'] === 'text');
    (loglineInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'A new saga.' } });
    ((byData(render(), 'data-novel-outline-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].projectId).toBe('default');
    expect(saveCalls[0].input).toMatchObject({ logline: 'A new saga.', structure: 'free' });
  });

  it('shows the Host error when an illegal outline write is rejected', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        outlineRead: async () => OUTLINE,
        outlineSave: async () => { throw new Error('Host rejected: unknown beat prerequisite'); },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'outline')?.props?.onClick as () => void)();

    const loglineInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (loglineInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'X' } });
    ((byData(render(), 'data-novel-outline-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    const error = byData(render(), 'data-novel-error', 'outline') as FakeNode;
    expect(error).toBeDefined();
    expect(error.props?.role).toBe('alert');
    expect((error.children ?? []).join('')).toContain('Host rejected');
  });

  it('renders the relationship list and full-field editor, saved only through relationshipSave', async () => {
    const existing = {
      id: 'hero+mentor', from: 'hero', to: 'mentor', type: 'mentor',
      affinity: 80, trust: 90, status: 'active', milestones: ['受训'], knownTo: ['hero'],
    };
    const saveCalls: Array<{ projectId: string; input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        relationshipRead: async () => [existing],
        relationshipSave: async (projectId, input) => { saveCalls.push({ projectId, input }); return input; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'relationship')?.props?.onClick as () => void)();

    const tree = render();
    expect(byData(tree, 'data-novel-layer-panel', 'relationship')).toBeDefined();

    // 点选列表项载入详情，全字段表单渲染（from/to/type/affinity/trust/milestones/knownTo）。
    const item = byData(tree, 'data-novel-relationship-id', 'hero+mentor') as FakeNode;
    (item.props?.onClick as () => void)();

    // 修改状态后保存。
    const statusInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text' && (n.props?.value as string) === 'active');
    (statusInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'strained' } });
    ((byData(render(), 'data-novel-relationship-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].projectId).toBe('default');
    expect(saveCalls[0].input).toMatchObject({
      id: 'hero+mentor', from: 'hero', to: 'mentor', type: 'mentor', status: 'strained',
    });
  });

  it('shows the Host error when an illegal relationship write is rejected', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        relationshipRead: async () => [],
        relationshipSave: async () => { throw new Error('Host rejected: endpoints must differ'); },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'relationship')?.props?.onClick as () => void)();

    const textInputs = collect(render(), 'input').filter((n) => n.props?.['type'] === 'text');
    (textInputs[0]?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'hero' } });
    (textInputs[1]?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'hero' } });
    ((byData(render(), 'data-novel-relationship-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    const error = byData(render(), 'data-novel-error', 'relationship') as FakeNode;
    expect(error).toBeDefined();
    expect(error.props?.role).toBe('alert');
    expect((error.children ?? []).join('')).toContain('Host rejected');
  });

  it('owns no fs API: the client source imports no node:fs and no browser LLM seam', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const source = readFileSync(resolve(root, 'src/client.ts'), 'utf8');
    expect(source).not.toMatch(/node:fs|fs\.readFile|window\.fetch|OPENAI_API_KEY|harness\.handle|host\.call/);
  });
});

describe('I49 C2/C4 面板 (R10-6)', () => {
  /** Find the first element with the given data attribute value. */
  const byData = (tree: FakeNode, attr: string, value: string): FakeNode | undefined => {
    let found: FakeNode | undefined;
    const visit = (current: unknown): void => {
      if (found || current == null || typeof current !== 'object') return;
      if (Array.isArray(current)) { for (const item of current) visit(item); return; }
      const n = current as FakeNode;
      if (n.props?.[attr] === value) { found = n; return; }
      for (const child of n.children ?? []) visit(child);
    };
    visit(tree);
    return found;
  };

  const SNAPSHOTS = [
    { id: 'ws', seq: 0, storyTime: 'day 1', scene: { location: '城门', timeOfDay: 'dawn', weather: '', season: '', atmosphere: '' }, characters: [] },
    { id: 'ws', seq: 1, storyTime: 'day 2', scene: { location: '王宫', timeOfDay: 'noon', weather: '', season: '', atmosphere: '' }, characters: [] },
  ];

  it('renders the C2 snapshot timeline and rolls back only through stateRollback', async () => {
    const rollbackCalls: Array<{ projectId: string; seq: number }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        stateSnapshots: async () => SNAPSHOTS,
        stateRollback: async (projectId, seq) => { rollbackCalls.push({ projectId, seq }); return { ...SNAPSHOTS[0], seq: 2, storyTime: 'day 2 (rolled back)' }; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'state')?.props?.onClick as () => void)();

    const tree = render();
    expect(byData(tree, 'data-novel-layer-panel', 'state')).toBeDefined();
    // 时间线条目锚点 + 当前快照。
    expect(byData(tree, 'data-novel-state-snapshot', '0')).toBeDefined();
    expect(byData(tree, 'data-novel-state-snapshot', '1')).toBeDefined();

    // 选择 seq 0 后点击回滚：只经 Host stateRollback。
    ((byData(tree, 'data-novel-state-snapshot', '0') as FakeNode).props?.onClick as () => void)();
    const rollback = byData(render(), 'data-novel-state-rollback', '') as FakeNode;
    expect(rollback.props?.disabled).toBe(false);
    (rollback.props?.onClick as () => void)();
    await flush();

    expect(rollbackCalls).toHaveLength(1);
    expect(rollbackCalls[0]).toEqual({ projectId: 'default', seq: 0 });
  });

  it('computes a diff between two snapshots only through stateDiff', async () => {
    const diffCalls: Array<{ fromSeq: number; toSeq: number }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        stateSnapshots: async () => SNAPSHOTS,
        stateDiff: async (_projectId, fromSeq, toSeq) => {
          diffCalls.push({ fromSeq, toSeq });
          return { fromSeq, toSeq, changes: [{ path: 'scene.location', before: '城门', after: '王宫' }] };
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'state')?.props?.onClick as () => void)();

    // 初始 from=0, to=1（载入时已自动选中前两快照）。
    ((byData(render(), 'data-novel-state-diff', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    expect(diffCalls).toHaveLength(1);
    expect(diffCalls[0]).toEqual({ fromSeq: 0, toSeq: 1 });
    const diffRow = byData(render(), 'data-novel-state-diff-row', 'scene.location') as FakeNode;
    expect(diffRow).toBeDefined();
    const rowText = ((): string => {
      let text = '';
      const visit = (current: unknown): void => {
        if (current == null || typeof current !== 'object') { text += String(current); return; }
        for (const child of (current as FakeNode).children ?? []) visit(child);
      };
      visit(diffRow);
      return text;
    })();
    expect(rowText).toContain('城门');
    expect(rowText).toContain('王宫');
  });

  const CANON = [
    { id: 'ev-1', seq: 0, storyTime: 'day 1', kind: 'event', summary: '英雄入城', detail: '城门大开', participants: [], location: '城门', consequences: [], affectedLayers: [], immutable: true, supersededBy: null },
    { id: 'ev-2', seq: 1, storyTime: 'day 2', kind: 'decision', summary: '结盟', detail: '结为盟友', participants: [], location: '王宫', consequences: [], affectedLayers: [], immutable: true, supersededBy: null },
  ];

  it('renders C4 as a read-only ledger and proposes corrections through canonCorrectionPropose', async () => {
    const proposeCalls: Array<{ projectId: string; targetId: string; input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        canonQuery: async () => CANON,
        canonCorrectionPropose: async (projectId, targetId, input) => {
          proposeCalls.push({ projectId, targetId, input });
          return { id: 'proposal-1' };
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'canon')?.props?.onClick as () => void)();

    const tree = render();
    expect(byData(tree, 'data-novel-layer-panel', 'canon')).toBeDefined();
    // 只读徽标 + 账本条目锚点。
    expect(byData(tree, 'data-novel-canon-readonly', '')).toBeDefined();
    expect(byData(tree, 'data-novel-canon-id', 'ev-1')).toBeDefined();

    // 选中事件并修改摘要后发起提案。
    ((byData(tree, 'data-novel-canon-id', 'ev-1') as FakeNode).props?.onClick as () => void)();
    const summaryInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text' && (n.props?.value as string) === '英雄入城');
    (summaryInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '英雄改道入城' } });
    ((byData(render(), 'data-novel-canon-propose', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    expect(proposeCalls).toHaveLength(1);
    expect(proposeCalls[0].projectId).toBe('default');
    expect(proposeCalls[0].targetId).toBe('ev-1');
    expect(proposeCalls[0].input).toMatchObject({ summary: '英雄改道入城' });
  });

  it('appends a supersede only after canonCorrectionAccept confirms the gate proposal', async () => {
    const calls: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        canonQuery: async () => CANON,
        canonCorrectionPropose: async () => { calls.push('propose'); return { id: 'proposal-1' }; },
        canonCorrectionAccept: async () => { calls.push('accept'); return { confirmation: {}, event: {} }; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'canon')?.props?.onClick as () => void)();

    ((byData(render(), 'data-novel-canon-id', 'ev-1') as FakeNode).props?.onClick as () => void)();
    const summaryInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text' && (n.props?.value as string) === '英雄入城');
    (summaryInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '改' } });

    // 提案前没有 accept 入口。
    expect(byData(render(), 'data-novel-canon-accept', '')).toBeUndefined();
    ((byData(render(), 'data-novel-canon-propose', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    // 提案后出现 accept 入口；确认后才追加 supersede（accept 被调用）。
    const accept = byData(render(), 'data-novel-canon-accept', '') as FakeNode;
    expect(accept).toBeDefined();
    expect(calls).toEqual(['propose']);
    (accept.props?.onClick as () => void)();
    await flush();
    expect(calls).toEqual(['propose', 'accept']);
  });

  it('owns no fs API and no direct canon write seam in the client source', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const source = readFileSync(resolve(root, 'src/client.ts'), 'utf8');
    expect(source).not.toMatch(/node:fs|fs\.readFile|window\.fetch|OPENAI_API_KEY|harness\.handle|host\.call/);
    // 正史无就地改写入口：客户端永不调用 update/delete/append/supersede 直接写账本。
    expect(source).not.toMatch(/canonUpdate|canonDelete|canonAppend|\.supersede\(/);
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
