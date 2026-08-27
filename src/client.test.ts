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
interface MountOptions { deferStoreInjection?: boolean; openProjectId?: string | null; llmConfig?: { load?: () => Promise<unknown>; save?: (input: unknown) => Promise<unknown> }; workbenchSettings?: { load?: () => Promise<unknown>; save?: (input: unknown) => Promise<unknown>; openProjectFolder?: (projectId: string) => Promise<unknown> }; onboardingAnalyzer?: { begin?: (input: unknown, settings: unknown) => Promise<unknown>; status?: (onboardingSessionId: string) => Promise<unknown>; cancel?: (onboardingSessionId: string) => Promise<unknown>; result?: (onboardingSessionId: string) => Promise<unknown>; start?: (input: unknown, settings: unknown) => Promise<unknown> }; onboarding?: { adjudicate?: (input: unknown, settings: unknown) => Promise<unknown>; acceptedLayers?: (onboardingSessionId: string) => Promise<unknown>; finalApply?: (input: unknown) => Promise<unknown> } }

interface WorkspaceOverrides {
  projectList?: () => Promise<unknown[]>;
  projectCreate?: (input: unknown) => Promise<unknown>;
  projectOpen?: (projectId: string) => Promise<unknown>;
  uploadStart?: (input: unknown) => Promise<unknown>;
  uploadChunk?: (uploadId: string, index: number, base64: string) => Promise<unknown>;
  uploadFinalize?: (uploadId: string) => Promise<unknown>;
  uploadCancel?: (uploadId: string) => Promise<unknown>;
  characterList?: (projectId: string) => Promise<unknown[]>;
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
  /** I60：C5 只读 Remote（chapterList/chapterRead/sceneRead）。 */
  chapterList?: (projectId: string) => Promise<unknown[]>;
  chapterRead?: (projectId: string, chapterId: string) => Promise<unknown>;
  sceneRead?: (projectId: string, chapterId: string, sceneId: string) => Promise<unknown>;
  /** I61：受控编辑 Remote（sceneEdit / reparse propose / accept / reject）。 */
  sceneEdit?: (projectId: string, chapterId: string, sceneId: string, range: unknown, replacement: string, baseHash?: string) => Promise<unknown>;
  sceneReparsePropose?: (projectId: string, chapterId: string, sceneId: string, range: unknown, replacement: string, baseHash?: string) => Promise<unknown>;
  sceneReparseAccept?: (projectId: string, chapterId: string, sceneId: string, range: unknown, replacement: string, proposalId: string, baseHash?: string) => Promise<unknown>;
  sceneReparseReject?: (projectId: string, proposalId: string) => Promise<unknown>;
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
  chapterList: overrides.chapterList ?? (async () => []),
  chapterRead: overrides.chapterRead ?? (async () => ({ id: '', index: 1, title: '', pov: '', status: 'draft', scenes: [] })),
  sceneRead: overrides.sceneRead ?? (async () => ({ chapter: { id: '', index: 1, title: '', pov: '' }, scene: { id: '', index: 0, summary: '', content: '', beats: [], canonEvents: [], notes: '' } })),
  sceneEdit: overrides.sceneEdit ?? (async () => ({ scene: { id: '', index: 0, summary: '', content: '', beats: [], canonEvents: [], notes: '' }, evidence: { before: '', after: '', unchangedPrefix: '', unchangedSuffix: '' } })),
  sceneReparsePropose: overrides.sceneReparsePropose ?? (async () => ({ proposalId: 'scene-reparse-fixture', status: 'pending' })),
  sceneReparseAccept: overrides.sceneReparseAccept ?? (async () => ({ status: 'written', scene: { id: '', index: 0, summary: '', content: '', beats: [], canonEvents: [], notes: '' }, layers: ['c2', 'c1', 'c3', 'c4', 'b2'] })),
  sceneReparseReject: overrides.sceneReparseReject ?? (async () => ({ proposalId: 'scene-reparse-fixture', status: 'rejected' })),
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

  // 既有竞态修复（I59 验证硬化）：自由文本入口 `analyzeText` 先经
  // crypto.subtle.digest（Node 线程池，0.5–4ms 且负载下抖动）再启动分析，而
  // flush() 只有约 2 个宏任务窗口，全量并行下会偶发「点 start 后 busy 面板/审阅
  // 未在固定窗口内渲染」失败（I52/I56/I57 历史偶发）。测试环境把 digest 替换为
  // 确定性单微任务桩（固定 32 字节即可：客户端哈希只作 sourceHash 绑定，分析
  // 结果会覆盖 sourceHash，无测试断言其取值）。
  const subtle = (globalThis as unknown as { crypto?: { subtle?: { digest?: unknown } } }).crypto?.subtle;
  if (subtle !== undefined) {
    (subtle as { digest: unknown }).digest = async (): Promise<ArrayBuffer> => new ArrayBuffer(32);
  }

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
  const onboardingStub = mountOptions.onboarding;
  const workbenchSettingsStub = mountOptions.workbenchSettings;
  const get = (name: string) => name === 'remote.novelWorkspace' ? workspace
    : name === 'remote.novelLlmConfig' ? {
      load: llmConfig.load ?? (async () => ({ providerId: 'novel-custom', baseUrl: '', model: '', hasKey: false, maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high' })),
      save: llmConfig.save ?? (async () => ({ ok: true, modelRef: 'novel-custom/test' })),
    }
    : name === 'remote.novelWorkbenchSettings' ? {
      load: workbenchSettingsStub?.load ?? (async () => ({ wordTarget: 500, askWhenThin: true })),
      save: workbenchSettingsStub?.save ?? (async () => ({ wordTarget: 500, askWhenThin: true })),
      openProjectFolder: workbenchSettingsStub?.openProjectFolder ?? (async () => ({ opened: true, path: 'C:\\dummy\\projects\\fixture-project' })),
    }
    : name === 'remote.novelOnboardingAnalyzer' ? (analyzer ?? {
      begin: async () => ({ onboardingSessionId: 'sess-1' }),
      status: async () => 'succeeded',
      result: async () => ({ projectId: 'fixture-project', onboardingSessionId: 'sess-1', sourceHash: 'a'.repeat(64), evidence: {}, layers: {} }),
      cancel: async () => undefined,
      start: async () => { throw new Error('未注入 remote.novelOnboardingAnalyzer.start'); },
    })
    : name === 'remote.novelOnboarding' ? (onboardingStub ?? {
      adjudicate: async () => { throw new Error('未注入 remote.novelOnboarding'); },
      acceptedLayers: async () => [],
      finalApply: async () => ({ projectId: 'fixture-project', onboardingSessionId: 'sess-1', appliedLayers: [], skippedLayers: [], blockedLayers: [], pendingLayers: [], retryable: false, errors: [] }),
    })
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
  // 两轮宏任务窗口：Node `File.arrayBuffer()` 在宏任务边界落地，单轮 setTimeout(0)
  // 可能在其之前触发导致上传链竞态（全量运行下偶发失败）。
  for (let round = 0; round < 2; round += 1) {
    for (let i = 0; i < 8; i += 1) { await Promise.resolve(); }
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
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
    // 稳定 data 锚点：十项视图按钮各带 data-novel-view（I60 新增正文 C5）。
    const viewButtons = collect(tree, 'button').filter((n) => n.props?.['data-novel-view'] !== undefined);
    expect(viewButtons.map((n) => n.props?.['data-novel-view'])).toEqual([
      'outline', 'chapters', 'characters', 'worldview', 'relationship', 'state', 'canon', 'onboarding', 'creationSettings', 'settings',
    ]);
    // 技术层编号只作辅助徽标（B5/C5/B3/B2/C1/C2/C4），非层视图无徽标。
    const badges = collect(tree, 'span').filter((n) => n.props?.['data-novel-nav-badge'] !== undefined);
    expect(badges.map((n) => n.props?.['data-novel-nav-badge'])).toEqual(['B5', 'C5', 'B3', 'B2', 'C1', 'C2', 'C4']);
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

  it('fails closed when opening the selected project fails (I55: keeps the chooser with a recoverable error)', async () => {
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
    // I55：open 失败不再 brick 成整屏错误，而是停在作品列表并展示可恢复错误。
    expect(render().props?.['data-novel-workspace']).toBe('ready');
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-project-error'] === '')).toBe(true);
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

describe('I55 作品上下文栏与项目切换 (R12-2)', () => {
  const projectButton = (tree: FakeNode, id: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-project-open'] === id);
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

  const ALPHA = { id: 'alpha', name: 'Alpha' };
  const BETA = { id: 'beta', name: 'Beta' };
  const READY_LAYERS = { characters: 'empty', worldview: 'empty', outline: 'uninitialized', relationship: 'empty', state: 'ready', canon: 'empty' };
  const character = (id: string, name: string) => ({ id, name, aliases: [], kind: 'protagonist', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] });

  it('shows the project context bar with the current name and a back-to-projects entry', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [ALPHA],
        projectOpen: async () => ({ project: ALPHA, layers: READY_LAYERS }),
      },
      { openProjectId: 'alpha' },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    expect(byData(render(), 'data-novel-project-context', '')).toBeDefined();
    expect(collect(render(), 'span').some((node) => node.props?.['data-novel-project-context-name'] === '' && (node.children ?? []).join('') === 'Alpha')).toBe(true);
    expect(byData(render(), 'data-novel-back-to-projects', '')).toBeDefined();
  });

  it('round-trips two projects with zero cross-project draft leakage', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [ALPHA, BETA],
        projectOpen: async (id) => ({ project: id === 'alpha' ? ALPHA : BETA, layers: READY_LAYERS }),
        characterList: async (id) => (id === 'alpha' ? [character('mara', 'Mara')] : [character('beta-hero', 'Beta Hero')]),
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (projectButton(render(), 'alpha')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-project-open']).toBe('alpha');
    expect(byData(render(), 'data-novel-character-id', 'mara')).toBeDefined();

    // dirty a character draft in alpha
    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara Edited' } });

    // back-to-projects → dirty confirm → confirm leave
    (byData(render(), 'data-novel-back-to-projects', '')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-leave-confirm', '')).toBeDefined();
    (byData(render(), 'data-novel-leave-discard', '')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeDefined();

    // open beta
    (projectButton(render(), 'beta')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-project-open']).toBe('beta');
    // beta's own character, never alpha's (zero cross-project leakage)
    expect(byData(render(), 'data-novel-character-id', 'beta-hero')).toBeDefined();
    expect(byData(render(), 'data-novel-character-id', 'mara')).toBeUndefined();
    // editor draft reset: name input is empty, not the alpha draft
    const betaName = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    expect(betaName?.props?.value).toBe('');
  });

  it('adjudicates a dirty form before leaving and cancels without navigating', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [ALPHA],
        projectOpen: async () => ({ project: ALPHA, layers: READY_LAYERS }),
      },
      { openProjectId: 'alpha' },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Dirty' } });

    (byData(render(), 'data-novel-back-to-projects', '')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-leave-confirm', '')).toBeDefined();
    // cancel keeps the project open and does not navigate
    (byData(render(), 'data-novel-leave-cancel', '')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-leave-confirm', '')).toBeUndefined();
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeUndefined();
    expect(render().props?.['data-novel-project-open']).toBe('alpha');
  });

  it('keeps the original project when a switch fails to open', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [ALPHA, BETA],
        projectOpen: async (id) => {
          if (id === 'alpha') return { project: ALPHA, layers: READY_LAYERS };
          throw new Error('cannot open beta');
        },
        characterList: async () => [character('mara', 'Mara')],
      },
      { openProjectId: 'alpha' },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    expect(render().props?.['data-novel-project-open']).toBe('alpha');

    // browse to switch
    (byData(render(), 'data-novel-back-to-projects', '')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeDefined();

    // attempt to open beta → fails with a recoverable error, original kept
    (projectButton(render(), 'beta')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-project-error', '')).toBeDefined();
    expect(render().props?.['data-novel-project-open']).toBe('alpha');

    // cancel browsing → back to alpha, its data still intact
    (byData(render(), 'data-novel-browse-cancel', '')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-project-open']).toBe('alpha');
    expect(byData(render(), 'data-novel-character-id', 'mara')).toBeDefined();
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
          load: async () => ({ providerId: 'novel-custom', baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', hasKey: true, maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high' }),
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
    expect(saves).toEqual([{ input: { baseUrl: 'https://new.example.com/v1', model: 'gpt-4o', apiKey: '', maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high' } }]);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-llm-message'] !== undefined)).toBe(true);
  });

  it('adjusts maxTokens, thinking and effort controls and submits them on save', async () => {
    const saves: Array<{ input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        llmConfig: {
          load: async () => ({ providerId: 'novel-custom', baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', hasKey: true, maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high' }),
          save: async (input) => { saves.push({ input }); return { ok: true, value: { ok: true, modelRef: 'novel-custom/gpt-4o' } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    const maxTokens = collect(tree, 'select').find((node) => node.props?.['data-novel-llm-max-tokens'] === '');
    const thinking = collect(tree, 'select').find((node) => node.props?.['data-novel-llm-thinking'] === '');
    const effort = collect(tree, 'select').find((node) => node.props?.['data-novel-llm-effort'] === '');
    expect(maxTokens).toBeDefined();
    expect(thinking).toBeDefined();
    expect(effort).toBeDefined();
    (maxTokens?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '131072' } });
    (thinking?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'disabled' } });
    (effort?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'low' } });
    const after = render();
    expect(after && collect(after, 'select').find((node) => node.props?.['data-novel-llm-effort'] === '')?.props?.disabled).toBe(true);
    (collect(after, 'button').find((node) => node.props?.['data-novel-llm-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(saves).toEqual([{ input: { baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', apiKey: '', maxTokens: 131072, thinking: 'disabled', reasoningEffort: 'low' } }]);
  });

  it('blocks save when the key is missing and none is stored', async () => {
    const saves: unknown[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        llmConfig: {
          load: async () => ({ providerId: 'novel-custom', baseUrl: '', model: '', hasKey: false, maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high' }),
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

  it('edits and saves creation settings (word target and ask-when-thin)', async () => {
    const saves: Array<{ input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        workbenchSettings: {
          load: async () => ({ wordTarget: 500, askWhenThin: true }),
          save: async (input) => { saves.push({ input }); return { ok: true, value: { wordTarget: 1200, askWhenThin: false } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-workbench-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    const word = collect(tree, 'input').find((node) => node.props?.['data-novel-workbench-word-target'] === '');
    const ask = collect(tree, 'input').find((node) => node.props?.['data-novel-workbench-ask-thin'] === '');
    expect(word).toBeDefined();
    expect(ask).toBeDefined();
    (word?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '1200' } });
    (ask?.props?.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    const after = render();
    (collect(after, 'button').find((node) => node.props?.['data-novel-workbench-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(saves).toEqual([{ input: { wordTarget: 1200, askWhenThin: false } }]);
  });

  it('adds, views and edits a detail beat under a beat', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        outlineRead: async () => ({ id: 'outline', structure: 'three-act', logline: '一句话梗概', themes: [], acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '开局', beats: [{ id: 'beat-1', title: '第一节', description: '火车上', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] }] }], foreshadowing: [], endings: [] }),
        outlineSave: async (input) => input,
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-layer'] === 'outline')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-act'] === 'act-1')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-beat'] === 'beat-1')?.props?.onClick as () => void)();
    await flush();
    // 手动新增细纲场景卡。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-add-detail'] === '')?.props?.onClick as () => void)();
    await flush();
    const card = collect(render(), 'button').find((node) => node.props?.['data-novel-detail-card'] !== undefined);
    expect(card).toBeDefined();
    // 点击卡片 → 查看/编辑面板出现。
    (card?.props?.onClick as () => void)();
    await flush();
    const editor = collect(render(), 'div').find((node) => node.props?.['data-novel-detail-card-editor'] !== undefined);
    expect(editor).toBeDefined();
    // 编辑标题 → 列表卡片同步更新。
    const titleInput = collect(editor as unknown as FakeNode, 'input')[0];
    (titleInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '火车相遇' } });
    await flush();
    const updated = collect(render(), 'button').find((node) => node.props?.['data-novel-detail-card'] !== undefined);
    const titleText = (updated?.children?.[0] as FakeNode | undefined)?.children?.[0];
    expect(String(titleText ?? '')).toContain('火车相遇');
  });

  it('opens the selected project landing folder from creation settings', async () => {
    const opened: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        workbenchSettings: {
          load: async () => ({ wordTarget: 500, askWhenThin: true }),
          openProjectFolder: async (projectId) => { opened.push(projectId); return { opened: true, path: `C:\\projects\\${projectId}` }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-workbench-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-open-project-folder'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(opened).toEqual(['fixture-project']);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-workbench-message'] !== undefined)).toBe(true);
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
      {
        onboardingAnalyzer: {
          begin: async () => ({ onboardingSessionId: 'sess-1' }),
          status: async () => 'failed',
          result: async () => { throw new Error(contractError); },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    // 原文入口只在独立「六层初始化审阅」页签渲染，先切到该页签。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
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
    // I57：失败经 status→result 链路落入 analysis 面板（可重试，不砖化）。
    const error = collect(render(), 'p').find((node) => node.props?.['data-novel-analysis-error'] !== undefined);
    expect(error).toBeDefined();
    expect(String(error?.children?.[0] ?? '')).toContain('不符合六层候选契约');
    // 失败后出现重试入口。
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-analysis-retry'] === '')).toBe(true);
  });

  it('shows the generated candidate content per layer before any verdict', async () => {
    const layers = {
      characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '见习测绘师', motivation: '追查守夜人', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
      worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: analyzerStub(layers),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    // 原文入口只在独立「六层初始化审阅」页签渲染，先切到该页签。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    const textarea = collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');
    const start = collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
    (start?.props?.onClick as () => void)();
    await flush();
    const value = collect(render(), 'span').find((node) => node.props?.['data-novel-onboarding-value'] === 'characters');
    expect(value).toBeDefined();
    expect(String(value?.children?.[0] ?? '')).toContain('米拉');
  });

  it('keeps the six-layer review on its own nav tab, never under layer tabs', async () => {
    const layers = {
      characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '见习测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
      worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: analyzerStub(layers),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const navClick = (marker: Record<string, unknown>) => {
      const button = collect(render(), 'button').find((node) => Object.entries(marker).some(([k, v]) => node.props?.[k] === v));
      (button?.props?.onClick as (() => void) | undefined)?.();
    };
    const reviewVisible = () => collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '');
    // 默认（角色层）不应出现审阅。
    expect(reviewVisible()).toBe(false);
    // 切到审阅页签：分析自动开始 → 审阅出现。
    navClick({ 'data-novel-onboarding-nav': '' });
    await flush();
    const tree = render();
    const textarea = collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');
    const start = collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港。' } });
    (start?.props?.onClick as () => void)();
    await flush();
    expect(reviewVisible()).toBe(true);
    // 切到角色层：审阅必须消失。
    navClick({ 'data-novel-layer': 'characters' });
    await flush();
    expect(reviewVisible()).toBe(false);
    // 切回审阅页签：审阅恢复。
    navClick({ 'data-novel-onboarding-nav': '' });
    await flush();
    expect(reviewVisible()).toBe(true);
  });
});

/** I56 夹具：仅 characters 有候选，其余五层为空候选。 */
const I56_LAYERS = {
  characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '见习测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
  worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
};

/** I57 session-first analyzer stub: begin→session, status→terminal, result→package. */
const analyzerStub = (layers: unknown, overrides: NonNullable<MountOptions['onboardingAnalyzer']> = {}) => ({
  begin: overrides.begin ?? (async () => ({ onboardingSessionId: 'sess-1' })),
  status: overrides.status ?? (async () => 'succeeded'),
  result: overrides.result ?? (async () => ({ projectId: 'fixture-project', onboardingSessionId: 'sess-1', sourceHash: 'a'.repeat(64), evidence: {}, layers })),
  cancel: overrides.cancel ?? (async () => undefined),
  start: overrides.start ?? (async () => { throw new Error('未注入 remote.novelOnboardingAnalyzer.start'); }),
});

/** I56：切到审阅页签、粘贴原文并启动分析，返回可随时重渲染的 render 函数。 */
async function openOnboardingReview(registrations: Record<string, Array<{ component: () => unknown }>>, layers: unknown): Promise<() => FakeNode> {
  // 等待 mount 的自动开项目循环完成，再进入审阅页签（与既有 I52 测试一致）。
  await flush();
  const render = () => registrations['shell.overlay'][0].component() as FakeNode;
  (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
  await flush();
  const tree = render();
  const textarea = collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');
  const start = collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
  (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
  (start?.props?.onClick as () => void)();
  // 等待分析结果落地再返回：自由文本经 crypto.subtle.digest（Node 线程池）后才
  // 启动分析，全量并行测试下宏任务延迟不确定，固定 flush 窗口会偶发先于审阅渲染
  // 返回（既有 I52/I56/I57 偶发竞态）；这里轮询直到候选值出现（最多 20 轮）。
  for (let round = 0; round < 20; round += 1) {
    await flush();
    if (collect(render(), 'span').some((node) => node.props?.['data-novel-onboarding-value'] !== undefined)) break;
  }
  return render;
}

describe('I56 six-layer adjudication correctness (R12-3)', () => {
  const baseMount = (onboarding: NonNullable<MountOptions['onboarding']>) => mount(
    () => Promise.resolve({ ok: true, value: READY_MODEL }),
    {},
    {
      onboardingAnalyzer: analyzerStub(I56_LAYERS),
      onboarding,
    },
  );

  it('修改后接受 opens a per-layer edit panel and submits the exact editedValue', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { registrations } = baseMount({
      adjudicate: async (input) => { calls.push(input as Record<string, unknown>); return { id: 'proposal-1', status: 'accepted' }; },
    });
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const clickVerdict = (layer: string, decision: string) => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      (button?.props?.onClick as () => void)();
    };
    clickVerdict('characters', 'edit');
    await flush();
    // 面板打开且预填当前候选 JSON。
    const editText = collect(render(), 'textarea').find((node) => node.props?.['data-novel-onboarding-edit-text'] === 'characters');
    expect(editText).toBeDefined();
    const editedLayer = {
      candidates: [{ ...(I56_LAYERS.characters.candidates[0] as { id: string }), personality: '大胆' }],
      confidence: 'high', warnings: [], evidenceIds: ['e1'],
    };
    (editText?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: JSON.stringify(editedLayer) } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-edit-confirm'] === 'characters')?.props?.onClick as () => void)();
    await flush();
    // Host 精确收到用户值（Remote payload 断言），且状态翻转为已修改并接受。
    expect(calls).toHaveLength(1);
    expect(calls[0].layer).toBe('characters');
    expect(calls[0].decision).toBe('edit');
    expect(calls[0].editedValue).toEqual(editedLayer);
    const status = collect(render(), 'span').find((node) => node.props?.['data-novel-onboarding-status'] === 'characters');
    expect(String(status?.children?.[0] ?? '')).toContain('已修改并接受');
  });

  it('非法 JSON 编辑值阻止提交且不调用 Remote', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { registrations } = baseMount({
      adjudicate: async (input) => { calls.push(input as Record<string, unknown>); return { id: 'proposal-1', status: 'accepted' }; },
    });
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const editButton = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === 'characters' && node.props?.['data-novel-onboarding-decision'] === 'edit');
    (editButton?.props?.onClick as () => void)();
    await flush();
    const editText = collect(render(), 'textarea').find((node) => node.props?.['data-novel-onboarding-edit-text'] === 'characters');
    (editText?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '{ 不是合法 JSON' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-edit-confirm'] === 'characters')?.props?.onClick as () => void)();
    await flush();
    expect(calls).toEqual([]);
    const error = collect(render(), 'p').find((node) => node.props?.['data-novel-onboarding-error'] !== undefined);
    expect(String(error?.children?.[0] ?? '')).toContain('不是合法 JSON');
  });

  it('打回重生成 opens a feedback panel and submits the user feedback', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { registrations } = baseMount({
      adjudicate: async (input) => { calls.push(input as Record<string, unknown>); return { id: 'proposal-2', status: 'pending' }; },
    });
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const regenButton = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === 'characters' && node.props?.['data-novel-onboarding-decision'] === 'regenerate');
    (regenButton?.props?.onClick as () => void)();
    await flush();
    const feedback = collect(render(), 'textarea').find((node) => node.props?.['data-novel-onboarding-feedback'] === 'characters');
    expect(feedback).toBeDefined();
    (feedback?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '角色缺少动机，请补充' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-regenerate-confirm'] === 'characters')?.props?.onClick as () => void)();
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].decision).toBe('regenerate');
    expect(calls[0].feedback).toBe('角色缺少动机，请补充');
    // 重生成后继仍 pending：状态提示待再次裁决。
    const status = collect(render(), 'span').find((node) => node.props?.['data-novel-onboarding-status'] === 'characters');
    expect(String(status?.children?.[0] ?? '')).toContain('已重生成');
  });

  it('apply 在六层全部进入终态前禁用，资格文案实时更新', async () => {
    const { registrations } = baseMount({
      adjudicate: async () => ({ id: 'proposal-1', status: 'accepted' }),
    });
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const apply = () => collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-apply'] === '');
    const eligibility = () => collect(render(), 'p').find((node) => node.props?.['data-novel-onboarding-eligibility'] !== undefined);
    expect(apply()?.props?.disabled).toBe(true);
    expect(String(eligibility()?.children?.[0] ?? '')).toContain('待 6 层');
    const clickVerdict = (layer: string, decision: string) => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      (button?.props?.onClick as () => void)();
    };
    clickVerdict('characters', 'accept');
    await flush();
    expect(String(eligibility()?.children?.[0] ?? '')).toContain('待 5 层');
    for (const layer of ['worldview', 'outline', 'relationship', 'state', 'canon']) {
      clickVerdict(layer, 'skip');
      await flush();
    }
    expect(apply()?.props?.disabled).toBe(false);
    expect(String(eligibility()?.children?.[0] ?? '')).toContain('已锁定');
  });

  it('空候选层禁用接受/修改后接受，仍可重生成与跳过；状态显示无候选', async () => {
    const { registrations } = baseMount({
      adjudicate: async () => ({ id: 'proposal-1', status: 'accepted' }),
    });
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const verdictDisabled = (layer: string, decision: string): boolean => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      return button?.props?.disabled === true;
    };
    expect(verdictDisabled('worldview', 'accept')).toBe(true);
    expect(verdictDisabled('worldview', 'edit')).toBe(true);
    expect(verdictDisabled('worldview', 'regenerate')).toBe(false);
    expect(verdictDisabled('worldview', 'skip')).toBe(false);
    expect(verdictDisabled('characters', 'accept')).toBe(false);
    const status = collect(render(), 'span').find((node) => node.props?.['data-novel-onboarding-status'] === 'worldview');
    expect(String(status?.children?.[0] ?? '')).toContain('无候选');
  });
});

describe('I57 初始化进度、取消、重试与应用刷新 (R12-4)', () => {
  const startButton = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
  const textareaOf = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');

  it('防重复 start：分析进行中再次点击不发起第二个 begin', async () => {
    const begins: Array<unknown> = [];
    const { registrations, overlayCleanups } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: {
          begin: async (input) => { begins.push(input); return { onboardingSessionId: 'sess-1' }; },
          status: async () => 'running',
          result: async () => ({}),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const clickStart = () => {
      const tree = render();
      (textareaOf(tree)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
      (startButton(tree)?.props?.onClick as () => void)();
    };
    clickStart();
    await flush();
    // 分析进行中（running）：按钮禁用 + 再次点击不产生第二个 begin（R12-4 防重复）。
    expect(startButton(render())?.props?.disabled).toBe(true);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-analysis-status'] === 'running')).toBe(true);
    clickStart();
    await flush();
    expect(begins).toHaveLength(1);
    // 清理轮询定时器，避免本测试残留的 running 轮询跨测试泄漏。
    overlayCleanups[0]();
    await flush();
  });

  it('busy/progress + 取消：取消调 Host cancel 且零层写入、零 apply', async () => {
    const cancels: string[] = [];
    let applies = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: {
          begin: async () => ({ onboardingSessionId: 'sess-1' }),
          status: async () => 'running',
          cancel: async (id) => { cancels.push(String(id)); },
        },
        onboarding: {
          finalApply: async () => { applies += 1; return { projectId: 'fixture-project', onboardingSessionId: 'sess-1', appliedLayers: [], skippedLayers: [], blockedLayers: [], pendingLayers: [], retryable: false, errors: [] }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    (textareaOf(tree)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
    (startButton(tree)?.props?.onClick as () => void)();
    await flush();
    // 分析进行中：busy 面板 + 取消按钮可见，未进入审阅（无候选值）。
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-analysis-cancel'] === '')).toBe(true);
    expect(collect(render(), 'span').some((node) => node.props?.['data-novel-onboarding-value'] !== undefined)).toBe(false);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-analysis-cancel'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(cancels).toEqual(['sess-1']);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-analysis-error'] !== undefined)).toBe(true);
    // 取消零层写入：无候选展示、无 apply、无终态门。
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-onboarding-apply'] === '' && node.props?.disabled !== true)).toBe(false);
    expect(applies).toBe(0);
  });

  it('错误可重试不砖化：失败显示可读错误，重试复用原文重新 begin 成功', async () => {
    const begins: Array<unknown> = [];
    let failed = true;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: {
          begin: async (input) => { begins.push(input); return { onboardingSessionId: 'sess-1' }; },
          status: async () => (failed ? 'failed' : 'succeeded'),
          result: async () => {
            if (failed) throw new Error('模型输出不符合六层候选契约（测试失败夹具）');
            return { projectId: 'fixture-project', onboardingSessionId: 'sess-1', sourceHash: 'a'.repeat(64), evidence: {}, layers: I56_LAYERS };
          },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const clickStart = () => {
      const tree = render();
      (textareaOf(tree)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
      (startButton(tree)?.props?.onClick as () => void)();
    };
    clickStart();
    await flush();
    // 失败：可读错误 + 重试按钮，UI 未砖化（按钮仍可用）。
    const error = collect(render(), 'p').find((node) => node.props?.['data-novel-analysis-error'] !== undefined);
    expect(String(error?.children?.[0] ?? '')).toContain('不符合六层候选契约');
    const retry = collect(render(), 'button').find((node) => node.props?.['data-novel-analysis-retry'] === '');
    expect(retry).toBeDefined();
    failed = false;
    (retry?.props?.onClick as () => void)();
    await flush();
    expect(begins).toHaveLength(2);
    // 重试成功后进入审阅（候选值可见）。
    expect(collect(render(), 'span').some((node) => node.props?.['data-novel-onboarding-value'] === 'characters')).toBe(true);
  });

  it('成功刷新六层：final apply 成功 → 重新 open 作品并刷新六层、激活创作台', async () => {
    const opens: string[] = [];
    const characterReads: string[] = [];
    let applies = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectOpen: async (id) => { opens.push(String(id)); return { project: { id, name: '夹具作品' }, layers: { characters: 'ready', worldview: 'ready', outline: 'ready', relationship: 'ready', state: 'ready', canon: 'ready' } }; },
        characterList: async () => { characterReads.push('list'); return []; },
      },
      {
        onboardingAnalyzer: analyzerStub(I56_LAYERS),
        onboarding: {
          adjudicate: async () => ({ id: 'proposal-1', status: 'accepted' }),
          finalApply: async () => {
            applies += 1;
            return { projectId: 'fixture-project', onboardingSessionId: 'sess-1', appliedLayers: ['characters'], skippedLayers: ['worldview', 'outline', 'relationship', 'state', 'canon'], blockedLayers: [], pendingLayers: [], retryable: false, errors: [] };
          },
        },
      },
    );
    await flush();
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const clickVerdict = (layer: string, decision: string) => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      (button?.props?.onClick as () => void)();
    };
    for (const layer of ['characters', 'worldview', 'outline', 'state', 'canon']) {
      clickVerdict(layer, 'accept');
      await flush();
    }
    clickVerdict('relationship', 'skip');
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-apply'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(applies).toBe(1);
    // 成功：离开审阅页签、重新打开作品并刷新六层、激活创作台。
    expect(opens.length).toBeGreaterThanOrEqual(2);
    expect(characterReads.length).toBeGreaterThanOrEqual(2);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '')).toBe(false);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-layer-panel'] === 'characters' && node.props?.['data-novel-layer-state'] === 'ready')).toBe(true);
  });

  it('partial retry：部分失败分层显示且重试只再次调用 finalApply', async () => {
    const applyCalls: Array<Record<string, unknown>> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: analyzerStub(I56_LAYERS),
        onboarding: {
          adjudicate: async () => ({ id: 'proposal-1', status: 'accepted' }),
          finalApply: async (input) => {
            applyCalls.push(input as Record<string, unknown>);
            if (applyCalls.length === 1) {
              return { projectId: 'fixture-project', onboardingSessionId: 'sess-1', appliedLayers: ['characters'], skippedLayers: [], blockedLayers: ['outline', 'state'], pendingLayers: [], retryable: true, errors: ['outline: blocked by an earlier failed prerequisite layer', 'state: blocked by an earlier failed prerequisite layer'] };
            }
            return { projectId: 'fixture-project', onboardingSessionId: 'sess-1', appliedLayers: ['characters', 'outline', 'state'], skippedLayers: [], blockedLayers: [], pendingLayers: [], retryable: false, errors: [] };
          },
        },
      },
    );
    await flush();
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const clickVerdict = (layer: string, decision: string) => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      (button?.props?.onClick as () => void)();
    };
    for (const layer of ['characters', 'worldview', 'outline', 'state', 'canon']) {
      clickVerdict(layer, 'accept');
      await flush();
    }
    clickVerdict('relationship', 'skip');
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-apply'] === '')?.props?.onClick as () => void)();
    await flush();
    // 分层显示：已应用/被阻断可读；重试按钮出现。
    const applied = collect(render(), 'dd').find((node) => node.props?.['data-novel-onboarding-applied'] !== undefined);
    expect(String(applied?.children?.[0] ?? '')).toContain('characters');
    const blockedText = ((): string => {
      const visit = (current: unknown): string => {
        if (current == null || typeof current !== 'object') return String(current);
        const n = current as FakeNode;
        return (n.children ?? []).map(visit).join('');
      };
      return visit(collect(render(), 'dl').find((node) => node.props?.['data-novel-onboarding-result'] === '') as unknown);
    })();
    expect(blockedText).toContain('outline');
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-onboarding-apply-retry'] === '')).toBe(true);
    // 重试：再次调用 finalApply（Host 幂等，只补未完成层）。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-apply-retry'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(applyCalls).toHaveLength(2);
    expect(applyCalls[1].onboardingSessionId).toBe('sess-1');
  });

  it('Fiber dispose 后分析轮询监听归零：卸载后不再查询 status', async () => {
    let statusCalls = 0;
    const { registrations, overlayCleanups } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: {
          begin: async () => ({ onboardingSessionId: 'sess-1' }),
          status: async () => { statusCalls += 1; return 'running'; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    (textareaOf(tree)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
    (startButton(tree)?.props?.onClick as () => void)();
    await flush();
    expect(statusCalls).toBeGreaterThanOrEqual(1);
    const before = statusCalls;
    overlayCleanups[0]();
    await flush();
    // 卸载清空轮询定时器：等待超过一个轮询间隔后 status 不再被调用（监听归零）。
    await new Promise((resolve) => { setTimeout(resolve, 900); });
    expect(statusCalls).toBe(before);
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

describe('I54 右侧停靠侧板（D20 / §14.8 / R12-1）', () => {
  it('docks the workbench right, full-height and non-modal in shell.overlay', () => {
    // 贴右全高：position:fixed + top/right/bottom:0；width:min(860px,100vw) 让窄屏占满主视区仍同一 Slot。
    expect(WORKBENCH_STYLES).toContain('position: fixed');
    expect(WORKBENCH_STYLES).toContain('top: 0');
    expect(WORKBENCH_STYLES).toContain('right: 0');
    expect(WORKBENCH_STYLES).toContain('bottom: 0');
    expect(WORKBENCH_STYLES).toContain('height: 100%');
    expect(WORKBENCH_STYLES).toContain('width: min(860px, 100vw)');
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

  it('keeps exactly one shell.overlay body plus the sidebar.footer.action toggle, never a single slot', async () => {
    const { entry, registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    expect(entry.inject).toEqual(['slots', 'remote']);
    expect(Object.keys(registrations).sort()).toEqual(['shell.overlay', 'sidebar.footer.action']);
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
    // 迁移映射：写作={大纲,正文} 策划={角色,世界观} 连续性={关系,状态,正史} 设置={初始化,创作设置,LLM 设置}。
    const itemsOf = (group: FakeNode | undefined): unknown[] => collect(group, 'button').filter((n) => n.props?.['data-novel-view'] !== undefined).map((n) => n.props?.['data-novel-view']);
    expect(itemsOf(navGroupOf(tree, 'writing'))).toEqual(['outline', 'chapters']);
    expect(itemsOf(navGroupOf(tree, 'planning'))).toEqual(['characters', 'worldview']);
    expect(itemsOf(navGroupOf(tree, 'continuity'))).toEqual(['relationship', 'state', 'canon']);
    expect(itemsOf(navGroupOf(tree, 'settings'))).toEqual(['onboarding', 'creationSettings', 'settings']);
  });

  it('navigates to every existing panel through the grouped nav with the stable data anchor', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const views = ['outline', 'chapters', 'characters', 'worldview', 'relationship', 'state', 'canon', 'onboarding', 'creationSettings', 'settings'];
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
    expect(grouped).toHaveLength(10);
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
    expect(NAV_ITEMS).toHaveLength(10);
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
    // 技术层编号只作徽标：七个层/正文项有 badge，非层视图无 badge。
    const badges = NAV_ITEMS.filter((item) => item.badge !== undefined).map((item) => item.badge);
    expect(badges).toEqual(['B5', 'C5', 'B3', 'B2', 'C1', 'C2', 'C4']);
    const noBadge = NAV_ITEMS.filter((item) => item.badge === undefined).map((item) => item.view);
    expect(noBadge).toEqual(['onboarding', 'creationSettings', 'settings']);
    // I60：层视图与正文视图是稳定视图（重复点击保持），设置类视图回退默认。
    expect(isStableView('chapters')).toBe(true);
    expect(isStableView('characters')).toBe(true);
    expect(isStableView('settings')).toBe(false);
  });
});

describe('I60 C5 章节/场景只读导航 (R13-1)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const chaptersTree = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'div').find((node) => node.props?.['data-novel-chapter-tree'] !== undefined);
  const sceneList = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'div').find((node) => node.props?.['data-novel-chapter-scenes'] !== undefined);
  const bodyPane = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'div').find((node) => node.props?.['data-novel-scene-body'] !== undefined);
  const paragraphs = (tree: FakeNode): string[] =>
    collect(tree, 'p').filter((node) => node.props?.['className'] === 'nv-chapters__paragraph').map((node) => String(node.children?.[0] ?? ''));

  const CHAPTER_LIST = [
    { id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft', sceneCount: 2 },
    { id: 'chapter-2', index: 2, title: '第二章', pov: 'lin', status: 'draft', sceneCount: 1 },
  ];
  const CHAPTER_1_READ = {
    ok: true,
    value: {
      id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft',
      scenes: [
        { id: 'scene-1', index: 0, summary: '相遇' },
        { id: 'scene-2', index: 1, summary: '分别' },
      ],
    },
  };
  const SCENE_1_READ = {
    ok: true,
    value: {
      chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'lin' },
      scene: { id: 'scene-1', index: 0, summary: '相遇', content: '第一段。\n\n第二段。', beats: [], canonEvents: [], notes: '' },
    },
  };
  const SCENE_2_READ = {
    ok: true,
    value: {
      chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'lin' },
      scene: { id: 'scene-2', index: 1, summary: '分别', content: '第三段。', beats: [], canonEvents: [], notes: '' },
    },
  };

  it('写作组新增「正文」视图；章节树/场景列表/正文按 Host 只读投影渲染', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => CHAPTER_LIST,
      chapterRead: async (_projectId, chapterId) => (chapterId === 'chapter-1' ? CHAPTER_1_READ : { ok: true, value: { id: chapterId, index: 2, title: '第二章', pov: 'lin', status: 'draft', scenes: [] } }),
      sceneRead: async (_projectId, _chapterId, sceneId) => (sceneId === 'scene-1' ? SCENE_1_READ : SCENE_2_READ),
    });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const chaptersButton = navButton(render(), 'chapters');
    expect(chaptersButton, '正文 nav button').toBeDefined();
    (chaptersButton?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    expect(tree.props?.['data-novel-route']).toBe('chapters');
    expect(collect(tree, 'section').some((n) => n.props?.['data-novel-chapters-panel'] !== undefined)).toBe(true);
    // 章节树（按 Host 返回顺序）与场景列空态（未选章节）。
    const chapterItems = collect(tree, 'button').filter((n) => n.props?.['data-novel-chapter-item'] !== undefined);
    expect(chapterItems.map((n) => n.props?.['data-novel-chapter-item'])).toEqual(['chapter-1', 'chapter-2']);
    expect(collect(sceneList(tree) ?? ({} as FakeNode), 'p').map((node) => String(node.children?.[0] ?? ''))).toContain('选择左侧章节查看场景。');
    // 选择第一章 → chapterRead → 场景列表 + 自动读取首个场景（sceneRead）。
    (chapterItems[0]?.props?.onClick as () => void)();
    await flush();
    const tree2 = render();
    const sceneItems = collect(tree2, 'button').filter((n) => n.props?.['data-novel-scene-item'] !== undefined);
    expect(sceneItems.map((n) => n.props?.['data-novel-scene-item'])).toEqual(['scene-1', 'scene-2']);
    // 正文：首个场景自动选中并按空行拆段渲染（只经 sceneRead 投影）。
    expect(paragraphs(tree2)).toEqual(['第一段。', '第二段。']);
    // 切换场景 → 正文更新。
    (sceneItems[1]?.props?.onClick as () => void)();
    await flush();
    expect(paragraphs(render())).toEqual(['第三段。']);
  });

  it('空章：章节树显示 0 场景章节，场景列与正文区显示空态而不崩溃', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => [{ id: 'chapter-empty', index: 1, title: '空章', pov: 'lin', status: 'draft', sceneCount: 0 }],
      chapterRead: async () => ({ ok: true, value: { id: 'chapter-empty', index: 1, title: '空章', pov: 'lin', status: 'draft', scenes: [] } }),
      sceneRead: async () => { throw new Error('不应读取空章场景'); },
    });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-chapter-item'] === 'chapter-empty')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    // 场景列与正文区各有一个 data-novel-chapters-empty 空态。
    const empties = collect(tree, 'p').filter((n) => n.props?.['data-novel-chapters-empty'] !== undefined);
    expect(empties.length).toBeGreaterThanOrEqual(2);
    expect(collect(tree, 'button').some((n) => n.props?.['data-novel-scene-item'] !== undefined)).toBe(false);
  });

  it('错误态：章节读取失败显示错误与重试，重试成功后恢复场景列表与正文', async () => {
    let failChapter = true;
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => CHAPTER_LIST,
      chapterRead: async (_projectId, chapterId) => {
        if (failChapter) throw new Error('章节文档损坏');
        return chapterId === 'chapter-1' ? CHAPTER_1_READ : { ok: true, value: { id: chapterId, index: 2, title: '第二章', pov: 'lin', status: 'draft', scenes: [] } };
      },
      sceneRead: async (_projectId, _chapterId, sceneId) => (sceneId === 'scene-1' ? SCENE_1_READ : SCENE_2_READ),
    });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-chapter-item'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((n) => n.props?.['data-novel-chapters-error'] !== undefined)).toBe(true);
    // 重试（Host 已恢复）→ 场景列表与正文出现，错误态消失。
    failChapter = false;
    (collect(render(), 'button').find((n) => n.props?.['data-novel-chapters-retry'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    expect(collect(tree, 'div').some((n) => n.props?.['data-novel-chapters-error'] !== undefined)).toBe(false);
    expect(collect(tree, 'button').filter((n) => n.props?.['data-novel-scene-item'] !== undefined).length).toBe(2);
    expect(paragraphs(tree)).toEqual(['第一段。', '第二段。']);
  });

  it('正文视图是稳定视图：重复点击保持原位（不回退默认层视图）', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const button = navButton(render(), 'chapters');
    (button?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('chapters');
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('chapters');
    expect(chaptersTree(render())).toBeDefined();
    expect(bodyPane(render())).toBeDefined();
  });
});

describe('I61 C5 正文编辑与可选 reparse (R13-2)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const sceneTextarea = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'textarea').find((node) => node.props?.['data-novel-scene-text'] !== undefined);
  const byAnchor = (tree: FakeNode, anchor: string): FakeNode | undefined => {
    const found = collect(tree, 'button').find((node) => node.props?.[anchor] !== undefined)
      ?? collect(tree, 'p').find((node) => node.props?.[anchor] !== undefined)
      ?? collect(tree, 'div').find((node) => node.props?.[anchor] !== undefined);
    return found;
  };

  const CHAPTER_LIST = [
    { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', sceneCount: 2 },
    { id: 'chapter-2', index: 2, title: '第二章', pov: 'mira', status: 'draft', sceneCount: 1 },
  ];
  const SCENE_1 = { id: 'scene-1', index: 0, summary: '相遇', content: 'prefix TARGET suffix', beats: [], canonEvents: [], notes: '' };
  const SCENE_2 = { id: 'scene-2', index: 1, summary: '分别', content: '另一段正文', beats: [], canonEvents: [], notes: '' };
  const READ_1 = { ok: true, value: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '相遇' }, { id: 'scene-2', index: 1, summary: '分别' }] } };
  const READ_2 = { ok: true, value: { id: 'chapter-2', index: 2, title: '第二章', pov: 'mira', status: 'draft', scenes: [] } };

  /** 打开正文视图并选中 chapter-1/scene-1（自动装载正文）。 */
  async function openScene(overrides: WorkspaceOverrides): Promise<{ registrations: ReturnType<typeof mount>['registrations']; render: () => FakeNode }> {
    const m = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => CHAPTER_LIST,
      chapterRead: async (_projectId, chapterId) => (chapterId === 'chapter-1' ? READ_1 : READ_2),
      sceneRead: async (_projectId, _chapterId, sceneId) => ({ ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira' }, scene: sceneId === 'scene-1' ? SCENE_1 : SCENE_2 } }),
      ...overrides,
    });
    await flush();
    const render = () => m.registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-scene-item'] === 'scene-1')).toBe(true);
    return { registrations: m.registrations, render };
  }

  it('编辑模式：单一连续范围 diff 保存，sceneEdit 携带精确 range/replacement/baseHash，exact round-trip', async () => {
    const calls: Array<{ range: unknown; replacement: string; baseHash: string }> = [];
    const { render } = await openScene({
      sceneEdit: async (_p, _c, _s, range, replacement, baseHash) => {
        calls.push({ range, replacement, baseHash: baseHash ?? '' });
        return { ok: true, value: { scene: { ...SCENE_1, content: 'prefix replacement suffix' }, evidence: { before: 'before', after: 'after', unchangedPrefix: 'prefix ', unchangedSuffix: ' suffix' } } };
      },
    });
    // 默认只读正文 + 「编辑正文」入口（I60 阅读语义保留）。
    expect(collect(render(), 'p').some((node) => node.props?.['className'] === 'nv-chapters__paragraph')).toBe(true);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    const textarea = sceneTextarea(render());
    expect(textarea, '编辑模式 textarea').toBeDefined();
    // 修改草稿 → 单一范围 diff（TARGET → replacement，范围外不变）。
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'prefix replacement suffix' } });
    await flush();
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-scene-range'] === 'single')).toBe(true);
    // 保存修改 → 只写 C5：精确 range/replacement + 装载时 baseHash（测试桩 64 个零）。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].range).toEqual({ start: 7, end: 13 });
    expect(calls[0].replacement).toBe('replacement');
    expect(calls[0].baseHash).toBe('0'.repeat(64));
    // 保存状态：已保存；草稿不再 dirty（re-save 按钮禁用）。
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-save-state'] === 'saved')).toBe(true);
    expect((collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save'] !== undefined)?.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('保存并重解析：propose 携带 baseHash → 提案面板 → 确认后 sceneReparseAccept 走 fan-out，完成态', async () => {
    const proposed: Array<{ range: unknown; replacement: string; baseHash: string }> = [];
    const accepted: Array<{ range: unknown; replacement: string; proposalId: string; baseHash: string }> = [];
    const { render } = await openScene({
      sceneReparsePropose: async (_p, _c, _s, range, replacement, baseHash) => {
        proposed.push({ range, replacement, baseHash: baseHash ?? '' });
        return { ok: true, value: { proposalId: 'scene-reparse-abc', status: 'pending' } };
      },
      sceneReparseAccept: async (_p, _c, _s, range, replacement, proposalId, baseHash) => {
        accepted.push({ range, replacement, proposalId, baseHash: baseHash ?? '' });
        return { ok: true, value: { status: 'written', scene: { ...SCENE_1, content: 'prefix parsed suffix' }, layers: ['c2', 'c1', 'c3', 'c4', 'b2'] } };
      },
    });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    const textarea = sceneTextarea(render());
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'prefix parsed suffix' } });
    await flush();
    // 保存并重解析 → propose（不写层）。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save-reparse'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(proposed).toHaveLength(1);
    expect(proposed[0].range).toEqual({ start: 7, end: 13 });
    expect(proposed[0].replacement).toBe('parsed');
    expect(proposed[0].baseHash).toBe('0'.repeat(64));
    // 提案面板 + 草稿锁定（textarea disabled）。
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-scene-reparse-proposed'] !== undefined)).toBe(true);
    expect((sceneTextarea(render())?.props as { disabled?: boolean }).disabled).toBe(true);
    // 确认重解析 → accept 使用冻结的 range/replacement + proposalId + baseHash。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-reparse-accept'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toEqual({ range: { start: 7, end: 13 }, replacement: 'parsed', proposalId: 'scene-reparse-abc', baseHash: '0'.repeat(64) });
    // 完成态：显示已同步层；保存按钮因 dirty=false 禁用。
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-scene-reparse-done'] !== undefined)).toBe(true);
  });

  it('拒绝 reparse：sceneReparseReject 被调用，面板进入 rejected 态（结构层由 Host 保证不变）', async () => {
    const rejected: string[] = [];
    const { render } = await openScene({
      sceneReparsePropose: async () => ({ ok: true, value: { proposalId: 'scene-reparse-abc', status: 'pending' } }),
      sceneReparseReject: async (_p, proposalId) => { rejected.push(proposalId); return { ok: true, value: { proposalId, status: 'rejected' } }; },
    });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (sceneTextarea(render())?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'prefix parsed suffix' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save-reparse'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-reparse-reject'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(rejected).toEqual(['scene-reparse-abc']);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-scene-reparse-rejected'] !== undefined)).toBe(true);
    // 拒绝后草稿仍 dirty（未保存），可继续仅保存正文。
    expect((collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save'] !== undefined)?.props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('脏文本保护：未保存草稿切换场景先弹确认条；放弃后离开，取消则停留', async () => {
    let sceneReads = 0;
    const { render } = await openScene({
      sceneRead: async (_p, _c, sceneId) => { sceneReads += 1; return { ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira' }, scene: sceneId === 'scene-1' ? SCENE_1 : SCENE_2 } }; },
    });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (sceneTextarea(render())?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'prefix DIRTY suffix' } });
    await flush();
    const readsBefore = sceneReads;
    // 切换到 scene-2 → 脏文本确认条，且不发起读取。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-item'] === 'scene-2')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-scene-leave'] !== undefined)).toBe(true);
    expect(sceneReads).toBe(readsBefore);
    // 取消 → 停留当前场景。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-leave-cancel'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-scene-leave'] !== undefined)).toBe(false);
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-scene-item'] === 'scene-1' && String(node.props?.['className'] ?? '').includes('is-active'))).toBe(true);
    // 再次切换并放弃 → 真正读取 scene-2。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-item'] === 'scene-2')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-discard'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(sceneReads).toBeGreaterThan(readsBefore);
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-scene-item'] === 'scene-2' && String(node.props?.['className'] ?? '').includes('is-active'))).toBe(true);
  });

  it('保存修改重复点击至多一次 Remote（I59 防重复提交语义）', async () => {
    let editCalls = 0;
    const { render } = await openScene({
      sceneEdit: async () => { editCalls += 1; return { ok: true, value: { scene: { ...SCENE_1, content: 'prefix replacement suffix' }, evidence: { before: 'b', after: 'a', unchangedPrefix: 'prefix ', unchangedSuffix: ' suffix' } } }; },
    });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (sceneTextarea(render())?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'prefix replacement suffix' } });
    await flush();
    const saveButton = collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save'] !== undefined);
    (saveButton?.props?.onClick as () => void)();
    (saveButton?.props?.onClick as () => void)();
    await flush();
    expect(editCalls).toBe(1);
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
    // 无离开确认时 Esc 关闭面板（返回 null，关闭入口后续恢复焦点到 data-novel-launch）。
    esc()?.({ key: 'Escape', preventDefault: () => {} });
    expect(render()).toBeNull();
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
