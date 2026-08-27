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
import { chaptersPanel, computeEditRange, freshSceneEditor, type CandidatePanelState, type CandidateReviewShape, type ChapterListItemShape, type ChapterReadShape, type ChaptersEditOps, type SceneEditorState, type SceneReadShape } from './client/layers/chapters.js';
import { freshReview, reviewPanel, type ReviewAdjudicationOutcomeShape, type ReviewAuditRecordShape, type ReviewEditOps, type ReviewLayerState, type ReviewProjectionShape } from './client/layers/review.js';
import { freshQueue, queuePanel, type QueueEditOps, type QueueLayerState, type QueueStartInputShape, type QueueStatusShape, type QueueTaskShape } from './client/layers/queue.js';
import { reloadProject, type ProjectOpenLayers } from './client/project-session.js';
import { uploadDocx, type UploadProgress } from './client/upload.js';
import { analysisPanel, ANALYSIS_POLL_INTERVAL_MS, analysisResult, applyAccepted, beginAnalysis, onboardingReview, ONBOARDING_LAYERS, adjudicateOne, type OnboardingAdjudicationExtra, type OnboardingAnalysisState, type OnboardingAnalyzerNamespace, type OnboardingDecision, type OnboardingLayerId, type OnboardingNamespace, type OnboardingState } from './client/onboarding.js';
import { onboardingRemoteContribution, onboardingAnalyzerRemoteContribution } from './client/onboarding.js';
import { freshLlmConfigDraft, llmSettingsPanel, llmConfigRemoteContribution, type LlmConfigDraftShape, type LlmConfigNamespace, type LlmConfigViewShape } from './client/settings.js';
import { freshWorkbenchSettingsDraft, workbenchSettingsPanel, workbenchSettingsRemoteContribution, type WorkbenchSettingsDraftShape, type WorkbenchSettingsNamespace, type WorkbenchSettingsViewShape } from './client/workbench-settings.js';
import { WORKBENCH_STYLES } from './client/styles.js';
import { DEFAULT_VIEW, NAV_GROUPS, isStableView, resolveWorkbenchView, type WorkbenchViewId } from './client/nav.js';
import { scheduleFocus } from './client/focus.js';

/** 导航侧栏可拖动宽度边界（UI 打磨补强，§14.8 停靠侧板）：默认 160px，可拖到 120–360px。 */
export const NAV_WIDTH_MIN = 120;
export const NAV_WIDTH_MAX = 360;
export const NAV_WIDTH_DEFAULT = 160;

/** 创作台面板整体宽度边界（UI 打磨补强：拖左边缘调整面板宽度，§14.8 停靠侧板）。 */
export const PANEL_WIDTH_MIN = 480;
export const PANEL_WIDTH_MAX = 1200;
export const PANEL_WIDTH_DEFAULT = 860;

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
  /** I64 一致性审校中心（R13-5）：审校面板状态（投影/过滤/选中/审计记录）。 */
  reviewPatch(patch: Partial<ReviewLayerState>): void;
  /** I65 生成队列（R13-6）：队列面板状态（投影/范围勾选/配置草稿）。 */
  queuePatch(patch: Partial<QueueLayerState>): void;
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
  reviewState: ReviewLayerState,
  queueState: QueueLayerState,
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
    return h('div', { 'data-novel-view-panel': 'chapters' }, chaptersPanel(h, projectId, workspace, writing, chapters, ops.chapters));
  }
  // I64：一致性审校中心（写作组）—— 五类问题统一投影 + 刷新/过滤 + 显式裁决（R13-5）。
  if (activeView === 'review') {
    return h('div', { 'data-novel-view-panel': 'review' }, reviewPanel(h, projectId, reviewNamespace, reviewState, ops.review));
  }
  // I65：生成队列（写作组）—— 场景卡范围/配置 + 暂停/继续/取消 + 任务列表（R13-6）。
  if (activeView === 'queue') {
    return h('div', { 'data-novel-view-panel': 'queue' }, queuePanel(h, projectId, queueNamespace, workspace, queueState, ops.queue));
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
}

/** 面板主体：品牌头栏 + 任务分组导航 + 视图内容区（写作/策划/连续性/作品设置，I58）。 */
function workbenchView(React: ReactFace, status: WorkspaceStatus, workspace: WorkspaceNamespace | undefined, writing: WritingNamespace | undefined, reviewNamespace: ReviewNamespace | undefined, queueNamespace: QueueNamespace | undefined, ui: { open: boolean; collapsed: boolean; activeView: WorkbenchViewId; navWidth: number; navResizeStart(clientX: number): void; navResizeMove(clientX: number): void; navResizeEnd(): void; navResizeStep(delta: number): void; panelWidth: number; panelResizeStart(clientX: number): void; panelResizeMove(clientX: number): void; panelResizeEnd(): void; panelResizeStep(delta: number): void; collapse(): void; close(): void; activateView(view: WorkbenchViewId): void; selectProject(id: string): void; createProject(input: { projectId: string; name: string }): void; uploadFile(file: File): void; analyzeText(text: string): void; cancelAnalysis(): void; retryAnalysis(): void; requestBrowse(): void; cancelBrowse(): void; confirmLeave(): void; cancelLeave(): void }, layers: LayerData, ops: WorkbenchOps, chapters: ChaptersLayerState, reviewState: ReviewLayerState, queueState: QueueLayerState, selectedProjectId?: string, selectedProjectName?: string, projects: Array<{ id: string; name: string }> = [], browsing = false, leaveConfirm = false, projectError?: string, upload?: UploadProgress, uploadResult?: { sourceHash: string; fileName: string; text: string; chunks: unknown[] }, onboardingState?: OnboardingState, onboardingNamespace?: OnboardingNamespace, decideOnboarding?: (layer: OnboardingLayerId, decision: OnboardingDecision, extra?: OnboardingAdjudicationExtra) => void, applyOnboarding?: () => void, patchOnboarding?: (patch: Partial<OnboardingState>) => void, settings?: { view: LlmConfigViewShape | undefined; draft: LlmConfigDraftShape; namespace: LlmConfigNamespace | undefined; mutate(patch: Partial<LlmConfigDraftShape>): void; save(): void }, creationSettings?: { view: WorkbenchSettingsViewShape | undefined; draft: WorkbenchSettingsDraftShape; namespace: WorkbenchSettingsNamespace | undefined; mutate(patch: Partial<WorkbenchSettingsDraftShape>): void; save(): void; projectId: string | undefined; openFolder(): void }): unknown {
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
          viewPanel(h, ui.activeView, selectedProjectId, workspace, writing, reviewNamespace, queueNamespace, reviewState, queueState, layers, ops, chapters, sourceEntry, review, settings, creationSettings),
        ),
      ),
    )
    : effectiveStatus === 'ready' && (selectedProjectId === undefined || browsing)
      ? h('section', { className: 'nv-workbench__state', 'data-novel-project-chooser': '', ...(browsing ? { 'data-novel-project-browsing': '' } : {}) },
        browsing ? h('button', { type: 'button', className: 'nv-workbench__nav-item', 'data-novel-browse-cancel': '', onClick: () => ui.cancelBrowse() }, '返回当前作品') : null,
        projectError !== undefined ? h('p', { className: 'nv-workbench__project-error', 'data-novel-project-error': '', role: 'alert' }, projectError) : null,
        h('button', { type: 'button', className: 'nv-workbench__nav-item' + (ui.activeView === 'settings' ? ' is-active' : ''), 'data-novel-settings-nav': '', onClick: () => ui.activateView('settings') }, 'LLM 设置'),
        ui.activeView === 'settings'
          ? (settings !== undefined ? llmSettingsPanel(h, settings.namespace, settings.view, settings.draft, settings.mutate, settings.save) : null)
          : (projects.length === 0 ? h('div', null,
              h('p', { 'data-novel-project-empty': '' }, '尚无作品，请新建空白作品或上传 DOCX。'),
              h('button', { type: 'button', 'data-novel-project-create': '', onClick: () => ui.createProject({ projectId: 'untitled', name: '未命名作品' }) }, '新建空白作品'),
              h('label', { className: 'nv-upload', 'data-novel-upload': '' },
                h('span', { className: 'nv-upload__label', role: 'status', 'aria-live': 'polite' }, uploadStatusLabel(upload)),
                h('input', { type: 'file', accept: '.docx', 'data-novel-upload-input': '', onChange: (event: { target: { files: FileList | null } }) => { const file = event.target.files?.[0]; if (file) ui.uploadFile(file); } }),
              ),
              uploadResult ? h('p', { 'data-novel-upload-result': '', role: 'status', 'aria-live': 'polite' }, `已提取「${uploadResult.fileName}」：${uploadResult.chunks.length} 个文本块`) : null,
            )
              : h('ul', { 'data-novel-project-list': '' }, projects.map((project) => h('button', { type: 'button', onClick: () => ui.selectProject(project.id), 'data-novel-project-open': project.id }, project.name)))),
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
          selectedProjectId: undefined,
          selectedProjectName: undefined,
          browsing: false,
          leaveConfirm: false,
          projectError: undefined,
          projects: [],
          projectLoading: false,
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
          resetEditors: (d) => { d.characterEditor = freshCharacterEditor(); d.worldEditor = freshWorldEditor(); d.outlineEditor = freshOutlineEditor(); d.relationshipEditor = freshRelationshipEditor(); d.stateEditor = freshStateEditor(); d.canonEditor = freshCanonEditor(); d.chapters = freshChapters(); d.review = freshReview(); d.queue = freshQueue(); d.onboarding = undefined; d.leaveConfirm = false; },
          browseProjects: (d) => { d.browsing = true; d.projectError = undefined; d.leaveConfirm = false; },
          cancelBrowse: (d) => { d.browsing = false; d.projectError = undefined; },
          showLeaveConfirm: (d, show: boolean) => { d.leaveConfirm = show; },
          projectFailed: (d, message: string) => { d.projectError = message; d.projectLoading = false; },
          createProject: (d) => { d.projectLoading = true; },
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
          reviewPatch: (d, patch: Partial<ReviewLayerState>) => { d.review = { ...d.review, ...patch }; },
          queuePatch: (d, patch: Partial<QueueLayerState>) => { d.queue = { ...d.queue, ...patch }; },
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
              }, (cause: Error) => { release(); if (!active) return; act.chaptersScene('error', undefined, (cause as Error).message); act.sceneEditorReset(); });
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
            return {
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
            };
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
                  if (projectId !== undefined) {
                    startAnalysis(projectId, result.sourceHash, result.text);
                    return;
                  }
                  // I53 DOCX new-work entry: with no project open yet, create one
                  // from the uploaded document, open it, then drive the six-layer
                  // review (design §14.7.4; I53 goal 三入口).
                  const name = result.fileName.replace(/\.docx$/i, '') || '未命名作品';
                  createProject({ projectId: slug(name), name }, () => {
                    if (currentProjectId !== undefined) startAnalysis(currentProjectId, result.sourceHash, result.text);
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
          return workbenchView(React, s.status, workspace, writing, reviewNamespace, queueNamespace, ui, layers, makeOps(s), s.chapters, s.review, s.queue, s.selectedProjectId, s.selectedProjectName, s.projects, s.browsing, s.leaveConfirm, s.projectError, s.upload, s.uploadResult, s.onboarding, onboarding, decideLayer, applyOnboarding, patchOnboarding, {
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
          slotDisposer();
          if (remoteDisposer) void remoteDisposer();
          if (onboardingDisposer) void onboardingDisposer();
          if (analyzerDisposer) void analyzerDisposer();
          if (llmConfigDisposer) void llmConfigDisposer();
          if (workbenchSettingsDisposer) void workbenchSettingsDisposer();
          if (writingDisposer) void writingDisposer();
          if (reviewDisposer) void reviewDisposer();
          if (queueDisposer) void queueDisposer();
        };
      });
    },
  };
}
