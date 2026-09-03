import * as React from 'react';
import type { Root } from 'react-dom/client';

import { launchButton, workbenchView, type WorkbenchUi } from '../../client/presenter.js';
import { scheduleFocus } from '../../client/focus.js';
import { WORKBENCH_STYLES } from '../../client/styles.js';
import type {
  WorkbenchActions,
  WorkbenchNamespaces,
  WorkbenchOps,
  WorkbenchState,
  WorkbenchViewStates,
} from '../../client/store/types.js';
import type { WorkbenchViewId } from '../../client/nav.js';
import type { WorkflowStageId } from '../../client/workflow.js';
import type { SourceImportFormat } from '../../client/source-import.js';
import type { DesktopStoreInstance } from './store-adapter.js';
import { useDesktopStore } from './store-adapter.js';

const NOOP = (): void => {};

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
export function createDesktopShellUi(state: WorkbenchState, actions: WorkbenchActions): WorkbenchUi {
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
    saveCreationSettings: NOOP,
    openCreationFolder: NOOP,
    selectProject: NOOP,
    archiveProject: NOOP,
    restoreProject: NOOP,
    newProjectName: state.newProjectName,
    newProjectNameChange: actions.newProjectName,
    projectLoading: state.projectLoading,
    createProject: NOOP,
    requestBrowse: actions.browseProjects,
    confirmLeave: NOOP,
    cancelLeave: () => actions.showLeaveConfirm(false),
    cancelBrowse: actions.cancelBrowse,
    uploadFile: NOOP,
    setSourceImportText: (text) => actions.sourceImportPatch({ text }),
    setSourceImportFormat: (format: SourceImportFormat) => actions.sourceImportPatch({ format }),
    submitSourceText: NOOP,
    beginImportInterpretation: NOOP,
    retryImportInterpretation: NOOP,
    cancelImportInterpretation: NOOP,
    confirmImportInterpretation: NOOP,
    setImportSourceRole: NOOP,
    setImportTreatment: NOOP,
    setImportNarrativeIntent: NOOP,
    setImportParagraphRole: NOOP,
    setImportParagraphDecision: NOOP,
    splitImportParagraph: NOOP,
    mergeImportParagraphWithNext: NOOP,
    setRuleStyleImportRulesDraft: NOOP,
    setRuleStyleImportStyleDraft: NOOP,
    retryRuleStyleImportInitialization: NOOP,
    proposeRuleStyleImportInitialization: NOOP,
    acceptRuleStyleImportInitialization: NOOP,
    rejectRuleStyleImportInitialization: NOOP,
  };
}

/** 唯一桌面 root 中的创作台壳；现有 presenter 和样式均由同一 React 树持有。 */
export function DesktopWorkbenchShell(props: { store: DesktopStoreInstance<WorkbenchState, WorkbenchActions> }): React.ReactElement {
  const state = useDesktopStore(props.store, (snapshot) => snapshot);
  const ui = createDesktopShellUi(state, props.store.actions);
  const content = state.open
    ? workbenchView(React, {
        status: { status: 'loading' },
        ns: PENDING_NAMESPACES,
        ui,
        states: viewStates(state),
        ops: PENDING_OPS,
        sourceImport: state.sourceImport,
      })
    : launchButton(React, actionsOpen(props.store.actions));

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('style', { 'data-novel-workbench': 'desktop-styles' }, WORKBENCH_STYLES),
    React.createElement('main', { className: 'desktop-shell', 'data-novel-desktop-root': 'true' }, content as React.ReactNode),
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
export function mountDesktopWorkbench(root: Pick<Root, 'render' | 'unmount'>, store: DesktopStoreInstance<WorkbenchState, WorkbenchActions>): () => void {
  let active = true;
  root.render(React.createElement(DesktopWorkbenchShell, { store }));
  return () => {
    if (!active) return;
    active = false;
    root.unmount();
    store.dispose();
  };
}
