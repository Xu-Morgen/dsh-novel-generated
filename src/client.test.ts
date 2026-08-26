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
interface MountOptions { deferStoreInjection?: boolean; openProjectId?: string | null; llmConfig?: { load?: () => Promise<unknown>; save?: (input: unknown) => Promise<unknown> }; onboardingAnalyzer?: { start?: (input: unknown, settings: unknown) => Promise<unknown> } }

interface WorkspaceOverrides {
  projectList?: () => Promise<unknown[]>;
  projectCreate?: (input: unknown) => Promise<unknown>;
  projectOpen?: (projectId: string) => Promise<unknown>;
  uploadStart?: (input: unknown) => Promise<unknown>;
  uploadChunk?: (uploadId: string, index: number, base64: string) => Promise<unknown>;
  uploadFinalize?: (uploadId: string) => Promise<unknown>;
  uploadCancel?: (uploadId: string) => Promise<unknown>;
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
  projectList: overrides.projectList ?? (async () => [{ id: 'fixture-project', name: '夹具作品' }]),
  projectCreate: overrides.projectCreate ?? (async () => ({})),
  projectOpen: overrides.projectOpen ?? (async () => ({})),
  uploadStart: overrides.uploadStart ?? (async () => ({ uploadId: 'fixture-upload', chunkSize: 65536, nextIndex: 0 })),
  uploadChunk: overrides.uploadChunk ?? (async () => ({ nextIndex: 1, received: 0 })),
  uploadFinalize: overrides.uploadFinalize ?? (async () => ({ sourceHash: 'a'.repeat(64), fileName: 'fixture.docx', text: '', chunks: [] })),
  uploadCancel: overrides.uploadCancel ?? (async () => ({ ok: true })),
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
 * fake slots/remote/effect, plus a fake `defineStore` engine and a store-binding
 * wrapper that emulates what the renderer does (bind `useStore`/`actions`, run the
 * `inject` factory). Returns everything a test needs to drive state and assert
 * Fiber-unload cleanup (Slot/样式/监听归零, R10-3).
 */
function mount(viewModel: () => Promise<unknown>, overrides: WorkspaceOverrides = {}, mountOptions: MountOptions = {}) {
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

  // Fake `defineStore` mirrors the real handle → create(scopeKey) → instance
  // contract. Every create gets fresh state and baked actions.
  const defineStore = (spec: { init: () => unknown; actions: Record<string, (d: never, ...params: never[]) => void> }) => ({
    create() {
      let state = spec.init();
      const listeners = new Set<() => void>();
      const actions: Record<string, unknown> = {};
      for (const key of Object.keys(spec.actions)) {
        actions[key] = (...params: unknown[]) => {
          const draft = structuredClone(state) as Record<string, unknown>;
          (spec.actions[key] as (d: unknown, ...p: unknown[]) => void)(draft, ...params);
          state = draft as never;
          for (const fn of listeners) fn();
        };
      }
      return {
        actions,
        getSnapshot: () => state,
        subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
      };
    },
  });

  const slots = {
    inject(key: string, cb: () => () => void) {
      const dispose = cb() ?? (() => {});
      (key === 'shell.overlay' ? overlayCleanups : footerCleanups).push(dispose);
      return () => {};
    },
    register(options: Record<string, unknown>, component: () => unknown) {
      const name = options.name as string;
      // Emulate the renderer's handle lifecycle. Normal tests schedule the first
      // instance on a microtask; the race test defers it until first render so a
      // fast Remote response can arrive before actions injection.
      let wrapped = component;
      const storeFactory = options.store as unknown as (() => { create(scopeKey?: string): { actions: Record<string, unknown>; getSnapshot: () => unknown } }) | undefined;
      if (storeFactory !== undefined) {
        let instance: { actions: Record<string, unknown>; getSnapshot: () => unknown } | undefined;
        const ensureInstance = () => {
          if (instance !== undefined) return instance;
          instance = storeFactory().create();
          const inject = options.inject as unknown as ((actions: unknown) => Record<string, unknown>) | undefined;
          if (inject !== undefined) inject(instance.actions);
          return instance;
        };
        if (mountOptions.deferStoreInjection !== true) queueMicrotask(ensureInstance);
        wrapped = () => {
          const current = ensureInstance();
          return (component as unknown as (props: unknown) => unknown)({
            useStore: (sel: (s: unknown) => unknown) => sel(current.getSnapshot()),
            actions: current.actions,
          });
        };
      }
      (registrations[name] ??= []).push({ options, component: wrapped });
      return () => {
        const list = registrations[name];
        const index = list.findIndex((entry) => entry.component === wrapped);
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
  const llmConfig = mountOptions.llmConfig ?? {};
  const analyzer = mountOptions.onboardingAnalyzer;
  const get = (name: string) => name === 'remote.novelWorkspace' ? workspace
    : name === 'remote.novelLlmConfig' ? {
      load: llmConfig.load ?? (async () => ({ providerId: 'novel-custom', baseUrl: '', model: '', hasKey: false })),
      save: llmConfig.save ?? (async () => ({ ok: true, modelRef: 'novel-custom/test' })),
    }
    : name === 'remote.novelOnboardingAnalyzer' ? (analyzer ?? { start: async () => { throw new Error('未注入 remote.novelOnboardingAnalyzer'); } })
    : undefined;
  const entry = factory((spec) => (spec === 'react' ? fakeReact : spec === '@deepseek-ai/dsh-client-runtime/client' ? { defineStore } : undefined));
  entry.apply({ slots, remote, get, effect } as never);
  // Editor behavior tests deliberately open the fixture project through the
  // chooser. I50 forbids production auto-selection, so session tests opt out.
  const openProjectId = mountOptions.openProjectId === undefined ? 'fixture-project' : mountOptions.openProjectId;
  if (openProjectId !== undefined) {
    void (async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve();
      const overlay = registrations['shell.overlay']?.[0]?.component() as FakeNode | undefined;
      const button = collect(overlay, 'button').find((node) => node.props?.['data-novel-project-open'] === openProjectId);
      (button?.props?.onClick as (() => void) | undefined)?.();
    })();
  }
  return { entry, registrations, overlayCleanups, footerCleanups, styleEffects, styleNodes };
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) { await Promise.resolve(); }
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  for (let i = 0; i < 8; i += 1) { await Promise.resolve(); }
};

/** Node has no `FileReader`; the upload helper needs one to read the File. */
class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: ArrayBuffer = new ArrayBuffer(0);
  readAsArrayBuffer(file: File) {
    void file.arrayBuffer().then((buffer) => { this.result = buffer; this.onload?.(); });
  }
}

afterEach(() => {
  delete (globalThis as unknown as { document?: unknown }).document;
  delete (globalThis as unknown as { FileReader?: unknown }).FileReader;
});

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

describe('I50 project-session startup', () => {
  const projectButton = (tree: FakeNode, id: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-project-open'] === id);

  it('shows an empty-root new-project state without mounting six layers', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { projectList: async () => [] },
      { openProjectId: null },
    );
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    expect(tree.props?.['data-novel-workspace']).toBe('ready');
    expect(collect(tree, 'p').some((node) => node.props?.['data-novel-project-empty'] === '')).toBe(true);
    expect(layerButtons(tree)).toEqual([]);
    // I50 requires an actionable blank-project entry. The current production
    // chooser only describes the state, so this assertion is intentionally red
    // until it exposes a create control wired to projectCreate.
    expect(collect(tree, 'button').some((node) => node.props?.['data-novel-project-create'] === '')).toBe(true);
  });

  it('shows multiple projects without selecting the first one', async () => {
    const projectOpen: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }],
        projectOpen: async (id) => { projectOpen.push(id); return {}; },
      },
      { openProjectId: null },
    );
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    expect(collect(tree, 'ul').some((node) => node.props?.['data-novel-project-list'] === '')).toBe(true);
    expect(projectButton(tree, 'alpha')).toBeDefined();
    expect(projectButton(tree, 'beta')).toBeDefined();
    expect(projectOpen).toEqual([]);
    expect(layerButtons(tree)).toEqual([]);
  });

  it('opens the selected project, reloads every layer, and keeps later writes on that id', async () => {
    const calls: Array<{ method: string; projectId: string }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }],
        projectOpen: async (id) => { calls.push({ method: 'projectOpen', projectId: id }); return {}; },
        characterList: async () => { calls.push({ method: 'characterList', projectId: 'beta' }); return []; },
        worldviewList: async () => { calls.push({ method: 'worldviewList', projectId: 'beta' }); return []; },
        outlineRead: async (id) => { calls.push({ method: 'outlineRead', projectId: id }); return { id: 'outline', structure: 'free', logline: '', themes: [], acts: [], foreshadowing: [], endings: [] }; },
        relationshipRead: async (id) => { calls.push({ method: 'relationshipRead', projectId: id }); return []; },
        stateSnapshots: async (id) => { calls.push({ method: 'stateSnapshots', projectId: id }); return []; },
        canonQuery: async (id) => { calls.push({ method: 'canonQuery', projectId: id }); return []; },
        characterCreate: async (id, input) => { calls.push({ method: 'characterCreate', projectId: id }); return { ...(input as object), id: 'mara' }; },
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (projectButton(render(), 'beta')?.props?.onClick as () => void)();
    await flush();

    expect(render().props?.['data-novel-project-open']).toBe('beta');
    expect(calls.filter((call) => call.method !== 'characterCreate')).toEqual(expect.arrayContaining([
      { method: 'projectOpen', projectId: 'beta' },
      { method: 'characterList', projectId: 'beta' },
      { method: 'worldviewList', projectId: 'beta' },
      { method: 'outlineRead', projectId: 'beta' },
      { method: 'relationshipRead', projectId: 'beta' },
      { method: 'stateSnapshots', projectId: 'beta' },
      { method: 'canonQuery', projectId: 'beta' },
    ]));

    const nameInput = collect(render(), 'input').find((node) => node.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara' } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-character-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(calls).toContainEqual({ method: 'characterCreate', projectId: 'beta' });
  });

  it('fails closed when opening the selected project fails', async () => {
    let characterLoads = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [{ id: 'broken', name: 'Broken' }],
        projectOpen: async () => { throw new Error('cannot open'); },
        characterList: async () => { characterLoads += 1; return []; },
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (projectButton(render(), 'broken')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-workspace']).toBe('error');
    expect(layerButtons(render())).toEqual([]);
    expect(characterLoads).toBe(0);
  });

  it('skips outlineRead for an uninitialized outline and shows the empty form', async () => {
    let outlineReads = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [{ id: 'fresh', name: 'Fresh' }],
        // projectOpen reports B5 as uninitialized (legacy `{}` outline).
        projectOpen: async () => ({ project: { id: 'fresh', name: 'Fresh', version: 1 }, layers: { characters: 'empty', worldview: 'empty', outline: 'uninitialized', relationship: 'empty', state: 'ready', canon: 'empty' } }),
        outlineRead: async () => { outlineReads += 1; return { id: 'outline', structure: 'free', logline: '', themes: [], acts: [], foreshadowing: [], endings: [] }; },
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-project-open'] === 'fresh')?.props?.onClick as () => void)();
    await flush();
    // I50 step 21: skip outlineRead for uninitialized — outlineRead would throw
    // "Invalid outline document" on the legacy `{}` marker.
    expect(outlineReads).toBe(0);
    (layerButtons(render()).find((node) => node.props?.['data-novel-layer'] === 'outline')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-layer-panel'] === 'outline' && node.props?.['data-novel-layer-state'] === 'ready')).toBe(true);
  });
});

describe('LLM 设置页', () => {
  it('opens the settings page, echoes the saved view and saves new values through the Remote', async () => {
    const loads: string[] = [];
    const saves: Array<{ input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        llmConfig: {
          load: async () => { loads.push('load'); return { providerId: 'novel-custom', baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', hasKey: true }; },
          save: async (input) => { saves.push({ input }); return { ok: true, value: { ok: true, modelRef: 'novel-custom/gpt-4o' } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const settingsNav = collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '');
    expect(settingsNav).toBeDefined();
    (settingsNav?.props?.onClick as () => void)();
    await flush();

    expect(loads).toEqual(['load']);
    const urlInput = collect(render(), 'input').find((node) => node.props?.['data-novel-llm-url'] === '');
    expect(urlInput?.props?.value).toBe('https://api.example.com/v1');
    expect(collect(render(), 'input').find((node) => node.props?.['data-novel-llm-model'] === '')?.props?.value).toBe('gpt-4o');

    (urlInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'https://new.example.com/v1' } });
    (collect(render(), 'input').find((node) => node.props?.['data-novel-llm-model'] === '')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'gpt-5' } });
    (collect(render(), 'input').find((node) => node.props?.['data-novel-llm-key'] === '')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'sk-new-key-123456' } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-llm-save'] === '')?.props?.onClick as () => void)();
    await flush();

    expect(saves).toEqual([{ input: { baseUrl: 'https://new.example.com/v1', model: 'gpt-5', apiKey: 'sk-new-key-123456' } }]);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-llm-message'] !== undefined)).toBe(true);
  });

  it('toggles the settings page closed and exits it when a layer is activated', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      { llmConfig: { load: async () => ({ providerId: 'novel-custom', baseUrl: '', model: '', hasKey: true }) } },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const settingsNav = () => collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '');
    (settingsNav()?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-llm-settings'] === '')).toBe(true);
    // 再次点击「LLM 设置」关闭，回到层级面板。
    (settingsNav()?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-llm-settings'] === '')).toBe(false);
    // 打开后点击任一层级按钮也会退出设置页。
    (settingsNav()?.props?.onClick as () => void)();
    await flush();
    (layerButtons(render()).find((node) => node.props?.['data-novel-layer'] === 'characters')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-llm-settings'] === '')).toBe(false);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-layer-panel'] === 'characters')).toBe(true);
  });

  it('saves with an empty key when a key is already stored (keeps it)', async () => {
    const saves: Array<{ input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        llmConfig: {
          load: async () => ({ providerId: 'novel-custom', baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', hasKey: true }),
          save: async (input) => { saves.push({ input }); return { ok: true, value: { ok: true, modelRef: 'novel-custom/gpt-4o' } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'input').find((node) => node.props?.['data-novel-llm-url'] === '')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'https://new.example.com/v1' } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-llm-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(saves).toEqual([{ input: { baseUrl: 'https://new.example.com/v1', model: 'gpt-4o', apiKey: '' } }]);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-llm-message'] !== undefined)).toBe(true);
  });

  it('blocks save when the key is missing and none is stored', async () => {
    const saves: unknown[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        llmConfig: {
          load: async () => ({ providerId: 'novel-custom', baseUrl: '', model: '', hasKey: false }),
          save: async (input) => { saves.push(input); return { ok: true, value: { ok: true, modelRef: 'x' } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'input').find((node) => node.props?.['data-novel-llm-url'] === '')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'https://x.example/v1' } });
    (collect(render(), 'input').find((node) => node.props?.['data-novel-llm-model'] === '')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'gpt-4o' } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-llm-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(saves).toEqual([]);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-llm-error'] !== undefined)).toBe(true);
  });
});

describe('I53 DOCX new-work entry from an empty root', () => {
  it('creates and opens a project from the uploaded document, then starts the six-layer review', async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
    const created: Array<{ projectId: string; name: string }> = [];
    const opened: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [],
        projectCreate: async (input) => {
          const parsed = input as { projectId: string; name: string };
          created.push(parsed);
          return { id: parsed.projectId, name: parsed.name };
        },
        projectOpen: async (id) => { opened.push(id); return {}; },
        uploadStart: async () => ({ uploadId: 'u1', chunkSize: 65536, nextIndex: 0 }),
        uploadChunk: async () => ({ nextIndex: 1, received: 1 }),
        uploadFinalize: async () => ({ sourceHash: 'a'.repeat(64), fileName: 'my book.docx', text: '第一段\n\n第二段', chunks: [{ index: 0, text: '第一段\n\n第二段', startOffset: 0, endOffset: 9 }] }),
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const input = collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '');
    expect(input).toBeDefined();
    (input?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File([new Uint8Array([1, 2, 3])], 'my book.docx')] as unknown as FileList } });
    await flush();

    // 空 root 上传必须自动新建并打开作品，再进入六层审阅（I53 三入口）。
    expect(created).toEqual([{ projectId: 'my-book', name: 'my book' }]);
    expect(opened).toEqual(['my-book']);
    expect(render().props?.['data-novel-project-open']).toBe('my-book');
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '')).toBe(true);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-upload-result'] !== undefined)).toBe(true);
  });
});

describe('I52 analysis failure surfaces a readable error in the review panel', () => {
  it('shows the Host contract error when the first analysis is rejected', async () => {
    const contractError = '六层分析结果不符合六层候选契约（layers.characters.candidates.0.aliases: Invalid input: expected array, received undefined）。模型输出已被拒绝且未写入任何层；请重试分析，或在审阅页对不合格层执行整层重生成。';
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      { onboardingAnalyzer: { start: async () => { throw new Error(contractError); } } },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    // The entry's textarea/button share one render closure; use the same tree so
    // the typed source text is visible to the start handler.
    const tree = render();
    const textarea = collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');
    const start = collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
    expect(textarea).toBeDefined();
    expect(start).toBeDefined();
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
    (start?.props?.onClick as () => void)();
    await flush();
    const error = collect(render(), 'p').find((node) => node.props?.['data-novel-onboarding-error'] !== undefined);
    expect(error).toBeDefined();
    expect(String(error?.children?.[0] ?? '')).toContain('不符合六层候选契约');
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
    expect(calls[0].projectId).toBe('fixture-project');
    expect(calls[0].input).toMatchObject({
      id: 'mara', name: 'Mara', kind: 'extra',
      personality: '', background: '', motivation: '',
      goals: [], flaws: [], abilities: [], speechStyle: '',
    });
  });

  it('surfaces a post-save refresh rejection instead of leaving the layer loading', async () => {
    let reads = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        characterList: async () => { reads += 1; if (reads > 1) throw new Error('Host refresh failed'); return []; },
        characterCreate: async (_projectId, input) => input,
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const nameInput = collect(render(), 'input').find((node) => node.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara' } });
    ((byData(render(), 'data-novel-character-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    const error = byData(render(), 'data-novel-layer-state', 'error') as FakeNode;
    expect(error.props?.role).toBe('alert');
    expect((error.children ?? []).join('')).toContain('Host refresh failed');
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
    expect(saveCalls[0].projectId).toBe('fixture-project');
    expect(saveCalls[0].input).toMatchObject({ logline: 'A new saga.', structure: 'free' });
    expect(byData(render(), 'data-novel-layer-state', 'ready')).toBeDefined();
    expect(byData(render(), 'data-novel-outline-save', '')).toBeDefined();
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
    expect(saveCalls[0].projectId).toBe('fixture-project');
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
    expect(rollbackCalls[0]).toEqual({ projectId: 'fixture-project', seq: 0 });
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
    expect(proposeCalls[0].projectId).toBe('fixture-project');
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
