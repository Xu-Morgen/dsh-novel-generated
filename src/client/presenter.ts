/**
 * I90 overlay presenter（review v2.0 §3.5 / 计划 §18 I90）。
 *
 * 从 client.ts 拆出 Overlay 的渲染面：
 * - `workbenchView`：21 形参收敛为 `(React, props: WorkbenchViewProps)` 对象参数
 *   （status/ns/ui/states/ops/selectedProjectId/.../settings 全部并入 props）；
 * - `createWorkbenchUi`：ui 方法表（渲染期快照 → 控制器命令的薄适配层），每次
 *   渲染重建（与迁移前 Overlay 闭包 `s` 语义一致），供 workbenchView /
 *   brandHeader / groupNav / viewPanel 消费；
 * - 品牌头栏 / 任务导航 / 作品上下文栏 / 脏表单离开裁决 / 悬浮入口 / 上传文案
 *   等纯渲染助手一并迁入。
 *
 * 不变式（迁移等价）：
 * - DOM 契约与 data-novel-* 锚点逐字保持（I46–I72 测试断言不变）；
 * - presenter 不持有 Remote namespace / store / dispatch 之外的领域真相；
 *   控制器命令经 ui 表转发，渲染期快照值（draft/browsing/loaded 判定）显式传入；
 * - `ui` 方法表保持同构：方法名与语义与迁移前 Overlay ui 字面量一一对应。
 */
import type { LayerId, ReactFace, WorkspaceStatus } from './shared.js';
import { el, type El } from './shared.js';
import { slug } from './shared.js';
import { DEFAULT_VIEW, isStableView, NAV_GROUPS, resolveWorkbenchView, type WorkbenchViewId } from './nav.js';
import { workflowStageForView, workflowStageOf, writeWorkflowResume, type WorkflowStageId } from './workflow.js';
import { GRID_STEP, NAV_WIDTH_MAX, NAV_WIDTH_MIN, PANEL_NAV_AUTO_COLLAPSE, PANEL_WIDTH_MAX, PANEL_WIDTH_MIN, type WorkbenchActions, type WorkbenchNamespaces, type WorkbenchOps, type WorkbenchState, type WorkbenchViewStates } from './store/types.js';
import type { UploadProgress } from './upload.js';
import { advancedError, toUserMessage } from './presentation.js';
import { llmSettingsPanel } from './settings.js';
import { viewPanel, type LlmSettingsPanelProps, type WorkbenchSettingsPanelProps } from './panels/index.js';
import type { ProjectController, SettingsController, UploadController } from './controllers.js';
import { sourceInterpretationReview, type ImportInterpretationController, type ImportInterpretationParagraph, type ImportInterpretationReviewState } from './import-interpretation-review.js';
import { projectSourceAwareWorkflow } from './source-aware-workflow.js';
import { sourceImportGate, sourceImportPresenter, type SourceImportController, type SourceImportFormat, type SourceImportState } from './source-import.js';

/** ui 方法表（Overlay → 控制器命令的薄适配层；I90 收敛为单一接口）。 */
export interface WorkbenchUi {
  open: boolean;
  collapsed: boolean;
  activeView: WorkbenchViewId;
  navWidth: number;
  navResizeStart(startX: number): void;
  navResizeMove(clientX: number): void;
  navResizeEnd(): void;
  navResizeStep(delta: number): void;
  panelWidth: number;
  panelResizeStart(startX: number): void;
  panelResizeMove(clientX: number): void;
  panelResizeEnd(): void;
  panelResizeStep(delta: number): void;
  collapse(): void;
  close(): void;
  activate(id: LayerId): void;
  activateView(view: WorkbenchViewId): void;
  openWorkflowStage(stage: WorkflowStageId): void;
  activateOnboarding(): void;
  activateCreationSettings(): void;
  toggleSettings(): void;
  saveLlmConfig(): void;
  saveCreationSettings(): void;
  openCreationFolder(): void;
  selectProject(id: string): void;
  archiveProject(id: string): void;
  restoreProject(id: string): void;
  newProjectName: string;
  newProjectNameChange(value: string): void;
  projectLoading: boolean;
  createProject(input: { projectId: string; name: string }): void;
  requestBrowse(): void;
  confirmLeave(): void;
  cancelLeave(): void;
  cancelBrowse(): void;
  uploadFile(file?: File): void;
  /** I179 Desktop uses Main's native file chooser instead of Renderer FileReader. */
  uploadUsesMainDialog?: boolean;
  setSourceImportText(text: string): void;
  setSourceImportFormat(format: SourceImportFormat): void;
  submitSourceText(): void;
  beginImportInterpretation(source: { sourceHash: string; text: string; paragraphs: readonly ImportInterpretationParagraph[] }): void;
  retryImportInterpretation(): void;
  cancelImportInterpretation(): void;
  confirmImportInterpretation(): void;
  setImportSourceRole(role: import('../core/schema/import-interpretation.js').ImportSourceRole | undefined): void;
  setImportTreatment(treatment: import('../core/schema/import-interpretation.js').ImportTreatment | undefined): void;
  setImportNarrativeIntent(intent: import('../core/schema/import-interpretation.js').NarrativeIntent | undefined): void;
  setImportParagraphRole(paragraphId: string, role: import('../core/schema/import-interpretation-analysis.js').SourceParagraphRole): void;
  setImportParagraphDecision(paragraphId: string, decision: import('./import-interpretation-review.js').ImportReviewParagraph['decision']): void;
  splitImportParagraph(paragraphId: string, offsetInParagraph: number): void;
  mergeImportParagraphWithNext(paragraphId: string): void;
  setRuleStyleImportRulesDraft(value: string): void;
  setRuleStyleImportStyleDraft(value: string): void;
  retryRuleStyleImportInitialization(): void;
  proposeRuleStyleImportInitialization(): void;
  acceptRuleStyleImportInitialization(): void;
  rejectRuleStyleImportInitialization(): void;
}

/** createWorkbenchUi 依赖面：渲染期快照 + baked actions + 控制器（窄化传参）。 */
export interface WorkbenchUiDeps {
  /** 当前渲染快照（与迁移前 Overlay 闭包 `s` 同义；ui 表每次渲染重建）。 */
  snapshot: WorkbenchState;
  /** inject 捕获的 baked actions（写 store 的唯一通道，I46–I49）。 */
  actions: WorkbenchActions;
  dispatch(fn: (a: WorkbenchActions) => void): void;
  project: ProjectController;
  settings: SettingsController;
  upload: UploadController;
  importInterpretation: ImportInterpretationController;
  sourceImport: SourceImportController;
  /** 关闭创作台并把焦点恢复到悬浮入口（I59/R12-6，slot 装配层注入）。 */
  closeWorkbench(): void;
}

/**
 * 构建 ui 方法表（迁移 Overlay ui 字面量，语义逐字保持）。
 * 渲染期快照值（draft/browsing/settingsView 是否已装载）在此显式读出并传给
 * 控制器 —— 控制器不持有 store（I90 窄化传参纪律）。
 */
export function createWorkbenchUi(deps: WorkbenchUiDeps): WorkbenchUi {
  const { snapshot: s, actions, dispatch, project, settings, upload, importInterpretation, sourceImport, closeWorkbench } = deps;
  const ui: WorkbenchUi = {
    get open() { return s.open; },
    get collapsed() { return s.collapsed; },
    get activeView() { return s.activeView; },
    get navWidth() { return s.navWidth; },
    navResizeStart(startX: number) { actions.navResizeStart(startX); },
    navResizeMove(clientX: number) { actions.navResizeMove(clientX); },
    navResizeEnd() { actions.navResizeEnd(); },
    navResizeStep(delta: number) { actions.setNavWidth(s.navWidth + delta); },
    get panelWidth() { return s.panelWidth; },
    panelResizeStart(startX: number) { actions.panelResizeStart(startX); },
    panelResizeMove(clientX: number) { actions.panelResizeMove(clientX); },
    panelResizeEnd() { actions.panelResizeEnd(); },
    panelResizeStep(delta: number) { actions.setPanelWidth(s.panelWidth + delta); },
    collapse() { actions.collapse(); },
    close() { closeWorkbench(); },
    activate(id: LayerId) { ui.activateView(id); },
    // I58：统一视图导航。设置类视图（非稳定视图）重复点击回退默认层视图
    // （保留旧 toggle 语义），层视图与 I60 正文视图重复点击保持；首次进入
    // 设置视图时惰性装载 Host 视图（经 settings controller）。
    activateView(view: WorkbenchViewId) {
      const target = view === s.activeView && !isStableView(view) ? DEFAULT_VIEW : view;
      const resolved = resolveWorkbenchView(target);
      const stage = workflowStageForView(resolved);
      if (stage !== undefined && s.selectedProjectId !== undefined) {
        actions.workflowStage(stage);
        writeWorkflowResume({ projectId: s.selectedProjectId, stage, ...(s.workflow.chapterId ?? s.chapters.selectedChapterId ? { chapterId: s.workflow.chapterId ?? s.chapters.selectedChapterId } : {}), ...(s.workflow.sceneId ?? s.chapters.selectedSceneId ? { sceneId: s.workflow.sceneId ?? s.chapters.selectedSceneId } : {}) });
      }
      actions.activateView(resolved);
      if (resolved === 'creationSettings') settings.ensureCreationSettingsLoaded(s.creationSettingsView === undefined);
      if (resolved === 'settings') settings.ensureLlmConfigLoaded(s.settingsView === undefined);
    },
    openWorkflowStage(stage: WorkflowStageId) {
      if (s.selectedProjectId === undefined) return;
      const target = workflowStageOf(stage);
      actions.workflowStage(stage);
      writeWorkflowResume({ projectId: s.selectedProjectId, stage, ...(s.workflow.chapterId ?? s.chapters.selectedChapterId ? { chapterId: s.workflow.chapterId ?? s.chapters.selectedChapterId } : {}), ...(s.workflow.sceneId ?? s.chapters.selectedSceneId ? { sceneId: s.workflow.sceneId ?? s.chapters.selectedSceneId } : {}) });
      actions.activateView(target.view);
    },
    activateOnboarding() { ui.activateView('onboarding'); },
    activateCreationSettings() { ui.activateView('creationSettings'); },
    toggleSettings() { ui.activateView('settings'); },
    saveLlmConfig() { settings.saveLlmConfig(s.settingsDraft, s.settingsView?.hasKey ?? false); },
    saveCreationSettings() { settings.saveCreationSettings(s.creationSettingsDraft); },
    openCreationFolder() { settings.openProjectFolder(); },
    selectProject(id: string) { project.openProject(id); },
    archiveProject(id: string) { project.archiveProject(id); },
    restoreProject(id: string) { project.restoreProject(id); },
    get newProjectName() { return s.newProjectName; },
    newProjectNameChange(value: string) { actions.newProjectName(value); },
    get projectLoading() { return s.projectLoading; },
    createProject(input: { projectId: string; name: string }) { project.createProject(input); },
    // I55：返回作品列表 / 切换入口。脏表单先裁决，确认/干净才进入列表。
    requestBrowse() {
      if (hasDirtyDrafts(s)) {
        dispatch((x) => x.showLeaveConfirm(true));
      } else {
        project.browseToProjects();
      }
    },
    confirmLeave() {
      dispatch((x) => x.showLeaveConfirm(false));
      project.browseToProjects();
    },
    cancelLeave() {
      dispatch((x) => x.showLeaveConfirm(false));
    },
    cancelBrowse() { project.cancelBrowse(); },
    uploadFile(file?: File) { upload.uploadFile(file, s.browsing, sourceImportGate(s).status === 'ready'); },
    setSourceImportText(text: string) { actions.sourceImportPatch({ text, status: 'idle', error: undefined }); },
    setSourceImportFormat(format: SourceImportFormat) { actions.sourceImportPatch({ format, status: 'idle', error: undefined }); },
    submitSourceText() { sourceImport.normalizeText({ text: s.sourceImport.text, format: s.sourceImport.format }, sourceImportGate(s)); },
    beginImportInterpretation(source) { importInterpretation.begin(source); },
    retryImportInterpretation() { importInterpretation.retry(); },
    cancelImportInterpretation() { importInterpretation.cancel(); },
    confirmImportInterpretation() { importInterpretation.confirm(); },
    setImportSourceRole(role) { importInterpretation.setSourceRole(role); },
    setImportTreatment(treatment) { importInterpretation.setTreatment(treatment); },
    setImportNarrativeIntent(intent) { importInterpretation.setNarrativeIntent(intent); },
    setImportParagraphRole(paragraphId, role) { importInterpretation.setParagraphRole(paragraphId, role); },
    setImportParagraphDecision(paragraphId, decision) { importInterpretation.setParagraphDecision(paragraphId, decision); },
    splitImportParagraph(paragraphId, offsetInParagraph) { importInterpretation.splitParagraph(paragraphId, offsetInParagraph); },
    mergeImportParagraphWithNext(paragraphId) { importInterpretation.mergeParagraphWithNext(paragraphId); },
    setRuleStyleImportRulesDraft(value) { importInterpretation.setRuleStyleRulesDraft(value); },
    setRuleStyleImportStyleDraft(value) { importInterpretation.setRuleStyleStyleDraft(value); },
    retryRuleStyleImportInitialization() { importInterpretation.retryRuleStyleInitialization(); },
    proposeRuleStyleImportInitialization() { importInterpretation.proposeRuleStyleInitialization(); },
    acceptRuleStyleImportInitialization() { importInterpretation.acceptRuleStyleInitialization(); },
    rejectRuleStyleImportInitialization() { importInterpretation.rejectRuleStyleInitialization(); },
  };
  return ui;
}

/** workbenchView 渲染期 props（21 形参收敛为对象；I90 review v2.0 §3.5/§5）。 */
export interface WorkbenchViewProps {
  status: WorkspaceStatus;
  ns: WorkbenchNamespaces;
  ui: WorkbenchUi;
  states: WorkbenchViewStates;
  ops: WorkbenchOps;
  selectedProjectId?: string;
  selectedProjectName?: string;
  projects?: Array<{ id: string; name: string }>;
  archivedProjects?: Array<{ id: string; name: string }>;
  browsing?: boolean;
  leaveConfirm?: boolean;
  projectError?: string;
  upload?: UploadProgress;
  uploadResult?: { sourceHash: string; fileName: string; text: string; chunks: unknown[] };
  sourceImport: SourceImportState;
  importInterpretationReview?: ImportInterpretationReviewState;
  settings?: LlmSettingsPanelProps;
  creationSettings?: WorkbenchSettingsPanelProps;
}

/** 品牌头栏：砚台朱砂标记 + 衬线标题 + 折叠/关闭。tabIndex=-1 + data-novel-focus-target
 *  作为 I59 打开面板后的焦点进入落点（R12-6 焦点进入）。 */
function brandHeader(h: El, subtitle: string | undefined, ui: { collapsed: boolean; collapse(): void; close(): void }): unknown {  return h('header', { className: 'nv-workbench__brand', 'data-novel-brand': '', 'data-novel-focus-target': '', tabIndex: -1 },
  h('span', { className: 'nv-workbench__mark', 'aria-hidden': 'true' }, '砚'),
  h('div', null,
    h('h2', { className: 'nv-workbench__title' }, '创作台'),
    subtitle === undefined ? null : h('span', { className: 'nv-workbench__subtitle' }, subtitle),
  ),
  h('button', { type: 'button', className: 'nv-workbench__toggle', 'aria-expanded': String(!ui.collapsed), onClick: () => ui.collapse() }, ui.collapsed ? '展开' : '折叠'),
  h('button', { type: 'button', className: 'nv-workbench__close', 'aria-label': '关闭创作台', onClick: () => ui.close() }, '关闭'),
);
}

/**
 * I58 任务分组导航（design §14.8 / R12-5）：九项扁平导航退役，改为
 * 「写作 / 策划 / 连续性 / 作品设置」四组。技术层编号只作辅助徽标（badge），
 * 不作为首要导航语言；每项携带稳定 data 锚点 `data-novel-view`（route/state/data
 * 三锚点的 data 位），层项同时保留 `data-novel-layer` 既有契约。
 */
function groupNav(h: El, activeView: WorkbenchViewId, activateView: (view: WorkbenchViewId) => void): unknown {
  return h('nav', { className: 'nv-workbench__nav', 'data-novel-nav': '', 'aria-label': '创作台任务导航' },
    NAV_GROUPS.map((group) => h('section', {
      key: group.id,
      className: 'nv-workbench__nav-group',
      'data-novel-nav-group': group.id,
    },
    h('h3', { className: 'nv-workbench__nav-group-label', 'data-novel-nav-group-label': group.id }, group.label),
    group.items.map((item) => h('button', {
      key: item.view,
      type: 'button',
      className: 'nv-workbench__nav-item' + (activeView === item.view ? ' is-active' : ''),
      'data-novel-view': item.view,
      'data-novel-nav-item': item.view,
      ...(item.layer !== undefined ? { 'data-novel-layer': item.layer } : {}),
      ...(item.view === 'onboarding' ? { 'data-novel-onboarding-nav': '' } : {}),
      ...(item.view === 'creationSettings' ? { 'data-novel-workbench-settings-nav': '' } : {}),
      ...(item.view === 'settings' ? { 'data-novel-settings-nav': '' } : {}),
      'aria-current': activeView === item.view ? 'page' : undefined,
      onClick: () => activateView(item.view),
    },
      h('span', { className: 'nv-workbench__nav-item-label' }, item.label),
      item.badge === undefined ? null : h('span', { className: 'nv-workbench__nav-item-badge nv-advanced-only', 'data-novel-nav-badge': item.badge, 'aria-hidden': 'true' }, item.badge),
    )),
  )),
  h('details', { className: 'nv-workbench__advanced', 'data-novel-advanced-view': '' },
    h('summary', null, '查看技术信息'),
    h('ul', null, NAV_GROUPS.flatMap((group) => group.items.filter((item) => item.badge !== undefined).map((item) => h('li', { key: item.view }, `${item.label}：${item.badge}`)))),
  ),
  );
}

/** I55 脏表单检测：任一编辑层存在未保存草案即需在切换离开前裁决（§14.8 / R12-2）。
 *  I61：正文编辑器的未保存草稿同样受保护（脏文本保护，R13-2）。 */
function hasDirtyDrafts(snapshot: WorkbenchState): boolean {
  return snapshot.characterEditor.dirty || snapshot.worldEditor.dirty || snapshot.outlineEditor.dirty || snapshot.relationshipEditor.dirty || snapshot.canonEditor.dirty || snapshot.chapters.editor.dirty;
}

/** I55 作品上下文栏：当前作品名持续可见 + 返回作品列表（切换）入口（§14.8 / R12-2）。 */
function projectContextBar(h: El, projectName: string, activeView: WorkbenchViewId, requestBrowse: () => void, goWorkflow: () => void, leaveConfirm: boolean, confirmLeave: () => void, cancelLeave: () => void): unknown {
  return h('div', { className: 'nv-workbench__project-context', 'data-novel-project-context': '' },
    h('span', { className: 'nv-workbench__project-context-name', 'data-novel-project-context-name': '' }, projectName),
    activeView === 'workflow' ? null : h('button', { type: 'button', className: 'nv-workbench__project-context-back', 'data-novel-workflow-back': '', onClick: () => goWorkflow() }, '返回创作流程'),
    h('button', { type: 'button', className: 'nv-workbench__project-context-back', 'data-novel-back-to-projects': '', onClick: () => requestBrowse() }, '返回作品列表'),
    leaveConfirm ? dirtyLeaveDialog(h, confirmLeave, cancelLeave) : null,
  );
}

/** I55 脏表单离开裁决：非模态确认条，离开将丢弃未保存 Client draft（§14.8 / R12-2）。 */
function dirtyLeaveDialog(h: El, confirmLeave: () => void, cancelLeave: () => void): unknown {
  return h('div', { className: 'nv-workbench__leave-confirm', 'data-novel-leave-confirm': '', role: 'alertdialog', 'aria-label': '离开作品确认' },
    h('p', { className: 'nv-workbench__leave-confirm-hint', 'data-novel-leave-confirm-hint': '' }, '有未保存的修改，离开将丢弃这些修改。'),
    h('button', { type: 'button', className: 'nv-workbench__leave-confirm-btn nv-workbench__leave-confirm-btn--discard', 'data-novel-leave-discard': '', onClick: () => confirmLeave() }, '离开并放弃修改'),
    h('button', { type: 'button', className: 'nv-workbench__leave-confirm-btn', 'data-novel-leave-cancel': '', onClick: () => cancelLeave() }, '取消'),
  );
}

/**
 * 面板主体：品牌头栏 + 任务分组导航 + 视图内容区（写作/策划/连续性/作品设置，I58）。
 * I82 形参收敛（架构审查 §5.1）：13 个 Remote namespace 打包为 `ns`、10 个面板
 * state + 层数据打包为 `states`，签名由 42 形参收敛到 21；I90 再收敛为
 * `(React, props: WorkbenchViewProps)` 对象参数（review v2.0 §3.5/§5）。
 */
export function workbenchView(React: ReactFace, props: WorkbenchViewProps): unknown {
  const { status, ns, ui, states, ops, selectedProjectId, selectedProjectName, projects = [], archivedProjects = [], browsing = false, leaveConfirm = false, projectError, upload, uploadResult, sourceImport, importInterpretationReview, settings, creationSettings } = props;
  const { workspace, writing, reviewNamespace, reviewRepairNamespace, queueNamespace, knowledgeNamespace, ruleStyleNamespace, progressNamespace, importExportNamespace, branchNamespace, searchNamespace, statisticsNamespace, timelineNamespace, sceneOutlineBinding, textMutation, textDeletion, outlineReconciliation, outlineDetailGeneration, referenceAuditNamespace, referenceCorrectionNamespace, onboardingNamespace, longDraft } = ns;
  const { layers, chapters, review: reviewState, referenceReview: referenceReviewState, queue: queueState, knowledge: knowledgeState, ruleStyle: ruleStyleState, progress: progressState, importExport: importExportState, search: searchState, statistics: statisticsState, timeline: timelineState, router: routerState } = states;
  const h = el(React);
  if (!ui.open) return null;
  const ready = status.status === 'ready' && workspace !== undefined;
  const effectiveStatus: WorkspaceStatus['status'] = ready ? 'ready'
    : status.status === 'error' ? 'error' : status.status;
  const message = status.status === 'error' ? toUserMessage(status.message)
    : (effectiveStatus === 'error' ? '创作台暂时不可用，请稍后重试。' : undefined);
  const subtitle = ready ? `已就绪 · ${status.model.version}` : undefined;
  const gate = sourceImportGate({ ...states.layers, chapters: states.chapters });
  const sourceEntry = selectedProjectId === undefined ? null : sourceImportPresenter(h, {
    state: sourceImport,
    gate,
    uploadLabel: uploadStatusLabel(upload),
    uploadBusy: upload?.phase === 'reading' || upload?.phase === 'uploading' || upload?.phase === 'finalizing',
    setText: ui.setSourceImportText,
    setFormat: ui.setSourceImportFormat,
    submitText: ui.submitSourceText,
    uploadFile: ui.uploadFile,
    mainDialog: ui.uploadUsesMainDialog,
  });
  const importReview = importInterpretationReview === undefined ? null : sourceInterpretationReview(h, importInterpretationReview, {
    begin: (source) => ui.beginImportInterpretation(source),
    retry: () => ui.retryImportInterpretation(),
    cancel: () => ui.cancelImportInterpretation(),
    confirm: () => ui.confirmImportInterpretation(),
    setSourceRole: (role) => ui.setImportSourceRole(role),
    setTreatment: (treatment) => ui.setImportTreatment(treatment),
    setNarrativeIntent: (intent) => ui.setImportNarrativeIntent(intent),
    availableCharacters: states.layers.characters.status === 'ready'
      ? states.layers.characters.list.map((character) => ({ id: character.id, name: character.name }))
      : [],
    setParagraphRole: (paragraphId, role) => ui.setImportParagraphRole(paragraphId, role),
    setParagraphDecision: (paragraphId, decision) => ui.setImportParagraphDecision(paragraphId, decision),
    splitParagraph: (paragraphId, offsetInParagraph) => ui.splitImportParagraph(paragraphId, offsetInParagraph),
    mergeParagraphWithNext: (paragraphId) => ui.mergeImportParagraphWithNext(paragraphId),
    setRuleStyleRulesDraft: (value) => ui.setRuleStyleImportRulesDraft(value),
    setRuleStyleStyleDraft: (value) => ui.setRuleStyleImportStyleDraft(value),
    retryRuleStyleInitialization: () => ui.retryRuleStyleImportInitialization(),
    proposeRuleStyleInitialization: () => ui.proposeRuleStyleImportInitialization(),
    acceptRuleStyleInitialization: () => ui.acceptRuleStyleImportInitialization(),
    rejectRuleStyleInitialization: () => ui.rejectRuleStyleImportInitialization(),
  });
  const sourceAware = importInterpretationReview === undefined ? undefined : projectSourceAwareWorkflow({ review: importInterpretationReview });
  const combinedReview = importReview;
  const body = effectiveStatus === 'ready' && selectedProjectId !== undefined && !browsing
    ? h('div', { className: 'nv-workbench__body', 'data-novel-project-open': selectedProjectId },
      projectContextBar(h, selectedProjectName ?? '未命名作品', ui.activeView, ui.requestBrowse, () => ui.activateView('workflow'), leaveConfirm, ui.confirmLeave, ui.cancelLeave),
      routerState.error === undefined ? null : h('div', { className: 'nv-workbench__router-error', 'data-novel-router-error': routerState.error.code, role: 'alert' },
        h('span', null, toUserMessage(routerState.error.message)),
        h('button', { type: 'button', className: 'nv-btn nv-btn--small', 'data-novel-router-error-dismiss': '', onClick: () => ops.router.dismissError() }, '知道了'),
      ),
      routerState.backStack.length > 0 ? h('button', {
        type: 'button',
        className: 'nv-btn nv-workbench__router-back',
        'data-novel-router-back': '',
        'aria-label': '返回来源',
        onClick: () => ops.router.back(),
      }, '返回来源') : null,
      h('div', { className: 'nv-workbench__body-row' },
        groupNav(h, ui.activeView, ui.activateView),
        h('div', {
          className: 'nv-workbench__nav-resizer',
          'data-novel-nav-resizer': '',
          role: 'separator',
          'aria-orientation': 'vertical',
          'aria-valuenow': String(ui.navWidth),
          'aria-valuemin': String(NAV_WIDTH_MIN),
          'aria-valuemax': String(NAV_WIDTH_MAX),
          tabIndex: 0,
          // UI 打磨：pointer 拖动会话（pointerdown 捕获 → move 更新宽度 → up/end 释放）。
          onPointerDown: (event: { clientX: number; pointerId: number; preventDefault(): void; currentTarget: { setPointerCapture?(id: number): void } }) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            ui.navResizeStart(event.clientX);
          },
          onPointerMove: (event: { clientX: number }) => ui.navResizeMove(event.clientX),
          onPointerUp: () => ui.navResizeEnd(),
          onPointerCancel: () => ui.navResizeEnd(),
          // 键盘可访问：左右方向键以 8px 步进调整侧栏宽度（I59 键盘可达性延续）。
          onKeyDown: (event: { key: string; preventDefault(): void }) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            ui.navResizeStep(event.key === 'ArrowLeft' ? -GRID_STEP : GRID_STEP);
          },
        }),
        h('div', { className: 'nv-workbench__main' },
          // I58：单一 activeView 分发四个任务组的视图（层 / 正文 / 审校中心 / 生成队列 / 初始化审阅 / 创作设置 / LLM 设置）。
          viewPanel(h, ui.activeView, selectedProjectId, selectedProjectName ?? '未命名作品', {
            workspace, writing, reviewNamespace, reviewRepairNamespace, queueNamespace, knowledgeNamespace, ruleStyleNamespace, progressNamespace, importExportNamespace, branchNamespace, searchNamespace, statisticsNamespace, timelineNamespace, referenceAuditNamespace, referenceCorrectionNamespace, sceneOutlineBinding, textMutation, textDeletion, outlineReconciliation, outlineDetailGeneration, onboardingNamespace, importInterpretation: ns.importInterpretation, importInterpretationAnalysis: ns.importInterpretationAnalysis, longDraft,
          }, {
            layers, chapters, review: reviewState, referenceReview: referenceReviewState, queue: queueState, knowledge: knowledgeState,
            ruleStyle: ruleStyleState, progress: progressState, importExport: importExportState, search: searchState,
            statistics: statisticsState, timeline: timelineState, router: routerState, workflow: states.workflow,
            outlineDetailGeneration: states.outlineDetailGeneration,
          }, ops, sourceEntry, combinedReview, settings, creationSettings, { ...states.workflow, sourceAware }, ui.openWorkflowStage),
        ),
      ),
    )
    : effectiveStatus === 'ready' && (selectedProjectId === undefined || browsing)
      ? h('section', { className: 'nv-workbench__state nv-workbench__state--chooser', 'data-novel-project-chooser': '', ...(browsing ? { 'data-novel-project-browsing': '' } : {}) },
        browsing ? h('button', { type: 'button', className: 'nv-workbench__nav-item', 'data-novel-browse-cancel': '', onClick: () => ui.cancelBrowse() }, '返回当前作品') : null,
      projectError !== undefined ? h('div', { className: 'nv-workbench__project-error', 'data-novel-project-error': '', role: 'alert' }, advancedError(h, projectError, '作品打开失败，请刷新后再试。', { 'data-novel-project-error': '' })) : null,
        h('button', { type: 'button', className: 'nv-workbench__nav-item' + (ui.activeView === 'settings' ? ' is-active' : ''), 'data-novel-settings-nav': '', onClick: () => ui.activateView('settings') }, 'AI 设置'),
        ui.activeView === 'settings'
          ? (settings !== undefined ? llmSettingsPanel(h, settings.namespace, settings.view, settings.draft, settings.mutate, settings.save) : null)
          : h('div', { className: 'nv-workbench__chooser' },
            // 项目目录层「新建小说作品」：空白创建 + 文档导入始终可用（已有作品时也能直接新增）。
            h('section', { className: 'nv-workbench__new-project', 'data-novel-project-create-section': '' },
              h('h3', { className: 'nv-workbench__new-project-title' }, '新建小说作品'),
              projects.length === 0 ? h('p', { className: 'nv-workbench__new-project-hint', 'data-novel-project-empty': '' }, '尚无作品，请新建空白作品或上传 DOCX。') : null,
              h('div', { className: 'nv-workbench__new-project-blank', 'data-novel-project-create-blank': '' },
                h('input', { type: 'text', className: 'nv-field__input', 'data-novel-project-name-input': '', placeholder: '作品名称（留空为「未命名作品」）', value: ui.newProjectName, onChange: (event: { target: { value: string } }) => ui.newProjectNameChange(event.target.value) }),
                h('button', { type: 'button', className: 'nv-workbench__new-project-create', 'data-novel-project-create': '', disabled: ui.projectLoading, onClick: () => ui.createProject({ projectId: slug(ui.newProjectName.trim()) || 'untitled', name: ui.newProjectName.trim() || '未命名作品' }) }, '创建空白作品'),
              ),
              h('label', { className: 'nv-upload', 'data-novel-upload': '' },
                h('span', { className: 'nv-upload__label', role: 'status', 'aria-live': 'polite' }, uploadStatusLabel(upload)),
                ui.uploadUsesMainDialog
                  ? h('button', { type: 'button', className: 'nv-btn', disabled: upload?.phase === 'reading' || upload?.phase === 'uploading' || upload?.phase === 'finalizing', 'data-novel-upload-main-dialog': '', onClick: () => ui.uploadFile() }, '选择 DOCX 文件')
                  : h('input', { type: 'file', accept: '.docx', 'data-novel-upload-input': '', onChange: (event: { target: { files: FileList | null } }) => { const file = event.target.files?.[0]; if (file) ui.uploadFile(file); } }),
              ),
              uploadResult ? h('div', { className: 'nv-upload__result', 'data-novel-upload-result-wrap': '' },
                h('p', { 'data-novel-upload-result': '', role: 'status', 'aria-live': 'polite' }, `已提取「${uploadResult.fileName}」：${uploadResult.chunks.length} 个文本块`),
              ) : null,
            ),
            // 活动作品可以打开或归档；归档区只允许恢复，绝不暴露打开/编辑入口。
            projects.length > 0 ? h('ul', { className: 'nv-workbench__project-list', 'data-novel-project-list': '' }, projects.map((project) => h('li', { className: 'nv-workbench__project-row' },
              h('button', { type: 'button', className: 'nv-workbench__project-open', onClick: () => ui.selectProject(project.id), 'data-novel-project-open': project.id }, project.name),
              h('button', { type: 'button', className: 'nv-workbench__project-archive', disabled: ui.projectLoading, onClick: () => ui.archiveProject(project.id), 'data-novel-project-archive': project.id, 'aria-label': `归档作品：${project.name}` }, '归档'),
            ))) : null,
            archivedProjects.length > 0 ? h('details', { className: 'nv-workbench__archive', 'data-novel-project-archive-section': '' },
              h('summary', { className: 'nv-workbench__archive-summary' }, `已归档作品（${archivedProjects.length}）`),
              h('p', { className: 'nv-workbench__archive-hint' }, '归档作品不会出现在主列表中，恢复前不可打开或编辑。'),
              h('ul', { className: 'nv-workbench__archive-list' }, archivedProjects.map((project) => h('li', { className: 'nv-workbench__archive-row' },
                h('span', { 'data-novel-project-archived': project.id }, project.name),
                h('button', { type: 'button', className: 'nv-workbench__project-restore', disabled: ui.projectLoading, onClick: () => ui.restoreProject(project.id), 'data-novel-project-restore': project.id }, '恢复'),
              ))),
            ) : null,
            // I153：目录层来源审阅不再依赖旧 OnboardingState。新作品 DOCX 会先建立
            // ImportInterpretationReview；只有显式存在的六层任务才展示旧分析面板。
            importReview === null ? null : h('div', { className: 'nv-onboarding-stack', 'data-novel-directory-review': '' }, importReview),
          ),
      )
    : h('section', {
      className: 'nv-workbench__state' + (effectiveStatus === 'error' ? ' nv-workbench__state--error' : ''),
      'data-novel-workspace-state': effectiveStatus,
      role: effectiveStatus === 'error' ? 'alert' : undefined,
      // I59 异步状态可播报（R12-6）：loading→error 文案变化由 aria-live=polite 播报，
      // error 时 role=alert 以 assertive 覆盖。
      'aria-live': 'polite',
    }, effectiveStatus === 'loading' ? '正在装载创作台…' : effectiveStatus === 'error' ? advancedError(h, status.status === 'error' ? status.message : message ?? '') : message);
  return h('section', {
    className: 'nv-workbench',
    // UI 打磨：nav 宽度经 CSS 变量下发，resizer 拖拽更新 store → 根节点变量 → 侧栏宽度；
    // 面板整体宽度同样经 --nv-panel-width 下发（左边缘拖柄调整，见下方 panel-resizer）。
    style: { '--nv-nav-width': `${ui.navWidth}px`, '--nv-panel-width': `${ui.panelWidth}px` },
    'data-novel-workspace': effectiveStatus,
    'data-novel-project-open': selectedProjectId,
    'data-novel-route': ui.activeView,
    // UI 打磨：面板过窄（< PANEL_NAV_AUTO_COLLAPSE）时侧边路由栏自动折叠为横向横条
    // （CSS 侧 .nv-workbench[data-novel-nav-collapsed] 驱动；与窄屏响应式形态一致）。
    'data-novel-nav-collapsed': ui.panelWidth < PANEL_NAV_AUTO_COLLAPSE ? '' : undefined,
    // I59 键盘/Esc（R12-6）：面板内 Esc 先取消脏表单离开确认，否则关闭面板
    // （关闭时焦点恢复到悬浮圆形入口，见 ui.close）。data-novel-focus-scope 是
    // 打开后的焦点进入范围锚点。
    'data-novel-focus-scope': '',
    onKeyDown: (event: { key: string; preventDefault(): void }): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (leaveConfirm) { ui.cancelLeave(); return; }
      ui.close();
    },
  },
    // UI 打磨：面板左边缘拖柄 —— 拖动调整创作台整体宽度（贴右停靠，左边缘即宽度边界）。
    h('div', {
      className: 'nv-workbench__panel-resizer',
      'data-novel-panel-resizer': '',
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-valuenow': String(ui.panelWidth),
      'aria-valuemin': String(PANEL_WIDTH_MIN),
      'aria-valuemax': String(PANEL_WIDTH_MAX),
      tabIndex: 0,
      onPointerDown: (event: { clientX: number; pointerId: number; preventDefault(): void; currentTarget: { setPointerCapture?(id: number): void } }) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        ui.panelResizeStart(event.clientX);
      },
      onPointerMove: (event: { clientX: number }) => ui.panelResizeMove(event.clientX),
      onPointerUp: () => ui.panelResizeEnd(),
      onPointerCancel: () => ui.panelResizeEnd(),
      // 键盘可访问：左右方向键以 8px 步进调整面板宽度（I59 键盘可达性延续）。
      onKeyDown: (event: { key: string; preventDefault(): void }) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        ui.panelResizeStep(event.key === 'ArrowLeft' ? -GRID_STEP : GRID_STEP);
      },
    }),
    brandHeader(h, subtitle, { collapsed: ui.collapsed, collapse: ui.collapse, close: ui.close }),
    ui.collapsed ? null : body,
  );
}

/** 悬浮圆形启动入口（UI 打磨）：主页面右上角圆形按钮，点击打开创作台并隐藏自己。 */
export function launchButton(React: ReactFace, launch: () => void): unknown {
  const h = el(React);
  return h('button', {
    type: 'button',
    className: 'nv-launch',
    'data-novel-launch': '',
    'aria-label': '打开创作台',
    title: '打开创作台',
    onClick: () => launch(),
  }, '砚');
}

/** I51 上传进度文案（纯展示，不经 Host）。 */
function uploadStatusLabel(upload: UploadProgress | undefined): string {
  switch (upload?.phase) {
    case 'reading': return '正在读取文件…';
    case 'uploading': return `正在上传 ${upload.uploaded ?? 0}/${upload.chunks ?? 0} 块…`;
    case 'finalizing': return '正在提取文本…';
    case 'done': return '提取完成';
    case 'error': return `上传失败：${upload.message ?? ''}`;
    case 'idle': default: return '上传 DOCX 文档';
  }
}
