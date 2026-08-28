/**
 * I83 共享 Client 测试 harness（架构审查 §4.2「client.test.ts 约 350 行单文件
 * harness」）：从 client.test.ts 原样抽出 fake React / fake slots·remote·effect /
 * fake defineStore 的 mount()、flush()、collect()、FakeFileReader 与全局清理。
 * 由拆分后的 6 个测试文件共享；本文件不匹配 vitest 的 *.test.ts 模式，也不进入
 * 构建产物（tsconfig.build.json exclude）。
 *
 * 用法：每个测试文件 import { mount, flush, ... } from './client/test-harness.js'
 * 并在文件级注册 afterEach(cleanupClientTestEnv)。
 */

import factory from '../client.js';
export { factory };

export interface FakeNode { tag: string; props: Record<string, unknown> | null; children: unknown[]; }

/** Fake React: `createElement` only — any JSX runtime use would fail to compile/run. */
export const fakeReact = {
  createElement: (tag: string, props: Record<string, unknown> | null, ...children: unknown[]): FakeNode =>
    ({ tag, props, children }),
};

/** Overridable subset of the `novelWorkspace` remote for I47/I48/I49 round-trip tests. */
export interface MountOptions { deferStoreInjection?: boolean; openProjectId?: string | null; llmConfig?: { load?: () => Promise<unknown>; save?: (input: unknown) => Promise<unknown> }; workbenchSettings?: { load?: () => Promise<unknown>; save?: (input: unknown) => Promise<unknown>; openProjectFolder?: (projectId: string) => Promise<unknown> }; importExport?: { exportArchive?: (projectId: string, mode: string) => Promise<unknown>; exportText?: (projectId: string, format: string) => Promise<unknown>; restore?: (projectId: string, raw: string) => Promise<unknown>; importPreview?: (projectId: string, input: { fileName: string; format: string; text: string }) => Promise<unknown> }; search?: { build?: (projectId: string) => Promise<unknown>; drop?: (projectId: string) => Promise<unknown>; stats?: (projectId: string) => Promise<unknown>; search?: (projectId: string, query: string, pov?: string) => Promise<unknown>; references?: (projectId: string, key: string, pov?: string) => Promise<unknown> }; statistics?: { rebuild?: (projectId: string) => Promise<unknown>; drop?: (projectId: string) => Promise<unknown>; stats?: (projectId: string) => Promise<unknown>; overview?: (projectId: string) => Promise<unknown>; chapterDetail?: (projectId: string, chapterId: string) => Promise<unknown>; sceneCards?: (projectId: string, filter?: { actId?: string; beatId?: string; status?: string; limit?: number }) => Promise<unknown>; tasks?: (projectId: string, filter?: { status?: string; limit?: number }) => Promise<unknown> }; timeline?: { read?: (projectId: string) => Promise<unknown>; ensureFromOutline?: (projectId: string) => Promise<unknown>; setCurrentNode?: (projectId: string, nodeId: string | null) => Promise<unknown>; save?: (projectId: string, input: unknown) => Promise<unknown> }; onboardingAnalyzer?: { begin?: (input: unknown, settings: unknown) => Promise<unknown>; status?: (onboardingSessionId: string) => Promise<unknown>; cancel?: (onboardingSessionId: string) => Promise<unknown>; result?: (onboardingSessionId: string) => Promise<unknown>; start?: (input: unknown, settings: unknown) => Promise<unknown> }; onboarding?: { adjudicate?: (input: unknown, settings: unknown) => Promise<unknown>; acceptedLayers?: (onboardingSessionId: string) => Promise<unknown>; finalApply?: (input: unknown) => Promise<unknown> }; writing?: { propose?: (projectId: string, input: unknown) => Promise<unknown>; preview?: (candidateId: string) => Promise<unknown>; adjudicate?: (candidateId: string, decision: string) => Promise<unknown> }; review?: { scan?: (projectId: string) => Promise<unknown>; adjudicate?: (projectId: string, input: { decision: string; issueIds: string[] }) => Promise<unknown>; records?: (projectId: string) => Promise<unknown> }; queue?: { status?: (projectId: string) => Promise<unknown>; start?: (projectId: string, input?: unknown) => Promise<unknown>; pause?: (projectId: string) => Promise<unknown>; resume?: (projectId: string) => Promise<unknown>; cancel?: (projectId: string) => Promise<unknown>; retry?: (projectId: string, taskId: string) => Promise<unknown>; cancelTask?: (projectId: string, taskId: string) => Promise<unknown>; recover?: (projectId: string) => Promise<unknown> }; ruleStyle?: { list?: (projectId: string) => Promise<unknown>; readRule?: (projectId: string, ruleId: string) => Promise<unknown>; createRule?: (projectId: string, input: unknown) => Promise<unknown>; updateRule?: (projectId: string, ruleId: string, patch: unknown) => Promise<unknown>; readStyle?: (projectId: string) => Promise<unknown>; saveStyle?: (projectId: string, input: unknown) => Promise<unknown> }; knowledge?: { list?: (projectId: string) => Promise<unknown>; read?: (projectId: string, entryId: string) => Promise<unknown>; propose?: (projectId: string, input: unknown) => Promise<unknown>; accept?: (projectId: string, proposalId: string) => Promise<unknown>; reject?: (projectId: string, proposalId: string) => Promise<unknown>; pending?: (projectId: string) => Promise<unknown> }; progress?: { projection?: (projectId: string) => Promise<unknown>; recordDeviation?: (projectId: string, input: unknown) => Promise<unknown>; reconcileDeviation?: (projectId: string, deviationId: string) => Promise<unknown>; inspire?: (projectId: string, prompt?: string) => Promise<unknown>; select?: (projectId: string, input: unknown) => Promise<unknown>; apply?: (projectId: string, proposalId: string) => Promise<unknown>; reject?: (projectId: string, proposalId: string) => Promise<unknown>; pending?: (projectId: string) => Promise<unknown>; audit?: (projectId: string) => Promise<unknown> }; }

export interface WorkspaceOverrides {
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
  /** I65：B5 场景卡范围（生成队列勾选）。 */
  outlineBeatCards?: (projectId: string) => Promise<unknown[]>;
}

/** Full `novelWorkspace` remote stub so render-time loads do not throw. */
export const makeWorkspace = (viewModel: () => Promise<unknown>, overrides: WorkspaceOverrides = {}) => ({
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
  outlineBeatCards: overrides.outlineBeatCards ?? (async () => []),
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


export const READY_MODEL = {
  product: 'novel-creation-tool' as const,
  version: '2.0.0' as const,
  ready: true as const,
  capabilities: ['generate', 'rewrite', 'continue', 'inspire'] as const,
};

/** Depth-first collect of every element whose tag matches `tag`. */
export function collect(node: unknown, tag: string): FakeNode[] {
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
export function layerButtons(node: unknown): FakeNode[] {
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
export function mount(viewModel: () => Promise<unknown>, overrides: WorkspaceOverrides = {}, mountOptions: MountOptions = {}) {
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
  const writingStub = mountOptions.writing;
  const reviewStub = mountOptions.review;
  const queueStub = mountOptions.queue;
  const knowledgeStub = mountOptions.knowledge;
  const ruleStyleStub = mountOptions.ruleStyle;
  const progressStub = mountOptions.progress;
  const importExportStub = mountOptions.importExport;
  const searchStub = mountOptions.search;
  const statisticsStub = mountOptions.statistics;
  const timelineStub = mountOptions.timeline;
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
    : name === 'remote.novelWriting' ? (writingStub ?? {
      propose: async () => { throw new Error('未注入 remote.novelWriting.propose'); },
      preview: async () => { throw new Error('未注入 remote.novelWriting.preview'); },
      adjudicate: async () => { throw new Error('未注入 remote.novelWriting.adjudicate'); },
    })
    : name === 'remote.novelReview' ? (reviewStub ?? {
      scan: async () => { throw new Error('未注入 remote.novelReview.scan'); },
      adjudicate: async () => { throw new Error('未注入 remote.novelReview.adjudicate'); },
      records: async () => { throw new Error('未注入 remote.novelReview.records'); },
    })
    : name === 'remote.novelQueue' ? (queueStub ?? {
      status: async () => { throw new Error('未注入 remote.novelQueue.status'); },
      start: async () => { throw new Error('未注入 remote.novelQueue.start'); },
      pause: async () => { throw new Error('未注入 remote.novelQueue.pause'); },
      resume: async () => { throw new Error('未注入 remote.novelQueue.resume'); },
      cancel: async () => { throw new Error('未注入 remote.novelQueue.cancel'); },
      retry: async () => { throw new Error('未注入 remote.novelQueue.retry'); },
      cancelTask: async () => { throw new Error('未注入 remote.novelQueue.cancelTask'); },
      recover: async () => { throw new Error('未注入 remote.novelQueue.recover'); },
    })
    : name === 'remote.novelRuleStyleManager' ? (ruleStyleStub ?? {
      list: async () => { throw new Error('未注入 remote.novelRuleStyleManager.list'); },
      readRule: async () => { throw new Error('未注入 remote.novelRuleStyleManager.readRule'); },
      createRule: async () => { throw new Error('未注入 remote.novelRuleStyleManager.createRule'); },
      updateRule: async () => { throw new Error('未注入 remote.novelRuleStyleManager.updateRule'); },
      readStyle: async () => { throw new Error('未注入 remote.novelRuleStyleManager.readStyle'); },
      saveStyle: async () => { throw new Error('未注入 remote.novelRuleStyleManager.saveStyle'); },
    })
    : name === 'remote.novelKnowledgeManager' ? (knowledgeStub ?? {
      list: async () => { throw new Error('未注入 remote.novelKnowledgeManager.list'); },
      read: async () => { throw new Error('未注入 remote.novelKnowledgeManager.read'); },
      propose: async () => { throw new Error('未注入 remote.novelKnowledgeManager.propose'); },
      accept: async () => { throw new Error('未注入 remote.novelKnowledgeManager.accept'); },
      reject: async () => { throw new Error('未注入 remote.novelKnowledgeManager.reject'); },
      pending: async () => { throw new Error('未注入 remote.novelKnowledgeManager.pending'); },
    })
    : name === 'remote.novelOutlineProgress' ? (progressStub ?? {
      projection: async () => { throw new Error('未注入 remote.novelOutlineProgress.projection'); },
      recordDeviation: async () => { throw new Error('未注入 remote.novelOutlineProgress.recordDeviation'); },
      reconcileDeviation: async () => { throw new Error('未注入 remote.novelOutlineProgress.reconcileDeviation'); },
      inspire: async () => { throw new Error('未注入 remote.novelOutlineProgress.inspire'); },
      select: async () => { throw new Error('未注入 remote.novelOutlineProgress.select'); },
      apply: async () => { throw new Error('未注入 remote.novelOutlineProgress.apply'); },
      reject: async () => { throw new Error('未注入 remote.novelOutlineProgress.reject'); },
      pending: async () => { throw new Error('未注入 remote.novelOutlineProgress.pending'); },
      audit: async () => { throw new Error('未注入 remote.novelOutlineProgress.audit'); },
    })
    : name === 'remote.novelImportExport' ? (importExportStub ?? {
      exportArchive: async () => { throw new Error('未注入 remote.novelImportExport.exportArchive'); },
      exportText: async () => { throw new Error('未注入 remote.novelImportExport.exportText'); },
      restore: async () => { throw new Error('未注入 remote.novelImportExport.restore'); },
      importPreview: async () => { throw new Error('未注入 remote.novelImportExport.importPreview'); },
    })
    : name === 'remote.novelSearch' ? (searchStub ?? {
      build: async () => { throw new Error('未注入 remote.novelSearch.build'); },
      drop: async () => { throw new Error('未注入 remote.novelSearch.drop'); },
      stats: async () => { throw new Error('未注入 remote.novelSearch.stats'); },
      search: async () => { throw new Error('未注入 remote.novelSearch.search'); },
      references: async () => { throw new Error('未注入 remote.novelSearch.references'); },
    })
    : name === 'remote.novelStatistics' ? (statisticsStub ?? {
      rebuild: async () => { throw new Error('未注入 remote.novelStatistics.rebuild'); },
      drop: async () => { throw new Error('未注入 remote.novelStatistics.drop'); },
      stats: async () => { throw new Error('未注入 remote.novelStatistics.stats'); },
      overview: async () => { throw new Error('未注入 remote.novelStatistics.overview'); },
      chapterDetail: async () => { throw new Error('未注入 remote.novelStatistics.chapterDetail'); },
      sceneCards: async () => { throw new Error('未注入 remote.novelStatistics.sceneCards'); },
      tasks: async () => { throw new Error('未注入 remote.novelStatistics.tasks'); },
    })
    : name === 'remote.novelTimeline' ? (timelineStub ?? {
      read: async () => { throw new Error('未注入 remote.novelTimeline.read'); },
      ensureFromOutline: async () => { throw new Error('未注入 remote.novelTimeline.ensureFromOutline'); },
      setCurrentNode: async () => { throw new Error('未注入 remote.novelTimeline.setCurrentNode'); },
      save: async () => { throw new Error('未注入 remote.novelTimeline.save'); },
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

export const flush = async (): Promise<void> => {
  // 两轮宏任务窗口：Node `File.arrayBuffer()` 在宏任务边界落地，单轮 setTimeout(0)
  // 可能在其之前触发导致上传链竞态（全量运行下偶发失败）。
  for (let round = 0; round < 2; round += 1) {
    for (let i = 0; i < 8; i += 1) { await Promise.resolve(); }
    await new Promise((resolve) => { setTimeout(resolve, 0); });
  }
  for (let i = 0; i < 8; i += 1) { await Promise.resolve(); }
};

/** Node has no `FileReader`; the upload helper needs one to read the File. */
export class FakeFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: ArrayBuffer = new ArrayBuffer(0);
  readAsArrayBuffer(file: File) {
    void file.arrayBuffer().then((buffer) => { this.result = buffer; this.onload?.(); });
  }
}

/** 每个测试文件统一注册的全局清理：摘除 fake document / FileReader。 */
export function cleanupClientTestEnv(): void {
  delete (globalThis as unknown as { document?: unknown }).document;
  delete (globalThis as unknown as { FileReader?: unknown }).FileReader;
}


/** I56 夹具：仅 characters 有候选，其余五层为空候选。 */
export const I56_LAYERS = {
  characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '见习测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
  worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
};

/** I57 session-first analyzer stub: begin→session, status→terminal, result→package. */
export const analyzerStub = (layers: unknown, overrides: NonNullable<MountOptions['onboardingAnalyzer']> = {}) => ({
  begin: overrides.begin ?? (async () => ({ onboardingSessionId: 'sess-1' })),
  status: overrides.status ?? (async () => 'succeeded'),
  result: overrides.result ?? (async () => ({ projectId: 'fixture-project', onboardingSessionId: 'sess-1', sourceHash: 'a'.repeat(64), evidence: {}, layers })),
  cancel: overrides.cancel ?? (async () => undefined),
  start: overrides.start ?? (async () => { throw new Error('未注入 remote.novelOnboardingAnalyzer.start'); }),
});

/** I56：切到审阅页签、粘贴原文并启动分析，返回可随时重渲染的 render 函数。 */
export async function openOnboardingReview(registrations: Record<string, Array<{ component: () => unknown }>>, layers: unknown): Promise<() => FakeNode> {
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

