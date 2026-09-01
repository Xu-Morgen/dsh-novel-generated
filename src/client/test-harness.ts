/**
 * I83 共享 Client 测试 harness 组合根（架构审查 §4.2；计划 §18 I95 拆分）：
 * fake runtime（fake React / fake slots·remote·effect / fake defineStore 的
 * mount()、flush()、collect()、FakeFileReader 与全局清理）保留在本文件；remote
 * builders（test-harness/remote-builders.ts）、DOM helpers
 * （test-harness/dom-helpers.ts）、onboarding fixtures
 * （test-harness/onboarding-fixtures.ts）各归自有切片，经本文件兼容重导出。
 * 本文件不匹配 vitest 的 *.test.ts 模式，也不进入构建产物（tsconfig.build.json exclude）。
 *
 * 用法：每个测试文件 import { mount, flush, ... } from "./client/test-harness.js"
 * 并在文件级注册 afterEach(cleanupClientTestEnv)。
 */

import factory from "../client.js";
export { factory };

import type { FakeNode } from "./test-harness/types.js";
import { collect } from "./test-harness/dom-helpers.js";
import { makeWorkspace, type MountOptions, type MountOptionsI136, type MountOptionsI138, type WorkspaceOverrides } from "./test-harness/remote-builders.js";

/** Fake React: `createElement` only — any JSX runtime use would fail to compile/run. */
export const fakeReact = {
  createElement: (tag: string, props: Record<string, unknown> | null, ...children: unknown[]): FakeNode =>
    ({ tag, props, children }),
};

export function mount(viewModel: () => Promise<unknown>, overrides: WorkspaceOverrides = {}, mountOptions: MountOptions & MountOptionsI136 & MountOptionsI138 = {}) {
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
  const writingStub = mountOptions.writing as (MountOptions['writing'] & MountOptionsI136['writing']) | undefined;
  const reviewStub = mountOptions.review;
  const reviewRepairStub = mountOptions.reviewRepair;
  const queueStub = mountOptions.queue;
  const knowledgeStub = mountOptions.knowledge;
  const ruleStyleStub = mountOptions.ruleStyle;
  const progressStub = mountOptions.progress;
  const importExportStub = mountOptions.importExport;
  const searchStub = mountOptions.search;
  const statisticsStub = mountOptions.statistics;
  const timelineStub = mountOptions.timeline;
  const branchStub = mountOptions.branch;
  const textMutationStub = mountOptions.textMutation;
  const sceneOutlineBindingStub = mountOptions.sceneOutlineBinding;
  const textDeletionStub = mountOptions.textDeletion;
  const outlineReconciliationStub = mountOptions.outlineReconciliation;
  const referenceAuditStub = mountOptions.referenceAudit;
  const referenceCorrectionStub = mountOptions.referenceCorrection;
  const outlineDetailGenerationStub = mountOptions.outlineDetailGeneration;
  const importInterpretationStub = mountOptions.importInterpretation;
  const importInterpretationAnalysisStub = mountOptions.importInterpretationAnalysis;
  const narrativeAdaptationStub = mountOptions.narrativeAdaptation;
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
    : name === 'remote.novelImportInterpretation' ? (importInterpretationStub ?? {
      create: async () => ({ projectId: 'fixture-project', importSessionId: 'import-sess-1', sourceHash: 'a'.repeat(64), intent: { sourceRole: 'idea', treatment: 'expand-outline' }, paragraphDecisions: [], status: 'draft', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }),
      read: async () => undefined,
      confirm: async (input: unknown) => ({ ...(input as Record<string, unknown>), status: 'confirmed', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }),
      discard: async (input: unknown) => ({ ...(input as Record<string, unknown>), status: 'discarded', intent: { sourceRole: 'idea', treatment: 'expand-outline' }, paragraphDecisions: [], createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }),
    })
    : name === 'remote.novelImportInterpretationAnalysis' ? (importInterpretationAnalysisStub ?? {
      begin: async (input: unknown) => input,
      status: async (input: unknown) => ({ ...(input as Record<string, unknown>), status: 'succeeded' }),
      cancel: async (input: unknown) => ({ ...(input as Record<string, unknown>), status: 'cancelled' }),
      result: async (input: unknown) => ({ ...(input as Record<string, unknown>), output: { sourceRole: 'idea', confidence: 'high', evidenceParagraphIds: ['paragraph-0001'], paragraphs: [{ paragraphId: 'paragraph-0001', role: 'plot-plan', confidence: 'high', evidence: 'fixture' }], rationale: 'fixture' } }),
    })
    : name === 'remote.novelNarrativeAdaptation' ? (narrativeAdaptationStub ?? {
      begin: async (input: unknown) => ({ ...(input as Record<string, unknown>), adaptationId: 'narrative-adaptation-1' }),
      status: async (input: unknown) => ({ ...(input as Record<string, unknown>), status: 'succeeded' }),
      cancel: async (input: unknown) => ({ ...(input as Record<string, unknown>), status: 'cancelled' }),
      result: async (input: unknown) => ({ ...(input as Record<string, unknown>), candidate: {} }),
    })
    : name === 'remote.novelWriting' ? {
      propose: writingStub?.propose ?? (async () => { throw new Error('未注入 remote.novelWriting.propose'); }),
      proposeAt: writingStub?.proposeAt ?? (async () => { throw new Error('未注入 remote.novelWriting.proposeAt'); }),
      preview: writingStub?.preview ?? (async () => { throw new Error('未注入 remote.novelWriting.preview'); }),
      previewLayers: (writingStub as { previewLayers?: (candidateId: string) => Promise<unknown> } | undefined)?.previewLayers ?? (async (candidateId: string) => ({
        candidateId, sourceHash: '0'.repeat(64), generationBaseline: { kind: 'no-outline-baseline' as const }, changes: [],
        validation: { status: 'pass' as const, violations: [] },
      })),
      adoptDraft: writingStub?.adoptDraft ?? (async () => { throw new Error('未注入 remote.novelWriting.adoptDraft'); }),
      adjudicate: writingStub?.adjudicate ?? (async () => { throw new Error('未注入 remote.novelWriting.adjudicate'); }),
      prepareFinalizationPlan: writingStub?.prepareFinalizationPlan ?? (async () => { throw new Error('未注入 remote.novelWriting.prepareFinalizationPlan'); }),
      readFinalizationPlan: writingStub?.readFinalizationPlan ?? (async () => { throw new Error('未注入 remote.novelWriting.readFinalizationPlan'); }),
      cancelFinalizationPlan: writingStub?.cancelFinalizationPlan ?? (async () => { throw new Error('未注入 remote.novelWriting.cancelFinalizationPlan'); }),
      proposeFinalization: writingStub?.proposeFinalization ?? (async () => { throw new Error('未注入 remote.novelWriting.proposeFinalization'); }),
      acceptFinalization: writingStub?.acceptFinalization ?? (async () => { throw new Error('未注入 remote.novelWriting.acceptFinalization'); }),
      rejectFinalization: writingStub?.rejectFinalization ?? (async () => { throw new Error('未注入 remote.novelWriting.rejectFinalization'); }),
    }
    : name === 'remote.novelReview' ? (reviewStub ?? {
      scan: async () => { throw new Error('未注入 remote.novelReview.scan'); },
      adjudicate: async () => { throw new Error('未注入 remote.novelReview.adjudicate'); },
      records: async () => { throw new Error('未注入 remote.novelReview.records'); },
      bookReadiness: async () => { throw new Error('未注入 remote.novelReview.bookReadiness'); },
      bookScan: async () => { throw new Error('未注入 remote.novelReview.bookScan'); },
    })
    : name === 'remote.novelReviewRepair' ? (reviewRepairStub ?? {
      propose: async () => { throw new Error('未注入 remote.novelReviewRepair.propose'); },
    })
    : name === 'remote.novelQueue' ? (queueStub ?? {
      status: async () => { throw new Error('未注入 remote.novelQueue.status'); },
      start: async () => { throw new Error('未注入 remote.novelQueue.start'); },
      startAt: async () => { throw new Error('未注入 remote.novelQueue.startAt'); },
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
      compileManuscript: async () => { throw new Error('未注入 remote.novelImportExport.compileManuscript'); },
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
    : name === 'remote.novelBranches' ? (branchStub ?? {
      list: async () => ({ branches: [] }),
      read: async () => ({ id: 'fixture-branch', label: 'fixture', chosen: true, content: '' }),
      save: async () => ({ branches: [], content: '' }),
      choose: async () => ({ branches: [], content: '' }),
      diff: async () => ({ from: { id: 'fixture-branch', label: 'fixture', chosen: true, content: '' }, to: { id: 'fixture-branch', label: 'fixture', chosen: true, content: '' }, lines: [] }),
      aggregate: async () => ({ projectId: 'fixture-project', chapters: [] }),
      chooseFresh: async () => ({ branches: [], content: '' }),
    })
    : name === 'remote.novelText' ? (textMutationStub ?? {
      fingerprint: async () => ({ fingerprint: 'a'.repeat(64) }),
      chapterCreate: async () => ({}), chapterUpdate: async () => ({}),
      sceneCreate: async () => ({}), sceneUpdate: async () => ({}), reorder: async () => ({}),
    })
    : name === 'remote.novelSceneOutlineBinding' ? (sceneOutlineBindingStub ?? {
      read: async () => ({ manual: [], effective: [], fingerprint: 'a'.repeat(64) }),
      save: async () => ({ manual: [], effective: [], fingerprint: 'a'.repeat(64) }),
      rebind: async () => ({ manual: [], effective: [], fingerprint: 'a'.repeat(64) }),
      unbind: async () => ({ manual: [], effective: [], fingerprint: 'a'.repeat(64) }),
      impact: async () => ({ kind: 'chapter', chapterId: 'fixture-chapter', bindings: [], fingerprint: 'a'.repeat(64) }),
    })
    : name === 'remote.novelTextDeletion' ? (textDeletionStub ?? {
      impact: async () => ({ status: 'ready', impact: { kind: 'chapter', chapterId: 'fixture-chapter', sceneCount: 0, branchCount: 0, proseCharacters: 0, sources: [], projectFingerprint: 'a'.repeat(64), targetFingerprint: 'a'.repeat(64), bindings: [], activeQueue: [], activeCandidates: [], historicalReferences: [], opaqueHistoryCount: 0, blockers: [], impactFingerprint: 'a'.repeat(64) } }),
      propose: async () => ({ status: 'pending', proposalId: 'fixture-delete-proposal', impact: {} }),
      apply: async () => ({ status: 'already-deleted', proposalId: 'fixture-delete-proposal', fingerprint: 'a'.repeat(64) }),
      reject: async () => ({ status: 'rejected', proposalId: 'fixture-delete-proposal' }),
    })
    : name === 'remote.novelOutlineReconciliation' ? (outlineReconciliationStub ?? {
      prepare: async () => { throw new Error('未注入 remote.novelOutlineReconciliation.prepare'); },
      regenerateOne: async () => { throw new Error('未注入 remote.novelOutlineReconciliation.regenerateOne'); },
      read: async () => { throw new Error('未注入 remote.novelOutlineReconciliation.read'); },
      cancel: async () => { throw new Error('未注入 remote.novelOutlineReconciliation.cancel'); },
      propose: async () => { throw new Error('未注入 remote.novelOutlineReconciliation.propose'); },
      accept: async () => { throw new Error('未注入 remote.novelOutlineReconciliation.accept'); },
      reject: async () => { throw new Error('未注入 remote.novelOutlineReconciliation.reject'); },
      finalize: async () => { throw new Error('未注入 remote.novelOutlineReconciliation.finalize'); },
      continue: async () => { throw new Error('未注入 remote.novelOutlineReconciliation.continue'); },
    })
    : name === 'remote.novelReferenceAudit' ? (referenceAuditStub ?? {
      list: async () => ({ ok: true, value: { projectId: 'fixture-project', records: [], nextCursor: null } }),
    })
    : name === 'remote.novelReferenceCorrection' ? (referenceCorrectionStub ?? {
      propose: async () => { throw new Error('未注入 remote.novelReferenceCorrection.propose'); },
      accept: async () => { throw new Error('未注入 remote.novelReferenceCorrection.accept'); },
      reject: async () => { throw new Error('未注入 remote.novelReferenceCorrection.reject'); },
      pending: async () => ({ ok: true, value: [] }),
    })
    : name === 'remote.novelOutlineDetailGeneration' ? (outlineDetailGenerationStub ?? {
      generate: async () => { throw new Error('未注入 remote.novelOutlineDetailGeneration.generate'); },
      read: async () => { throw new Error('未注入 remote.novelOutlineDetailGeneration.read'); },
      edit: async () => { throw new Error('未注入 remote.novelOutlineDetailGeneration.edit'); },
      regenerate: async () => { throw new Error('未注入 remote.novelOutlineDetailGeneration.regenerate'); },
      skip: async () => { throw new Error('未注入 remote.novelOutlineDetailGeneration.skip'); },
      propose: async () => { throw new Error('未注入 remote.novelOutlineDetailGeneration.propose'); },
      accept: async () => { throw new Error('未注入 remote.novelOutlineDetailGeneration.accept'); },
      reject: async () => { throw new Error('未注入 remote.novelOutlineDetailGeneration.reject'); },
      cancel: async () => { throw new Error('未注入 remote.novelOutlineDetailGeneration.cancel'); },
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

// I95 兼容重导出（拆分后外部符号入口不变）。
export { collect, layerButtons } from "./test-harness/dom-helpers.js";
export { I56_LAYERS, analyzerStub, openOnboardingReview } from "./test-harness/onboarding-fixtures.js";
export { makeWorkspace, READY_MODEL, type MountOptions, type MountOptionsI136, type MountOptionsI138, type WorkspaceOverrides } from "./test-harness/remote-builders.js";
export type { FakeNode } from "./test-harness/types.js";
