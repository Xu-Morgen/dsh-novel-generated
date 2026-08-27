import {
  type BundleRequire,
  type ClientPluginEntry,
  type EditorRemote,
  type El,
  type LayerId,
  type ReactFace,
  type WorkspaceNamespace,
  type WorkspaceSlots,
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
  LAYERS,
  characterText,
  el as createElement,
  listField,
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
} from './client/shared.js';
import {
  characterCreateInput as buildCharacterCreateInput,
  characterLayer as renderCharacterLayer,
  type CharacterEditOps,
  type CharacterEditor,
  type CharacterLayerState,
  type CharacterShape,
} from './client/layers/characters.js';
import {
  type WorldLayerState,
  type WorldShape,
  type WorldEditOps,
  type WorldEditor,
  worldviewInput as buildWorldviewInput,
  worldviewLayer as renderWorldviewLayer,
} from './client/layers/worldview.js';
import {
  type RelationshipEditOps,
  type RelationshipEditor,
  type RelationshipLayerState,
  type RelationshipShape,
  relationshipInput as buildRelationshipInput,
  relationshipLayer as renderRelationshipLayer,
} from './client/layers/relationship.js';
import { stateLayer as renderStateLayer, type StateDiffShape, type StateEditOps, type StateEditor, type StateLayerState, type StateSnapshotShape } from './client/layers/state.js';
import { canonCorrectionInput as buildCanonCorrectionInput, canonLayer as renderCanonLayer, type CanonEditOps, type CanonEditor, type CanonEventShape, type CanonLayerState } from './client/layers/canon.js';
import {
  outlineInput as buildOutlineInput,
  outlineLayer as renderOutlineLayer,
  type OutlineActShape,
  type OutlineBeatShape,
  type OutlineDetailBeatShape,
  type OutlineEditOps,
  type OutlineEditor,
  type OutlineLayerState,
  type OutlineShape,
} from './client/layers/outline.js';
import { freshCanonEditor, freshCharacterEditor, freshOutlineEditor, freshRelationshipEditor, freshStateEditor, freshWorldEditor, freshChapters, type ChaptersLayerState } from './client/store.js';
import { chaptersPanel, computeEditRange, freshSceneEditor, type BranchDiffLineShape, type BranchPanelState, type BranchSummaryShape, type CandidatePanelState, type CandidateReviewShape, type ChapterListItemShape, type ChapterReadShape, type ChaptersEditOps, type SceneEditorState, type SceneReadShape } from './client/layers/chapters.js';
import { freshReview, reviewPanel, type ReviewAdjudicationOutcomeShape, type ReviewAuditRecordShape, type ReviewEditOps, type ReviewLayerState, type ReviewProjectionShape } from './client/layers/review.js';
import { freshQueue, queuePanel, type QueueEditOps, type QueueLayerState, type QueueStartInputShape, type QueueStatusShape, type QueueTaskShape } from './client/layers/queue.js';
import { freshKnowledge, knowledgePanel, type KnowledgeApplyOutcomeShape, type KnowledgeEditOps, type KnowledgeLayerState, type KnowledgeProjectionShape, type KnowledgeProposalShape, type KnowledgeProposeOutcomeShape, type KnowledgeViewId } from './client/layers/knowledge.js';
import { freshRuleDraft, freshRuleStyle, freshStyleDraft, ruleStylePanel, type RuleDraftShape, type RuleShape, type RuleStyleEditOps, type RuleStyleLayerState, type RuleStyleProjectionShape, type StyleDraftShape, type StyleShape } from './client/layers/rule-style.js';
import { freshProgress, progressPanel, type ProgressApplyOutcomeShape, type ProgressAuditRecordShape, type ProgressDirectionShape, type ProgressEditOps, type ProgressLayerState, type ProgressPendingProposalShape, type ProgressProjectionShape, type ProgressSelectOutcomeShape } from './client/layers/progress.js';
import { freshImportExport, importExportPanel, downloadText, MAX_RESTORE_FILE_BYTES, type ImportExportEditOps, type ImportExportLayerState, type ImportExportPreviewShape, type ImportExportRestoreResultShape } from './client/layers/import-export.js';
import { freshSearch, searchPanel, type SearchEditOps, type SearchHitShape, type SearchLayerState, type SearchResultShape, type SearchStatsShape } from './client/layers/search.js';
import { freshStatistics, statisticsPanel, type ChapterDetailShape, type SceneCardsResultShape, type StatisticsEditOps, type StatisticsLayerState, type StatisticsOverviewShape, type StatisticsStatsShape, type TasksResultShape } from './client/layers/statistics.js';
import { reloadProject, type ProjectOpenLayers } from './client/project-session.js';
import { uploadDocx, type UploadProgress } from './client/upload.js';
import { analysisPanel, ANALYSIS_POLL_INTERVAL_MS, analysisResult, applyAccepted, beginAnalysis, onboardingReview, ONBOARDING_LAYERS, adjudicateOne, type OnboardingAdjudicationExtra, type OnboardingAnalysisState, type OnboardingAnalyzerNamespace, type OnboardingDecision, type OnboardingLayerId, type OnboardingNamespace, type OnboardingState } from './client/onboarding.js';
import { onboardingRemoteContribution, onboardingAnalyzerRemoteContribution } from './client/onboarding.js';
import { freshLlmConfigDraft, llmSettingsPanel, llmConfigRemoteContribution, type LlmConfigDraftShape, type LlmConfigNamespace, type LlmConfigViewShape } from './client/settings.js';
import { freshWorkbenchSettingsDraft, workbenchSettingsPanel, workbenchSettingsRemoteContribution, type WorkbenchSettingsDraftShape, type WorkbenchSettingsNamespace, type WorkbenchSettingsViewShape } from './client/workbench-settings.js';
import { RESPONSIVE_BREAKPOINT_NAV, WORKBENCH_STYLES } from './client/styles.js';
import { DEFAULT_VIEW, NAV_GROUPS, isStableView, resolveWorkbenchView, type WorkbenchViewId } from './client/nav.js';
import { scheduleFocus } from './client/focus.js';

/** 导航侧栏可拖动宽度边界（UI 打磨补强，§14.8 停靠侧板）：默认 160px，可拖到 120–360px。 */
export const NAV_WIDTH_MIN = 120;
export const NAV_WIDTH_MAX = 360;
export const NAV_WIDTH_DEFAULT = 160;

/** 创作台面板整体宽度边界（UI 打磨补强：拖左边缘调整面板宽度，§14.8 停靠侧板）。 */
export const PANEL_WIDTH_MIN = 640;
export const PANEL_WIDTH_MAX = 1600;
export const PANEL_WIDTH_DEFAULT = 860;

/** 面板过窄阈值：低于该宽度时侧边路由栏自动折叠为横向滚动横条（与响应式断点一致）。 */
export const PANEL_NAV_AUTO_COLLAPSE = RESPONSIVE_BREAKPOINT_NAV;

/** 侧栏宽度键盘步进（resizer 方向键，I59 键盘可达性延续）。 */
export const GRID_STEP = 8;

/** Compatibility facade retained for the public client rendering contract. */
function el(React: ReactFace): El {
  // Keep the explicit primitive visible at the entry boundary; shared owns the implementation.
  void React.createElement;
  return createElement(React);
}

/**
 * `defineStore` contract supplied by the DSH client runtime (the same React-free
 * engine the official UI plugins use). `spec` carries `init` (fresh state per
 * instance) and an `actions` table of immer-draft transforms; `create(scopeKey)`
 * returns a bare `{ getSnapshot, subscribe, actions }` instance. The renderer
 * binds `useStore` from this instance and hands baked `actions` to the component.
 */
export type BakedStoreActions<T, A> = {
  [K in keyof A]: A[K] extends (draft: T, ...params: infer P) => void ? (...params: P) => void : never;
};
export interface StoreInstance<T, A> {
  readonly actions: BakedStoreActions<T, A>;
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
}
export interface StoreHandle<T, A> {
  create(scopeKey?: string): StoreInstance<T, A>;
}
export interface DefineStore {
  <T, A extends Record<string, (draft: T, ...params: never[]) => void>>(spec: {
    init: () => T;
    persist?: string;
    actions: A;
  }): StoreHandle<T, A>;
}
/** Baked action callback set the store hands to the component (draft stripped). */
export type WorkbenchActions = {
  open(): void;
  close(): void;
  collapse(): void;
  /** 导航侧栏宽度（可拖动，UI 打磨）：设置侧栏宽度（钳制在 NAV_WIDTH_MIN/MAX 内）。 */
  setNavWidth(width: number): void;
  /** 拖动会话开始：记录指针起点 X 与当前宽度。 */
  navResizeStart(startX: number): void;
  /** 拖动会话移动：按指针位移更新侧栏宽度。 */
  navResizeMove(clientX: number): void;
  /** 拖动会话结束：释放指针。 */
  navResizeEnd(): void;
  /** 创作台面板整体宽度（可拖动，UI 打磨）：设置面板宽度（钳制在 PANEL_WIDTH_MIN/MAX 内）。 */
  setPanelWidth(width: number): void;
  /** 面板宽度拖动会话开始：记录指针起点 X 与当前宽度。 */
  panelResizeStart(startX: number): void;
  /** 面板宽度拖动会话移动：按指针位移更新面板宽度。 */
  panelResizeMove(clientX: number): void;
  /** 面板宽度拖动会话结束：释放指针。 */
  panelResizeEnd(): void;
  activate(id: LayerId): void;
  /** I58 稳定视图导航：以 WorkbenchViewId 为唯一 route/state 锚点。 */
  activateView(view: WorkbenchViewId): void;
  activateOnboarding(): void;
  activateCreationSettings(): void;
  ready(model: WorkspaceViewModel): void;
  fail(message: string): void;
  setProjects(list: unknown[]): void;
  selectProject(projectId: string, name?: string): void;
  resetEditors(): void;
  browseProjects(): void;
  cancelBrowse(): void;
  showLeaveConfirm(show: boolean): void;
  projectFailed(message: string): void;
  createProject(input: { projectId: string; name: string }): void;
  /** 项目目录层「空白创建」作品名称草稿（受控输入，经 store 持久化，重渲染不丢）。 */
  newProjectName(value: string): void;
  uploadProgress(progress: UploadProgress): void;
  uploadSettled(result: { sourceHash: string; fileName: string; text: string; chunks: unknown[] } | undefined): void;
  onboarding(state: OnboardingState | undefined): void;
  onboardingDecision(layer: OnboardingLayerId, decision: OnboardingDecision): void;
  onboardingPatch(patch: Partial<OnboardingState>): void;
  onboardingApplyResult(result: OnboardingState['applyResult']): void;
  onboardingError(message: string): void;
  /** I57 分析生命周期状态（busy/progress/cancel/retry）。 */
  onboardingAnalysis(analysis: OnboardingAnalysisState | undefined): void;
  creationSettingsLoaded(view: WorkbenchSettingsViewShape): void;
  creationSettingsMutate(patch: Partial<WorkbenchSettingsDraftShape>): void;
  creationSettingsSettled(patch: Partial<WorkbenchSettingsDraftShape>): void;
  setCharacters(status: 'loading' | 'ready' | 'error', list: unknown[], message?: string): void;
  setWorldview(status: 'loading' | 'ready' | 'error', list: unknown[], message?: string): void;
  setOutline(status: 'loading' | 'ready' | 'error', outline: unknown, message?: string): void;
  setRelationship(status: 'loading' | 'ready' | 'error', list: unknown[], message?: string): void;
  setState(status: 'loading' | 'ready' | 'error', snapshots: unknown[], message?: string): void;
  setCanon(status: 'loading' | 'ready' | 'error', events: unknown[], message?: string): void;
  /** I60 C5 章节树装载与章节/场景读取（R13-1）。 */
  setChapters(status: 'loading' | 'ready' | 'error', list: unknown[], message?: string): void;
  chaptersSelectChapter(chapterId: string): void;
  chaptersSelectScene(sceneId: string): void;
  chaptersRead(status: 'loading' | 'ready' | 'error', read: unknown, message?: string): void;
  chaptersScene(status: 'idle' | 'loading' | 'ready' | 'error', scene: unknown, message?: string): void;
  /** I61 正文编辑器（R13-2）：保存/重解析/脏文本保护全部经 store 持久化。 */
  sceneEditor(patch: Partial<SceneEditorState>): void;
  sceneEditorReset(): void;
  /** I63 候选审阅面板（R13-4）：面板状态机 + 局部重写指令草稿。 */
  chaptersCandidate(patch: Partial<CandidatePanelState>): void;
  /** I70 版本/分支面板（R14-5）：版本列表/存档草稿/对比视图状态合并。 */
  chaptersBranches(patch: Partial<BranchPanelState>): void;
  /** I64 一致性审校中心（R13-5）：审校面板状态（投影/过滤/选中/审计记录）。 */
  reviewPatch(patch: Partial<ReviewLayerState>): void;
  /** I65 生成队列（R13-6）：队列面板状态（投影/范围勾选/配置草稿）。 */
  queuePatch(patch: Partial<QueueLayerState>): void;
  /** I66 知情与揭示管理面（R14-1）：面板状态（投影/视图/选中/提案草稿/pending）。 */
  knowledgePatch(patch: Partial<KnowledgeLayerState>): void;
  /** I67：规则与文风面板状态合并（R14-2）。 */
  ruleStylePatch(patch: Partial<RuleStyleLayerState>): void;
  /** I68：进度与灵感面板状态合并（R14-3）。 */
  progressPatch(patch: Partial<ProgressLayerState>): void;
  /** I69：导入导出与备份面板状态合并（R14-4）。 */
  importExportPatch(patch: Partial<ImportExportLayerState>): void;
  /** I71：全局搜索与追踪面板状态合并（R14-6）。 */
  searchPatch(patch: Partial<SearchLayerState>): void;
  /** I72：写作进度面板状态合并（R14-7）。 */
  statisticsPatch(patch: Partial<StatisticsLayerState>): void;
  characterDraft(patch: Partial<CharacterEditor>): void;
  worldDraft(patch: Partial<WorldEditor>): void;
  outlineDraft(patch: Partial<OutlineEditor>): void;
  relationshipDraft(patch: Partial<RelationshipEditor>): void;
  stateDraft(patch: Partial<StateEditor>): void;
  canonDraft(patch: Partial<CanonEditor>): void;
  characterMutate(update: (draft: CharacterShape) => CharacterShape): void;
  worldMutate(update: (draft: WorldShape) => WorldShape): void;
  outlineMutate(update: (draft: OutlineShape) => OutlineShape): void;
  relationshipMutate(update: (draft: RelationshipShape) => RelationshipShape): void;
  toggleSettings(): void;
  settingsLoaded(view: LlmConfigViewShape): void;
  settingsMutate(patch: Partial<LlmConfigDraftShape>): void;
  settingsSettled(patch: Partial<LlmConfigDraftShape>): void;
};

/** I63 裁决结果的 Client 投影（最小 owned JSON；与 Host `novelWriting.adjudicate` 对齐）。 */
type WritingAdjudicationOutcome =
  | { readonly status: 'written'; readonly candidateId: string; readonly scene: { readonly chapterId: string; readonly sceneId: string }; readonly layers: readonly string[] }
  | { readonly status: 'rejected'; readonly candidateId: string }
  | { readonly status: 'rewritten'; readonly candidateId: string; readonly superseded: string; readonly candidate: { readonly id: string } }
  | { readonly status: 'generation-rejected' | 'prewrite-rejected'; readonly candidateId: string; readonly adjudication: { readonly status: string } }
  | { readonly status: 'pending-compensation'; readonly candidateId: string; readonly failedStage: string };

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

/** 单层空态占位（仅兜底，I49 起六层均有真实面板）。 */
function emptyState(h: El, layer: (typeof LAYERS)[number]): unknown {
  return h('section', {
    className: 'nv-workbench__empty',
    'data-novel-layer-panel': layer.id,
    'data-novel-layer-state': 'empty',
  },
    h('h3', { className: 'nv-workbench__empty-title' }, layer.title),
    h('p', { className: 'nv-workbench__empty-hint' }, layer.hint),
  );
}

/**
 * I48 B5 大纲结构化编辑器（design §5.7 / R10-5）。替换裸 JSON 文本框：幕→节→
 * 细纲场景卡的三级层级编辑。所有读写只经 Host `outlineRead`/`outlineSave`/
 * `outlineBeatCards`，Client 不拥有领域校验（design §0.1.2）。
 */

/** 内容区：按激活层渲染真表单（I47/I48/I49），仅兜底空态。 */
function contentArea(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, activeLayer: LayerId, layers: LayerData, ops: WorkbenchOps): unknown {
  const layer = LAYERS.find((item) => item.id === activeLayer) ?? LAYERS[0];
  if (layer.id === 'characters') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderCharacterLayer(h, projectId, workspace, layers.characters, layers.characterEditor, ops.characters));
  }
  if (layer.id === 'worldview') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderWorldviewLayer(h, projectId, workspace, layers.worldview, layers.worldEditor, ops.worldview));
  }
  if (layer.id === 'outline') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderOutlineLayer(h, projectId, workspace, layers.outline, layers.outlineEditor, ops.outline));
  }
  if (layer.id === 'relationship') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderRelationshipLayer(h, projectId, workspace, layers.relationship, layers.relationshipEditor, ops.relationship));
  }
  if (layer.id === 'state') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderStateLayer(h, projectId, workspace, layers.state, layers.stateEditor, ops.state));
  }
  if (layer.id === 'canon') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      renderCanonLayer(h, projectId, workspace, layers.canon, layers.canonEditor, ops.canon));
  }
  return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' }, emptyState(h, layer));
}

/**
 * I58 视图分发（design §14.8 / R12-5）：按稳定 activeView 渲染对应面板，
 * 每个内容区携带 `data-novel-view-panel` data 锚点。非层视图（LLM 设置 /
 * 创作设置 / 六层初始化审阅 / I60 正文）与层视图互斥，由单一视图状态决定。
 */
function viewPanel(
  h: El,
  activeView: WorkbenchViewId,
  projectId: string,
  workspace: WorkspaceNamespace | undefined,
  writing: WritingNamespace | undefined,
  reviewNamespace: ReviewNamespace | undefined,
  queueNamespace: QueueNamespace | undefined,
  knowledgeNamespace: KnowledgeNamespace | undefined,
  ruleStyleNamespace: RuleStyleNamespace | undefined,
  progressNamespace: ProgressNamespace | undefined,
  importExportNamespace: ImportExportNamespace | undefined,
  branchNamespace: BranchNamespace | undefined,
  searchNamespace: SearchNamespace | undefined,
  statisticsNamespace: StatisticsNamespace | undefined,
  reviewState: ReviewLayerState,
  queueState: QueueLayerState,
  knowledgeState: KnowledgeLayerState,
  ruleStyleState: RuleStyleLayerState,
  progressState: ProgressLayerState,
  importExportState: ImportExportLayerState,
  searchState: SearchLayerState,
  statisticsState: StatisticsLayerState,
  layers: LayerData,
  ops: WorkbenchOps,
  chapters: ChaptersLayerState,
  sourceEntry: unknown,
  review: unknown,
  settings: { view: LlmConfigViewShape | undefined; draft: LlmConfigDraftShape; namespace: LlmConfigNamespace | undefined; mutate(patch: Partial<LlmConfigDraftShape>): void; save(): void } | undefined,
  creationSettings: { view: WorkbenchSettingsViewShape | undefined; draft: WorkbenchSettingsDraftShape; namespace: WorkbenchSettingsNamespace | undefined; mutate(patch: Partial<WorkbenchSettingsDraftShape>): void; save(): void; projectId: string | undefined; openFolder(): void } | undefined,
): unknown {
  if (activeView === 'settings') {
    return h('div', { 'data-novel-view-panel': 'settings' }, settings !== undefined ? llmSettingsPanel(h, settings.namespace, settings.view, settings.draft, settings.mutate, settings.save) : null);
  }
  if (activeView === 'creationSettings') {
    return h('div', { 'data-novel-view-panel': 'creationSettings' }, creationSettings !== undefined ? workbenchSettingsPanel(h, creationSettings.namespace, creationSettings.draft, creationSettings.mutate, creationSettings.save, creationSettings.projectId, creationSettings.openFolder) : null);
  }
  if (activeView === 'onboarding') {
    return h('div', { className: 'nv-onboarding-stack', 'data-novel-onboarding-tab': '', 'data-novel-view-panel': 'onboarding' }, sourceEntry, review);
  }
  // I60：正文视图（写作组 C5）—— 章节树/场景列表/正文只读面板（R13-1）+ I63 候选审阅。
  if (activeView === 'chapters') {
    return h('div', { 'data-novel-view-panel': 'chapters' }, chaptersPanel(h, projectId, workspace, writing, branchNamespace, chapters, ops.chapters));
  }
  // I64：一致性审校中心（写作组）—— 五类问题统一投影 + 刷新/过滤 + 显式裁决（R13-5）。
  if (activeView === 'review') {
    return h('div', { 'data-novel-view-panel': 'review' }, reviewPanel(h, projectId, reviewNamespace, reviewState, ops.review));
  }
  // I65：生成队列（写作组）—— 场景卡范围/配置 + 暂停/继续/取消 + 任务列表（R13-6）。
  if (activeView === 'queue') {
    return h('div', { 'data-novel-view-panel': 'queue' }, queuePanel(h, projectId, queueNamespace, workspace, queueState, ops.queue));
  }
  // I66：知情与揭示（连续性组）—— 事实/角色双视图 + 揭示/holder Gate 提案（R14-1）。
  if (activeView === 'knowledge') {
    return h('div', { 'data-novel-view-panel': 'knowledge' }, knowledgePanel(h, projectId, knowledgeNamespace, knowledgeState, ops.knowledge));
  }
  // I67：规则与文风（策划组）—— B1 规则 + B4 风格档案表单（R14-2）。
  if (activeView === 'ruleStyle') {
    return h('div', { 'data-novel-view-panel': 'ruleStyle' }, ruleStylePanel(h, projectId, ruleStyleNamespace, ruleStyleState, ops.ruleStyle));
  }
  // I68：进度与灵感（写作组）—— C6 执行态进度/偏差 + 灵感方向 Gate 落地（R14-3）。
  if (activeView === 'progress') {
    return h('div', { 'data-novel-view-panel': 'progress' }, progressPanel(h, projectId, progressNamespace, progressState, ops.progress));
  }
  // I69：导入导出与备份（作品设置组）—— 项目包/纯文本导出 + round-trip 恢复 + 导入预览（R14-4）。
  if (activeView === 'importExport') {
    return h('div', { 'data-novel-view-panel': 'importExport' }, importExportPanel(h, projectId, importExportNamespace, importExportState, ops.importExport));
  }
  // I71：全局搜索与上下文追踪（写作组）—— 跨六层关键词检索 + 实体引用 + 结果跳转 + 索引重建/删除（R14-6）。
  if (activeView === 'search') {
    return h('div', { 'data-novel-view-panel': 'search' }, searchPanel(h, projectId, searchNamespace, searchState, ops.search));
  }
  // I72：写作进度面板（写作组）—— 可重建派生统计：章节字数/目标完成度/场景卡状态/POV 分布/任务历史（R14-7）。
  if (activeView === 'statistics') {
    return h('div', { 'data-novel-view-panel': 'statistics' }, statisticsPanel(h, projectId, statisticsNamespace, statisticsState, ops.statistics));
  }
  return h('div', { 'data-novel-view-panel': activeView }, contentArea(h, projectId, workspace, activeView, layers, ops));
}

/** I47/I48/I49 数据层：各领域列表与表单态在面板装载后维护，供真表单渲染。 */
interface LayerData {
  readonly characters: CharacterLayerState;
  readonly worldview: WorldLayerState;
  readonly outline: OutlineLayerState;
  readonly relationship: RelationshipLayerState;
  readonly state: StateLayerState;
  readonly canon: CanonLayerState;
  readonly characterEditor: CharacterEditor;
  readonly worldEditor: WorldEditor;
  readonly outlineEditor: OutlineEditor;
  readonly relationshipEditor: RelationshipEditor;
  readonly stateEditor: StateEditor;
  readonly canonEditor: CanonEditor;
}
/** 每层编辑动作集合（render 助手经此写入 store，而非就地改对象）。 */
interface WorkbenchOps {
  readonly characters: CharacterEditOps;
  readonly worldview: WorldEditOps;
  readonly outline: OutlineEditOps;
  readonly relationship: RelationshipEditOps;
  readonly state: StateEditOps;
  readonly canon: CanonEditOps;
  /** I60：C5 只读导航（章节/场景选择与重试，经 Host Remote 读取）。 */
  readonly chapters: ChaptersEditOps;
  /** I64：一致性审校中心（刷新/过滤/选中/显式裁决，R13-5）。 */
  readonly review: ReviewEditOps;
  /** I65：生成队列（范围/配置 + 暂停/继续/取消 + 重试，R13-6）。 */
  readonly queue: QueueEditOps;
  /** I66：知情与揭示（刷新/双视图/选中/提案草稿 + Gate 确认，R14-1）。 */
  readonly knowledge: KnowledgeEditOps;
  /** I67：规则与文风（刷新/规则选中与新建/表单草稿/保存，R14-2）。 */
  readonly ruleStyle: RuleStyleEditOps;
  /** I68：进度与灵感（刷新/偏差记录与调和/灵感时刻/选定→Gate 提案→确认/拒绝，R14-3）。 */
  readonly progress: ProgressEditOps;
  /** I69：导入导出与备份（导出下载/恢复/N-7 说明/导入预览，R14-4）。 */
  readonly importExport: ImportExportEditOps;
  /** I71：全局搜索与上下文追踪（搜索/引用/跳转/重建/删除派生索引，R14-6）。 */
  readonly search: SearchEditOps;
  /** I72：写作进度面板（概览/筛选/章节详情/重建/删除派生统计，R14-7）。 */
  readonly statistics: StatisticsEditOps;
}

/** 面板主体：品牌头栏 + 任务分组导航 + 视图内容区（写作/策划/连续性/作品设置，I58）。 */
function workbenchView(React: ReactFace, status: WorkspaceStatus, workspace: WorkspaceNamespace | undefined, writing: WritingNamespace | undefined, reviewNamespace: ReviewNamespace | undefined, queueNamespace: QueueNamespace | undefined, knowledgeNamespace: KnowledgeNamespace | undefined, ruleStyleNamespace: RuleStyleNamespace | undefined, progressNamespace: ProgressNamespace | undefined, importExportNamespace: ImportExportNamespace | undefined, branchNamespace: BranchNamespace | undefined, searchNamespace: SearchNamespace | undefined, statisticsNamespace: StatisticsNamespace | undefined, ui: { open: boolean; collapsed: boolean; activeView: WorkbenchViewId; navWidth: number; navResizeStart(clientX: number): void; navResizeMove(clientX: number): void; navResizeEnd(): void; navResizeStep(delta: number): void; panelWidth: number; panelResizeStart(clientX: number): void; panelResizeMove(clientX: number): void; panelResizeEnd(): void; panelResizeStep(delta: number): void; collapse(): void; close(): void; activateView(view: WorkbenchViewId): void; selectProject(id: string): void; createProject(input: { projectId: string; name: string }): void; newProjectName: string; newProjectNameChange(value: string): void; projectLoading: boolean; uploadFile(file: File): void; analyzeText(text: string): void; cancelAnalysis(): void; retryAnalysis(): void; requestBrowse(): void; cancelBrowse(): void; confirmLeave(): void; cancelLeave(): void }, layers: LayerData, ops: WorkbenchOps, chapters: ChaptersLayerState, reviewState: ReviewLayerState, queueState: QueueLayerState, knowledgeState: KnowledgeLayerState, ruleStyleState: RuleStyleLayerState, progressState: ProgressLayerState, importExportState: ImportExportLayerState, searchState: SearchLayerState, statisticsState: StatisticsLayerState, selectedProjectId?: string, selectedProjectName?: string, projects: Array<{ id: string; name: string }> = [], browsing = false, leaveConfirm = false, projectError?: string, upload?: UploadProgress, uploadResult?: { sourceHash: string; fileName: string; text: string; chunks: unknown[] }, onboardingState?: OnboardingState, onboardingNamespace?: OnboardingNamespace, decideOnboarding?: (layer: OnboardingLayerId, decision: OnboardingDecision, extra?: OnboardingAdjudicationExtra) => void, applyOnboarding?: () => void, patchOnboarding?: (patch: Partial<OnboardingState>) => void, settings?: { view: LlmConfigViewShape | undefined; draft: LlmConfigDraftShape; namespace: LlmConfigNamespace | undefined; mutate(patch: Partial<LlmConfigDraftShape>): void; save(): void }, creationSettings?: { view: WorkbenchSettingsViewShape | undefined; draft: WorkbenchSettingsDraftShape; namespace: WorkbenchSettingsNamespace | undefined; mutate(patch: Partial<WorkbenchSettingsDraftShape>): void; save(): void; projectId: string | undefined; openFolder(): void }): unknown {
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
          viewPanel(h, ui.activeView, selectedProjectId, workspace, writing, reviewNamespace, queueNamespace, knowledgeNamespace, ruleStyleNamespace, progressNamespace, importExportNamespace, branchNamespace, searchNamespace, statisticsNamespace, reviewState, queueState, knowledgeState, ruleStyleState, progressState, importExportState, searchState, statisticsState, layers, ops, chapters, sourceEntry, review, settings, creationSettings),
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

/* ---- store shape: the single reactive source of truth for the workbench ---- */

interface WorkbenchState {
  open: boolean;
  collapsed: boolean;
  /** 导航侧栏宽度（px，可拖动，UI 打磨）。 */
  navWidth: number;
  /** 侧栏拖动会话：active 期间 pointermove 更新宽度；结束即复位。 */
  navResize: { active: boolean; startX: number; startWidth: number };
  /** 创作台面板整体宽度（px，可拖动左边缘调整，UI 打磨）。 */
  panelWidth: number;
  /** 面板宽度拖动会话：active 期间 pointermove 更新宽度；结束即复位。 */
  panelResize: { active: boolean; startX: number; startWidth: number };
  /** I58 稳定视图状态锚点：唯一 active view（route/state/data 三锚点的 state 位）。 */
  activeView: WorkbenchViewId;
  status: WorkspaceStatus;
  characters: CharacterLayerState;
  worldview: WorldLayerState;
  outline: OutlineLayerState;
  relationship: RelationshipLayerState;
  state: StateLayerState;
  canon: CanonLayerState;
  characterEditor: CharacterEditor;
  worldEditor: WorldEditor;
  outlineEditor: OutlineEditor;
  relationshipEditor: RelationshipEditor;
  stateEditor: StateEditor;
  canonEditor: CanonEditor;
  /** I60：C5 章节树 + 章节/场景只读读取状态（R13-1）。 */
  chapters: ChaptersLayerState;
  /** I64：一致性审校中心面板状态（投影/过滤/选中/审计记录，R13-5）。 */
  review: ReviewLayerState;
  /** I65：生成队列面板状态（投影/范围勾选/配置草稿，R13-6）。 */
  queue: QueueLayerState;
  /** I66：知情与揭示面板状态（投影/视图/选中/提案草稿/pending，R14-1）。 */
  knowledge: KnowledgeLayerState;
  /** I67：规则与文风面板状态（投影/编辑草稿/风格草稿，R14-2）。 */
  ruleStyle: RuleStyleLayerState;
  /** I68：进度与灵感面板状态（投影/偏差草稿/方向/待确认/审计，R14-3）。 */
  progress: ProgressLayerState;
  /** I69：导入导出与备份面板状态（导出选择/恢复结果/导入预览，R14-4）。 */
  importExport: ImportExportLayerState;
  /** I71：全局搜索与追踪面板状态（查询/引用/索引状态/结果，R14-6）。 */
  search: SearchLayerState;
  /** I72：写作进度面板状态（统计/概览/筛选/章节详情/任务历史，R14-7）。 */
  statistics: StatisticsLayerState;
  selectedProjectId: string | undefined;
  /** 当前作品的展示名（来自 Host `projectOpen` 复核结果，用于作品上下文栏）。 */
  selectedProjectName: string | undefined;
  /** true 表示作品列表正在显示（无作品或正在切换），当前作品仍被保留。 */
  browsing: boolean;
  /** 脏表单离开裁决确认条是否显示（I55 / R12-2）。 */
  leaveConfirm: boolean;
  /** 可恢复的 open/切换失败信息（保持当前视图，不 brick 成整屏错误）。 */
  projectError: string | undefined;
  projects: Array<{ id: string; name: string }>;
  projectLoading: boolean;
  /** 项目目录层「空白创建」作品名称草稿（受控输入，与 selectedProjectId 无关，属目录层 UI 态）。 */
  newProjectName: string;
  upload: UploadProgress;
  uploadResult: { sourceHash: string; fileName: string; text: string; chunks: unknown[] } | undefined;
  onboarding: OnboardingState | undefined;
  settingsView: LlmConfigViewShape | undefined;
  settingsDraft: LlmConfigDraftShape;
  creationSettingsView: WorkbenchSettingsViewShape | undefined;
  creationSettingsDraft: WorkbenchSettingsDraftShape;
}

/** Public bundle factory; React, Remote and defineStore are supplied by the DSH shell. */
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
      const storeHandle = defineStore({
        init: (): WorkbenchState => ({
          open: true,
          collapsed: false,
          navWidth: NAV_WIDTH_DEFAULT,
          navResize: { active: false, startX: 0, startWidth: 0 },
          panelWidth: PANEL_WIDTH_DEFAULT,
          panelResize: { active: false, startX: 0, startWidth: 0 },
          activeView: DEFAULT_VIEW,
          status: { status: 'loading' },
          characters: { status: 'loading', list: [] },
          worldview: { status: 'loading', list: [] },
          outline: { status: 'loading' },
          relationship: { status: 'loading', list: [] },
          state: { status: 'loading', snapshots: [] },
          canon: { status: 'loading', events: [] },
          characterEditor: freshCharacterEditor(),
          worldEditor: freshWorldEditor(),
          outlineEditor: freshOutlineEditor(),
          relationshipEditor: freshRelationshipEditor(),
          stateEditor: freshStateEditor(),
          canonEditor: freshCanonEditor(),
          chapters: freshChapters(),
          review: freshReview(),
          queue: freshQueue(),
          knowledge: freshKnowledge(),
          ruleStyle: freshRuleStyle(),
          progress: freshProgress(),
          importExport: freshImportExport(),
          search: freshSearch(),
          statistics: freshStatistics(),
          selectedProjectId: undefined,
          selectedProjectName: undefined,
          browsing: false,
          leaveConfirm: false,
          projectError: undefined,
          projects: [],
          projectLoading: false,
          newProjectName: '',
          upload: { phase: 'idle' },
          uploadResult: undefined,
          onboarding: undefined,
          settingsView: undefined,
          settingsDraft: freshLlmConfigDraft(),
          creationSettingsView: undefined,
          creationSettingsDraft: freshWorkbenchSettingsDraft(),
        }),
        actions: {
          open: (d) => { d.open = true; d.collapsed = false; },
          close: (d) => { d.open = false; },
          collapse: (d) => { d.collapsed = !d.collapsed; },
          // UI 打磨：侧栏可拖动宽度（pointer 会话经 store 持久化，渲染层只消费快照）。
          setNavWidth: (d, width: number) => { d.navWidth = Math.round(Math.min(NAV_WIDTH_MAX, Math.max(NAV_WIDTH_MIN, width))); },
          navResizeStart: (d, startX: number) => { d.navResize = { active: true, startX, startWidth: d.navWidth }; },
          navResizeMove: (d, clientX: number) => { if (d.navResize.active) d.navWidth = Math.round(Math.min(NAV_WIDTH_MAX, Math.max(NAV_WIDTH_MIN, d.navResize.startWidth + (clientX - d.navResize.startX)))); },
          navResizeEnd: (d) => { d.navResize = { active: false, startX: 0, startWidth: 0 }; },
          // UI 打磨：面板整体宽度可拖动（拖左边缘；store 持久化会话，渲染层只消费快照）。
          setPanelWidth: (d, width: number) => { d.panelWidth = Math.round(Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, width))); },
          panelResizeStart: (d, startX: number) => { d.panelResize = { active: true, startX, startWidth: d.panelWidth }; },
          panelResizeMove: (d, clientX: number) => { if (d.panelResize.active) d.panelWidth = Math.round(Math.min(PANEL_WIDTH_MAX, Math.max(PANEL_WIDTH_MIN, d.panelResize.startWidth + (d.panelResize.startX - clientX)))); },
          panelResizeEnd: (d) => { d.panelResize = { active: false, startX: 0, startWidth: 0 }; },
          activate: (d, id: LayerId) => { d.activeView = resolveWorkbenchView(id); },
          activateView: (d, view: WorkbenchViewId) => { d.activeView = resolveWorkbenchView(view); },
          activateOnboarding: (d) => { d.activeView = 'onboarding'; },
          activateCreationSettings: (d) => { d.activeView = 'creationSettings'; },
          ready: (d, model: WorkspaceViewModel) => { d.status = { status: 'ready', model }; },
          fail: (d, message: string) => { d.status = { status: 'error', message }; },
          setProjects: (d, list: unknown[]) => { d.projects = list as Array<{ id: string; name: string }>; d.projectLoading = false; },
          selectProject: (d, projectId: string, name?: string) => { d.selectedProjectId = projectId; d.selectedProjectName = name ?? d.selectedProjectName; d.browsing = false; d.leaveConfirm = false; d.projectError = undefined; d.projectLoading = false; },
          resetEditors: (d) => { d.characterEditor = freshCharacterEditor(); d.worldEditor = freshWorldEditor(); d.outlineEditor = freshOutlineEditor(); d.relationshipEditor = freshRelationshipEditor(); d.stateEditor = freshStateEditor(); d.canonEditor = freshCanonEditor(); d.chapters = freshChapters(); d.review = freshReview(); d.queue = freshQueue(); d.knowledge = freshKnowledge(); d.ruleStyle = freshRuleStyle(); d.progress = freshProgress(); d.importExport = freshImportExport(); d.search = freshSearch(); d.statistics = freshStatistics(); d.onboarding = undefined; d.leaveConfirm = false; },
          browseProjects: (d) => { d.browsing = true; d.projectError = undefined; d.leaveConfirm = false; },
          cancelBrowse: (d) => { d.browsing = false; d.projectError = undefined; },
          showLeaveConfirm: (d, show: boolean) => { d.leaveConfirm = show; },
          projectFailed: (d, message: string) => { d.projectError = message; d.projectLoading = false; },
          createProject: (d) => { d.projectLoading = true; d.newProjectName = ''; },
          newProjectName: (d, value: string) => { d.newProjectName = value; },
          uploadProgress: (d, progress: UploadProgress) => { d.upload = progress; },
          uploadSettled: (d, result: { sourceHash: string; fileName: string; text: string; chunks: unknown[] } | undefined) => { d.uploadResult = result; },
          onboarding: (d, state: OnboardingState | undefined) => { d.onboarding = state; },
          onboardingDecision: (d, layer: OnboardingLayerId, decision: OnboardingDecision) => { if (d.onboarding) d.onboarding = { ...d.onboarding, decisions: { ...d.onboarding.decisions, [layer]: decision }, error: undefined }; },
          onboardingPatch: (d, patch: Partial<OnboardingState>) => { if (d.onboarding) d.onboarding = { ...d.onboarding, ...patch }; },
          onboardingApplyResult: (d, result: OnboardingState['applyResult']) => { if (d.onboarding) d.onboarding = { ...d.onboarding, applyResult: result, error: undefined }; },
          onboardingError: (d, message: string) => { if (d.onboarding) d.onboarding = { ...d.onboarding, error: message }; },
          onboardingAnalysis: (d, analysis: OnboardingAnalysisState | undefined) => { if (d.onboarding) d.onboarding = { ...d.onboarding, analysis }; },
          setCharacters: (d, status: 'loading' | 'ready' | 'error', list: unknown[], message?: string) => { d.characters = status === 'error' ? { status: 'error', list: [], message } : { status, list: list as CharacterShape[] }; },
          setWorldview: (d, status: 'loading' | 'ready' | 'error', list: unknown[], message?: string) => { d.worldview = status === 'error' ? { status: 'error', list: [], message } : { status, list: list as WorldShape[] }; },
          setOutline: (d, status: 'loading' | 'ready' | 'error', outline: unknown, message?: string) => { d.outline = status === 'ready' ? { status: 'ready', outline: outline as OutlineShape } : status === 'error' ? { status: 'error', message } : { status: 'loading' }; },
          setRelationship: (d, status: 'loading' | 'ready' | 'error', list: unknown[], message?: string) => { d.relationship = status === 'error' ? { status: 'error', list: [], message } : { status, list: list as RelationshipShape[] }; },
          setState: (d, status: 'loading' | 'ready' | 'error', snapshots: unknown[], message?: string) => { d.state = status === 'error' ? { status: 'error', snapshots: [], message } : { status, snapshots: snapshots as StateSnapshotShape[] }; },
          setCanon: (d, status: 'loading' | 'ready' | 'error', events: unknown[], message?: string) => { d.canon = status === 'error' ? { status: 'error', events: [], message } : { status, events: events as CanonEventShape[] }; },
          // I60 C5 章节/场景只读导航（R13-1）：选择/读取状态全部经 store 持久化，
          // 渲染层只消费快照，跨项目切换由 resetEditors 清空。
          setChapters: (d, status: 'loading' | 'ready' | 'error', list: unknown[], message?: string) => { d.chapters = { ...d.chapters, status, list: list as ChapterListItemShape[], message }; },
          chaptersSelectChapter: (d, chapterId: string) => { d.chapters = { ...d.chapters, selectedChapterId: chapterId, selectedSceneId: undefined, chapter: { status: 'loading' }, scene: { status: 'idle' } }; },
          chaptersSelectScene: (d, sceneId: string) => { d.chapters = { ...d.chapters, selectedSceneId: sceneId, scene: { status: 'loading' } }; },
          chaptersRead: (d, status: 'loading' | 'ready' | 'error', read: unknown, message?: string) => { d.chapters = { ...d.chapters, chapter: status === 'error' ? { status: 'error', message } : status === 'ready' ? { status: 'ready', read: read as ChapterReadShape } : { status: 'loading' } }; },
          chaptersScene: (d, status: 'idle' | 'loading' | 'ready' | 'error', scene: unknown, message?: string) => { d.chapters = { ...d.chapters, scene: status === 'error' ? { status: 'error', message } : status === 'ready' ? { status: 'ready', item: (scene as { scene?: SceneReadShape }).scene } : { status } }; },
          // I61：编辑器状态合并（与各层 draft 同一模式）；场景装载/重载时先 Reset 再初始化。
          sceneEditor: (d, patch: Partial<SceneEditorState>) => { d.chapters = { ...d.chapters, editor: { ...d.chapters.editor, ...patch } }; },
          sceneEditorReset: (d) => { d.chapters = { ...d.chapters, editor: freshSceneEditor() }; },
          chaptersCandidate: (d, patch: Partial<CandidatePanelState>) => { d.chapters = { ...d.chapters, candidate: { ...d.chapters.candidate, ...patch } }; },
          chaptersBranches: (d, patch: Partial<BranchPanelState>) => { d.chapters = { ...d.chapters, branches: { ...d.chapters.branches, ...patch } }; },
          reviewPatch: (d, patch: Partial<ReviewLayerState>) => { d.review = { ...d.review, ...patch }; },
          queuePatch: (d, patch: Partial<QueueLayerState>) => { d.queue = { ...d.queue, ...patch }; },
          knowledgePatch: (d, patch: Partial<KnowledgeLayerState>) => { d.knowledge = { ...d.knowledge, ...patch }; },
          ruleStylePatch: (d, patch: Partial<RuleStyleLayerState>) => { d.ruleStyle = { ...d.ruleStyle, ...patch }; },
          progressPatch: (d, patch: Partial<ProgressLayerState>) => { d.progress = { ...d.progress, ...patch }; },
          importExportPatch: (d, patch: Partial<ImportExportLayerState>) => { d.importExport = { ...d.importExport, ...patch }; },
          searchPatch: (d, patch: Partial<SearchLayerState>) => { d.search = { ...d.search, ...patch }; },
          statisticsPatch: (d, patch: Partial<StatisticsLayerState>) => { d.statistics = { ...d.statistics, ...patch }; },
          characterDraft: (d, patch: Partial<CharacterEditor>) => { Object.assign(d.characterEditor, patch); },
          worldDraft: (d, patch: Partial<WorldEditor>) => { Object.assign(d.worldEditor, patch); },
          outlineDraft: (d, patch: Partial<OutlineEditor>) => { Object.assign(d.outlineEditor, patch); },
          relationshipDraft: (d, patch: Partial<RelationshipEditor>) => { Object.assign(d.relationshipEditor, patch); },
          stateDraft: (d, patch: Partial<StateEditor>) => { Object.assign(d.stateEditor, patch); },
          canonDraft: (d, patch: Partial<CanonEditor>) => { Object.assign(d.canonEditor, patch); },
          // Mutator actions: apply an update function to the LIVE draft (immer
          // semantics) so consecutive edits in one tick never read a stale render
          // snapshot — the root of the "unresponsive UI" defect.
          characterMutate: (d, update: (draft: CharacterShape) => CharacterShape) => { d.characterEditor.draft = update(d.characterEditor.draft); d.characterEditor.dirty = true; d.characterEditor.saveMessage = ''; },
          worldMutate: (d, update: (draft: WorldShape) => WorldShape) => { d.worldEditor.draft = update(d.worldEditor.draft); d.worldEditor.dirty = true; d.worldEditor.saveMessage = ''; },
          outlineMutate: (d, update: (draft: OutlineShape) => OutlineShape) => { d.outlineEditor.draft = update(d.outlineEditor.draft); d.outlineEditor.dirty = true; d.outlineEditor.saveMessage = ''; },
          relationshipMutate: (d, update: (draft: RelationshipShape) => RelationshipShape) => { d.relationshipEditor.draft = update(d.relationshipEditor.draft); d.relationshipEditor.dirty = true; d.relationshipEditor.saveMessage = ''; },
          // I58：非层视图重复点击回退默认层视图（保留旧 settings toggle 语义）；
          // 层视图之间直接切换，不做 toggle。
          toggleSettings: (d) => { d.activeView = d.activeView === 'settings' ? DEFAULT_VIEW : 'settings'; },
          settingsLoaded: (d, view: LlmConfigViewShape) => { d.settingsView = view; d.settingsDraft = { ...d.settingsDraft, baseUrl: view.baseUrl, model: view.model, maxTokens: view.maxTokens, thinking: view.thinking, reasoningEffort: view.reasoningEffort }; },
          settingsMutate: (d, patch: Partial<LlmConfigDraftShape>) => { Object.assign(d.settingsDraft, patch); },
          settingsSettled: (d, patch: Partial<LlmConfigDraftShape>) => { Object.assign(d.settingsDraft, patch); },
          creationSettingsLoaded: (d, view: WorkbenchSettingsViewShape) => { d.creationSettingsView = view; d.creationSettingsDraft = { ...d.creationSettingsDraft, wordTarget: view.wordTarget, askWhenThin: view.askWhenThin }; },
          creationSettingsMutate: (d, patch: Partial<WorkbenchSettingsDraftShape>) => { Object.assign(d.creationSettingsDraft, patch); },
          creationSettingsSettled: (d, patch: Partial<WorkbenchSettingsDraftShape>) => { Object.assign(d.creationSettingsDraft, patch); },
        },
      });

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
      const makeOps = (snapshot: WorkbenchState): WorkbenchOps => {
        const act = capturedActions as WorkbenchActions;
        const projectId = currentProjectId;
        // I71：搜索结果跳转复用正文 ops（openScene）；渲染期构造完成后填充。
        let chaptersOpsRef: ChaptersEditOps | undefined;
        return {
          characters: {
            select: (character) => act.characterDraft({ selectedId: character.id, draft: { ...character }, dirty: false, error: '', saving: false, saveMessage: '' }),
            newDraft: () => { const draft: CharacterShape = { id: '', name: '', kind: 'extra', aliases: [], personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }; act.characterDraft({ selectedId: undefined, draft, dirty: false, error: '', saving: false, saveMessage: '' }); },
            mutate: (update) => act.characterMutate(update),
            save: () => {
              const e = snapshot.characterEditor;
              // I59：saving 忙碌挡 + 同 tick 连点 inflight 挡（R12-6 至多一次 Remote）。
              if (e.saving || !beginOp('characters:save')) return;
              const release = (): void => endOp('characters:save');
              if (!workspace || projectId === undefined) { release(); act.characterDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.draft.name.trim() === '') { release(); act.characterDraft({ error: '角色名不能为空' }); return; }
              const effectiveId = e.selectedId ?? slug(e.draft.name);
              act.characterDraft({ saving: true, error: '', saveMessage: '' });
              if (e.selectedId === undefined) {
                void unwrap(workspace.characterCreate(projectId, buildCharacterCreateInput({ ...e.draft, id: effectiveId }))).then((created) => { release(); if (!active) return; const shape = created as CharacterShape; act.characterDraft({ draft: shape, selectedId: shape.id, dirty: false, saving: false, saveMessage: '已保存', error: '' }); act.setCharacters('loading', []); void unwrap(workspace!.characterList(projectId)).then((list) => act.setCharacters('ready', list as unknown[]), (cause: Error) => { act.setCharacters('error', [], cause.message); act.characterDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.characterDraft({ saving: false, saveMessage: '', error: cause.message }); });
              } else {
                void unwrap(workspace.characterUpdate(projectId, e.selectedId, buildCharacterCreateInput({ ...e.draft, id: e.selectedId }))).then((updated) => { release(); if (!active) return; act.characterDraft({ draft: { ...(updated as CharacterShape) }, dirty: false, saving: false, saveMessage: '已保存', error: '' }); act.setCharacters('loading', []); void unwrap(workspace!.characterList(projectId)).then((list) => act.setCharacters('ready', list as unknown[]), (cause: Error) => { act.setCharacters('error', [], cause.message); act.characterDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.characterDraft({ saving: false, saveMessage: '', error: cause.message }); });
              }
            },
          },
          worldview: {
            select: (entry) => act.worldDraft({ selectedId: entry.id, draft: { ...entry }, dirty: false, error: '', saving: false, saveMessage: '' }),
            newDraft: () => { const draft: WorldShape = { id: '', kind: 'concept', title: '', content: '', keywords: [], triggerMode: 'constant', weight: 0, parent: null, mutable: true, status: 'active', supersededBy: null }; act.worldDraft({ selectedId: undefined, draft, dirty: false, error: '', saving: false, saveMessage: '' }); },
            mutate: (update) => act.worldMutate(update),
            save: () => {
              const e = snapshot.worldEditor;
              if (e.saving || !beginOp('worldview:save')) return;
              const release = (): void => endOp('worldview:save');
              if (!workspace || projectId === undefined) { release(); act.worldDraft({ error: '创作台远程服务不可用' }); return; }
              if ((e.draft.title ?? '').trim() === '') { release(); act.worldDraft({ error: '标题不能为空' }); return; }
              act.worldDraft({ saving: true, error: '', saveMessage: '' });
              if (e.selectedId === undefined) {
                const effectiveId = slug(e.draft.title ?? 'untitled');
                void unwrap(workspace.worldviewCreate(projectId, buildWorldviewInput({ ...e.draft, id: effectiveId }))).then((created) => { release(); if (!active) return; act.worldDraft({ draft: created as WorldShape, selectedId: (created as WorldShape).id, dirty: false, saving: false, saveMessage: '已保存', error: '' }); void unwrap(workspace!.worldviewList(projectId)).then((list) => act.setWorldview('ready', list as unknown[]), (cause: Error) => { act.setWorldview('error', [], cause.message); act.worldDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.worldDraft({ saving: false, saveMessage: '', error: cause.message }); });
              } else {
                const replacementId = slug(e.draft.title ?? e.selectedId);
                void unwrap(workspace.worldviewRewrite(projectId, e.selectedId, buildWorldviewInput({ ...e.draft, id: replacementId }))).then((result) => { release(); if (!active) return; const replacement = (result as { replacement: WorldShape }).replacement; act.worldDraft({ draft: replacement, selectedId: replacement.id, dirty: false, saving: false, saveMessage: '已保存', error: '' }); void unwrap(workspace!.worldviewList(projectId)).then((list) => act.setWorldview('ready', list as unknown[]), (cause: Error) => { act.setWorldview('error', [], cause.message); act.worldDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.worldDraft({ saving: false, saveMessage: '', error: cause.message }); });
              }
            },
          },
          outline: {
            mutate: (update) => act.outlineMutate(update),
            selectAct: (id) => act.outlineDraft({ selectedActId: id, selectedBeatId: undefined, selectedDetailId: undefined }),
            selectBeat: (actId, beatId) => act.outlineDraft({ selectedActId: actId, selectedBeatId: beatId, selectedDetailId: undefined }),
            selectDetail: (id) => act.outlineDraft({ selectedDetailId: id }),
            addAct: () => { const acts = snapshot.outlineEditor.draft.acts ?? []; const id = `act-${acts.length + 1}`; act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts: acts.concat({ id, index: acts.length, title: '', goal: '', beats: [] }) }, dirty: true, selectedActId: id, selectedBeatId: undefined, selectedDetailId: undefined }); },
            removeAct: (actId) => { const acts = (snapshot.outlineEditor.draft.acts ?? []).filter((act) => act.id !== actId).map((act, index) => ({ ...act, index })); act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts }, dirty: true, selectedActId: snapshot.outlineEditor.selectedActId === actId ? undefined : snapshot.outlineEditor.selectedActId, selectedBeatId: snapshot.outlineEditor.selectedActId === actId ? undefined : snapshot.outlineEditor.selectedBeatId, selectedDetailId: snapshot.outlineEditor.selectedActId === actId ? undefined : snapshot.outlineEditor.selectedDetailId }); },
            addBeat: (actId) => { const foundAct = (snapshot.outlineEditor.draft.acts ?? []).find((x) => x.id === actId); const count = foundAct?.beats?.length ?? 0; const id = `beat-${count + 1}`; const beat: OutlineBeatShape = { id, title: '', description: '', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] }; const acts = (snapshot.outlineEditor.draft.acts ?? []).map((x) => x.id === actId ? { ...x, beats: (x.beats ?? []).concat(beat) } : x); act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts }, dirty: true, selectedActId: actId, selectedBeatId: id, selectedDetailId: undefined }); },
            removeBeat: (actId, beatId) => { const acts = (snapshot.outlineEditor.draft.acts ?? []).map((act) => act.id === actId ? { ...act, beats: (act.beats ?? []).filter((b) => b.id !== beatId) } : act); act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts }, dirty: true, selectedBeatId: snapshot.outlineEditor.selectedBeatId === beatId ? undefined : snapshot.outlineEditor.selectedBeatId, selectedDetailId: snapshot.outlineEditor.selectedBeatId === beatId ? undefined : snapshot.outlineEditor.selectedDetailId }); },
            addDetailBeat: (actId, beatId) => { const foundAct = (snapshot.outlineEditor.draft.acts ?? []).find((x) => x.id === actId); const foundBeat = foundAct?.beats?.find((x) => x.id === beatId); const id = `detail-${actId}-${beatId}-${(foundBeat?.detailBeats?.length ?? 0) + 1}`; const card: OutlineDetailBeatShape = { id, title: '', summary: '', pov: '', wordTarget: 500, points: [], status: 'planned' }; const acts = (snapshot.outlineEditor.draft.acts ?? []).map((act) => act.id === actId ? { ...act, beats: (act.beats ?? []).map((beat) => beat.id === beatId ? { ...beat, detailBeats: (beat.detailBeats ?? []).concat(card) } : beat) } : act); act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts }, dirty: true, selectedDetailId: id }); },
            removeDetailBeat: (actId, beatId, cardId) => { const acts = (snapshot.outlineEditor.draft.acts ?? []).map((act) => act.id === actId ? { ...act, beats: (act.beats ?? []).map((beat) => beat.id === beatId ? { ...beat, detailBeats: (beat.detailBeats ?? []).filter((card) => card.id !== cardId) } : beat) } : act); act.outlineDraft({ draft: { ...snapshot.outlineEditor.draft, acts }, dirty: true, selectedDetailId: snapshot.outlineEditor.selectedDetailId === cardId ? undefined : snapshot.outlineEditor.selectedDetailId }); },
            save: () => {
              const e = snapshot.outlineEditor;
              if (e.saving || !beginOp('outline:save')) return;
              const release = (): void => endOp('outline:save');
              if (!workspace || projectId === undefined) { release(); act.outlineDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.draft.logline.trim() === '') { release(); act.outlineDraft({ error: '一句话梗概（logline）不能为空' }); return; }
              act.outlineDraft({ saving: true, error: '', saveMessage: '' });
              void unwrap(workspace.outlineSave(projectId, buildOutlineInput(e.draft))).then((saved) => { release(); if (!active) return; const outline = saved as OutlineShape; act.outlineDraft({ draft: { ...outline }, dirty: false, saving: false, saveMessage: '已保存', error: '' }); act.setOutline('ready', outline); }, (cause: Error) => { release(); act.outlineDraft({ saving: false, saveMessage: '', error: cause.message }); });
            },
          },
          relationship: {
            select: (entry) => act.relationshipDraft({ selectedId: entry.id, draft: { ...entry }, dirty: false, error: '', saving: false, saveMessage: '' }),
            newDraft: () => act.relationshipDraft({ selectedId: undefined, draft: freshRelationshipEditor().draft, dirty: false, error: '', saving: false, saveMessage: '' }),
            mutate: (update) => act.relationshipMutate(update),
            save: () => {
              const e = snapshot.relationshipEditor;
              if (e.saving || !beginOp('relationship:save')) return;
              const release = (): void => endOp('relationship:save');
              if (!workspace || projectId === undefined) { release(); act.relationshipDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.draft.from.trim() === '' || e.draft.to.trim() === '') { release(); act.relationshipDraft({ error: '关系两端（from/to）不能为空' }); return; }
              const effectiveId = e.selectedId ?? `${slug(e.draft.from)}+${slug(e.draft.to)}`;
              act.relationshipDraft({ saving: true, error: '', saveMessage: '' });
              void unwrap(workspace.relationshipSave(projectId, buildRelationshipInput({ ...e.draft, id: effectiveId }))).then((saved) => { release(); if (!active) return; act.relationshipDraft({ draft: { ...(saved as RelationshipShape) }, selectedId: (saved as RelationshipShape).id, dirty: false, saving: false, saveMessage: '已保存', error: '' }); void unwrap(workspace!.relationshipRead(projectId)).then((list) => act.setRelationship('ready', list as unknown[]), (cause: Error) => { act.setRelationship('error', [], cause.message); act.relationshipDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.relationshipDraft({ saving: false, saveMessage: '', error: cause.message }); });
            },
          },
          state: {
            select: (seq) => { const e = snapshot.stateEditor; let fromSeq = e.fromSeq; let toSeq = e.toSeq; if (fromSeq === undefined) fromSeq = seq; else if (toSeq === undefined && seq !== fromSeq) toSeq = seq; else { fromSeq = seq; toSeq = undefined; } act.stateDraft({ selectedSeq: seq, fromSeq, toSeq, diff: undefined }); },
            showDiff: () => {
              const e = snapshot.stateEditor;
              if (!beginOp('state:diff')) return;
              const release = (): void => endOp('state:diff');
              if (!workspace || projectId === undefined) { release(); act.stateDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.fromSeq === undefined || e.toSeq === undefined) { release(); act.stateDraft({ error: '请从时间线选择两个快照再比对' }); return; }
              void unwrap(workspace.stateDiff(projectId, e.fromSeq, e.toSeq)).then((diff) => { release(); act.stateDraft({ diff: diff as StateDiffShape, error: '' }); }, (cause: Error) => { release(); act.stateDraft({ error: cause.message, diff: undefined }); });
            },
            rollback: () => {
              const e = snapshot.stateEditor;
              if (!beginOp('state:rollback')) return;
              const release = (): void => endOp('state:rollback');
              if (!workspace || projectId === undefined) { release(); act.stateDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.selectedSeq === undefined) { release(); act.stateDraft({ error: '请先选择要回滚到的快照' }); return; }
              void unwrap(workspace.stateRollback(projectId, e.selectedSeq)).then((rolled) => { release(); if (!active) return; const next = rolled as StateSnapshotShape; act.stateDraft({ selectedSeq: next.seq, diff: undefined, error: '' }); void unwrap(workspace!.stateSnapshots(projectId)).then((snapshots) => act.setState('ready', snapshots as unknown[]), (cause: Error) => { act.setState('error', [], cause.message); act.stateDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.stateDraft({ error: cause.message }); });
            },
          },
          canon: {
            select: (event) => act.canonDraft({ selectedId: event.id, proposalId: undefined, draft: { storyTime: event.storyTime, summary: event.summary, detail: event.detail ?? '' }, dirty: false, error: '', saving: false, saveMessage: '' }),
            mutate: (update) => act.canonDraft({ draft: update(snapshot.canonEditor.draft), dirty: true }),
            propose: () => {
              const e = snapshot.canonEditor;
              if (e.saving || !beginOp('canon:propose')) return;
              const release = (): void => endOp('canon:propose');
              if (!workspace || projectId === undefined) { release(); act.canonDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.selectedId === undefined) { release(); act.canonDraft({ error: '请先选择一个正史事件再发起更正' }); return; }
              if ((e.draft.summary ?? '').trim() === '') { release(); act.canonDraft({ error: '更正摘要不能为空' }); return; }
              act.canonDraft({ saving: true, saveMessage: '', error: '' });
              void unwrap(workspace.canonCorrectionPropose(projectId, e.selectedId, buildCanonCorrectionInput(e.draft))).then((proposal) => { release(); if (!active) return; act.canonDraft({ proposalId: (proposal as { id?: string }).id, saving: false, saveMessage: '更正提案已发起', error: '' }); }, (cause: Error) => { release(); act.canonDraft({ saving: false, saveMessage: '', error: cause.message }); });
            },
            accept: () => {
              const e = snapshot.canonEditor;
              if (e.saving || !beginOp('canon:accept')) return;
              const release = (): void => endOp('canon:accept');
              if (!workspace || projectId === undefined) { release(); act.canonDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.proposalId === undefined) { release(); act.canonDraft({ error: '请先发起更正提案' }); return; }
              act.canonDraft({ saving: true, saveMessage: '', error: '' });
              void unwrap(workspace.canonCorrectionAccept(projectId, e.proposalId)).then(() => { release(); if (!active) return; act.canonDraft({ proposalId: undefined, dirty: false, saving: false, saveMessage: '已确认更正', error: '' }); void unwrap(workspace!.canonQuery(projectId, undefined)).then((events) => act.setCanon('ready', events as unknown[]), (cause: Error) => { act.setCanon('error', [], cause.message); act.canonDraft({ error: cause.message }); }); }, (cause: Error) => { release(); act.canonDraft({ saving: false, saveMessage: '', error: cause.message }); });
            },
          },
          // I60/I61 C5 正文工作台 ops（R13-1 / R13-2）：只读导航 + 受控编辑。
          // 注意：loadScene 必须显式接收 chapterId —— makeOps 在渲染时创建的闭包
          // 快照里 selectedChapterId 尚未更新，不能依赖快照取章（陈旧闭包缺陷）。
          chapters: (() => {
            const editorPatch = (patch: Partial<SceneEditorState>): void => act.sceneEditor(patch);
            const reparseLocked = (state: SceneEditorState): boolean => state.reparse.kind === 'proposed' || state.reparse.kind === 'accepting';
            const hashText = async (text: string): Promise<string> => {
              const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
              return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
            };
            // ---- I70 版本/分支面板（R14-5）：列表装载 / 命名存档 / 选用 / 对比 ----
            const branchesPatch = (patch: Partial<BranchPanelState>): void => act.chaptersBranches(patch);
            // 注意：branchesLoad 必须显式接收 chapterId/sceneId —— makeOps 渲染闭包
            // 快照里 selected* 尚未更新（与 loadScene 同一陈旧闭包缺陷，见上注释）。
            const branchesLoad = (chapterId?: string, sceneId?: string): void => {
              const target = branchNamespace;
              const cid = chapterId ?? snapshot.chapters.selectedChapterId;
              const sid = sceneId ?? snapshot.chapters.selectedSceneId;
              if (!target || projectId === undefined || cid === undefined || sid === undefined) return;
              if (!beginOp(`branches:list:${sid}`)) return;
              const release = (): void => endOp(`branches:list:${sid}`);
              branchesPatch({ status: 'loading', message: undefined });
              void unwrap(target.list(projectId, cid, sid)).then((result) => {
                release();
                if (!active) return;
                const list = ((result as { branches?: BranchSummaryShape[] }).branches ?? []) as BranchSummaryShape[];
                branchesPatch({ status: 'ready', list, message: undefined });
              }, (cause: Error) => { release(); if (!active) return; branchesPatch({ status: 'error', message: (cause as Error).message }); });
            };
            const branchSave = (): void => {
              const target = branchNamespace;
              const current = snapshot.chapters.branches;
              const chapterId = snapshot.chapters.selectedChapterId;
              const sceneId = snapshot.chapters.selectedSceneId;
              if (!target || projectId === undefined || chapterId === undefined || sceneId === undefined) return;
              const label = current.labelDraft.trim();
              if (label === '') { branchesPatch({ message: '请先输入版本名称' }); return; }
              if (current.acting || !beginOp('branches:save')) return;
              const release = (): void => endOp('branches:save');
              branchesPatch({ acting: true, message: undefined });
              void unwrap(target.save(projectId, chapterId, sceneId, label)).then((result) => {
                release();
                if (!active) return;
                const saved = (result as { branches?: BranchSummaryShape[] }).branches;
                branchesPatch({ acting: false, status: 'ready', list: (saved ?? current.list) as BranchSummaryShape[], labelDraft: '', message: '已存档当前版本' });
              }, (cause: Error) => { release(); if (!active) return; branchesPatch({ acting: false, message: (cause as Error).message }); });
            };
            const branchChoose = (branchId: string): void => {
              const target = branchNamespace;
              const current = snapshot.chapters.branches;
              const chapterId = snapshot.chapters.selectedChapterId;
              const sceneId = snapshot.chapters.selectedSceneId;
              if (!target || projectId === undefined || chapterId === undefined || sceneId === undefined) return;
              if (current.acting || !beginOp(`branches:choose:${branchId}`)) return;
              const release = (): void => endOp(`branches:choose:${branchId}`);
              branchesPatch({ acting: true, message: undefined });
              void unwrap(target.choose(projectId, chapterId, sceneId, branchId)).then((result) => {
                release();
                if (!active) return;
                const chosen = (result as { branches?: BranchSummaryShape[]; content?: string });
                branchesPatch({ acting: false, status: 'ready', list: (chosen.branches ?? current.list) as BranchSummaryShape[], message: '已切换版本（只改正文，未同步结构层；如需同步请显式重解析）' });
                // 切换后正文变化：重载场景，让编辑器以新原文初始化（baseHash 随之更新）。
                if (chosen.content !== undefined && chosen.content !== snapshot.chapters.editor.original && sceneId !== undefined) loadScene(sceneId, chapterId);
              }, (cause: Error) => { release(); if (!active) return; branchesPatch({ acting: false, message: (cause as Error).message }); });
            };
            const branchDiff = (branchId: string): void => {
              const target = branchNamespace;
              const chapterId = snapshot.chapters.selectedChapterId;
              const sceneId = snapshot.chapters.selectedSceneId;
              if (!target || projectId === undefined || chapterId === undefined || sceneId === undefined) return;
              if (!beginOp(`branches:diff:${branchId}`)) return;
              const release = (): void => endOp(`branches:diff:${branchId}`);
              branchesPatch({ diff: { status: 'loading', lines: [] }, message: undefined });
              void unwrap(target.diff(projectId, chapterId, sceneId, branchId)).then((result) => {
                release();
                if (!active) return;
                const diff = result as { from?: { label: string }; to?: { label: string }; lines?: BranchDiffLineShape[] };
                branchesPatch({ diff: { status: 'ready', fromLabel: diff.from?.label, toLabel: diff.to?.label, lines: (diff.lines ?? []) as BranchDiffLineShape[] } });
              }, (cause: Error) => { release(); if (!active) return; branchesPatch({ diff: { status: 'error', lines: [], message: (cause as Error).message } }); });
            };
            const branchCloseDiff = (): void => branchesPatch({ diff: { status: 'idle', lines: [] } });
            const loadScene = (sceneId: string, chapterId: string): void => {
              const target = workspace;
              if (!target || projectId === undefined) return;
              if (!beginOp(`chapters:scene:${sceneId}`)) return;
              const release = (): void => endOp(`chapters:scene:${sceneId}`);
              act.chaptersSelectScene(sceneId);
              void unwrap(target.sceneRead(projectId, chapterId, sceneId)).then((scene) => {
                release();
                if (!active) return;
                const shape = (scene as { scene?: SceneReadShape }).scene;
                act.chaptersScene('ready', scene, undefined);
                // I61：场景装载/重载后以原文初始化编辑器（baseHash 基准 = original）。
                act.sceneEditorReset();
                act.sceneEditor({ mode: 'read', original: shape?.content ?? '', draft: shape?.content ?? '', dirty: false });
                // I70：装载后刷新该场景的版本列表（chosen 唯一投影）。
                branchesLoad(chapterId, sceneId);
              }, (cause: Error) => { release(); if (!active) return; act.chaptersScene('error', undefined, (cause as Error).message); act.sceneEditorReset(); branchesPatch({ status: 'idle', list: [], diff: { status: 'idle', lines: [] } }); });
            };
            const selectChapter = (chapterId: string): void => {
              // I61 脏文本保护：草稿未保存时先弹离开确认，把切换推迟到裁决后。
              const editor = snapshot.chapters.editor;
              if (editor.dirty && !editor.leaveConfirm) { editorPatch({ leaveConfirm: true, pendingNavigation: { chapterId } }); return; }
              const target = workspace;
              if (!target || projectId === undefined) return;
              if (!beginOp(`chapters:chapter:${chapterId}`)) return;
              const release = (): void => endOp(`chapters:chapter:${chapterId}`);
              act.chaptersSelectChapter(chapterId);
              void unwrap(target.chapterRead(projectId, chapterId)).then((read) => {
                release();
                if (!active) return;
                const shape = read as ChapterReadShape;
                act.chaptersRead('ready', shape, undefined);
                if (shape.scenes.length > 0) loadScene(shape.scenes[0].id, chapterId);
                else act.chaptersScene('idle', undefined, undefined);
              }, (cause: Error) => { release(); if (!active) return; act.chaptersRead('error', undefined, (cause as Error).message); });
            };
            const selectScene = (sceneId: string): void => {
              const chapterId = snapshot.chapters.selectedChapterId;
              if (chapterId === undefined) return;
              const editor = snapshot.chapters.editor;
              if (editor.dirty && !editor.leaveConfirm) { editorPatch({ leaveConfirm: true, pendingNavigation: { chapterId, sceneId } }); return; }
              loadScene(sceneId, chapterId);
            };
            const save = (reparse: boolean): void => {
              const target = workspace;
              const editor = snapshot.chapters.editor;
              if (!target || projectId === undefined) return;
              if (editor.saving || reparseLocked(editor)) return;
              if (!beginOp(reparse ? 'chapters:save:reparse' : 'chapters:save')) return;
              const release = (): void => endOp(reparse ? 'chapters:save:reparse' : 'chapters:save');
              const chapterId = snapshot.chapters.selectedChapterId;
              const sceneId = snapshot.chapters.selectedSceneId;
              if (chapterId === undefined || sceneId === undefined) { release(); editorPatch({ error: '请先选择场景' }); return; }
              const diff = computeEditRange(editor.original, editor.draft);
              if (diff.kind === 'none') { release(); editorPatch({ error: '没有需要保存的修改' }); return; }
              editorPatch({ saving: true, error: '', saveMessage: '' });
              // baseHash = 装载时正文哈希：Host 核对当前文本一致才允许写（脏文本保护）。
              void hashText(editor.original).then((baseHash) => {
                if (reparse) {
                  void unwrap(target.sceneReparsePropose(projectId, chapterId, sceneId, diff.range, diff.replacement, baseHash)).then((proposal) => {
                    release();
                    if (!active) return;
                    const p = proposal as { proposalId?: string; status?: string };
                    if (!p.proposalId) { editorPatch({ saving: false, error: '重解析提案失败：缺少 proposalId' }); return; }
                    // 幂等提议：同一编辑重复提议返回既有提案（可能是已拒绝/已处理）。
                    if (p.status === 'rejected') { editorPatch({ saving: false, saveMessage: '', reparse: { kind: 'rejected' } }); return; }
                    if (p.status === 'accepted') { editorPatch({ saving: false, saveMessage: '', reparse: { kind: 'done', message: '该重解析提案此前已确认并应用' } }); return; }
                    editorPatch({ saving: false, saveMessage: '', reparse: { kind: 'proposed', proposalId: p.proposalId, range: diff.range, replacement: diff.replacement, baseHash } });
                  }, (cause: Error) => { release(); if (!active) return; editorPatch({ saving: false, error: (cause as Error).message }); });
                } else {
                  void unwrap(target.sceneEdit(projectId, chapterId, sceneId, diff.range, diff.replacement, baseHash)).then((result) => {
                    release();
                    if (!active) return;
                    const r = result as { scene?: SceneReadShape };
                    const content = r.scene?.content ?? editor.draft;
                    act.chaptersScene('ready', { scene: r.scene }, undefined);
                    editorPatch({ saving: false, saveMessage: '已保存', dirty: false, original: content, draft: content, error: '' });
                  }, (cause: Error) => { release(); if (!active) return; editorPatch({ saving: false, error: (cause as Error).message }); });
                }
              }, (cause: Error) => { release(); if (!active) return; editorPatch({ saving: false, error: (cause as Error).message }); });
            };
            const acceptReparse = (): void => {
              const target = workspace;
              const editor = snapshot.chapters.editor;
              const r = editor.reparse;
              if (!target || projectId === undefined || r.kind !== 'proposed') return;
              if (!beginOp('chapters:reparse:accept')) return;
              const release = (): void => endOp('chapters:reparse:accept');
              const chapterId = snapshot.chapters.selectedChapterId;
              const sceneId = snapshot.chapters.selectedSceneId;
              if (chapterId === undefined || sceneId === undefined) { release(); editorPatch({ reparse: { kind: 'error', message: '请先选择场景' } }); return; }
              editorPatch({ reparse: { kind: 'accepting', proposalId: r.proposalId, range: r.range, replacement: r.replacement, baseHash: r.baseHash } });
              // accept 再带 baseHash：Host 在 propose→accept 窗口内核对正文未变（脏文本保护）。
              void unwrap(target.sceneReparseAccept(projectId, chapterId, sceneId, r.range, r.replacement, r.proposalId, r.baseHash)).then((result) => {
                release();
                if (!active) return;
                const res = result as { scene?: SceneReadShape; layers?: string[] };
                const content = res.scene?.content ?? editor.draft;
                act.chaptersScene('ready', { scene: res.scene }, undefined);
                editorPatch({ saving: false, dirty: false, original: content, draft: content, error: '', saveMessage: '', reparse: { kind: 'done', message: `已重解析并同步：${(res.layers ?? []).join(' / ')}` } });
              }, (cause: Error) => { release(); if (!active) return; editorPatch({ reparse: { kind: 'error', message: (cause as Error).message } }); });
            };
            const rejectReparse = (): void => {
              const target = workspace;
              const r = snapshot.chapters.editor.reparse;
              if (!target || projectId === undefined || r.kind !== 'proposed') return;
              if (!beginOp('chapters:reparse:reject')) return;
              const release = (): void => endOp('chapters:reparse:reject');
              void unwrap(target.sceneReparseReject(projectId, r.proposalId)).then(() => { release(); if (!active) return; editorPatch({ reparse: { kind: 'rejected' } }); }, (cause: Error) => { release(); if (!active) return; editorPatch({ reparse: { kind: 'error', message: (cause as Error).message } }); });
            };
            const discardDraft = (): void => {
              const pending = snapshot.chapters.editor.pendingNavigation;
              editorPatch({ leaveConfirm: false, pendingNavigation: undefined, dirty: false, saveMessage: '', error: '' });
              if (pending !== undefined) {
                if (pending.sceneId !== undefined && pending.chapterId === snapshot.chapters.selectedChapterId) loadScene(pending.sceneId, pending.chapterId);
                else selectChapter(pending.chapterId);
              }
            };
            // ---- I63 候选审阅与生成后裁决（R13-4）----
            const candidatePatch = (patch: Partial<CandidatePanelState>): void => act.chaptersCandidate(patch);
            // accept 成功后刷新章节树与当前章节，让新场景/替换后的场景立即可见。
            const reloadChapters = (): void => {
              const target = workspace;
              if (!target || projectId === undefined) return;
              void unwrap(target.chapterList(projectId)).then((list) => {
                if (!active) return;
                act.setChapters('ready', list as unknown[]);
                const chapterId = snapshot.chapters.selectedChapterId;
                if (chapterId !== undefined) selectChapter(chapterId);
              }, (cause: Error) => { if (active) act.setChapters('error', [], (cause as Error).message); });
            };
            // 候选生成后立即预览（正文 + diff + 校验结果），ready 才允许裁决。
            const previewAfterPropose = (candidateId: string, onReady: () => void): void => {
              const target = writing;
              if (!target) { candidatePatch({ ui: { kind: 'error', message: '候选审阅服务不可用' } }); return; }
              void unwrap(target.preview(candidateId)).then((review) => {
                if (!active) return;
                candidatePatch({ ui: { kind: 'ready', review: review as CandidateReviewShape } });
                onReady();
              }, (cause: Error) => { if (active) candidatePatch({ ui: { kind: 'error', message: (cause as Error).message } }); });
            };
            const proposeWriting = (intent: 'continue' | 'scene-card'): void => {
              const target = writing;
              if (!target || projectId === undefined) { candidatePatch({ ui: { kind: 'error', message: '候选审阅服务不可用' } }); return; }
              if (!beginOp(`writing:propose:${intent}`)) return;
              const release = (): void => endOp(`writing:propose:${intent}`);
              candidatePatch({ ui: { kind: 'proposing', intent } });
              void unwrap(target.propose(projectId, { intent })).then((result) => {
                release();
                if (!active) return;
                const candidate = (result as { candidate?: { id: string } }).candidate;
                if (!candidate?.id) { candidatePatch({ ui: { kind: 'error', message: '候选生成失败：缺少候选 id' } }); return; }
                previewAfterPropose(candidate.id, () => undefined);
              }, (cause: Error) => { release(); if (!active) return; candidatePatch({ ui: { kind: 'error', message: (cause as Error).message } }); });
            };
            const proposeRewrite = (): void => {
              const target = writing;
              const chapterId = snapshot.chapters.selectedChapterId;
              const sceneId = snapshot.chapters.selectedSceneId;
              const prompt = snapshot.chapters.candidate.rewritePrompt;
              if (!target || projectId === undefined) { candidatePatch({ ui: { kind: 'error', message: '候选审阅服务不可用' } }); return; }
              if (chapterId === undefined || sceneId === undefined) { candidatePatch({ ui: { kind: 'error', message: '请先选择要重写的场景' } }); return; }
              if (prompt.trim() === '') return;
              if (!beginOp('writing:propose:rewrite')) return;
              const release = (): void => endOp('writing:propose:rewrite');
              candidatePatch({ ui: { kind: 'proposing', intent: 'rewrite' } });
              void unwrap(target.propose(projectId, { intent: 'rewrite', chapterId, sceneId, prompt })).then((result) => {
                release();
                if (!active) return;
                const candidate = (result as { candidate?: { id: string } }).candidate;
                if (!candidate?.id) { candidatePatch({ ui: { kind: 'error', message: '候选生成失败：缺少候选 id' } }); return; }
                previewAfterPropose(candidate.id, () => undefined);
              }, (cause: Error) => { release(); if (!active) return; candidatePatch({ ui: { kind: 'error', message: (cause as Error).message } }); });
            };
            const adjudicateCandidate = (decision: 'accept' | 'reject' | 'rewrite'): void => {
              const target = writing;
              const ui = snapshot.chapters.candidate.ui;
              if (!target || projectId === undefined || ui.kind !== 'ready') return;
              const candidateId = ui.review.candidateId;
              // I59 双击幂等：同候选同裁决在 Remote 返回前至多提交一次。
              if (!beginOp(`writing:adjudicate:${candidateId}:${decision}`)) return;
              const release = (): void => endOp(`writing:adjudicate:${candidateId}:${decision}`);
              candidatePatch({ ui: { kind: 'acting', review: ui.review, action: decision } });
              void unwrap(target.adjudicate(candidateId, decision)).then((result) => {
                release();
                if (!active) return;
                const outcome = result as WritingAdjudicationOutcome;
                if (outcome.status === 'written') {
                  candidatePatch({ ui: { kind: 'done', message: `已接受并落盘：${outcome.scene.chapterId}/${outcome.scene.sceneId}（已同步 ${outcome.layers.length} 层）` } });
                  reloadChapters();
                } else if (outcome.status === 'rejected') {
                  candidatePatch({ ui: { kind: 'done', message: '已拒绝候选，未写入任何内容' } });
                } else if (outcome.status === 'rewritten') {
                  // 后继候选：立即审阅新候选（旧候选已被 Host 置为 superseded，不可静默接受）。
                  previewAfterPropose(outcome.candidate.id, () => undefined);
                } else if (outcome.status === 'generation-rejected' || outcome.status === 'prewrite-rejected') {
                  candidatePatch({ ui: { kind: 'error', message: '校验未通过：存在硬冲突，未写入任何内容。请重写候选。' } });
                } else if (outcome.status === 'pending-compensation') {
                  candidatePatch({ ui: { kind: 'error', message: `写回中断（${outcome.failedStage}），未完成。请重试或重写。` } });
                }
              }, (cause: Error) => { release(); if (!active) return; candidatePatch({ ui: { kind: 'error', message: (cause as Error).message } }); });
            };
            const chaptersOpsResult: ChaptersEditOps = {
              selectChapter,
              selectScene,
              retryChapter() {
                const chapterId = snapshot.chapters.selectedChapterId;
                if (chapterId !== undefined) selectChapter(chapterId);
              },
              retryScene() {
                const sceneId = snapshot.chapters.selectedSceneId;
                const chapterId = snapshot.chapters.selectedChapterId;
                if (sceneId !== undefined && chapterId !== undefined) loadScene(sceneId, chapterId);
              },
              startEdit() { editorPatch({ mode: 'edit' }); },
              textChange(value) {
                const editor = snapshot.chapters.editor;
                editorPatch({ draft: value, dirty: value !== editor.original, saveMessage: '', error: '' });
              },
              save,
              acceptReparse,
              rejectReparse,
              discardDraft,
              cancelLeave() { editorPatch({ leaveConfirm: false, pendingNavigation: undefined }); },
              proposeWriting,
              rewritePromptChange(value) { candidatePatch({ rewritePrompt: value }); },
              proposeRewrite,
              adjudicateCandidate,
              dismissCandidate() { candidatePatch({ ui: { kind: 'idle' }, rewritePrompt: '' }); },
              // I70 版本/分支面板（R14-5）。
              branchesLoad,
              branchLabelChange(value) { branchesPatch({ labelDraft: value }); },
              branchSave,
              branchChoose,
              branchDiff,
              branchCloseDiff,
              // I71 搜索结果跳转（R14-6）：打开指定章节/场景（脏文本保护复用离开确认）。
              openScene(chapterId, sceneId) {
                const editor = snapshot.chapters.editor;
                if (editor.dirty && !editor.leaveConfirm) { editorPatch({ leaveConfirm: true, pendingNavigation: { chapterId, sceneId } }); return; }
                const target = workspace;
                if (!target || projectId === undefined) return;
                if (!beginOp(`chapters:jump:${chapterId}`)) return;
                const release = (): void => endOp(`chapters:jump:${chapterId}`);
                act.chaptersSelectChapter(chapterId);
                void unwrap(target.chapterRead(projectId, chapterId)).then((read) => {
                  release();
                  if (!active) return;
                  act.chaptersRead('ready', read as ChapterReadShape, undefined);
                  loadScene(sceneId, chapterId);
                }, (cause: Error) => { release(); if (!active) return; act.chaptersRead('error', undefined, (cause as Error).message); });
              },
            };
            chaptersOpsRef = chaptersOpsResult;
            return chaptersOpsResult;
          })(),
          // ---- I64 一致性审校中心（R13-5）：刷新/过滤/选中/显式裁决 ----
          review: (() => {
            const reviewPatch = (patch: Partial<ReviewLayerState>): void => act.reviewPatch(patch);
            const toggleFilter = (kind: 'categories' | 'severities' | 'statuses', value: string): void => {
              const filter = snapshot.review.filter;
              const next = (filter[kind] as readonly string[]).includes(value)
                ? (filter[kind] as readonly string[]).filter((item) => item !== value)
                : [...(filter[kind] as readonly string[]), value];
              reviewPatch({ filter: { ...filter, [kind]: next } });
            };
            return {
              scan(): void {
                const target = reviewNamespace;
                if (!target || projectId === undefined) { reviewPatch({ status: 'error', message: '审校服务不可用' }); return; }
                if (!beginOp('review:scan')) return;
                const release = (): void => endOp('review:scan');
                reviewPatch({ status: 'scanning', message: undefined });
                // 投影 + 审计记录并行读取（都为只读 Remote）。
                void Promise.all([
                  unwrap(target.scan(projectId)),
                  unwrap(target.records(projectId)),
                ]).then(([projection, recordEnvelope]) => {
                  release();
                  if (!active) return;
                  const records = (recordEnvelope as { records?: ReviewAuditRecordShape[] } | undefined)?.records ?? [];
                  reviewPatch({ status: 'ready', projection: projection as ReviewProjectionShape, records, selected: [], message: undefined });
                }, (cause: Error) => { release(); if (!active) return; reviewPatch({ status: 'error', message: (cause as Error).message }); });
              },
              toggleFilter,
              clearFilters() { reviewPatch({ filter: { categories: [], severities: [], statuses: [] } }); },
              selectIssue(issueId: string) {
                const selected = snapshot.review.selected;
                reviewPatch({ selected: selected.includes(issueId) ? selected.filter((item) => item !== issueId) : [...selected, issueId] });
              },
              adjudicate(decision: 'continue' | 'rewrite-requested'): void {
                const target = reviewNamespace;
                const state = snapshot.review;
                if (!target || projectId === undefined || state.status !== 'ready') return;
                if (state.selected.length === 0 || state.acting) return;
                if (!beginOp(`review:adjudicate:${decision}`)) return;
                const release = (): void => endOp(`review:adjudicate:${decision}`);
                reviewPatch({ acting: true, message: undefined });
                void unwrap(target.adjudicate(projectId, { decision, issueIds: [...state.selected] })).then((outcome) => {
                  release();
                  if (!active) return;
                  const result = outcome as ReviewAdjudicationOutcomeShape;
                  reviewPatch({
                    acting: false,
                    projection: result.projection,
                    records: result.records,
                    selected: [],
                    message: `已记录 ${result.applied.length} 项${decision === 'continue' ? '「显式继续」' : '「请求重写」'}（重复 ${result.duplicate.length} 项）。`,
                  });
                }, (cause: Error) => { release(); if (!active) return; reviewPatch({ acting: false, message: (cause as Error).message }); });
              },
              dismiss() { reviewPatch({ status: 'idle', projection: undefined, message: undefined, selected: [], acting: false, records: [] }); },
            };
          })(),
          // ---- I65 生成队列（R13-6）：范围/配置 + 暂停/继续/取消 + 重试 ----
          queue: (() => {
            const queuePatch = (patch: Partial<QueueLayerState>): void => act.queuePatch(patch);
            // 运行中轮询状态（Host 后台 loop 驱动；terminal 后停止，Fiber 卸载即清）。
            let queuePollTimer: ReturnType<typeof setTimeout> | undefined;
            const clearQueuePoll = (): void => {
              if (queuePollTimer !== undefined) { clearTimeout(queuePollTimer); queuePollTimer = undefined; }
            };
            const pollQueueStatus = (): void => {
              const target = queueNamespace;
              if (!active || target === undefined || projectId === undefined) { clearQueuePoll(); return; }
              void unwrap(target.status(projectId)).then((projection) => {
                if (!active) { clearQueuePoll(); return; }
                const next = projection as QueueStatusShape;
                queuePatch({ projection: next });
                if (next.runState === 'running' || next.runState === 'paused') {
                  queuePollTimer = setTimeout(pollQueueStatus, 2000);
                } else {
                  clearQueuePoll();
                }
              }, () => { clearQueuePoll(); });
            };
            const loadCards = (): void => {
              const target = workspace;
              if (!target || projectId === undefined) return;
              void unwrap(target.outlineBeatCards(projectId)).then((cards) => {
                if (!active) return;
                const shaped = (cards as Array<{ actId: string; beatId: string; detailBeat: { id: string; title: string; pov: string; wordTarget: number; status: string } }>).map((card) => ({
                  actId: card.actId, beatId: card.beatId, id: card.detailBeat.id, title: card.detailBeat.title,
                  pov: card.detailBeat.pov, wordTarget: card.detailBeat.wordTarget, status: card.detailBeat.status,
                }));
                // 默认全选（start 时全部入队）；已有勾选保留。
                queuePatch({ cards: shaped, selectedCardIds: snapshot.queue.selectedCardIds.length > 0 ? snapshot.queue.selectedCardIds : shaped.map((card) => card.id), status: 'ready' });
              }, (cause: Error) => { if (active) queuePatch({ status: 'ready', message: (cause as Error).message }); });
            };
            /** 通用队列命令（幂等由 Host 状态机保证；同键 inflight 去重）。 */
            const queueCommand = (method: 'pause' | 'resume' | 'cancel' | 'retry', taskId?: string): void => {
              const target = queueNamespace;
              if (!target || projectId === undefined) return;
              if (!beginOp(`queue:${method}:${taskId ?? ''}`)) return;
              const release = (): void => endOp(`queue:${method}:${taskId ?? ''}`);
              const call = method === 'retry' ? target.retry(projectId, taskId as string) : (target[method] as (projectId: string) => Promise<unknown>)(projectId);
              void unwrap(call).then((projection) => {
                release();
                if (!active) return;
                const next = projection as QueueStatusShape;
                queuePatch({ status: 'ready', projection: next, acting: false, message: undefined });
                if (next.runState === 'running' || next.runState === 'paused') pollQueueStatus();
              }, (cause: Error) => { release(); if (!active) return; queuePatch({ message: (cause as Error).message }); });
            };
            return {
              refresh(): void {
                const target = queueNamespace;
                if (!target || projectId === undefined) { queuePatch({ status: 'error', message: '生成队列服务不可用' }); return; }
                if (!beginOp('queue:refresh')) return;
                const release = (): void => endOp('queue:refresh');
                queuePatch({ status: 'loading', message: undefined });
                void unwrap(target.status(projectId)).then((projection) => {
                  release();
                  if (!active) return;
                  const next = projection as QueueStatusShape;
                  queuePatch({ status: 'ready', projection: next });
                  loadCards();
                  if (next.runState === 'running' || next.runState === 'paused') pollQueueStatus();
                }, (cause: Error) => { release(); if (!active) return; queuePatch({ status: 'error', message: (cause as Error).message }); });
              },
              toggleCard(cardId: string) {
                const selected = snapshot.queue.selectedCardIds;
                queuePatch({ selectedCardIds: selected.includes(cardId) ? selected.filter((id) => id !== cardId) : [...selected, cardId] });
              },
              setBudget(value: string) { queuePatch({ wordBudget: value }); },
              setRetries(value: string) { queuePatch({ maxRetries: value }); },
              toggleSoftStop() { queuePatch({ stopOnSoftWarnings: !snapshot.queue.stopOnSoftWarnings }); },
              start(): void {
                const target = queueNamespace;
                const state = snapshot.queue;
                if (!target || projectId === undefined || state.acting) return;
                if (!beginOp('queue:start')) return;
                const release = (): void => endOp('queue:start');
                const budget = state.wordBudget.trim();
                const parsedBudget = budget === '' ? undefined : Number.parseInt(budget, 10);
                const parsedRetries = Number.parseInt(state.maxRetries, 10);
                const input: QueueStartInputShape = {
                  ...(state.selectedCardIds.length > 0 ? { cardIds: [...state.selectedCardIds] } : {}),
                  ...(parsedBudget !== undefined && Number.isFinite(parsedBudget) && parsedBudget > 0 ? { wordBudget: parsedBudget } : {}),
                  ...(Number.isFinite(parsedRetries) && parsedRetries >= 0 ? { maxRetries: parsedRetries } : {}),
                  stopOnSoftWarnings: state.stopOnSoftWarnings,
                };
                queuePatch({ acting: true, message: undefined });
                void unwrap(target.start(projectId, input)).then((projection) => {
                  release();
                  if (!active) return;
                  const next = projection as QueueStatusShape;
                  queuePatch({ acting: false, status: 'ready', projection: next });
                  if (next.runState === 'running' || next.runState === 'paused') pollQueueStatus();
                }, (cause: Error) => { release(); if (!active) return; queuePatch({ acting: false, message: (cause as Error).message }); });
              },
              pause() { queueCommand('pause'); },
              resume() { queueCommand('resume'); },
              cancel() { queueCommand('cancel'); },
              retry(taskId: string) { queueCommand('retry', taskId); },
              dismiss() { queuePatch({ status: 'idle', projection: undefined, message: undefined, acting: false }); clearQueuePoll(); },
            };
          })(),
          // ---- I66 知情与揭示管理面（R14-1）：双视图 + 揭示/holder Gate 提案 ----
          knowledge: (() => {
            const knowledgePatch = (patch: Partial<KnowledgeLayerState>): void => act.knowledgePatch(patch);
            return {
              refresh(): void {
                const target = knowledgeNamespace;
                if (!target || projectId === undefined) { knowledgePatch({ status: 'error', message: '知情与揭示服务不可用' }); return; }
                if (!beginOp('knowledge:refresh')) return;
                const release = (): void => endOp('knowledge:refresh');
                knowledgePatch({ status: 'loading', message: undefined });
                // 投影 + 待确认提案并行读取（都为只读 Remote）。
                void Promise.all([
                  unwrap(target.list(projectId)),
                  unwrap(target.pending(projectId)),
                ]).then(([projection, pendingEnvelope]) => {
                  release();
                  if (!active) return;
                  const pending = (pendingEnvelope as { proposals?: KnowledgeProposalShape[] } | undefined)?.proposals ?? [];
                  knowledgePatch({ status: 'ready', projection: projection as KnowledgeProjectionShape, pending, message: undefined });
                }, (cause: Error) => { release(); if (!active) return; knowledgePatch({ status: 'error', message: (cause as Error).message }); });
              },
              setView(view: KnowledgeViewId) { knowledgePatch({ view, selectedEntryId: undefined, draft: { holders: [], status: '', revealAt: '' } }); },
              selectFact(entryId: string) {
                const selected = snapshot.knowledge.selectedEntryId === entryId ? undefined : entryId;
                knowledgePatch({ selectedEntryId: selected, draft: { holders: [], status: '', revealAt: '' }, message: undefined });
              },
              toggleDraftHolder(characterId: string) {
                const holders = snapshot.knowledge.draft.holders;
                knowledgePatch({ draft: { ...snapshot.knowledge.draft, holders: holders.includes(characterId) ? holders.filter((id) => id !== characterId) : [...holders, characterId] } });
              },
              setDraftStatus(value: '' | 'partially-revealed' | 'revealed') { knowledgePatch({ draft: { ...snapshot.knowledge.draft, status: value } }); },
              setDraftRevealAt(value: string) { knowledgePatch({ draft: { ...snapshot.knowledge.draft, revealAt: value } }); },
              propose(kind: 'reveal' | 'holder-add'): void {
                const target = knowledgeNamespace;
                const state = snapshot.knowledge;
                if (!target || projectId === undefined || state.status !== 'ready') return;
                if (state.selectedEntryId === undefined || state.draft.holders.length === 0 || state.acting) return;
                if (!beginOp(`knowledge:propose:${kind}`)) return;
                const release = (): void => endOp(`knowledge:propose:${kind}`);
                const revealAt = state.draft.revealAt.trim();
                const input = kind === 'reveal'
                  ? {
                    kind,
                    entryId: state.selectedEntryId,
                    holders: [...state.draft.holders],
                    ...(state.draft.status === '' ? {} : { status: state.draft.status }),
                    ...(revealAt === '' ? {} : { revealAt }),
                  }
                  : { kind, entryId: state.selectedEntryId, holders: [...state.draft.holders] };
                knowledgePatch({ acting: true, message: undefined });
                void unwrap(target.propose(projectId, input)).then((outcome) => {
                  release();
                  if (!active) return;
                  const result = outcome as KnowledgeProposeOutcomeShape;
                  const names = new Map((state.projection?.characters ?? []).map((character) => [character.characterId, character.name]));
                  const addedNames = state.draft.holders.map((id) => names.get(id) ?? id).join('、');
                  knowledgePatch({
                    acting: false,
                    selectedEntryId: undefined,
                    draft: { holders: [], status: '', revealAt: '' },
                    message: `提案已提交待确认（${result.proposalId}）：${result.kind === 'reveal' ? '揭示' : 'holder 变更'}「${result.preview.fact}」→ 新增知情：${addedNames}。确认后生效（知情只增不退）。`,
                  });
                  // 刷新待确认提案列表（Gate pending 持久化）。
                  void unwrap(target.pending(projectId)).then((pendingEnvelope) => {
                    if (!active) return;
                    knowledgePatch({ pending: (pendingEnvelope as { proposals?: KnowledgeProposalShape[] }).proposals ?? [] });
                  }, () => undefined);
                }, (cause: Error) => { release(); if (!active) return; knowledgePatch({ acting: false, message: (cause as Error).message }); });
              },
              accept(proposalId: string): void {
                const target = knowledgeNamespace;
                if (!target || projectId === undefined || snapshot.knowledge.acting) return;
                if (!beginOp(`knowledge:accept:${proposalId}`)) return;
                const release = (): void => endOp(`knowledge:accept:${proposalId}`);
                knowledgePatch({ acting: true, message: undefined });
                void unwrap(target.accept(projectId, proposalId)).then((outcome) => {
                  release();
                  if (!active) return;
                  const result = outcome as KnowledgeApplyOutcomeShape;
                  const pending = snapshot.knowledge.pending.filter((proposal) => proposal.proposalId !== proposalId);
                  knowledgePatch({
                    acting: false,
                    projection: result.projection,
                    pending,
                    message: result.applied
                      ? `已确认并应用揭示 / holder 变更（知情只增不退，已同步 holders 与角色知情状态）。`
                      : '该变更此前已生效（幂等确认，未重复写 C3）。',
                  });
                }, (cause: Error) => { release(); if (!active) return; knowledgePatch({ acting: false, message: (cause as Error).message }); });
              },
              reject(proposalId: string): void {
                const target = knowledgeNamespace;
                if (!target || projectId === undefined || snapshot.knowledge.acting) return;
                if (!beginOp(`knowledge:reject:${proposalId}`)) return;
                const release = (): void => endOp(`knowledge:reject:${proposalId}`);
                knowledgePatch({ acting: true, message: undefined });
                void unwrap(target.reject(projectId, proposalId)).then(() => {
                  release();
                  if (!active) return;
                  knowledgePatch({
                    acting: false,
                    pending: snapshot.knowledge.pending.filter((proposal) => proposal.proposalId !== proposalId),
                    message: `已拒绝提案 ${proposalId}（C3 零写）。`,
                  });
                }, (cause: Error) => { release(); if (!active) return; knowledgePatch({ acting: false, message: (cause as Error).message }); });
              },
              dismiss() { knowledgePatch({ status: 'idle', projection: undefined, message: undefined, selectedEntryId: undefined, draft: { holders: [], status: '', revealAt: '' }, pending: [], acting: false }); },
            };
          })(),
          // ---- I67 规则与文风控制面（R14-2）：规则列表/详情表单 + 风格档案 ----
          ruleStyle: (() => {
            const ruleStylePatch = (patch: Partial<RuleStyleLayerState>): void => act.ruleStylePatch(patch);
            const ruleDraftFrom = (rule: RuleShape): RuleDraftShape => ({
              id: rule.id, scope: rule.scope, kind: rule.kind, statement: rule.statement,
              priority: String(rule.priority), immutable: rule.immutable, active: rule.active,
              examples: [...rule.examples],
            });
            const styleDraftFrom = (style: StyleShape | null): StyleDraftShape => style === null
              ? freshStyleDraft()
              : {
                name: style.name, person: style.person, tense: style.tense, povScope: style.povScope,
                tone: style.tone, proseStyle: style.proseStyle, chapterFormat: style.chapterFormat,
                dialogueConventions: style.dialogueConventions, forbidden: [...style.forbidden],
              };
            return {
              refresh(): void {
                const target = ruleStyleNamespace;
                if (!target || projectId === undefined) { ruleStylePatch({ status: 'error', message: '规则与文风服务不可用' }); return; }
                if (!beginOp('ruleStyle:refresh')) return;
                const release = (): void => endOp('ruleStyle:refresh');
                ruleStylePatch({ status: 'loading', message: undefined });
                void unwrap(target.list(projectId)).then((projection) => {
                  release();
                  if (!active) return;
                  const result = projection as RuleStyleProjectionShape;
                  ruleStylePatch({ status: 'ready', projection: result, styleDraft: styleDraftFrom(result.style), message: undefined });
                }, (cause: Error) => { release(); if (!active) return; ruleStylePatch({ status: 'error', message: (cause as Error).message }); });
              },
              selectRule(ruleId: string): void {
                const target = ruleStyleNamespace;
                const state = snapshot.ruleStyle;
                if (!target || projectId === undefined || state.acting) return;
                if (state.editingRuleId === ruleId) {
                  ruleStylePatch({ editingRuleId: undefined, ruleDraft: undefined, message: undefined });
                  return;
                }
                if (!beginOp(`ruleStyle:read:${ruleId}`)) return;
                const release = (): void => endOp(`ruleStyle:read:${ruleId}`);
                void unwrap(target.readRule(projectId, ruleId)).then((rule) => {
                  release();
                  if (!active) return;
                  ruleStylePatch({ editingRuleId: ruleId, ruleDraft: ruleDraftFrom(rule as RuleShape), message: undefined });
                }, (cause: Error) => { release(); if (!active) return; ruleStylePatch({ message: (cause as Error).message }); });
              },
              newRule(): void {
                const editing = snapshot.ruleStyle.editingRuleId === '__new__';
                ruleStylePatch({ editingRuleId: editing ? undefined : '__new__', ruleDraft: editing ? undefined : freshRuleDraft(), message: undefined });
              },
              cancelRuleEdit(): void { ruleStylePatch({ editingRuleId: undefined, ruleDraft: undefined, message: undefined }); },
              setRuleDraft(patch: Partial<RuleDraftShape>): void {
                const draft = snapshot.ruleStyle.ruleDraft;
                if (draft === undefined) return;
                ruleStylePatch({ ruleDraft: { ...draft, ...patch }, message: undefined });
              },
              saveRule(): void {
                const target = ruleStyleNamespace;
                const state = snapshot.ruleStyle;
                if (!target || projectId === undefined || state.ruleDraft === undefined || state.acting) return;
                const draft = state.ruleDraft;
                if (!beginOp(`ruleStyle:save:${state.editingRuleId ?? ''}`)) return;
                const release = (): void => endOp(`ruleStyle:save:${state.editingRuleId ?? ''}`);
                const payload = {
                  scope: draft.scope, kind: draft.kind, statement: draft.statement.trim(),
                  priority: Number(draft.priority), immutable: draft.immutable, active: draft.active,
                  examples: [...draft.examples],
                };
                ruleStylePatch({ acting: true, message: undefined });
                const call = state.editingRuleId === '__new__'
                  ? target.createRule(projectId, { ...payload, id: draft.id.trim() })
                  : target.updateRule(projectId, draft.id.trim(), payload);
                void unwrap(call).then((rule) => {
                  release();
                  if (!active) return;
                  const saved = rule as RuleShape;
                  ruleStylePatch({ acting: false, editingRuleId: undefined, ruleDraft: undefined, message: `已保存规则「${saved.id}」（v${saved.version}）。` });
                  // 刷新列表投影以反映同一 Host 真相（生成/检测消费同一存储）。
                  void unwrap(target.list(projectId)).then((projection) => {
                    if (!active) return;
                    const result = projection as RuleStyleProjectionShape;
                    ruleStylePatch({ projection: result, status: 'ready' });
                  }, () => undefined);
                }, (cause: Error) => { release(); if (!active) return; ruleStylePatch({ acting: false, message: (cause as Error).message }); });
              },
              setStyleDraft(patch: Partial<StyleDraftShape>): void {
                ruleStylePatch({ styleDraft: { ...snapshot.ruleStyle.styleDraft, ...patch }, message: undefined });
              },
              saveStyle(): void {
                const target = ruleStyleNamespace;
                const state = snapshot.ruleStyle;
                if (!target || projectId === undefined || state.acting) return;
                if (!beginOp('ruleStyle:saveStyle')) return;
                const release = (): void => endOp('ruleStyle:saveStyle');
                const draft = state.styleDraft;
                const input = {
                  name: draft.name.trim(), person: draft.person, tense: draft.tense, povScope: draft.povScope,
                  tone: draft.tone.trim(), proseStyle: draft.proseStyle.trim(), chapterFormat: draft.chapterFormat.trim(),
                  dialogueConventions: draft.dialogueConventions.trim(), forbidden: [...draft.forbidden],
                };
                ruleStylePatch({ acting: true, message: undefined });
                void unwrap(target.saveStyle(projectId, input)).then((style) => {
                  release();
                  if (!active) return;
                  const saved = style as StyleShape;
                  ruleStylePatch({ acting: false, message: `已保存风格档案「${saved.name}」（v${saved.version}，id ${saved.id}）。` });
                  // 刷新投影：style 视图同步（含 version/id）。
                  void unwrap(target.list(projectId)).then((projection) => {
                    if (!active) return;
                    const result = projection as RuleStyleProjectionShape;
                    ruleStylePatch({ projection: result, status: 'ready', styleDraft: styleDraftFrom(result.style) });
                  }, () => undefined);
                }, (cause: Error) => { release(); if (!active) return; ruleStylePatch({ acting: false, message: (cause as Error).message }); });
              },
              dismiss() { ruleStylePatch({ status: 'idle', projection: undefined, message: undefined, editingRuleId: undefined, ruleDraft: undefined, styleDraft: freshStyleDraft(), acting: false }); },
            };
          })(),
          // ---- I68 进度与灵感落地（R14-3）：导航/完成状态 + 偏差 + 灵感 Gate 落地 ----
          progress: (() => {
            const progressPatch = (patch: Partial<ProgressLayerState>): void => act.progressPatch(patch);
            const refresh = (): void => {
              const target = progressNamespace;
              if (!target || projectId === undefined) { progressPatch({ status: 'error', message: '进度与灵感服务不可用' }); return; }
              if (!beginOp('progress:refresh')) return;
              const release = (): void => endOp('progress:refresh');
              progressPatch({ status: 'loading', message: undefined });
              // 投影 + 待确认 + 审计并行读取（都为只读 Remote）。
              void Promise.all([
                unwrap(target.projection(projectId)),
                unwrap(target.pending(projectId)),
                unwrap(target.audit(projectId)),
              ]).then(([projection, pendingEnvelope, auditEnvelope]) => {
                release();
                if (!active) return;
                progressPatch({
                  status: 'ready',
                  projection: projection as ProgressProjectionShape,
                  pending: (pendingEnvelope as { proposals?: ProgressPendingProposalShape[] } | undefined)?.proposals ?? [],
                  audit: (auditEnvelope as { records?: ProgressAuditRecordShape[] } | undefined)?.records ?? [],
                  message: undefined,
                });
              }, (cause: Error) => { release(); if (!active) return; progressPatch({ status: 'error', message: (cause as Error).message }); });
            };
            return {
              refresh,
              inspire(): void {
                const target = progressNamespace;
                if (!target || projectId === undefined || snapshot.progress.acting || snapshot.progress.inspiring) return;
                if (!beginOp('progress:inspire')) return;
                const release = (): void => endOp('progress:inspire');
                progressPatch({ inspiring: true, message: undefined, directions: undefined, selectedDirectionId: undefined });
                void unwrap(target.inspire(projectId, snapshot.progress.prompt.trim() || undefined)).then((outcome) => {
                  release();
                  if (!active) return;
                  const result = outcome as { projectId: string; directions: ProgressDirectionShape[] };
                  progressPatch({ inspiring: false, directions: result.directions, message: `灵感时刻产出 ${result.directions.length} 个方向（零写；选定并经确认后才会调整 B5/C6）。` });
                }, (cause: Error) => { release(); if (!active) return; progressPatch({ inspiring: false, message: (cause as Error).message }); });
              },
              setPrompt(value: string) { progressPatch({ prompt: value }); },
              selectDirection(directionId: string) {
                const state = snapshot.progress;
                const next = state.selectedDirectionId === directionId ? undefined : directionId;
                progressPatch({ selectedDirectionId: next, message: undefined });
              },
              proposeApply(): void {
                const target = progressNamespace;
                const state = snapshot.progress;
                if (!target || projectId === undefined || state.status !== 'ready' || state.acting) return;
                const selected = state.directions?.find((direction) => direction.id === state.selectedDirectionId);
                if (selected === undefined) return;
                if (!beginOp('progress:propose')) return;
                const release = (): void => endOp('progress:propose');
                progressPatch({ acting: true, message: undefined });
                void unwrap(target.select(projectId, { direction: selected })).then((outcome) => {
                  release();
                  if (!active) return;
                  const result = outcome as ProgressSelectOutcomeShape;
                  progressPatch({
                    acting: false,
                    selectedDirectionId: undefined,
                    message: `方向「${result.direction.title}」已提交待确认（${result.proposalId}）。确认后只改授权的 B5/C6；拒绝则零写。`,
                  });
                  void unwrap(target.pending(projectId)).then((pendingEnvelope) => {
                    if (!active) return;
                    progressPatch({ pending: (pendingEnvelope as { proposals?: ProgressPendingProposalShape[] }).proposals ?? [] });
                  }, () => undefined);
                }, (cause: Error) => { release(); if (!active) return; progressPatch({ acting: false, message: (cause as Error).message }); });
              },
              accept(proposalId: string): void {
                const target = progressNamespace;
                if (!target || projectId === undefined || snapshot.progress.acting) return;
                if (!beginOp(`progress:accept:${proposalId}`)) return;
                const release = (): void => endOp(`progress:accept:${proposalId}`);
                progressPatch({ acting: true, message: undefined });
                void unwrap(target.apply(projectId, proposalId)).then((outcome) => {
                  release();
                  if (!active) return;
                  const result = outcome as ProgressApplyOutcomeShape;
                  progressPatch({
                    acting: false,
                    projection: result.projection,
                    pending: snapshot.progress.pending.filter((proposal) => proposal.proposalId !== proposalId),
                    audit: result.audit,
                    message: result.applied
                      ? '已确认并应用灵感方向（只改授权的 B5 立意/主题与 C6 偏差记录）。'
                      : '该方向此前已应用（幂等确认，未重复写 B5/C6）。',
                  });
                }, (cause: Error) => { release(); if (!active) return; progressPatch({ acting: false, message: (cause as Error).message }); });
              },
              reject(proposalId: string): void {
                const target = progressNamespace;
                if (!target || projectId === undefined || snapshot.progress.acting) return;
                if (!beginOp(`progress:reject:${proposalId}`)) return;
                const release = (): void => endOp(`progress:reject:${proposalId}`);
                progressPatch({ acting: true, message: undefined });
                void unwrap(target.reject(projectId, proposalId)).then(() => {
                  release();
                  if (!active) return;
                  progressPatch({
                    acting: false,
                    pending: snapshot.progress.pending.filter((proposal) => proposal.proposalId !== proposalId),
                    message: `已拒绝方向提案 ${proposalId}（B5/C6 零写）。`,
                  });
                  void unwrap(target.audit(projectId)).then((auditEnvelope) => {
                    if (!active) return;
                    progressPatch({ audit: (auditEnvelope as { records?: ProgressAuditRecordShape[] }).records ?? [] });
                  }, () => undefined);
                }, (cause: Error) => { release(); if (!active) return; progressPatch({ acting: false, message: (cause as Error).message }); });
              },
              setDeviationDraft(patch: Partial<{ planned: string; actual: string; reason: string }>) {
                progressPatch({ deviationDraft: { ...snapshot.progress.deviationDraft, ...patch } });
              },
              recordDeviation(): void {
                const target = progressNamespace;
                const state = snapshot.progress;
                if (!target || projectId === undefined || state.status !== 'ready' || state.acting) return;
                if (state.deviationDraft.planned.trim() === '' || state.deviationDraft.actual.trim() === '' || state.deviationDraft.reason.trim() === '') return;
                if (!beginOp('progress:record-deviation')) return;
                const release = (): void => endOp('progress:record-deviation');
                progressPatch({ acting: true, message: undefined });
                void unwrap(target.recordDeviation(projectId, {
                  planned: state.deviationDraft.planned.trim(),
                  actual: state.deviationDraft.actual.trim(),
                  reason: state.deviationDraft.reason.trim(),
                })).then((projection) => {
                  release();
                  if (!active) return;
                  progressPatch({ acting: false, projection: projection as ProgressProjectionShape, deviationDraft: { planned: '', actual: '', reason: '' }, message: '偏差已记录（只写 C6；B5 未改变）。' });
                }, (cause: Error) => { release(); if (!active) return; progressPatch({ acting: false, message: (cause as Error).message }); });
              },
              reconcileDeviation(deviationId: string): void {
                const target = progressNamespace;
                if (!target || projectId === undefined || snapshot.progress.acting) return;
                if (!beginOp(`progress:reconcile:${deviationId}`)) return;
                const release = (): void => endOp(`progress:reconcile:${deviationId}`);
                progressPatch({ acting: true, message: undefined });
                void unwrap(target.reconcileDeviation(projectId, deviationId)).then((projection) => {
                  release();
                  if (!active) return;
                  progressPatch({ acting: false, projection: projection as ProgressProjectionShape, message: `偏差 ${deviationId} 已标记为调和（只写 C6）。` });
                }, (cause: Error) => { release(); if (!active) return; progressPatch({ acting: false, message: (cause as Error).message }); });
              },
              dismiss() { progressPatch({ status: 'idle', projection: undefined, message: undefined, directions: undefined, inspiring: false, prompt: '', selectedDirectionId: undefined, pending: [], audit: [], deviationDraft: { planned: '', actual: '', reason: '' }, acting: false }); },
            };
          })(),
          // ---- I69 导入导出与备份（R14-4）：受控下载 / round-trip 恢复 / 导入预览 ----
          importExport: (() => {
            const iePatch = (patch: Partial<ImportExportLayerState>): void => act.importExportPatch(patch);
            return {
              setExportMode(mode) { iePatch({ exportMode: mode, message: undefined, error: undefined }); },
              setTextFormat(format) { iePatch({ textFormat: format, message: undefined, error: undefined }); },
              setImportFormat(format) { iePatch({ importFormat: format, message: undefined, error: undefined }); },
              setImportText(text) { iePatch({ importText: text, message: undefined, error: undefined }); },
              pickImportFile(file) {
                if (!file) return;
                void file.text().then((text) => {
                  if (!active) return;
                  iePatch({ importText: text, importFileName: file.name, message: undefined, error: undefined });
                }, () => { if (!active) return; iePatch({ error: `读取导入文件失败：${file.name}` }); });
              },
              pickRestoreFile(file) {
                if (!file) return;
                if (file.size > MAX_RESTORE_FILE_BYTES) {
                  iePatch({ restoreFileName: undefined, restoreRaw: undefined, restoreResult: undefined, restoreError: '恢复包超过 10 MiB 上限。', error: undefined });
                  return;
                }
                void file.text().then((text) => {
                  if (!active) return;
                  iePatch({ restoreFileName: file.name, restoreRaw: text, restoreResult: undefined, restoreError: undefined, message: undefined, error: undefined });
                }, () => { if (!active) return; iePatch({ restoreError: `读取恢复包失败：${file.name}` }); });
              },
              exportArchive(): void {
                const target = importExportNamespace;
                if (!target || projectId === undefined || snapshot.importExport.acting) return;
                if (!beginOp('importExport:export-archive')) return;
                const release = (): void => endOp('importExport:export-archive');
                iePatch({ acting: true, message: undefined, error: undefined });
                void unwrap(target.exportArchive(projectId, snapshot.importExport.exportMode)).then((outcome) => {
                  release();
                  if (!active) return;
                  const result = outcome as { fileName: string; mode: string; fileCount: number; content: string };
                  downloadText(result.fileName, result.content);
                  iePatch({ acting: false, message: `已导出 ${result.fileCount} 个文件（${result.mode}），开始下载 ${result.fileName}。` });
                }, (cause: Error) => { release(); if (!active) return; iePatch({ acting: false, error: (cause as Error).message }); });
              },
              exportText(): void {
                const target = importExportNamespace;
                if (!target || projectId === undefined || snapshot.importExport.acting) return;
                if (!beginOp('importExport:export-text')) return;
                const release = (): void => endOp('importExport:export-text');
                iePatch({ acting: true, message: undefined, error: undefined });
                void unwrap(target.exportText(projectId, snapshot.importExport.textFormat)).then((outcome) => {
                  release();
                  if (!active) return;
                  const result = outcome as { fileName: string; format: string; files: Record<string, string> };
                  for (const [name, content] of Object.entries(result.files)) {
                    const base = name.split('/').pop() ?? name;
                    // Blob 类型只作浏览器提示，落盘文件名由 anchor.download 的扩展名决定；
                    // 不传 MIME（默认 application/json），避免 `text/` 字样进入 bundle
                    // （I60/I61 的 Client bundle 负向扫描禁止作品目录路径提示泄漏）。
                    downloadText(base, content);
                  }
                  iePatch({ acting: false, message: `已导出 ${Object.keys(result.files).length} 个纯文本文件（${result.format}），逐个下载。` });
                }, (cause: Error) => { release(); if (!active) return; iePatch({ acting: false, error: (cause as Error).message }); });
              },
              restore(): void {
                const target = importExportNamespace;
                const state = snapshot.importExport;
                if (!target || projectId === undefined || state.acting || state.restoreRaw === undefined) return;
                if (!beginOp('importExport:restore')) return;
                const release = (): void => endOp('importExport:restore');
                iePatch({ acting: true, message: undefined, error: undefined, restoreError: undefined, restoreResult: undefined });
                void unwrap(target.restore(projectId, state.restoreRaw)).then((outcome) => {
                  release();
                  if (!active) return;
                  const result = outcome as ImportExportRestoreResultShape;
                  if (result.status === 'imported') {
                    iePatch({ acting: false, restoreResult: result, message: `恢复完成：写入 ${result.written.length} 个文件（round-trip）。` });
                  } else {
                    iePatch({ acting: false, restoreResult: result, message: undefined });
                  }
                }, (cause: Error) => { release(); if (!active) return; iePatch({ acting: false, restoreError: (cause as Error).message }); });
              },
              previewImport(): void {
                const target = importExportNamespace;
                const state = snapshot.importExport;
                if (!target || projectId === undefined || state.acting || state.importText.trim() === '') return;
                if (!beginOp('importExport:preview')) return;
                const release = (): void => endOp('importExport:preview');
                iePatch({ acting: true, message: undefined, error: undefined });
                void unwrap(target.importPreview(projectId, { fileName: state.importFileName ?? `pasted.${state.importFormat}`, format: state.importFormat, text: state.importText })).then((outcome) => {
                  release();
                  if (!active) return;
                  const result = outcome as ImportExportPreviewShape;
                  iePatch({ acting: false, preview: result, message: `导入预览完成：${result.chunks.length} 块（零写）。` });
                }, (cause: Error) => { release(); if (!active) return; iePatch({ acting: false, error: (cause as Error).message }); });
              },
              dismiss() { iePatch({ status: 'idle', message: undefined, error: undefined, acting: false, preview: undefined, restoreFileName: undefined, restoreRaw: undefined, restoreResult: undefined, restoreError: undefined, importText: '', importFileName: undefined }); },
            };
          })(),
          // ---- I71 全局搜索与上下文追踪（R14-6）：搜索/引用/跳转/索引生命周期 ----
          search: (() => {
            const searchPatch = (patch: Partial<SearchLayerState>): void => act.searchPatch(patch);
            const run = <T>(method: 'search' | 'references', key: string, onResult: (result: T) => void): void => {
              const target = searchNamespace;
              if (!target || projectId === undefined) { searchPatch({ status: 'error', message: '搜索服务不可用' }); return; }
              if (!beginOp(`search:${method}:${key}`)) return;
              const release = (): void => endOp(`search:${method}:${key}`);
              searchPatch({ acting: true, message: undefined });
              const pov = snapshot.search.pov.trim();
              const call = method === 'search'
                ? target.search(projectId, key, pov === '' ? undefined : pov)
                : target.references(projectId, key, pov === '' ? undefined : pov);
              void unwrap(call).then((result) => {
                release();
                if (!active) return;
                onResult(result as T);
                searchPatch({ acting: false, status: 'ready' });
              }, (cause: Error) => { release(); if (!active) return; searchPatch({ acting: false, status: 'error', message: (cause as Error).message }); });
            };
            const runStats = (): void => {
              const target = searchNamespace;
              if (!target || projectId === undefined) return;
              if (!beginOp('search:stats')) return;
              const release = (): void => endOp('search:stats');
              searchPatch({ acting: true, message: undefined });
              void unwrap(target.stats(projectId)).then((stats) => {
                release();
                if (!active) return;
                searchPatch({ acting: false, stats: stats as SearchStatsShape, message: undefined });
              }, (cause: Error) => { release(); if (!active) return; searchPatch({ acting: false, message: (cause as Error).message }); });
            };
            return {
              setQuery(value: string) { searchPatch({ query: value, message: undefined }); },
              setPov(value: string) { searchPatch({ pov: value, message: undefined }); },
              search() {
                const q = snapshot.search.query.trim();
                if (q === '') return;
                searchPatch({ results: undefined, references: undefined, message: undefined });
                run<SearchResultShape>('search', q, (result) => searchPatch({ results: result }));
              },
              setReferenceKey(value: string) { searchPatch({ referenceKey: value, message: undefined }); },
              references() {
                const key = snapshot.search.referenceKey.trim();
                if (key === '') return;
                searchPatch({ references: undefined, message: undefined });
                run<{ key: string; total: number; hits: readonly SearchHitShape[] }>('references', key, (result) => searchPatch({ references: result }));
              },
              refreshStats() { runStats(); },
              rebuild(): void {
                const target = searchNamespace;
                if (!target || projectId === undefined) { searchPatch({ message: '搜索服务不可用' }); return; }
                if (!beginOp('search:rebuild')) return;
                const release = (): void => endOp('search:rebuild');
                searchPatch({ acting: true, message: undefined });
                void unwrap(target.build(projectId)).then((stats) => {
                  release();
                  if (!active) return;
                  searchPatch({ acting: false, stats: stats as SearchStatsShape, message: `已从六层 live source-of-truth 重建派生索引（${(stats as SearchStatsShape).totalEntries} 条，零写结构层）。` });
                }, (cause: Error) => { release(); if (!active) return; searchPatch({ acting: false, message: (cause as Error).message }); });
              },
              drop(): void {
                const target = searchNamespace;
                if (!target || projectId === undefined) { searchPatch({ message: '搜索服务不可用' }); return; }
                if (!beginOp('search:drop')) return;
                const release = (): void => endOp('search:drop');
                searchPatch({ acting: true, message: undefined });
                void unwrap(target.drop(projectId)).then((stats) => {
                  release();
                  if (!active) return;
                  searchPatch({ acting: false, stats: stats as SearchStatsShape, results: undefined, references: undefined, message: '已删除派生索引（可随时重建，不写任何结构层）。' });
                }, (cause: Error) => { release(); if (!active) return; searchPatch({ acting: false, message: (cause as Error).message }); });
              },
              // 结果跳转：正文命中 → 正文视图对应场景；其余层 → 对应层面板（R14-6 结果跳转）。
              jumpTo(hit: SearchHitShape): void {
                if (hit.layer === 'text' && hit.nav.chapterId !== undefined && hit.nav.sceneId !== undefined) {
                  act.activateView('chapters');
                  chaptersOpsRef?.openScene(hit.nav.chapterId, hit.nav.sceneId);
                  return;
                }
                const layerView: Record<string, WorkbenchViewId> = {
                  characters: 'characters', worldview: 'worldview', outline: 'outline',
                  canon: 'canon', knowledge: 'knowledge', text: 'chapters',
                };
                const view = layerView[hit.layer];
                if (view !== undefined) act.activateView(view);
              },
              dismiss() { searchPatch({ status: 'idle', message: undefined, results: undefined, references: undefined, query: '', pov: '', referenceKey: '', acting: false }); },
            };
          })(),
          // ---- I72 写作进度面板（R14-7）：概览/筛选/章节详情/重建/删除派生统计 ----
          statistics: (() => {
            const statisticsPatch = (patch: Partial<StatisticsLayerState>): void => act.statisticsPatch(patch);
            const run = <T>(key: string, call: (target: StatisticsNamespace, projectId: string) => Promise<unknown>, onResult: (result: T) => void): void => {
              const target = statisticsNamespace;
              if (!target || projectId === undefined) { statisticsPatch({ status: 'error', message: '统计服务不可用' }); return; }
              if (!beginOp(key)) return;
              const release = (): void => endOp(key);
              statisticsPatch({ acting: true, message: undefined });
              void unwrap(call(target, projectId)).then((result) => {
                release();
                if (!active) return;
                onResult(result as T);
                statisticsPatch({ acting: false, status: 'ready' });
              }, (cause: Error) => { release(); if (!active) return; statisticsPatch({ acting: false, status: 'error', message: (cause as Error).message }); });
            };
            const loadCards = (filters: { actId: string; beatId: string; status: string }): void => {
              run<SceneCardsResultShape>(`statistics:cards:${filters.actId}:${filters.beatId}:${filters.status}`, (ns, pid) => ns.sceneCards(pid, {
                ...(filters.actId !== '' ? { actId: filters.actId } : {}),
                ...(filters.beatId !== '' ? { beatId: filters.beatId } : {}),
                ...(filters.status !== '' ? { status: filters.status } : {}),
              }), (result) => statisticsPatch({ sceneCards: result }));
            };
            const loadTasks = (status: string): void => {
              run<TasksResultShape>(`statistics:tasks:${status}`, (ns, pid) => ns.tasks(pid, status === '' ? undefined : { status }), (result) => statisticsPatch({ tasks: result }));
            };
            const loadOverview = (): void => {
              run<StatisticsOverviewShape>('statistics:overview', (ns, pid) => ns.overview(pid), (result) => statisticsPatch({ overview: result }));
            };
            return {
              setCardAct(value: string) { statisticsPatch({ cardActId: value, cardBeatId: '' }); loadCards({ actId: value, beatId: '', status: snapshot.statistics.cardStatus }); },
              setCardBeat(value: string) { statisticsPatch({ cardBeatId: value }); loadCards({ actId: snapshot.statistics.cardActId, beatId: value, status: snapshot.statistics.cardStatus }); },
              setCardStatus(value: string) { statisticsPatch({ cardStatus: value }); loadCards({ actId: snapshot.statistics.cardActId, beatId: snapshot.statistics.cardBeatId, status: value }); },
              setTaskStatus(value: string) { statisticsPatch({ taskStatus: value }); loadTasks(value); },
              selectChapter(value: string) {
                statisticsPatch({ chapterId: value });
                if (value === '') { statisticsPatch({ chapterDetail: undefined }); return; }
                run<ChapterDetailShape>(`statistics:chapterDetail:${value}`, (ns, pid) => ns.chapterDetail(pid, value), (result) => statisticsPatch({ chapterDetail: result }));
              },
              refreshOverview() { loadOverview(); },
              refreshStats() {
                run<StatisticsStatsShape>('statistics:stats', (ns, pid) => ns.stats(pid), (result) => statisticsPatch({ stats: result }));
              },
              rebuild(): void {
                run<StatisticsStatsShape>('statistics:rebuild', (ns, pid) => ns.rebuild(pid), (stats) => {
                  statisticsPatch({ stats });
                  loadOverview();
                  loadCards({ actId: snapshot.statistics.cardActId, beatId: snapshot.statistics.cardBeatId, status: snapshot.statistics.cardStatus });
                  loadTasks(snapshot.statistics.taskStatus);
                  statisticsPatch({ message: `已从 C5/B5/C6/任务记录重建派生统计（章节 ${stats.counts.chapters} · 场景 ${stats.counts.scenes} · 场景卡 ${stats.counts.cards} · 任务 ${stats.counts.tasks}，零写结构层）。` });
                });
              },
              drop(): void {
                run<StatisticsStatsShape>('statistics:drop', (ns, pid) => ns.drop(pid), (stats) => {
                  statisticsPatch({ stats, overview: undefined, sceneCards: undefined, tasks: undefined, chapterDetail: undefined, message: '已删除派生统计（可随时重建，不写任何结构层）。' });
                });
              },
              dismiss() { statisticsPatch({ status: 'idle', message: undefined, stats: undefined, overview: undefined, chapterId: '', chapterDetail: undefined, cardActId: '', cardBeatId: '', cardStatus: '', sceneCards: undefined, taskStatus: '', tasks: undefined, acting: false }); },
            };
          })(),
        };
      };

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
          return workbenchView(React, s.status, workspace, writing, reviewNamespace, queueNamespace, knowledgeNamespace, ruleStyleNamespace, progressNamespace, importExportNamespace, branchNamespace, searchNamespace, statisticsNamespace, ui, layers, makeOps(s), s.chapters, s.review, s.queue, s.knowledge, s.ruleStyle, s.progress, s.importExport, s.search, s.statistics, s.selectedProjectId, s.selectedProjectName, s.projects, s.browsing, s.leaveConfirm, s.projectError, s.upload, s.uploadResult, s.onboarding, onboarding, decideLayer, applyOnboarding, patchOnboarding, {
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
        // Self-mount the namespace, then resolve it through `ctx.get` instead of
        // `inject`: injecting `remote.novelWorkspace` here would deadlock, because
        // that service only exists after `$mount` completes.
        void ctx.remote.$mount(workspaceRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          remoteDisposer = dispose;
          workspace = ctx.get('remote.novelWorkspace', false) as WorkspaceNamespace | undefined;
          if (!workspace) { dispatch((x) => x.fail('创作台远程服务不可用')); return; }
          return unwrap(workspace.viewModel()).then(
            (model) => {
              const target = workspace;
              dispatch((x) => x.ready(model as WorkspaceViewModel));
              if (target === undefined) return;
              void unwrap(target.projectList()).then(
                (projects) => dispatch((x) => x.setProjects(projects as unknown[])),
                () => dispatch((x) => x.fail('作品列表读取失败')),
              );
            },
            () => { dispatch((x) => x.fail('创作台远程服务不可用')); },
          );
        }, () => { dispatch((x) => x.fail('创作台远程服务不可用')); });
        // I53: mount the analyzer + adjudication namespaces for the six-layer
        // review. Start analysis after a source text is available (upload or
        // free text), then review/adjudicate/apply through their Remotes.
        void ctx.remote.$mount(onboardingAnalyzerRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          analyzerDisposer = dispose;
          analyzer = ctx.get('remote.novelOnboardingAnalyzer', false) as OnboardingAnalyzerNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: analyzer Remote mount failed', cause); });
        void ctx.remote.$mount(onboardingRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          onboardingDisposer = dispose;
          onboarding = ctx.get('remote.novelOnboarding', false) as OnboardingNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: onboarding Remote mount failed', cause); });
        void ctx.remote.$mount(llmConfigRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          llmConfigDisposer = dispose;
          llmConfig = ctx.get('remote.novelLlmConfig', false) as LlmConfigNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: llm config Remote mount failed', cause); });
        void ctx.remote.$mount(workbenchSettingsRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          workbenchSettingsDisposer = dispose;
          workbenchSettings = ctx.get('remote.novelWorkbenchSettings', false) as WorkbenchSettingsNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: workbench settings Remote mount failed', cause); });
        // I63：候选审阅与裁决 Remote（R13-4）。挂载失败静默降级：审阅面板显示不可用。
        void ctx.remote.$mount(writingRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          writingDisposer = dispose;
          writing = ctx.get('remote.novelWriting', false) as WritingNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: writing Remote mount failed', cause); });
        // I64：一致性审校中心 Remote（R13-5）。挂载失败静默降级：审校面板显示不可用。
        void ctx.remote.$mount(reviewRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          reviewDisposer = dispose;
          reviewNamespace = ctx.get('remote.novelReview', false) as ReviewNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: review Remote mount failed', cause); });
        // I65：可恢复自动生成队列 Remote（R13-6）。挂载失败静默降级：队列面板显示不可用。
        void ctx.remote.$mount(queueRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          queueDisposer = dispose;
          queueNamespace = ctx.get('remote.novelQueue', false) as QueueNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: queue Remote mount failed', cause); });
        // I66：知情与揭示管理面 Remote（R14-1）。挂载失败静默降级：知情面板显示不可用。
        void ctx.remote.$mount(knowledgeRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          knowledgeDisposer = dispose;
          knowledgeNamespace = ctx.get('remote.novelKnowledgeManager', false) as KnowledgeNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: knowledge Remote mount failed', cause); });
        // I67：规则与文风控制面 Remote（R14-2）。挂载失败静默降级：规则与文风面板显示不可用。
        void ctx.remote.$mount(ruleStyleRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          ruleStyleDisposer = dispose;
          ruleStyleNamespace = ctx.get('remote.novelRuleStyleManager', false) as RuleStyleNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: ruleStyle Remote mount failed', cause); });
        // I68：进度与灵感 Remote（R14-3）。挂载失败静默降级：进度与灵感面板显示不可用。
        void ctx.remote.$mount(progressRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          progressDisposer = dispose;
          progressNamespace = ctx.get('remote.novelOutlineProgress', false) as ProgressNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: progress Remote mount failed', cause); });
        // I69：导入导出与备份 Remote（R14-4）。挂载失败静默降级：面板显示不可用。
        void ctx.remote.$mount(importExportRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          importExportDisposer = dispose;
          importExportNamespace = ctx.get('remote.novelImportExport', false) as ImportExportNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: importExport Remote mount failed', cause); });
        // I70：C5 正文版本与分支 Remote（R14-5）。挂载失败静默降级：分支面板显示不可用。
        void ctx.remote.$mount(branchRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          branchDisposer = dispose;
          branchNamespace = ctx.get('remote.novelBranches', false) as BranchNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: branches Remote mount failed', cause); });
        // I71：全局搜索与上下文追踪 Remote（R14-6）。挂载失败静默降级：搜索面板显示不可用。
        void ctx.remote.$mount(searchRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          searchDisposer = dispose;
          searchNamespace = ctx.get('remote.novelSearch', false) as SearchNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: search Remote mount failed', cause); });
        // I72：写作进度面板 Remote（R14-7）。挂载失败静默降级：进度面板显示不可用。
        void ctx.remote.$mount(statisticsRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          statisticsDisposer = dispose;
          statisticsNamespace = ctx.get('remote.novelStatistics', false) as StatisticsNamespace | undefined;
        }, (cause: Error) => { console.error('novel-creation-tool: statistics Remote mount failed', cause); });
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
        };
      });
    },
  };
}
