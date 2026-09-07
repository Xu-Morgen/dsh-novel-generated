import { useSourcePlanPanel } from './source-plan-panel.js';
import { ProjectDirectory } from './project-directory.js';
import { Button } from './ui/button.js';
import * as React from 'react';
import type { Root } from 'react-dom/client';

import { workbenchView, type WorkbenchUi } from '../../client/presenter.js';
import { WORKBENCH_STYLES } from '../../client/styles.js';
import type { OpsRuntime } from '../../client/ops/context.js';
import type {
  WorkbenchActions,
  WorkbenchNamespaces,
  WorkbenchOps,
  WorkbenchState,
  WorkbenchViewStates,
} from '../../client/store/types.js';
import type { WorkbenchViewId } from '../../client/nav.js';
import { workflowStageForView, workflowStageOf, writeWorkflowResume, type WorkflowStageId } from '../../client/workflow.js';
import { createSourceImportController, sourceImportGate, type SourceImportController, type SourceImportFormat } from '../../client/source-import.js';
import { createImportInterpretationController, paragraphsFromHostChunks, type ImportInterpretationController } from '../../client/import-interpretation-review.js';
import type { ImportInterpretationReviewState, RuleStyleStreamView } from '../../client/import-interpretation-review.js';
import { createDesktopUploadController, type DesktopUploadController } from './upload-controller.js';
import type { DesktopIpcClient } from './desktop-ipc-client.js';
import type { DesktopClientSnapshot } from './desktop-ipc-client.js';
import { createDesktopProjectWorkflow, type DesktopProjectWorkflow, type ProjectPreferenceStore } from './project-workflow.js';
import { createDesktopStructuredOps } from './structured-ops.js';
import { createDesktopFileDialog } from './file-dialog.js';
import { createQueuePollController } from '../../client/queue-poll.js';
import { createSettingsController, type SettingsController } from '../../client/controllers.js';
import type { DesktopStoreInstance } from './store-adapter.js';
import { useDesktopStore } from './store-adapter.js';
import { createDesktopAssistantClient, type DesktopAssistantClient } from './assistant-client.js';
import { DesktopAssistantPanel } from './assistant-panel.js';
import { createDesktopMigrationClient } from './migration-client.js';
import { DesktopMigrationPanel } from './migration-panel.js';

const NOOP = (): void => {};
const MEMORY_PREFERENCE = new Map<string, string>();
const FALLBACK_PREFERENCE: ProjectPreferenceStore = {
  getItem: (key) => MEMORY_PREFERENCE.get(key) ?? null,
  setItem: (key, value) => { MEMORY_PREFERENCE.set(key, value); },
  removeItem: (key) => { MEMORY_PREFERENCE.delete(key); },
};

const PENDING_NAMESPACES: WorkbenchNamespaces = {
  workspace: undefined,
  writing: undefined,
  reviewNamespace: undefined,
  reviewRepairNamespace: undefined,
  queueNamespace: undefined,
  knowledgeNamespace: undefined,
  ruleStyleNamespace: undefined,
  progressNamespace: undefined,
  importExportNamespace: undefined,
  branchNamespace: undefined,
  searchNamespace: undefined,
  statisticsNamespace: undefined,
  timelineNamespace: undefined,
  referenceAuditNamespace: undefined,
  referenceCorrectionNamespace: undefined,
  sceneOutlineBinding: undefined,
  textMutation: undefined,
  textDeletion: undefined,
  outlineReconciliation: undefined,
  onboardingNamespace: undefined,
  importInterpretation: undefined,
  importInterpretationAnalysis: undefined,
  longDraft: undefined,
  outlineDetailGeneration: undefined,
};

// I173 只挂载 presenter；在 I174 service bag 接线前，loading 分支不会读取领域 ops。
// Proxy 仍 fail closed，防止后续误把未接线操作当作成功。
const PENDING_OPS = new Proxy(Object.create(null) as WorkbenchOps, {
  get(_target, property) {
    throw new Error(`desktop workbench operation is unavailable before I174: ${String(property)}`);
  },
});

function desktopNamespaces(client: DesktopIpcClient): WorkbenchNamespaces {
  return {
    ...PENDING_NAMESPACES,
    workspace: client.services.workspace,
    writing: client.services.writing,
    reviewNamespace: client.services.reviewNamespace,
    reviewRepairNamespace: client.services.reviewRepairNamespace,
    queueNamespace: client.services.queueNamespace,
    knowledgeNamespace: client.services.knowledgeNamespace,
    ruleStyleNamespace: client.services.ruleStyleNamespace,
    progressNamespace: client.services.progressNamespace,
    importExportNamespace: client.services.importExportNamespace,
    branchNamespace: client.services.branchNamespace,
    searchNamespace: client.services.searchNamespace,
    statisticsNamespace: client.services.statisticsNamespace,
    timelineNamespace: client.services.timelineNamespace,
    sceneOutlineBinding: client.services.sceneOutlineBinding,
    textMutation: client.services.textMutation,
    textDeletion: client.services.textDeletion,
    outlineReconciliation: client.services.outlineReconciliation,
    outlineDetailGeneration: client.services.outlineDetailGeneration,
    referenceAuditNamespace: client.services.referenceAudit,
    referenceCorrectionNamespace: client.services.referenceCorrection,
    importInterpretation: client.services.importInterpretation,
    importInterpretationAnalysis: client.services.importInterpretationAnalysis,
  };
}

function viewStates(state: WorkbenchState): WorkbenchViewStates {
  return {
    workflow: state.workflow,
    layers: {
      characters: state.characters,
      worldview: state.worldview,
      outline: state.outline,
      relationship: state.relationship,
      state: state.state,
      canon: state.canon,
      characterEditor: state.characterEditor,
      worldEditor: state.worldEditor,
      outlineEditor: state.outlineEditor,
      relationshipEditor: state.relationshipEditor,
      stateEditor: state.stateEditor,
      canonEditor: state.canonEditor,
    },
    chapters: state.chapters,
    review: state.review,
    referenceReview: state.referenceReview,
    queue: state.queue,
    knowledge: state.knowledge,
    ruleStyle: state.ruleStyle,
    progress: state.progress,
    importExport: state.importExport,
    search: state.search,
    statistics: state.statistics,
    timeline: state.timeline,
    outlineDetailGeneration: state.outlineDetailGeneration,
    router: state.router,
  };
}

const RULE_STYLE_BEGIN_METHOD = 'novel-creation-tool/novelRuleStyleImportInitialization/begin';

/** Narrow and validate the live desktop progress event before it enters the presenter. */
export function desktopRuleStyleStream(progress: DesktopClientSnapshot['progress']): RuleStyleStreamView | undefined {
  if (progress?.methodId !== RULE_STYLE_BEGIN_METHOD || progress.value === null || typeof progress.value !== 'object' || Array.isArray(progress.value)) return undefined;
  const value = progress.value as Record<string, unknown>;
  const phases: readonly RuleStyleStreamView['phase'][] = ['checking-config', 'connecting', 'reasoning', 'generating', 'validating'];
  if (value.status !== 'running') return undefined;
  if (typeof value.streamPhase !== 'string' || !phases.includes(value.streamPhase as RuleStyleStreamView['phase'])) return undefined;
  if (typeof value.receivedCharacters !== 'number' || !Number.isSafeInteger(value.receivedCharacters) || value.receivedCharacters < 0) return undefined;
  if (typeof value.latestText !== 'string' || value.latestText.length > 240) return undefined;
  return { phase: value.streamPhase as RuleStyleStreamView['phase'], receivedCharacters: value.receivedCharacters, latestText: value.latestText };
}

/** Single in-app stream window; terminal progress makes this component return null automatically. */
export function DesktopLlmStreamWindow(props: { progress?: DesktopClientSnapshot['progress'] }): React.ReactElement | null {
  const stream = desktopRuleStyleStream(props.progress);
  if (stream === undefined) return null;
  const phase = stream.phase === 'checking-config' ? '检查 AI 配置'
    : stream.phase === 'connecting' ? '连接 AI 服务'
      : stream.phase === 'reasoning' ? 'AI 正在推理'
        : stream.phase === 'generating' ? `流式接收中 · ${stream.receivedCharacters} 字`
          : '校验生成结果';
  return React.createElement('aside', {
    className: 'nv-llm-stream-window', role: 'dialog', 'aria-label': 'AI 流式传输', 'aria-live': 'polite',
    'data-novel-llm-stream-window': stream.phase,
  },
  React.createElement('strong', { className: 'nv-llm-stream-window__phase' }, phase),
  React.createElement('p', { className: 'nv-llm-stream-window__content', title: stream.latestText || '等待模型返回首个内容片段' }, stream.latestText || '等待模型返回首个内容片段…'));
}

/**
 * I173 临时 UI adapter：只开放纯 Renderer 交互，业务命令显式保持未接线。
 * I174 会以 DesktopServiceBag 替换这些业务空操作；本迭代不会提前调用 IPC。
 */
interface DesktopShellControllers {
  readonly upload: DesktopUploadController;
  readonly sourceImport: SourceImportController;
  readonly importInterpretation: ImportInterpretationController;
  readonly settings: SettingsController;
}

export function createDesktopShellUi(state: WorkbenchState, actions: WorkbenchActions, workflow: DesktopProjectWorkflow, controllers?: DesktopShellControllers): WorkbenchUi {
  const persistWorkflowStage = (stage: WorkflowStageId): void => {
    if (state.selectedProjectId === undefined) return;
    writeWorkflowResume({
      projectId: state.selectedProjectId,
      stage,
      ...(state.workflow.chapterId ?? state.chapters.selectedChapterId ? { chapterId: state.workflow.chapterId ?? state.chapters.selectedChapterId } : {}),
      ...(state.workflow.sceneId ?? state.chapters.selectedSceneId ? { sceneId: state.workflow.sceneId ?? state.chapters.selectedSceneId } : {}),
    });
  };
  return {
    open: true,
    collapsed: state.collapsed,
    activeView: state.activeView,
    navWidth: state.navWidth,
    navResizeStart: actions.navResizeStart,
    navResizeMove: actions.navResizeMove,
    navResizeEnd: actions.navResizeEnd,
    navResizeStep: (delta) => actions.setNavWidth(state.navWidth + delta),
    panelWidth: state.panelWidth,
    panelResizeStart: actions.panelResizeStart,
    panelResizeMove: actions.panelResizeMove,
    panelResizeEnd: actions.panelResizeEnd,
    panelResizeStep: (delta) => actions.setPanelWidth(state.panelWidth + delta),
    collapse: actions.collapse,
    close: workflow.requestBrowse,
    activate: actions.activate,
    activateView: (view: WorkbenchViewId) => {
      const stage = workflowStageForView(view);
      if (stage !== undefined && state.selectedProjectId !== undefined) {
        actions.workflowStage(stage);
        persistWorkflowStage(stage);
      }
      actions.activateView(view);
      if (view === 'settings') controllers?.settings.ensureLlmConfigLoaded(state.settingsView === undefined);
    },
    openWorkflowStage: (stage: WorkflowStageId) => {
      if (state.selectedProjectId === undefined) return;
      actions.workflowStage(stage);
      persistWorkflowStage(stage);
      actions.activateView(stage === 'outline' && state.importInterpretationReview?.confirmed && state.outlineEditor.draft.acts.length === 0 ? 'onboarding' : workflowStageOf(stage).view);
    },
    activateOnboarding: actions.activateOnboarding,
    activateCreationSettings: actions.activateCreationSettings,
    toggleSettings: actions.toggleSettings,
    saveLlmConfig: () => controllers?.settings.saveLlmConfig(state.settingsDraft, state.settingsView?.hasKey ?? false) ?? NOOP(),
    saveCreationSettings: () => workflow.saveSettings(state.creationSettingsDraft),
    openCreationFolder: workflow.openProjectFolder,
    selectProject: workflow.requestOpen,
    archiveProject: workflow.archiveProject,
    restoreProject: workflow.restoreProject,
    newProjectName: state.newProjectName,
    newProjectNameChange: actions.newProjectName,
    projectLoading: state.projectLoading,
    createProject: (input) => workflow.createBlankProject(input.name),
    requestBrowse: workflow.requestBrowse,
    confirmLeave: workflow.confirmLeave,
    cancelLeave: workflow.cancelLeave,
    cancelBrowse: actions.cancelBrowse,
    uploadUsesMainDialog: controllers !== undefined,
    uploadFile: (file?: File) => controllers?.upload.uploadFile(file, state.browsing, sourceImportGate(state).status === 'ready') ?? NOOP(),
    setSourceImportText: (text) => actions.sourceImportPatch({ text }),
    setSourceImportFormat: (format: SourceImportFormat) => actions.sourceImportPatch({ format }),
    submitSourceText: () => controllers?.sourceImport.normalizeText({ text: state.sourceImport.text, format: state.sourceImport.format }, sourceImportGate(state)) ?? NOOP(),
    beginImportInterpretation: (source) => controllers?.importInterpretation.begin(source) ?? NOOP(),
    retryImportInterpretation: () => controllers?.importInterpretation.retry() ?? NOOP(),
    cancelImportInterpretation: () => controllers?.importInterpretation.cancel() ?? NOOP(),
    confirmImportInterpretation: () => controllers?.importInterpretation.confirm() ?? NOOP(),
    setImportSourceRole: (role) => controllers?.importInterpretation.setSourceRole(role) ?? NOOP(),
    setImportTreatment: (treatment) => controllers?.importInterpretation.setTreatment(treatment) ?? NOOP(),
    setImportNarrativeIntent: (intent) => controllers?.importInterpretation.setNarrativeIntent(intent) ?? NOOP(),
    setImportParagraphRole: (paragraphId, role) => controllers?.importInterpretation.setParagraphRole(paragraphId, role) ?? NOOP(),
    setImportParagraphDecision: (paragraphId, decision) => controllers?.importInterpretation.setParagraphDecision(paragraphId, decision) ?? NOOP(),
    splitImportParagraph: (paragraphId, offset) => controllers?.importInterpretation.splitParagraph(paragraphId, offset) ?? NOOP(),
    mergeImportParagraphWithNext: (paragraphId) => controllers?.importInterpretation.mergeParagraphWithNext(paragraphId) ?? NOOP(),
    setRuleStyleImportRulesDraft: (value) => controllers?.importInterpretation.setRuleStyleRulesDraft(value) ?? NOOP(),
    setRuleStyleImportStyleDraft: (value) => controllers?.importInterpretation.setRuleStyleStyleDraft(value) ?? NOOP(),
    retryRuleStyleImportInitialization: () => controllers?.importInterpretation.retryRuleStyleInitialization() ?? NOOP(),
    proposeRuleStyleImportInitialization: () => controllers?.importInterpretation.proposeRuleStyleInitialization() ?? NOOP(),
    acceptRuleStyleImportInitialization: () => controllers?.importInterpretation.acceptRuleStyleInitialization() ?? NOOP(),
    rejectRuleStyleImportInitialization: () => controllers?.importInterpretation.rejectRuleStyleInitialization() ?? NOOP(),
  };
}

function preferenceStore(): ProjectPreferenceStore {
  return typeof window === 'undefined' ? FALLBACK_PREFERENCE : window.localStorage;
}

/** 唯一桌面 root 中的创作台壳；现有 presenter 和样式均由同一 React 树持有。 */
function structuredProjectView(state: WorkbenchState, actions: WorkbenchActions, ui: WorkbenchUi, ops: WorkbenchOps, namespaces: WorkbenchNamespaces, llmConfigNamespace: DesktopIpcClient['services']['llmConfig'], settingsNamespace: DesktopIpcClient['services']['workbenchSettings'], assistant: DesktopAssistantClient, liveProgress: DesktopClientSnapshot['progress'], assistantOpen: boolean, toggleAssistant: () => void, sourcePlanReview?: React.ReactNode): React.ReactElement {
  const settings = {
    view: state.settingsView,
    draft: state.settingsDraft,
    namespace: llmConfigNamespace,
    mutate: actions.settingsMutate,
    save: ui.saveLlmConfig,
  };
  const creationSettings = {
    view: state.creationSettingsView,
    draft: state.creationSettingsDraft,
    namespace: settingsNamespace,
    mutate: actions.creationSettingsMutate,
    save: ui.saveCreationSettings,
    projectId: state.selectedProjectId,
    openFolder: ui.openCreationFolder,
  };
  const ruleStyleStream = desktopRuleStyleStream(liveProgress);
  const importInterpretationReview: ImportInterpretationReviewState | undefined = state.importInterpretationReview === undefined || ruleStyleStream === undefined
    ? state.importInterpretationReview
    : { ...state.importInterpretationReview, ruleStyleStream };
  return React.createElement('section', { className: 'desktop-project', 'data-novel-project-ready': 'true' },
    workbenchView(React, {
      status: state.status,
      desktop: true,
      desktopTools: React.createElement(Button, { variant: 'ghost', 'aria-expanded': assistantOpen, 'data-novel-assistant-toggle': '', onClick: toggleAssistant }, assistantOpen ? '收起助手' : '创作助手'),
      desktopAside: state.selectedProjectId !== undefined ? React.createElement('aside', { hidden: !assistantOpen, className: 'desktop-assistant', 'aria-label': '创作助手' }, React.createElement(DesktopAssistantPanel, { client: assistant, projectId: state.selectedProjectId, target: state.chapters.selectedChapterId && state.chapters.selectedSceneId ? { chapterId: state.chapters.selectedChapterId, sceneId: state.chapters.selectedSceneId } : undefined })) : null,
      ns: namespaces,
      ui,
      states: viewStates(state),
      ops,
      selectedProjectId: state.selectedProjectId,
      selectedProjectName: state.selectedProjectName,
      projects: state.projects,
      archivedProjects: state.archivedProjects,
      browsing: state.browsing,
      leaveConfirm: state.leaveConfirm,
      projectError: state.projectError,
      upload: state.upload,
      uploadResult: state.uploadResult,
      sourceImport: state.sourceImport,
      sourcePlanReview,
      importInterpretationReview,
      settings,
      creationSettings,
    }) as React.ReactNode,
  );
}

export function DesktopWorkbenchShell(props: { store: DesktopStoreInstance<WorkbenchState, WorkbenchActions>; client: DesktopIpcClient }): React.ReactElement {
  const state = useDesktopStore(props.store, (snapshot) => snapshot);
  const [assistantOpen, setAssistantOpen] = React.useState(false);
  const [migrationOpen, setMigrationOpen] = React.useState(false);
  const connection = React.useSyncExternalStore(props.client.subscribe, props.client.getSnapshot, props.client.getSnapshot);
  const sourcePlanDirty = React.useRef(false);
  const workflow = React.useMemo(() => createDesktopProjectWorkflow({ store: props.store, services: props.client.services, preference: preferenceStore(), hasAdditionalDraft: () => sourcePlanDirty.current }), [props.store, props.client]);
  const assistant = React.useMemo(() => createDesktopAssistantClient(props.client), [props.client]);
  const migration = React.useMemo(() => createDesktopMigrationClient(props.client), [props.client]);
  React.useEffect(() => {
    void workflow.start();
    return workflow.dispose;
  }, [workflow]);
  const activeRef = React.useRef(true);
  const activeOperationsRef = React.useRef(new Set<string>());
  React.useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      activeOperationsRef.current.clear();
    };
  }, []);
  const sourceControllers = React.useMemo(() => {
    const operations = new Set<string>();
    const dispatch = (fn: (actions: WorkbenchActions) => void): void => {
      if (activeRef.current) fn(props.store.actions);
    };
    const beginOp = (key: string): boolean => {
      if (!activeRef.current || operations.has(key)) return false;
      operations.add(key);
      return true;
    };
    const endOp = (key: string): void => { operations.delete(key); };
    const currentProjectId = (): string | undefined => props.store.getSnapshot().selectedProjectId;
    const isActive = (): boolean => activeRef.current;
    let importInterpretation: ImportInterpretationController;
    const startSourceReview = (projectId: string, source: { sourceHash: string; text: string; chunks: readonly unknown[] }): void => {
      if (currentProjectId() !== projectId) return;
      try {
        importInterpretation.begin({ sourceHash: source.sourceHash, text: source.text, paragraphs: paragraphsFromHostChunks(source.chunks) });
      } catch {
        importInterpretation.begin({ sourceHash: source.sourceHash, text: source.text, paragraphs: [] });
      }
      props.store.actions.activateOnboarding();
    };
    importInterpretation = createImportInterpretationController({
      analysis: () => props.client.services.importInterpretationAnalysis,
      session: () => props.client.services.importInterpretation,
      initialization: () => props.client.services.ruleStyleImportInitialization,
      currentProjectId,
      isActive,
      beginOp,
      endOp,
      dispatch,
      onConfirmed: () => {
        if (!activeRef.current) return;
        props.store.actions.workflowStage('outline');
        props.store.actions.activateView('onboarding');
      },
    });
    const sourceImport = createSourceImportController({
      normalizer: () => props.client.services.importExportNamespace,
      currentProjectId,
      isActive,
      beginOp,
      endOp,
      dispatch,
      startSourceReview: (source) => {
        if (currentProjectId() === undefined) return;
        importInterpretation.begin(source);
        props.store.actions.activateOnboarding();
      },
    });
    const upload = createDesktopUploadController({
      workspace: () => props.client.services.workspace,
      currentProjectId,
      isActive,
      beginOp,
      endOp,
      dispatch,
      startSourceReview,
      createProject: (input, onOpened) => workflow.createImportedProject(input, onOpened),
    });
    const settings = createSettingsController({
      llmConfig: () => props.client.services.llmConfig,
      workbenchSettings: () => props.client.services.workbenchSettings,
      currentProjectId,
      isActive,
      beginOp,
      endOp,
      dispatch,
    });
    return Object.freeze({
      upload,
      sourceImport,
      importInterpretation,
      settings,
      dispose: () => {
        operations.clear();
        importInterpretation.dispose();
      },
    });
  }, [props.client, props.store, workflow]);
  React.useEffect(() => () => sourceControllers.dispose(), [sourceControllers]);
  const queuePoll = React.useMemo(() => createQueuePollController({
    isActive: () => activeRef.current
      && props.store.getSnapshot().selectedProjectId !== undefined
      && !props.store.getSnapshot().browsing,
    projectId: () => props.store.getSnapshot().selectedProjectId,
    queue: () => props.client.services.queueNamespace,
    onStatus: (projection) => {
      if (activeRef.current) props.store.actions.queuePatch({ status: 'ready', projection, acting: false });
    },
  }), [props.client, props.store]);
  React.useEffect(() => () => queuePoll.stop(), [queuePoll]);
  const projectId = state.selectedProjectId;
  const sourcePlanReview = useSourcePlanPanel({ projectId: projectId ?? '', review: state.importInterpretationReview, services: props.client.services, actions: props.store.actions, onboarding: state.onboarding, onDirtyChange: value => { sourcePlanDirty.current = value; }, onComplete: () => {
    if (!projectId) return;
    writeWorkflowResume({ projectId, stage: 'outline' }); workflow.requestOpen(projectId, true);
  } });
  const runtime: OpsRuntime = {
    snapshot: state,
    act: props.store.actions,
    projectId,
    isActive: () => activeRef.current
      && projectId !== undefined
      && props.store.getSnapshot().selectedProjectId === projectId
      && !props.store.getSnapshot().browsing,
    beginOp: (key) => {
      const scopedKey = projectId === undefined ? key : `${projectId}:${key}`;
      if (!activeRef.current || projectId === undefined || activeOperationsRef.current.has(scopedKey)) return false;
      activeOperationsRef.current.add(scopedKey);
      return true;
    },
    endOp: (key) => { activeOperationsRef.current.delete(projectId === undefined ? key : `${projectId}:${key}`); },
    queuePoll,
    cancelMethod: (methodId) => { props.client.cancelMethod(methodId); },
  };
  const namespaces = desktopNamespaces(props.client);
  const fileDialog = React.useMemo(() => createDesktopFileDialog(props.client), [props.client]);
  const ops = createDesktopStructuredOps(runtime, {
    workspace: namespaces.workspace,
    reviewNamespace: namespaces.reviewNamespace,
    reviewRepairNamespace: namespaces.reviewRepairNamespace,
    queueNamespace: namespaces.queueNamespace,
    knowledgeNamespace: namespaces.knowledgeNamespace,
    ruleStyleNamespace: namespaces.ruleStyleNamespace,
    progressNamespace: namespaces.progressNamespace,
    importExportNamespace: namespaces.importExportNamespace,
    writing: namespaces.writing,
    branchNamespace: namespaces.branchNamespace,
    searchNamespace: namespaces.searchNamespace,
    statisticsNamespace: namespaces.statisticsNamespace,
    timelineNamespace: namespaces.timelineNamespace,
    textMutation: namespaces.textMutation,
    sceneOutlineBinding: namespaces.sceneOutlineBinding,
    textDeletion: namespaces.textDeletion,
    outlineReconciliation: namespaces.outlineReconciliation,
    referenceAuditNamespace: namespaces.referenceAuditNamespace,
    referenceCorrectionNamespace: namespaces.referenceCorrectionNamespace,
    outlineDetailGeneration: namespaces.outlineDetailGeneration,
    saveFile: fileDialog,
  });
  const ui = createDesktopShellUi(state, props.store.actions, workflow, sourceControllers);
  React.useEffect(() => {
    if (state.status.status !== 'ready' || projectId === undefined || state.browsing) return;
    ops.knowledge.refresh();
    if (state.ruleStyle.status === 'idle') ops.ruleStyle.refresh();
    if (state.activeView === 'progress') ops.progress.refresh();
    // I192 / §14.34: entering the queue reads its persisted tasks and outline scope.
    if (state.activeView === 'queue') ops.queue.refresh();
    if (state.activeView === 'search') ops.search.refreshStats();
    if (state.activeView === 'statistics') {
      ops.statistics.refreshStats();
      ops.statistics.refreshOverview();
    }
    if (state.activeView === 'timeline' && !state.timeline.dirty) ops.timeline.refresh();
  }, [state.status.status, state.browsing, state.activeView, projectId]);
  React.useEffect(() => {
    if (!state.leaveConfirm) return;
    const previousFocus = document.activeElement;
    document.querySelector<HTMLElement>('[data-novel-leave-cancel]')?.focus();
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus(); };
  }, [state.leaveConfirm]);
  const loading = workbenchView(React, {
        status: { status: 'loading' },
        ns: PENDING_NAMESPACES,
        ui,
        states: viewStates(state),
        ops: PENDING_OPS,
        sourceImport: state.sourceImport,
      });
  const content = state.status.status !== 'ready'
      ? loading
      : state.selectedProjectId !== undefined && !state.browsing
        ? structuredProjectView(state, props.store.actions, ui, ops, namespaces, props.client.services.llmConfig, props.client.services.workbenchSettings, assistant, connection.progress, assistantOpen, () => setAssistantOpen((value) => !value), sourcePlanReview)
        : migrationOpen ? React.createElement('section', { className: 'desktop-library' },
          React.createElement(Button, { variant: 'ghost', 'data-novel-migration-close': '', onClick: () => setMigrationOpen(false) }, '返回作品库'),
          React.createElement(DesktopMigrationPanel, { client: migration }))
        : React.createElement(ProjectDirectory, { state, actions: props.store.actions, workflow, ui, openMigration: () => setMigrationOpen(true) });

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('style', { 'data-novel-workbench': 'desktop-styles' }, WORKBENCH_STYLES),
    React.createElement('main', {
      className: 'desktop-shell',
      'data-novel-desktop-root': 'true',
      'data-novel-workspace': state.status.status,
      'data-novel-connection-status': connection.status,
      'data-novel-pending-requests': String(connection.pendingCount),
      'data-novel-last-progress-method': connection.progress?.methodId ?? '',
    },
      content as React.ReactNode,
      React.createElement(DesktopLlmStreamWindow, { progress: connection.progress }),
    ),
  );
}

/**
 * 把 store 与 React root 绑定到同一 disposer；重复调用 dispose 保持幂等。
 */
export function mountDesktopWorkbench(root: Pick<Root, 'render' | 'unmount'>, store: DesktopStoreInstance<WorkbenchState, WorkbenchActions>, client: DesktopIpcClient): () => void {
  let active = true;
  root.render(React.createElement(DesktopWorkbenchShell, { store, client }));
  return () => {
    if (!active) return;
    active = false;
    root.unmount();
    client.dispose();
    store.dispose();
  };
}
