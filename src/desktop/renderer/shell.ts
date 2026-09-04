import * as React from 'react';
import type { Root } from 'react-dom/client';

import { launchButton, workbenchView, type WorkbenchUi } from '../../client/presenter.js';
import { scheduleFocus } from '../../client/focus.js';
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
import type { WorkflowStageId } from '../../client/workflow.js';
import { createSourceImportController, sourceImportGate, type SourceImportController, type SourceImportFormat } from '../../client/source-import.js';
import { createImportInterpretationController, paragraphsFromHostChunks, type ImportInterpretationController } from '../../client/import-interpretation-review.js';
import { createDesktopUploadController, type DesktopUploadController } from './upload-controller.js';
import { workbenchSettingsPanel } from '../../client/workbench-settings.js';
import type { DesktopIpcClient } from './desktop-ipc-client.js';
import { createDesktopProjectWorkflow, type DesktopProjectWorkflow, type ProjectPreferenceStore } from './project-workflow.js';
import { createDesktopStructuredOps } from './structured-ops.js';
import { createDesktopFileDialog } from './file-dialog.js';
import { createQueuePollController } from '../../client/queue-poll.js';
import type { DesktopStoreInstance } from './store-adapter.js';
import { useDesktopStore } from './store-adapter.js';

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

/**
 * I173 临时 UI adapter：只开放纯 Renderer 交互，业务命令显式保持未接线。
 * I174 会以 DesktopServiceBag 替换这些业务空操作；本迭代不会提前调用 IPC。
 */
interface DesktopShellControllers {
  readonly upload: DesktopUploadController;
  readonly sourceImport: SourceImportController;
  readonly importInterpretation: ImportInterpretationController;
}

export function createDesktopShellUi(state: WorkbenchState, actions: WorkbenchActions, workflow: DesktopProjectWorkflow, controllers?: DesktopShellControllers): WorkbenchUi {
  return {
    open: state.open,
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
    close: () => {
      actions.close();
      scheduleFocus('[data-novel-launch]');
    },
    activate: actions.activate,
    activateView: (view: WorkbenchViewId) => actions.activateView(view),
    openWorkflowStage: (stage: WorkflowStageId) => actions.workflowStage(stage),
    activateOnboarding: actions.activateOnboarding,
    activateCreationSettings: actions.activateCreationSettings,
    toggleSettings: actions.toggleSettings,
    saveLlmConfig: NOOP,
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

function projectDirectoryView(state: WorkbenchState, actions: WorkbenchActions, workflow: DesktopProjectWorkflow, ui: WorkbenchUi): React.ReactElement {
  return React.createElement('section', { className: 'nv-workbench__state nv-workbench__state--chooser', 'data-novel-project-chooser': '' },
    React.createElement('header', { className: 'nv-workbench__brand' },
      React.createElement('span', { className: 'nv-workbench__mark', 'aria-hidden': 'true' }, '砚'),
      React.createElement('div', null, React.createElement('h2', { className: 'nv-workbench__title' }, '创作台'), React.createElement('span', { className: 'nv-workbench__subtitle' }, '桌面作品目录')),
    ),
    state.browsing && state.selectedProjectId !== undefined
      ? React.createElement('button', { type: 'button', 'data-novel-browse-cancel': '', onClick: actions.cancelBrowse }, '返回当前作品')
      : null,
    state.projectError ? React.createElement('p', { role: 'alert', 'data-novel-project-error': '' }, state.projectError) : null,
    React.createElement('section', { className: 'nv-workbench__new-project', 'data-novel-project-create-section': '' },
      React.createElement('button', { type: 'button', disabled: state.projectLoading || state.upload.phase === 'reading' || state.upload.phase === 'uploading' || state.upload.phase === 'finalizing', 'data-novel-upload-main-dialog': '', onClick: () => ui.uploadFile() }, 'Select DOCX import'),
      React.createElement('h3', null, '新建小说作品'),
      React.createElement('input', {
        type: 'text',
        value: state.newProjectName,
        placeholder: '作品名称（留空为「未命名作品」）',
        'data-novel-project-name-input': '',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => actions.newProjectName(event.target.value),
      }),
      React.createElement('button', { type: 'button', disabled: state.projectLoading, 'data-novel-project-create': '', onClick: () => workflow.createBlankProject(state.newProjectName) }, '创建空白作品'),
    ),
    state.projects.length === 0 ? React.createElement('p', { 'data-novel-project-empty': '' }, '尚无作品，请新建空白作品。') : null,
    React.createElement('ul', { 'data-novel-project-list': '' }, state.projects.map((project) => React.createElement('li', { key: project.id },
      React.createElement('button', { type: 'button', 'data-novel-project-open': project.id, onClick: () => workflow.requestOpen(project.id) }, project.name),
      React.createElement('button', { type: 'button', disabled: state.projectLoading, 'data-novel-project-archive': project.id, onClick: () => workflow.archiveProject(project.id) }, '归档'),
    ))),
    state.archivedProjects.length === 0 ? null : React.createElement('section', { 'data-novel-project-archive-section': '' },
      React.createElement('h3', null, `已归档作品（${state.archivedProjects.length}）`),
      React.createElement('p', null, '归档作品为只读目录，恢复前不可打开或编辑。'),
      React.createElement('ul', null, state.archivedProjects.map((project) => React.createElement('li', { key: project.id, 'data-novel-archived-project': project.id },
        React.createElement('span', null, project.name),
        React.createElement('button', { type: 'button', disabled: state.projectLoading, 'data-novel-project-restore': project.id, onClick: () => workflow.restoreProject(project.id) }, '恢复'),
      ))),
    ),
  );
}

function openedProjectView(state: WorkbenchState, actions: WorkbenchActions, workflow: DesktopProjectWorkflow, settingsNamespace: DesktopIpcClient['services']['workbenchSettings']): React.ReactElement {
  const creationSettings = state.creationSettingsDraft;
  return React.createElement('section', { className: 'nv-workbench', 'data-novel-project-open': state.selectedProjectId, 'data-novel-project-ready': 'true' },
    React.createElement('header', { className: 'nv-workbench__project-context', 'data-novel-project-context': '' },
      React.createElement('strong', { 'data-novel-project-context-name': '' }, state.selectedProjectName ?? '未命名作品'),
      React.createElement('span', { role: 'status', 'data-novel-project-readiness': 'verified' }, '作品结构已由主进程验证'),
      React.createElement('button', { type: 'button', 'data-novel-back-to-projects': '', onClick: workflow.requestBrowse }, '返回作品列表'),
    ),
    state.leaveConfirm ? React.createElement('div', { role: 'alertdialog', 'data-novel-leave-confirm': '' },
      React.createElement('p', null, '有未保存的修改，离开将丢弃这些修改。'),
      React.createElement('button', { type: 'button', 'data-novel-leave-discard': '', onClick: workflow.confirmLeave }, '离开并放弃修改'),
      React.createElement('button', { type: 'button', 'data-novel-leave-cancel': '', onClick: workflow.cancelLeave }, '取消'),
    ) : null,
    workbenchSettingsPanel(
      (tag, props, ...children) => React.createElement(tag, props, ...(children as React.ReactNode[])),
      settingsNamespace,
      creationSettings,
      (patch) => actions.creationSettingsMutate(patch),
      () => workflow.saveSettings(creationSettings),
      state.selectedProjectId,
      workflow.openProjectFolder,
    ) as React.ReactNode,
  );
}

/** 唯一桌面 root 中的创作台壳；现有 presenter 和样式均由同一 React 树持有。 */
function structuredProjectView(state: WorkbenchState, actions: WorkbenchActions, ui: WorkbenchUi, ops: WorkbenchOps, namespaces: WorkbenchNamespaces, settingsNamespace: DesktopIpcClient['services']['workbenchSettings']): React.ReactElement {
  const creationSettings = {
    view: state.creationSettingsView,
    draft: state.creationSettingsDraft,
    namespace: settingsNamespace,
    mutate: actions.creationSettingsMutate,
    save: ui.saveCreationSettings,
    projectId: state.selectedProjectId,
    openFolder: ui.openCreationFolder,
  };
  return React.createElement('section', { 'data-novel-project-ready': 'true' }, workbenchView(React, {
    status: state.status,
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
    importInterpretationReview: state.importInterpretationReview,
    creationSettings,
  }) as React.ReactNode);
}

export function DesktopWorkbenchShell(props: { store: DesktopStoreInstance<WorkbenchState, WorkbenchActions>; client: DesktopIpcClient }): React.ReactElement {
  const state = useDesktopStore(props.store, (snapshot) => snapshot);
  const connection = React.useSyncExternalStore(props.client.subscribe, props.client.getSnapshot, props.client.getSnapshot);
  const workflow = React.useMemo(() => createDesktopProjectWorkflow({ store: props.store, services: props.client.services, preference: preferenceStore() }), [props.store, props.client]);
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
        props.store.actions.activateView('workflow');
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
    return Object.freeze({
      upload,
      sourceImport,
      importInterpretation,
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
      if (activeRef.current) props.store.actions.queuePatch({ status: 'ready', projection, acting: false, message: undefined });
    },
  }), [props.client, props.store]);
  React.useEffect(() => () => queuePoll.stop(), [queuePoll]);
  const projectId = state.selectedProjectId;
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
    ops.ruleStyle.refresh();
    if (state.activeView === 'progress') ops.progress.refresh();
    if (state.activeView === 'search') ops.search.refreshStats();
    if (state.activeView === 'statistics') {
      ops.statistics.refreshStats();
      ops.statistics.refreshOverview();
    }
    if (state.activeView === 'timeline') ops.timeline.refresh();
  }, [state.status.status, state.browsing, state.activeView, projectId]);
  const loading = workbenchView(React, {
        status: { status: 'loading' },
        ns: PENDING_NAMESPACES,
        ui,
        states: viewStates(state),
        ops: PENDING_OPS,
        sourceImport: state.sourceImport,
      });
  const content = !state.open
    ? launchButton(React, actionsOpen(props.store.actions))
    : state.status.status !== 'ready'
      ? loading
      : state.selectedProjectId !== undefined && !state.browsing
        ? structuredProjectView(state, props.store.actions, ui, ops, namespaces, props.client.services.workbenchSettings)
        : projectDirectoryView(state, props.store.actions, workflow, ui);

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
    }, content as React.ReactNode),
  );
}

function actionsOpen(actions: WorkbenchActions): () => void {
  return () => {
    actions.open();
    scheduleFocus('[data-novel-focus-scope] [data-novel-focus-target]');
  };
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
