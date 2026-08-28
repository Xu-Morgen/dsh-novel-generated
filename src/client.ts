import {
  type BundleRequire,
  type ClientPluginEntry,
  type El,
  type LayerId,
  type ReactFace,
  type WorkspaceNamespace,
  type WorkspaceStatus,
  type WorkspaceViewModel,
  type TypertDisposer,
  type WritingNamespace,
  type ReviewNamespace,
  type QueueNamespace,
  type KnowledgeNamespace,
  type RuleStyleNamespace,
  type ProgressNamespace,
  type ImportExportNamespace,
  type BranchNamespace,
  type SearchNamespace,
  type StatisticsNamespace,
  type TimelineNamespace,
  el as createElement,
  slug,
  unwrap,
  workspaceRemoteContribution,
  writingRemoteContribution,
  reviewRemoteContribution,
  queueRemoteContribution,
  knowledgeRemoteContribution,
  ruleStyleRemoteContribution,
  progressRemoteContribution,
  importExportRemoteContribution,
  branchRemoteContribution,
  searchRemoteContribution,
  statisticsRemoteContribution,
  timelineRemoteContribution,
} from './client/shared.js';
import { reloadProject, type ProjectOpenLayers } from './client/project-session.js';
import { uploadDocx, type UploadProgress } from './client/upload.js';
import { analysisPanel, ANALYSIS_POLL_INTERVAL_MS, analysisResult, applyAccepted, beginAnalysis, onboardingReview, ONBOARDING_LAYERS, adjudicateOne, type OnboardingAdjudicationExtra, type OnboardingAnalysisState, type OnboardingAnalyzerNamespace, type OnboardingDecision, type OnboardingLayerId, type OnboardingNamespace, type OnboardingState } from './client/onboarding.js';
import { onboardingRemoteContribution, onboardingAnalyzerRemoteContribution } from './client/onboarding.js';
import { llmConfigRemoteContribution, llmSettingsPanel, type LlmConfigDraftShape, type LlmConfigNamespace, type LlmConfigViewShape } from './client/settings.js';
import { workbenchSettingsRemoteContribution, type WorkbenchSettingsDraftShape, type WorkbenchSettingsNamespace, type WorkbenchSettingsViewShape } from './client/workbench-settings.js';
import { WORKBENCH_STYLES } from './client/styles.js';
import { DEFAULT_VIEW, NAV_GROUPS, isStableView, resolveWorkbenchView, type WorkbenchViewId } from './client/nav.js';
import { scheduleFocus } from './client/focus.js';
// I83：视图分发（viewPanel + 面板注册表）迁至 client/panels/，mount 生命周期
// 迁至 client/mount.ts（架构审查 §4.1 / §9 #5）；client.ts 只保留装配与渲染外壳。
import { viewPanel, type LlmSettingsPanelProps, type WorkbenchSettingsPanelProps } from './client/panels/index.js';
import { mountRemote } from './client/mount.js';
import {
  createWorkbenchStore,
  type DefineStore,
  type LayerData,
  type WorkbenchActions,
  type WorkbenchNamespaces,
  type WorkbenchOps,
  type WorkbenchState,
  type WorkbenchViewStates,
} from './client/store/index.js';
import { GRID_STEP, NAV_WIDTH_DEFAULT, NAV_WIDTH_MAX, NAV_WIDTH_MIN, PANEL_NAV_AUTO_COLLAPSE, PANEL_WIDTH_DEFAULT, PANEL_WIDTH_MAX, PANEL_WIDTH_MIN } from './client/store/types.js';
import { createWorkbenchOps } from './client/ops/index.js';
import type { OpsContext } from './client/ops/context.js';

/** 侧栏/面板宽度与步进常量已迁至 store 契约层（I82，src/client/store/types.ts）；
 *  此处 re-export 保持既有导入面（client.test.ts 的 NAV/PANEL 锚点不变）。 */
export { NAV_WIDTH_MIN, NAV_WIDTH_MAX, NAV_WIDTH_DEFAULT, PANEL_WIDTH_MIN, PANEL_WIDTH_MAX, PANEL_WIDTH_DEFAULT, PANEL_NAV_AUTO_COLLAPSE, GRID_STEP } from './client/store/types.js';

/** Compatibility facade retained for the public client rendering contract. */
function el(React: ReactFace): El {
  // Keep the explicit primitive visible at the entry boundary; shared owns the implementation.
  void React.createElement;
  return createElement(React);
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
        item.badge === undefined ? null : h('span', { className: 'nv-workbench__nav-item-badge', 'data-novel-nav-badge': item.badge }, item.badge),
      )),
    )),
  );
}

/** I55 脏表单检测：任一编辑层存在未保存草案即需在切换离开前裁决（§14.8 / R12-2）。
 *  I61：正文编辑器的未保存草稿同样受保护（脏文本保护，R13-2）。 */
function hasDirtyDrafts(snapshot: { characterEditor: { dirty: boolean }; worldEditor: { dirty: boolean }; outlineEditor: { dirty: boolean }; relationshipEditor: { dirty: boolean }; canonEditor: { dirty: boolean }; chapters: { editor: { dirty: boolean } } }): boolean {
  return snapshot.characterEditor.dirty || snapshot.worldEditor.dirty || snapshot.outlineEditor.dirty || snapshot.relationshipEditor.dirty || snapshot.canonEditor.dirty || snapshot.chapters.editor.dirty;
}

/** I55 作品上下文栏：当前作品名持续可见 + 返回作品列表（切换）入口（§14.8 / R12-2）。 */
function projectContextBar(h: El, projectName: string, requestBrowse: () => void, leaveConfirm: boolean, confirmLeave: () => void, cancelLeave: () => void): unknown {
  return h('div', { className: 'nv-workbench__project-context', 'data-novel-project-context': '' },
    h('span', { className: 'nv-workbench__project-context-name', 'data-novel-project-context-name': '' }, projectName),
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
 * I58 视图分发迁至 src/client/panels/（I83）：viewPanel 按稳定 activeView 渲染
 * 对应面板，每个内容区携带 `data-novel-view-panel` data 锚点；非层视图（LLM 设置 /
 * 创作设置 / 六层初始化审阅 / I60 正文）与层视图互斥，由单一视图状态决定。
 * I82 形参收敛（架构审查 §5.1）：13 个 Remote namespace 打包为 `ns`、10 个面板
 * state + 层数据打包为 `states`，签名由 33 形参收敛到 10。
 */

/** 面板主体：品牌头栏 + 任务分组导航 + 视图内容区（写作/策划/连续性/作品设置，I58）。
 *  I82 形参收敛（架构审查 §5.1）：13 个 Remote namespace 打包为 `ns`、10 个面板
 *  state + 层数据打包为 `states`，签名由 42 形参收敛到 21；LayerData/WorkbenchOps
 *  契约已迁至 src/client/store/types.ts。 */
function workbenchView(
  React: ReactFace,
  status: WorkspaceStatus,
  ns: WorkbenchNamespaces,
  ui: { open: boolean; collapsed: boolean; activeView: WorkbenchViewId; navWidth: number; navResizeStart(clientX: number): void; navResizeMove(clientX: number): void; navResizeEnd(): void; navResizeStep(delta: number): void; panelWidth: number; panelResizeStart(clientX: number): void; panelResizeMove(clientX: number): void; panelResizeEnd(): void; panelResizeStep(delta: number): void; collapse(): void; close(): void; activateView(view: WorkbenchViewId): void; selectProject(id: string): void; createProject(input: { projectId: string; name: string }): void; newProjectName: string; newProjectNameChange(value: string): void; projectLoading: boolean; uploadFile(file: File): void; analyzeText(text: string): void; cancelAnalysis(): void; retryAnalysis(): void; requestBrowse(): void; cancelBrowse(): void; confirmLeave(): void; cancelLeave(): void },
  states: WorkbenchViewStates,
  ops: WorkbenchOps,
  selectedProjectId?: string,
  selectedProjectName?: string,
  projects: Array<{ id: string; name: string }> = [],
  browsing = false,
  leaveConfirm = false,
  projectError?: string,
  upload?: UploadProgress,
  uploadResult?: { sourceHash: string; fileName: string; text: string; chunks: unknown[] },
  onboardingState?: OnboardingState,
  decideOnboarding?: (layer: OnboardingLayerId, decision: OnboardingDecision, extra?: OnboardingAdjudicationExtra) => void,
  applyOnboarding?: () => void,
  patchOnboarding?: (patch: Partial<OnboardingState>) => void,
  settings?: LlmSettingsPanelProps,
  creationSettings?: WorkbenchSettingsPanelProps,
): unknown {
  const { workspace, writing, reviewNamespace, queueNamespace, knowledgeNamespace, ruleStyleNamespace, progressNamespace, importExportNamespace, branchNamespace, searchNamespace, statisticsNamespace, timelineNamespace, onboardingNamespace } = ns;
  const { layers, chapters, review: reviewState, queue: queueState, knowledge: knowledgeState, ruleStyle: ruleStyleState, progress: progressState, importExport: importExportState, search: searchState, statistics: statisticsState, timeline: timelineState } = states;
  const h = el(React);
  if (!ui.open) return null;
  const ready = status.status === 'ready' && workspace !== undefined;
  const effectiveStatus: WorkspaceStatus['status'] = ready ? 'ready'
    : status.status === 'error' ? 'error' : status.status;
  const message = status.status === 'error' ? status.message
    : (effectiveStatus === 'error' ? '创作台远程服务不可用' : undefined);
  const subtitle = ready ? `已就绪 · ${status.model.version}` : undefined;
  let sourceText = '';
  const sourceEntry = selectedProjectId === undefined ? null : h('section', { className: 'nv-onboarding-entry', 'data-novel-onboarding-entry': '' },
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '原文初始化'),
      h('textarea', { className: 'nv-field__input', rows: 4, placeholder: '粘贴原文以生成六层候选', onChange: (event: { target: { value: string } }) => { sourceText = event.target.value; } }),
    ),
    h('button', {
      type: 'button',
      className: 'nv-onboarding-entry__start',
      'data-novel-onboarding-start': '',
      // I57：分析中防重复 start —— queued/running 期间禁用「分析原文」。
      disabled: onboardingState?.analysis !== undefined && (onboardingState.analysis.status === 'queued' || onboardingState.analysis.status === 'running'),
      onClick: () => ui.analyzeText(sourceText),
    }, '分析原文'),
    // I57：busy/progress/cancel/retry 面板（R12-4），分析失败/取消后可重试。
    onboardingState === undefined ? null : analysisPanel(h, onboardingState, () => ui.cancelAnalysis(), () => ui.retryAnalysis()),
    h('label', { className: 'nv-upload', 'data-novel-onboarding-upload': '' },
      h('span', { className: 'nv-upload__label', role: 'status', 'aria-live': 'polite' }, uploadStatusLabel(upload)),
      h('input', { type: 'file', accept: '.docx', 'data-novel-upload-input': '', onChange: (event: { target: { files: FileList | null } }) => { const file = event.target.files?.[0]; if (file) ui.uploadFile(file); } }),
    ),
    uploadResult ? h('p', { 'data-novel-upload-result': '', role: 'status', 'aria-live': 'polite' }, `已提取「${uploadResult.fileName}」：${uploadResult.chunks.length} 个文本块`) : null,
  );
  const review = onboardingState === undefined ? null : onboardingReview(h, onboardingNamespace, onboardingState, patchOnboarding ?? (() => {}), decideOnboarding ?? (() => {}), applyOnboarding ?? (() => {}));
  const body = effectiveStatus === 'ready' && selectedProjectId !== undefined && !browsing
    ? h('div', { className: 'nv-workbench__body', 'data-novel-project-open': selectedProjectId },
      projectContextBar(h, selectedProjectName ?? selectedProjectId, ui.requestBrowse, leaveConfirm, ui.confirmLeave, ui.cancelLeave),
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
          viewPanel(h, ui.activeView, selectedProjectId, {
            workspace, writing, reviewNamespace, queueNamespace, knowledgeNamespace, ruleStyleNamespace, progressNamespace, importExportNamespace, branchNamespace, searchNamespace, statisticsNamespace, timelineNamespace, onboardingNamespace,
          }, {
            layers, chapters, review: reviewState, queue: queueState, knowledge: knowledgeState, ruleStyle: ruleStyleState, progress: progressState, importExport: importExportState, search: searchState, statistics: statisticsState, timeline: timelineState,
          }, ops, sourceEntry, review, settings, creationSettings),
        ),
      ),
    )
    : effectiveStatus === 'ready' && (selectedProjectId === undefined || browsing)
      ? h('section', { className: 'nv-workbench__state nv-workbench__state--chooser', 'data-novel-project-chooser': '', ...(browsing ? { 'data-novel-project-browsing': '' } : {}) },
        browsing ? h('button', { type: 'button', className: 'nv-workbench__nav-item', 'data-novel-browse-cancel': '', onClick: () => ui.cancelBrowse() }, '返回当前作品') : null,
        projectError !== undefined ? h('p', { className: 'nv-workbench__project-error', 'data-novel-project-error': '', role: 'alert' }, projectError) : null,
        h('button', { type: 'button', className: 'nv-workbench__nav-item' + (ui.activeView === 'settings' ? ' is-active' : ''), 'data-novel-settings-nav': '', onClick: () => ui.activateView('settings') }, 'LLM 设置'),
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
                h('input', { type: 'file', accept: '.docx', 'data-novel-upload-input': '', onChange: (event: { target: { files: FileList | null } }) => { const file = event.target.files?.[0]; if (file) ui.uploadFile(file); } }),
              ),
              uploadResult ? h('p', { 'data-novel-upload-result': '', role: 'status', 'aria-live': 'polite' }, `已提取「${uploadResult.fileName}」：${uploadResult.chunks.length} 个文本块`) : null,
            ),
            // 既有作品列表（点击打开；返回列表时可切换作品）。
            projects.length > 0 ? h('ul', { className: 'nv-workbench__project-list', 'data-novel-project-list': '' }, projects.map((project) => h('button', { type: 'button', className: 'nv-workbench__project-open', onClick: () => ui.selectProject(project.id), 'data-novel-project-open': project.id }, project.name))) : null,
            // 审阅部分提到项目目录：文档导入新建作品后，六层分析/审阅在项目目录层展示。
            // 原文与 sourceHash 保留在 OnboardingState，取消/失败可在此重试；apply 成功后进入创作台。
            onboardingState === undefined ? null : h('div', { className: 'nv-onboarding-stack', 'data-novel-directory-review': '' },
              analysisPanel(h, onboardingState, () => ui.cancelAnalysis(), () => ui.retryAnalysis()),
              review,
            ),
          ),
      )
    : h('section', {
      className: 'nv-workbench__state' + (effectiveStatus === 'error' ? ' nv-workbench__state--error' : ''),
      'data-novel-workspace-state': effectiveStatus,
      role: effectiveStatus === 'error' ? 'alert' : undefined,
      // I59 异步状态可播报（R12-6）：loading→error 文案变化由 aria-live=polite 播报，
      // error 时 role=alert 以 assertive 覆盖。
      'aria-live': 'polite',
    }, effectiveStatus === 'loading' ? '正在装载创作台…' : message);
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
function launchButton(React: ReactFace, launch: () => void): unknown {
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

export default function factory(require: BundleRequire): ClientPluginEntry {
  const React = require('react') as ReactFace;
  const runtime = require('@deepseek-ai/dsh-client-runtime/client') as { defineStore?: DefineStore } | undefined;
  const defineStore = runtime?.defineStore;
  if (defineStore === undefined) {
    throw new Error('DSH client runtime defineStore is unavailable');
  }
  return {
    name: 'novel-creation-tool-client',
    inject: ['slots', 'remote'],
    apply(ctx): void {
      let workspace: WorkspaceNamespace | undefined;
      let onboarding: OnboardingNamespace | undefined;
      let analyzer: OnboardingAnalyzerNamespace | undefined;
      let llmConfig: LlmConfigNamespace | undefined;
      let workbenchSettings: WorkbenchSettingsNamespace | undefined;
      let writing: WritingNamespace | undefined;
      let reviewNamespace: ReviewNamespace | undefined;
      let queueNamespace: QueueNamespace | undefined;
      let knowledgeNamespace: KnowledgeNamespace | undefined;
      let ruleStyleNamespace: RuleStyleNamespace | undefined;
      let progressNamespace: ProgressNamespace | undefined;
      let importExportNamespace: ImportExportNamespace | undefined;
      let branchNamespace: BranchNamespace | undefined;
      let searchNamespace: SearchNamespace | undefined;
      let statisticsNamespace: StatisticsNamespace | undefined;
      let timelineNamespace: TimelineNamespace | undefined;
      let currentProjectId: string | undefined;
      let active = true;
      let remoteDisposer: TypertDisposer | undefined;
      let onboardingDisposer: TypertDisposer | undefined;
      let analyzerDisposer: TypertDisposer | undefined;
      let llmConfigDisposer: TypertDisposer | undefined;
      let workbenchSettingsDisposer: TypertDisposer | undefined;
      let writingDisposer: TypertDisposer | undefined;
      let reviewDisposer: TypertDisposer | undefined;
      let queueDisposer: TypertDisposer | undefined;
      let knowledgeDisposer: TypertDisposer | undefined;
      let ruleStyleDisposer: TypertDisposer | undefined;
      let progressDisposer: TypertDisposer | undefined;
      let importExportDisposer: TypertDisposer | undefined;
      let branchDisposer: TypertDisposer | undefined;
      let searchDisposer: TypertDisposer | undefined;
      let statisticsDisposer: TypertDisposer | undefined;
      let timelineDisposer: TypertDisposer | undefined;

      // I59 请求去重（design §14.8 / R12-6）：同一操作键在 Remote 返回前至多提交
      // 一次（双击/连点至多一次 Remote）。键为「领域:动作」：层保存按层、项目打开
      // 按 projectId、裁决按层；synchronous 判定，React 重渲染前的同 tick 连点也能挡住。
      const inflight = new Set<string>();
      const beginOp = (key: string): boolean => {
        if (inflight.has(key)) return false;
        inflight.add(key);
        return true;
      };
      const endOp = (key: string): void => { inflight.delete(key); };

      // The store is the wiring hub: actions write it; the component subscribes
      // via useStore and re-renders. Every load result and every editor draft
      // mutation flows through an action, so no plain `let` mutation can leave
      // the UI stale (the I46–I49 defect this fixes).
      // I82：store 工厂（fresh 状态 + actions 表）迁至 src/client/store/index.ts，
      // 此处只把 DSH defineStore 交给它；返回的 StoreHandle 由 slot 注册的 `store:` 工厂持有。
      const storeHandle = createWorkbenchStore(defineStore);

      // The renderer owns the store instance (created from the `store:` factory on
      // the registration). We capture its baked actions through the registration's
      // `inject` factory — the SAME instance the component receives as
      // `props.actions` — so every async load and edit write re-renders the
      // overlay. Never call `storeHandle.create()` here: a second instance would
      // be a disguised singleton that the UI does not subscribe to.
      let capturedActions: WorkbenchActions | undefined;
      const pending: Array<(a: WorkbenchActions) => void> = [];
      const lifecycleActions = (actions: WorkbenchActions): WorkbenchActions => {
        const guarded: Record<string, (...params: unknown[]) => void> = {};
        for (const [name, action] of Object.entries(actions as unknown as Record<string, (...params: unknown[]) => void>)) {
          guarded[name] = (...params: unknown[]) => { if (active) action(...params); };
        }
        return guarded as unknown as WorkbenchActions;
      };
      const dispatch = (fn: (a: WorkbenchActions) => void): void => {
        if (!active) return;
        if (capturedActions !== undefined) fn(capturedActions);
        else pending.push(fn);
      };
      const openProject = (projectId: string, onOpened?: () => void): void => {
        const target = workspace;
        if (!active || target === undefined) return;
        if (!beginOp(`project:open:${projectId}`)) return;
        const release = (): void => endOp(`project:open:${projectId}`);
        void unwrap(target.projectOpen(projectId)).then((result) => {
          release();
          if (!active) return;
          currentProjectId = projectId;
          const layers = (result as { layers?: ProjectOpenLayers } | undefined)?.layers;
          const name = (result as { project?: { name?: string } } | undefined)?.project?.name;
          dispatch((actions) => {
            actions.selectProject(projectId, name);
            // I55：打开/切换成功前清空旧作品编辑器草案与初始化状态，杜绝跨项目串写。
            actions.resetEditors();
            reloadProject(target, projectId, actions, dispatch, () => active, layers);
          });
          if (onOpened) onOpened();
        }, (cause: Error) => { release(); dispatch((actions) => actions.projectFailed(`作品打开失败：${cause?.message ?? '未知错误'}`)); });
      };
      const createProject = (input: { projectId: string; name: string }, onOpened?: () => void): void => {
        const target = workspace;
        if (!active || target === undefined) return;
        if (!beginOp('project:create')) return;
        const release = (): void => endOp('project:create');
        dispatch((actions) => actions.createProject(input));
        void unwrap(target.projectCreate(input)).then((project) => {
          release();
          if (!active) return;
          dispatch((actions) => actions.setProjects([project]));
          openProject((project as { id: string }).id, onOpened);
        }, () => { release(); dispatch((actions) => actions.fail('作品创建失败')); });
      };
      // I55：返回作品列表（切换入口）。脏表单裁决由组件层 `requestBrowse` 先行完成，
      // 这里只切换为列表视图并刷新作品列表，不丢当前作品（browseProjects 保留 selectedProjectId）。
      const browseToProjects = (): void => {
        if (!beginOp('browse:list')) return;
        const release = (): void => endOp('browse:list');
        dispatch((actions) => actions.browseProjects());
        const target = workspace;
        if (target !== undefined) {
          void unwrap(target.projectList()).then(
            (projects) => { release(); if (active) dispatch((actions) => actions.setProjects(projects as unknown[])); },
            () => release(), // 列表刷新失败不 brick：保留既有列表，切换本身非破坏性。
          );
        } else {
          release();
        }
      };
      const cancelBrowse = (): void => {
        dispatch((actions) => actions.cancelBrowse());
      };

      // I53: start six-layer analysis from a source text, then open the review.
      // The current onboarding state is mirrored in a closure so the verdict/apply
      // handlers can read it without reaching into the reactive store snapshot.
      let currentOnboarding: OnboardingState | undefined;
      const setOnboarding = (next: OnboardingState | undefined): void => {
        currentOnboarding = next;
        dispatch((actions) => actions.onboarding(next));
      };
      // I57 session-first flow (R12-4): `begin` returns the session id immediately,
      // then the client polls `status` for busy/progress and calls `cancel` or
      // `result` on terminal states. The poll timer belongs to the Fiber and is
      // cleared on dispose, so no listener leaks after unload.
      let analysisPollTimer: ReturnType<typeof setTimeout> | undefined;
      const clearAnalysisPoll = (): void => {
        if (analysisPollTimer !== undefined) { clearTimeout(analysisPollTimer); analysisPollTimer = undefined; }
      };
      const setAnalysis = (analysis: OnboardingAnalysisState | undefined): void => {
        if (currentOnboarding === undefined) return;
        currentOnboarding = { ...currentOnboarding, analysis };
        dispatch((actions) => actions.onboardingAnalysis(analysis));
      };
      const startAnalysis = (projectId: string, sourceHash: string, text: string): void => {
        const target = analyzer;
        if (!active || target === undefined) { setOnboarding({ projectId, onboardingSessionId: '', sourceHash, decisions: {}, analysis: { status: 'failed', error: '分析服务不可用', sourceText: text } }); return; }
        // 分析中防重复 start：queued/running 期间忽略再次点击（R12-4）。
        const status = currentOnboarding?.analysis?.status;
        if (status === 'queued' || status === 'running') return;
        // 分析开始即切到独立「六层初始化审阅」页签，让原文入口与审阅面板可见。
        dispatch((actions) => actions.activateOnboarding());
        clearAnalysisPoll();
        // 以原文本（或 DOCX 提取文本）发起分析；busy 状态先行，让进度立即可见。
        setOnboarding({ projectId, onboardingSessionId: '', sourceHash, decisions: {}, analysis: { status: 'queued', sourceText: text } });
        void beginAnalysis(target, { projectId, sourceHash, text }).then((sessionId) => {
          if (!active) return;
          if (currentOnboarding?.projectId !== projectId || currentOnboarding?.sourceHash !== sourceHash) return;
          setAnalysis({ status: 'running', sessionId, sourceText: text });
          const poll = (): void => {
            const next = analyzer;
            if (!active || next === undefined) { clearAnalysisPoll(); return; }
            void unwrap(next.status(sessionId)).then((statusRaw) => {
              if (!active) return;
              // 取消竞态防护：用户已取消/失败后，即使上一次 status 刚返回 running
              // 也不再继续轮询（R12-4 监听归零）。
              const local = currentOnboarding?.analysis;
              if (local !== undefined && (local.status === 'cancelled' || local.status === 'failed' || local.status === 'succeeded')) { clearAnalysisPoll(); return; }
              const s = statusRaw as string;
              if (s === 'succeeded') {
                clearAnalysisPoll();
                void analysisResult(next, sessionId).then((result) => {
                  if (!active) return;
                  const session = result as { onboardingSessionId?: string; sourceHash?: string; layers?: unknown };
                  setOnboarding({
                    projectId,
                    onboardingSessionId: session.onboardingSessionId ?? sessionId,
                    sourceHash: session.sourceHash ?? sourceHash,
                    decisions: {},
                    layers: session.layers,
                    analysis: { status: 'succeeded', sessionId, sourceText: text },
                  });
                }, (cause: Error) => setAnalysis({ status: 'failed', sessionId, error: (cause as Error).message, sourceText: text }));
                return;
              }
              if (s === 'failed' || s === 'cancelled') {
                clearAnalysisPoll();
                if (s === 'failed') {
                  void analysisResult(next, sessionId).then(() => undefined, (cause: Error) => setAnalysis({ status: 'failed', sessionId, error: (cause as Error).message, sourceText: text }));
                } else {
                  setAnalysis({ status: 'cancelled', sessionId, error: '分析已取消', sourceText: text });
                }
                return;
              }
              analysisPollTimer = setTimeout(poll, ANALYSIS_POLL_INTERVAL_MS);
            }, (cause: Error) => {
              clearAnalysisPoll();
              setAnalysis({ status: 'failed', sessionId, error: (cause as Error).message, sourceText: text });
            });
          };
          poll();
        }, (cause: Error) => {
          if (!active) return;
          setAnalysis({ status: 'failed', error: (cause as Error).message, sourceText: text });
        });
      };
      const cancelAnalysis = (): void => {
        const target = analyzer;
        const sessionId = currentOnboarding?.analysis?.sessionId;
        if (!active || target === undefined || !sessionId) return;
        clearAnalysisPoll();
        setAnalysis({ status: 'cancelled', sessionId, error: '分析已取消', sourceText: currentOnboarding?.analysis?.sourceText });
        void unwrap(target.cancel(sessionId)).catch(() => undefined);
      };
      const retryAnalysis = (): void => {
        const state = currentOnboarding;
        const text = state?.analysis?.sourceText;
        if (state === undefined || !text) return;
        // 重试复用同一原文重新分析；busy 状态由 startAnalysis 重建（R12-4）。
        startAnalysis(state.projectId, state.sourceHash, text);
      };
      // I56: 逐层裁决草稿（编辑 JSON 文本 / 重生成反馈 / 打开面板）与终态门都经
      // store 持久化；`currentOnboarding` 闭包镜像同步更新，保证裁决回调读到最新绑定。
      const patchOnboarding = (patch: Partial<OnboardingState>): void => {
        if (!active) return;
        if (currentOnboarding) currentOnboarding = { ...currentOnboarding, ...patch };
        dispatch((actions) => actions.onboardingPatch(patch));
      };
      const decideLayer = (layer: OnboardingLayerId, decision: OnboardingDecision, extra?: OnboardingAdjudicationExtra): void => {
        const target = onboarding;
        const state = currentOnboarding;
        if (!active || target === undefined || !state) return;
        // I59 防重复提交（R12-6）：同一层在裁决返回前忽略再次点击。
        if (!beginOp(`onboarding:decide:${layer}`)) return;
        const release = (): void => endOp(`onboarding:decide:${layer}`);
        dispatch((actions) => actions.onboardingDecision(layer, decision));
        void adjudicateOne(target, state, layer, decision, extra).then(() => {
          release();
          if (!active) return;
          // 裁决成功即关闭该层打开的裁决面板（草稿保留，可再次编辑）。
          patchOnboarding({ openPanel: { ...(currentOnboarding?.openPanel ?? {}), [layer]: undefined } });
        }, (cause: Error) => { release(); if (!active) return; dispatch((actions) => actions.onboardingError((cause as Error).message)); });
      };
      // I57 (R12-4): final apply 成功后刷新六层并激活创作台；partial-retryable
      // 只重试未完成层 —— 重试按钮直接再次调用 finalApply，Host 侧按领域身份
      // 幂等（已应用层不重复写，见 I53 验收「重复 apply 语义幂等」）。
      // I59：apply 进行中置 applying（按钮忙碌禁用），同 tick 连点至多一次 finalApply。
      const applyOnboarding = (): void => {
        const target = onboarding;
        const state = currentOnboarding;
        if (!active || target === undefined || !state) return;
        if (state.applying === true || !beginOp('onboarding:apply')) return;
        const release = (): void => endOp('onboarding:apply');
        patchOnboarding({ applying: true, error: undefined });
        void applyAccepted(target, state).then((result) => {
          release();
          if (!active) return;
          patchOnboarding({ applying: false });
          if (result.blockedLayers.length === 0 && result.pendingLayers.length === 0 && !result.retryable) {
            // 成功：离开审阅页签，经 Host projectOpen 复核并刷新六层（成功刷新六层）。
            setOnboarding(undefined);
            openProject(state.projectId);
            dispatch((actions) => actions.activate('characters'));
            return;
          }
          dispatch((actions) => actions.onboardingApplyResult(result));
        }, (cause: Error) => { release(); if (!active) return; patchOnboarding({ applying: false }); dispatch((actions) => actions.onboardingError((cause as Error).message)); });
      };

      // Edit-op closures: derive from the current store snapshot and write back
      // via actions. `makeOps` runs at render time, after `inject` has captured
      // the renderer's baked actions, so `capturedActions` resolves safely.
      // I82：逐层编辑动作（makeOps 1300 行）迁至 src/client/ops/（按层工厂）；
      // 此处只构建 OpsContext 并交给组合根 createWorkbenchOps。渲染期闭包语义
      // 不变：snapshot 是当前渲染快照，act 是 inject 捕获的 baked actions。
      const makeOps = (snapshot: WorkbenchState): WorkbenchOps => createWorkbenchOps({
        snapshot,
        act: capturedActions as WorkbenchActions,
        projectId: currentProjectId,
        active,
        beginOp,
        endOp,
        workspace,
        writing,
        reviewNamespace,
        queueNamespace,
        knowledgeNamespace,
        ruleStyleNamespace,
        progressNamespace,
        importExportNamespace,
        branchNamespace,
        searchNamespace,
        statisticsNamespace,
        timelineNamespace,
      });

      // I46 视觉体系：包内 <style> 注入并归属 Fiber，卸载即回收（R10-3 / D13）。
      ctx.effect(() => {
        const tag = document.createElement('style');
        tag.setAttribute('data-novel-workbench', 'styles');
        tag.textContent = WORKBENCH_STYLES;
        document.head.appendChild(tag);
        return () => { tag.remove(); };
      }, 'novel-creation-tool: workbench styles');

      ctx.slots.inject('shell.overlay', () => {
        // I59 焦点恢复（R12-6）：关闭/Esc 时把焦点恢复到悬浮圆形入口
        // `data-novel-launch`（焦点进入由打开入口的 scheduleFocus 负责）。
        const closeWorkbench = (): void => {
          dispatch((actions) => actions.close());
          // 关闭后面板消失、悬浮圆形入口重新挂载，焦点恢复到 `data-novel-launch`（经宏任务等 React 提交）。
          scheduleFocus('[data-novel-launch]');
        };
        // The component is a real React function component subscribing to the
        // store; close/collapse/activate and every draft mutation dispatch an
        // action, and `useStore` re-renders this component on every change.
        const Overlay = (props: { useStore: <S>(sel: (s: WorkbenchState) => S) => S; actions: WorkbenchActions }): unknown => {
          const s = props.useStore((snapshot) => snapshot);
          const ui = {
            get open() { return s.open; },
            get collapsed() { return s.collapsed; },
            get activeView() { return s.activeView; },
            get navWidth() { return s.navWidth; },
            navResizeStart(startX: number) { props.actions.navResizeStart(startX); },
            navResizeMove(clientX: number) { props.actions.navResizeMove(clientX); },
            navResizeEnd() { props.actions.navResizeEnd(); },
            navResizeStep(delta: number) { props.actions.setNavWidth(s.navWidth + delta); },
            get panelWidth() { return s.panelWidth; },
            panelResizeStart(startX: number) { props.actions.panelResizeStart(startX); },
            panelResizeMove(clientX: number) { props.actions.panelResizeMove(clientX); },
            panelResizeEnd() { props.actions.panelResizeEnd(); },
            panelResizeStep(delta: number) { props.actions.setPanelWidth(s.panelWidth + delta); },
            collapse() { props.actions.collapse(); },
            close() { closeWorkbench(); },
            activate(id: LayerId) { props.actions.activate(id); },
            // I58：统一视图导航。设置类视图（非稳定视图）重复点击回退默认层视图
            // （保留旧 toggle 语义），层视图与 I60 正文视图重复点击保持；首次进入
            // 设置视图时惰性装载 Host 视图。
            activateView(view: WorkbenchViewId) {
              const target = view === s.activeView && !isStableView(view) ? DEFAULT_VIEW : view;
              props.actions.activateView(resolveWorkbenchView(target));
              if (target === 'creationSettings' && s.creationSettingsView === undefined && workbenchSettings) {
                void unwrap(workbenchSettings.load()).then((loaded) => { if (active) dispatch((x) => x.creationSettingsLoaded(loaded as WorkbenchSettingsViewShape)); }, () => dispatch((x) => x.creationSettingsSettled({ error: '创作设置读取失败' })));
              }
              if (target === 'settings' && s.settingsView === undefined && llmConfig) {
                void unwrap(llmConfig.load()).then((loaded) => { if (active) dispatch((x) => x.settingsLoaded(loaded as LlmConfigViewShape)); }, () => dispatch((x) => x.settingsSettled({ error: '设置读取失败' })));
              }
            },
            activateOnboarding() { ui.activateView('onboarding'); },
            activateCreationSettings() { ui.activateView('creationSettings'); },
            toggleSettings() { ui.activateView('settings'); },
            saveLlmConfig() {
              const target = llmConfig;
              const draft = s.settingsDraft;
              // I59 防重复提交（R12-6）：saving 忙碌挡 + 同 tick inflight 挡。
              if (draft.saving || !beginOp('settings:llm:save')) return;
              const release = (): void => endOp('settings:llm:save');
              if (!target) { release(); dispatch((x) => x.settingsSettled({ error: '设置服务不可用' })); return; }
              const baseUrl = draft.baseUrl.trim();
              const model = draft.model.trim();
              if (baseUrl === '' || model === '') { release(); dispatch((x) => x.settingsSettled({ error: '请填写 API URL 与模型名称' })); return; }
              if (draft.apiKey === '' && !(s.settingsView?.hasKey ?? false)) { release(); dispatch((x) => x.settingsSettled({ error: '请填写 API Key（留空将保留已保存的 Key）' })); return; }
              dispatch((x) => x.settingsSettled({ saving: true, message: '', error: '' }));
              void unwrap(target.save({ baseUrl, model, apiKey: draft.apiKey, maxTokens: draft.maxTokens, thinking: draft.thinking, reasoningEffort: draft.reasoningEffort })).then(
                (result) => {
                  release();
                  if (!active) return;
                  dispatch((x) => x.settingsSettled({ saving: false, message: `已保存路由 ${(result as { modelRef: string }).modelRef}（重启 DSH 服务后生效）` }));
                  void unwrap(llmConfig?.load()).then((view) => { if (active && view !== undefined) dispatch((x) => x.settingsLoaded(view as LlmConfigViewShape)); }, () => undefined);
                },
                (cause: Error) => { release(); if (!active) return; dispatch((x) => x.settingsSettled({ saving: false, error: (cause as Error).message })); },
              );
            },
            saveCreationSettings() {
              const target = workbenchSettings;
              const draft = s.creationSettingsDraft;
              if (draft.saving || !beginOp('settings:workbench:save')) return;
              const release = (): void => endOp('settings:workbench:save');
              if (!target) { release(); dispatch((x) => x.creationSettingsSettled({ error: '创作设置服务不可用' })); return; }
              if (!Number.isFinite(draft.wordTarget) || draft.wordTarget < 100) { release(); dispatch((x) => x.creationSettingsSettled({ error: '目标字数至少 100' })); return; }
              dispatch((x) => x.creationSettingsSettled({ saving: true, message: '', error: '' }));
              void unwrap(target.save({ wordTarget: draft.wordTarget, askWhenThin: draft.askWhenThin })).then(
                (view) => {
                  release();
                  if (!active) return;
                  dispatch((x) => x.creationSettingsSettled({ saving: false, message: '创作设置已保存' }));
                  if (active && view !== undefined) dispatch((x) => x.creationSettingsLoaded(view as WorkbenchSettingsViewShape));
                },
                (cause: Error) => { release(); if (!active) return; dispatch((x) => x.creationSettingsSettled({ saving: false, error: (cause as Error).message })); },
              );
            },
            openCreationFolder() {
              const target = workbenchSettings;
              const projectId = currentProjectId;
              if (!beginOp('settings:open-folder')) return;
              const release = (): void => endOp('settings:open-folder');
              if (!target || projectId === undefined) { release(); dispatch((x) => x.creationSettingsSettled({ error: '请先选择作品' })); return; }
              dispatch((x) => x.creationSettingsSettled({ message: '', error: '' }));
              void unwrap(target.openProjectFolder(projectId)).then(
                (result) => {
                  release();
                  if (!active) return;
                  dispatch((x) => x.creationSettingsSettled({ message: `已打开作品落地文件夹：${(result as { path: string }).path}` }));
                },
                (cause: Error) => { release(); if (!active) return; dispatch((x) => x.creationSettingsSettled({ error: (cause as Error).message })); },
              );
            },
            selectProject(id: string) { openProject(id); },
            get newProjectName() { return s.newProjectName; },
            newProjectNameChange(value: string) { props.actions.newProjectName(value); },
            get projectLoading() { return s.projectLoading; },
            createProject(input: { projectId: string; name: string }) { createProject(input); },
            // I55：返回作品列表 / 切换入口。脏表单先裁决，确认/干净才进入列表。
            requestBrowse() {
              if (hasDirtyDrafts(s)) {
                dispatch((x) => x.showLeaveConfirm(true));
              } else {
                browseToProjects();
              }
            },
            confirmLeave() {
              dispatch((x) => x.showLeaveConfirm(false));
              browseToProjects();
            },
            cancelLeave() {
              dispatch((x) => x.showLeaveConfirm(false));
            },
            cancelBrowse() { cancelBrowse(); },
            uploadFile(file: File) {
              const target = workspace;
              if (!target || !active) return;
              // I59 防重复上传（R12-6）：一次 Remote 上传链进行中忽略再次选择文件。
              if (!beginOp('upload')) return;
              void uploadDocx(target, file, (progress) => dispatch((x) => x.uploadProgress(progress))).then(
                (result) => {
                  endOp('upload');
                  dispatch((x) => { x.uploadSettled(result); x.uploadProgress({ phase: 'done' }); });
                  const projectId = currentProjectId;
                  // 创作台内（非浏览）上传 → 对当前作品发起六层分析（既有 I53 自由文本/DOCX 入口）；
                  // 项目目录层（无作品或浏览中）上传 → 一律新建独立作品，审阅在目录层展示。
                  if (projectId !== undefined && !s.browsing) {
                    startAnalysis(projectId, result.sourceHash, result.text);
                    return;
                  }
                  // I53 DOCX new-work entry: with no project open yet (or browsing
                  // the project directory), create a NEW project from the uploaded
                  // document, open it, then drive the six-layer review. The review
                  // is presented at the project-directory level（审阅部分提到项目目录），
                  // so stay in the chooser view instead of entering the workbench.
                  const name = result.fileName.replace(/\.docx$/i, '') || '未命名作品';
                  createProject({ projectId: slug(name), name }, () => {
                    if (currentProjectId !== undefined) {
                      startAnalysis(currentProjectId, result.sourceHash, result.text);
                      // startAnalysis 已切到「六层初始化审阅」页签；browse 让目录层
                      // 可见审阅（apply 成功后 openProject 才进入创作台）。
                      dispatch((actions) => actions.browseProjects());
                    }
                  });
                },
                () => { endOp('upload'); dispatch((x) => x.uploadSettled(undefined)); },
              );
            },
            analyzeText(text: string) {
              const projectId = currentProjectId;
              const normalized = text.trim();
              if (!projectId || normalized.length === 0) return;
              void crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized)).then((digest) => {
                const bytes = new Uint8Array(digest);
                const hash = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
                startAnalysis(projectId, hash, normalized);
              });
            },
            cancelAnalysis() { cancelAnalysis(); },
            retryAnalysis() { retryAnalysis(); },
          };
          const layers: LayerData = {
            characters: s.characters,
            worldview: s.worldview,
            outline: s.outline,
            relationship: s.relationship,
            state: s.state,
            canon: s.canon,
            characterEditor: s.characterEditor,
            worldEditor: s.worldEditor,
            outlineEditor: s.outlineEditor,
            relationshipEditor: s.relationshipEditor,
            stateEditor: s.stateEditor,
            canonEditor: s.canonEditor,
          };
          // UI 打磨：面板关闭时渲染悬浮圆形入口（主页面右上角）；点击打开主控界面并隐藏自己。
          if (!s.open) {
            return launchButton(React, () => {
              dispatch((actions) => actions.open());
              scheduleFocus('[data-novel-focus-scope] [data-novel-focus-target]');
            });
          }
          return workbenchView(React, s.status, {
            workspace, writing, reviewNamespace, queueNamespace, knowledgeNamespace, ruleStyleNamespace, progressNamespace, importExportNamespace, branchNamespace, searchNamespace, statisticsNamespace, timelineNamespace, onboardingNamespace: onboarding,
          }, ui, {
            layers, chapters: s.chapters, review: s.review, queue: s.queue, knowledge: s.knowledge, ruleStyle: s.ruleStyle, progress: s.progress, importExport: s.importExport, search: s.search, statistics: s.statistics, timeline: s.timeline,
          }, makeOps(s), s.selectedProjectId, s.selectedProjectName, s.projects, s.browsing, s.leaveConfirm, s.projectError, s.upload, s.uploadResult, s.onboarding, decideLayer, applyOnboarding, patchOnboarding, {
            view: s.settingsView,
            draft: s.settingsDraft,
            namespace: llmConfig,
            mutate: (patch: Partial<LlmConfigDraftShape>) => dispatch((x) => x.settingsMutate(patch)),
            save: () => ui.saveLlmConfig(),
          }, {
            view: s.creationSettingsView,
            draft: s.creationSettingsDraft,
            namespace: workbenchSettings,
            mutate: (patch: Partial<WorkbenchSettingsDraftShape>) => dispatch((x) => x.creationSettingsMutate(patch)),
            save: () => ui.saveCreationSettings(),
            projectId: s.selectedProjectId,
            openFolder: () => ui.openCreationFolder(),
          });
        };

        const slotDisposer = ctx.slots.register(
          { name: 'shell.overlay', id: 'novel-creation-tool-workspace', order: 0, label: '创作台', store: () => storeHandle, inject: (actions: WorkbenchActions) => { if (!active) return {}; const guarded = lifecycleActions(actions); capturedActions = guarded; for (const fn of pending.splice(0)) fn(guarded); return {}; } },
          Overlay as unknown as () => unknown,
        );
        // I83：16 个结构相同的 `$mount` 块收敛为参数化工厂（架构审查 §4.1 /
        // §9 #5；client/mount.ts 是唯一实现）。Self-mount 每个 namespace 后经
        // `ctx.get` 解析（而非 `inject`：inject 会死锁，因为该服务在 `$mount`
        // 完成后才存在）。workspace 是唯一装载后处理（viewModel + 作品列表）与
        // 显式失败处理（dispatch fail 全屏错误）的特例。
        const mountCtx = { remote: ctx.remote, get: (name: string, silent?: boolean) => ctx.get(name, silent), isActive: () => active };
        mountRemote<WorkspaceNamespace>(mountCtx, {
          contribution: workspaceRemoteContribution,
          serviceKey: 'remote.novelWorkspace',
          label: 'workspace',
          bind: (disposer, service) => { remoteDisposer = disposer; workspace = service; },
          after: (service) => {
            if (service === undefined) { dispatch((x) => x.fail('创作台远程服务不可用')); return; }
            void unwrap(service.viewModel()).then(
              (model) => {
                dispatch((x) => x.ready(model as WorkspaceViewModel));
                void unwrap(service.projectList()).then(
                  (projects) => dispatch((x) => x.setProjects(projects as unknown[])),
                  () => dispatch((x) => x.fail('作品列表读取失败')),
                );
              },
              () => { dispatch((x) => x.fail('创作台远程服务不可用')); },
            );
          },
          onError: () => { dispatch((x) => x.fail('创作台远程服务不可用')); },
        });
        // I53: 六层初始化审阅的 analyzer + adjudication namespaces。挂载失败静默
        // 降级：审阅面板显示不可用。
        mountRemote<OnboardingAnalyzerNamespace>(mountCtx, { contribution: onboardingAnalyzerRemoteContribution, serviceKey: 'remote.novelOnboardingAnalyzer', label: 'analyzer', bind: (disposer, service) => { analyzerDisposer = disposer; analyzer = service; } });
        mountRemote<OnboardingNamespace>(mountCtx, { contribution: onboardingRemoteContribution, serviceKey: 'remote.novelOnboarding', label: 'onboarding', bind: (disposer, service) => { onboardingDisposer = disposer; onboarding = service; } });
        mountRemote<LlmConfigNamespace>(mountCtx, { contribution: llmConfigRemoteContribution, serviceKey: 'remote.novelLlmConfig', label: 'llm config', bind: (disposer, service) => { llmConfigDisposer = disposer; llmConfig = service; } });
        mountRemote<WorkbenchSettingsNamespace>(mountCtx, { contribution: workbenchSettingsRemoteContribution, serviceKey: 'remote.novelWorkbenchSettings', label: 'workbench settings', bind: (disposer, service) => { workbenchSettingsDisposer = disposer; workbenchSettings = service; } });
        // I63：候选审阅与裁决 Remote（R13-4）。挂载失败静默降级：审阅面板显示不可用。
        mountRemote<WritingNamespace>(mountCtx, { contribution: writingRemoteContribution, serviceKey: 'remote.novelWriting', label: 'writing', bind: (disposer, service) => { writingDisposer = disposer; writing = service; } });
        // I64：一致性审校中心 Remote（R13-5）。挂载失败静默降级：审校面板显示不可用。
        mountRemote<ReviewNamespace>(mountCtx, { contribution: reviewRemoteContribution, serviceKey: 'remote.novelReview', label: 'review', bind: (disposer, service) => { reviewDisposer = disposer; reviewNamespace = service; } });
        // I65：可恢复自动生成队列 Remote（R13-6）。挂载失败静默降级：队列面板显示不可用。
        mountRemote<QueueNamespace>(mountCtx, { contribution: queueRemoteContribution, serviceKey: 'remote.novelQueue', label: 'queue', bind: (disposer, service) => { queueDisposer = disposer; queueNamespace = service; } });
        // I66：知情与揭示管理面 Remote（R14-1）。挂载失败静默降级：知情面板显示不可用。
        mountRemote<KnowledgeNamespace>(mountCtx, { contribution: knowledgeRemoteContribution, serviceKey: 'remote.novelKnowledgeManager', label: 'knowledge', bind: (disposer, service) => { knowledgeDisposer = disposer; knowledgeNamespace = service; } });
        // I67：规则与文风控制面 Remote（R14-2）。挂载失败静默降级：规则与文风面板显示不可用。
        mountRemote<RuleStyleNamespace>(mountCtx, { contribution: ruleStyleRemoteContribution, serviceKey: 'remote.novelRuleStyleManager', label: 'ruleStyle', bind: (disposer, service) => { ruleStyleDisposer = disposer; ruleStyleNamespace = service; } });
        // I68：进度与灵感 Remote（R14-3）。挂载失败静默降级：进度与灵感面板显示不可用。
        mountRemote<ProgressNamespace>(mountCtx, { contribution: progressRemoteContribution, serviceKey: 'remote.novelOutlineProgress', label: 'progress', bind: (disposer, service) => { progressDisposer = disposer; progressNamespace = service; } });
        // I69：导入导出与备份 Remote（R14-4）。挂载失败静默降级：面板显示不可用。
        mountRemote<ImportExportNamespace>(mountCtx, { contribution: importExportRemoteContribution, serviceKey: 'remote.novelImportExport', label: 'importExport', bind: (disposer, service) => { importExportDisposer = disposer; importExportNamespace = service; } });
        // I70：C5 正文版本与分支 Remote（R14-5）。挂载失败静默降级：分支面板显示不可用。
        mountRemote<BranchNamespace>(mountCtx, { contribution: branchRemoteContribution, serviceKey: 'remote.novelBranches', label: 'branches', bind: (disposer, service) => { branchDisposer = disposer; branchNamespace = service; } });
        // I71：全局搜索与上下文追踪 Remote（R14-6）。挂载失败静默降级：搜索面板显示不可用。
        mountRemote<SearchNamespace>(mountCtx, { contribution: searchRemoteContribution, serviceKey: 'remote.novelSearch', label: 'search', bind: (disposer, service) => { searchDisposer = disposer; searchNamespace = service; } });
        // I72：写作进度面板 Remote（R14-7）。挂载失败静默降级：进度面板显示不可用。
        mountRemote<StatisticsNamespace>(mountCtx, { contribution: statisticsRemoteContribution, serviceKey: 'remote.novelStatistics', label: 'statistics', bind: (disposer, service) => { statisticsDisposer = disposer; statisticsNamespace = service; } });
        // 方案 A：剧情时间线 Remote（design §8 相关角色对）。挂载失败静默降级：时间线面板显示不可用。
        mountRemote<TimelineNamespace>(mountCtx, { contribution: timelineRemoteContribution, serviceKey: 'remote.novelTimeline', label: 'timeline', bind: (disposer, service) => { timelineDisposer = disposer; timelineNamespace = service; } });
        return () => {
          active = false;
          clearAnalysisPoll();
          capturedActions = undefined;
          pending.splice(0);
          workspace = undefined;
          onboarding = undefined;
          analyzer = undefined;
          llmConfig = undefined;
          workbenchSettings = undefined;
          writing = undefined;
          reviewNamespace = undefined;
          queueNamespace = undefined;
          knowledgeNamespace = undefined;
          ruleStyleNamespace = undefined;
          progressNamespace = undefined;
          importExportNamespace = undefined;
          branchNamespace = undefined;
          searchNamespace = undefined;
          statisticsNamespace = undefined;
          timelineNamespace = undefined;
          slotDisposer();
          if (remoteDisposer) void remoteDisposer();
          if (onboardingDisposer) void onboardingDisposer();
          if (analyzerDisposer) void analyzerDisposer();
          if (llmConfigDisposer) void llmConfigDisposer();
          if (workbenchSettingsDisposer) void workbenchSettingsDisposer();
          if (writingDisposer) void writingDisposer();
          if (reviewDisposer) void reviewDisposer();
          if (queueDisposer) void queueDisposer();
          if (knowledgeDisposer) void knowledgeDisposer();
          if (ruleStyleDisposer) void ruleStyleDisposer();
          if (progressDisposer) void progressDisposer();
          if (importExportDisposer) void importExportDisposer();
          if (branchDisposer) void branchDisposer();
          if (searchDisposer) void searchDisposer();
          if (statisticsDisposer) void statisticsDisposer();
          if (timelineDisposer) void timelineDisposer();
        };
      });
    },
  };
}
