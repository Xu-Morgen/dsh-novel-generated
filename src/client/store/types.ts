import type { LayerId, WorkspaceNamespace, WorkspaceStatus, WorkspaceViewModel, WritingNamespace, ReviewNamespace, ReviewRepairNamespace, QueueNamespace, KnowledgeNamespace, RuleStyleNamespace, ProgressNamespace, ImportExportNamespace, BranchNamespace, SearchNamespace, StatisticsNamespace, TimelineNamespace, SceneOutlineBindingNamespace, TextMutationNamespace, TextDeletionNamespace, OutlineReconciliationNamespace, ReferenceAuditNamespace, ReferenceCorrectionNamespace, LongDraftNamespace, OutlineDetailGenerationNamespace } from '../shared.js';
import type { UploadProgress } from '../upload.js';
import type { OnboardingAdjudicationExtra, OnboardingAnalysisState, OnboardingDecision, OnboardingLayerId, OnboardingNamespace, OnboardingState } from '../onboarding.js';
import type { LlmConfigDraftShape, LlmConfigNamespace, LlmConfigViewShape } from '../settings.js';
import type { WorkbenchSettingsDraftShape, WorkbenchSettingsNamespace, WorkbenchSettingsViewShape } from '../workbench-settings.js';
import type { WorkbenchViewId } from '../nav.js';
import { RESPONSIVE_BREAKPOINT_NAV } from '../styles.js';
import type { CharacterEditOps, CharacterEditor, CharacterLayerState, CharacterShape } from '../layers/characters.js';
import type { WorldEditOps, WorldEditor, WorldLayerState, WorldShape } from '../layers/worldview.js';
import type { OutlineEditOps, OutlineEditor, OutlineLayerState, OutlineShape } from '../layers/outline.js';
import type { RelationshipEditOps, RelationshipEditor, RelationshipLayerState, RelationshipShape } from '../layers/relationship.js';
import type { StateEditOps, StateEditor, StateLayerState, StateSnapshotShape } from '../layers/state.js';
import type { CanonEditOps, CanonEditor, CanonEventShape, CanonLayerState } from '../layers/canon.js';
import type { BranchPanelState, CandidatePanelState, ChaptersEditOps, ChaptersLayerState, ChapterListItemShape, ChapterReadShape, SceneEditorState, SceneReadShape, ChapterManagementState, ChaptersMode } from '../layers/chapters.js';
import type { WritingWorkflowState } from '../writing-workflow.js';
import type { PolishSessionState } from '../polish-session.js';
import type { ReviewEditOps, ReviewLayerState } from '../layers/review.js';
import type { QueueEditOps, QueueLayerState } from '../layers/queue.js';
import type { KnowledgeEditOps, KnowledgeLayerState } from '../layers/knowledge.js';
import type { RuleStyleEditOps, RuleStyleLayerState } from '../layers/rule-style.js';
import type { ProgressEditOps, ProgressLayerState } from '../layers/progress.js';
import type { ImportExportEditOps, ImportExportLayerState } from '../layers/import-export.js';
import type { SearchEditOps, SearchLayerState } from '../layers/search.js';
import type { StatisticsEditOps, StatisticsLayerState } from '../layers/statistics.js';
import type { TimelineEditOps, TimelineLayerState } from '../layers/timeline.js';
import type { ReferenceReviewEditOps, ReferenceReviewLayerState } from '../layers/reference-review.js';
import type { RouterEditOps, RouterState } from '../router.js';
import type { OutlineDetailGenerationEditOps, OutlineDetailGenerationLayerState } from '../layers/outline-detail-generation.js';

/**
 * I82 创作台 Client store 契约层（架构审查 §5.1 / §9 #5 拆分：store/types.ts 承载
 * 全部 store 接口与契约常量；fresh 状态与 actions 表在 index.ts；逐层编辑动作在
 * ../ops/）。WorkbenchActions / WorkbenchState / ProjectSessionActions 三接口在此
 * 单一来源声明（ProjectSessionActions 由 WorkbenchActions Pick 派生，不再手写
 * 重复方法签名）。
 */

/** UI 打磨：侧栏/面板宽度常量（可拖动布局的钳制范围与默认值）。 */
export const NAV_WIDTH_MIN = 120;
export const NAV_WIDTH_MAX = 360;
export const NAV_WIDTH_DEFAULT = 160;
export const PANEL_WIDTH_MIN = 640;
export const PANEL_WIDTH_MAX = 1600;
export const PANEL_WIDTH_DEFAULT = 860;
export const PANEL_NAV_AUTO_COLLAPSE = RESPONSIVE_BREAKPOINT_NAV;
/** 拖拽键盘步进（px）。 */
export const GRID_STEP = 8;

/**
 * The store is created with the DSH `defineStore` contract supplied by the
 * client runtime (the same React-free engine the official UI plugins use).
 * `spec` carries `init` (fresh state per instance) and an `actions` table of
 * immer-draft transforms; `create(scopeKey)` returns a bare
 * `{ getSnapshot, subscribe, actions }` instance. The renderer binds `useStore`
 * from this instance and hands baked `actions` to the component.
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
  /** I107：仅在同一导航世代内接收候选异步结果，避免切场景后旧响应回填。 */
  chaptersCandidateForRevision(patch: Partial<CandidatePanelState>, navigationRevision: number): void;
  /** I121：共享写作循环状态只接受当前导航世代的异步结果。 */
  chaptersWorkflow(patch: Partial<WritingWorkflowState>): void;
  chaptersWorkflowForRevision(patch: Partial<WritingWorkflowState>, navigationRevision: number): void;
  /** I122：章节润色会话只属于当前 Client Fiber，异步结果按导航世代接收。 */
  chaptersPolish(state: PolishSessionState): void;
  chaptersPolishForRevision(state: PolishSessionState, navigationRevision: number): void;
  chaptersPolishReset(): void;
  /** I70 版本/分支面板（R14-5）：版本列表/存档草稿/对比视图状态合并。 */
  chaptersBranches(patch: Partial<BranchPanelState>): void;
  /** I107：章节区唯一可见操作模式。 */
  chaptersMode(mode: ChaptersMode): void;
  /** I106：章节 CRUD/绑定/删除仅保存交互态；领域结果由 Host 重读回填。 */
  chaptersManagement(patch: Partial<ChapterManagementState>): void;
  /** I64 一致性审校中心（R13-5）：审校面板状态（投影/过滤/选中/审计记录）。 */
  reviewPatch(patch: Partial<ReviewLayerState>): void;
  /** I117 引用更新审查：Host audit 只读投影 + 当前会话错误标记。 */
  referenceReviewPatch(patch: Partial<ReferenceReviewLayerState>): void;
  /** I134：范围候选是 Client 审阅态；叙事层写回仍只能经 Host I11 Gate。 */
  outlineDetailGenerationPatch(patch: Partial<OutlineDetailGenerationLayerState>): void;
  outlineDetailGenerationReset(): void;
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
  /** I124：路由错误/当前与返回栈均为 Client 瞬态，不落作品文件。 */
  routerPatch(patch: Partial<RouterState>): void;
  /** I72：写作进度面板状态合并（R14-7）。 */
  statisticsPatch(patch: Partial<StatisticsLayerState>): void;
  /** 方案 A：剧情时间线面板状态合并（design §8 相关角色对）。 */
  timelinePatch(patch: Partial<TimelineLayerState>): void;
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

/**
 * I82 接口收敛（架构审查 §5.1）：reloadProject 所需的装载动作子集由
 * WorkbenchActions Pick 派生，不再手写重复方法签名（三接口重复声明归零）。
 */
export type ProjectSessionActions = Pick<
  WorkbenchActions,
  | 'setCharacters'
  | 'setWorldview'
  | 'setOutline'
  | 'setRelationship'
  | 'setState'
  | 'setCanon'
  | 'setChapters'
  | 'outlineDraft'
  | 'stateDraft'
>;

/** I47/I48/I49 数据层：各领域列表与表单态在面板装载后维护，供真表单渲染。 */
export interface LayerData {
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
export interface WorkbenchOps {
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
  /** 方案 A：剧情时间线面板（刷新/自建/节点选择/编辑/手动设当前/保存）。 */
  readonly timeline: TimelineEditOps;
  /** I117：引用更新审查（只读 audit + 本地错误标记）。 */
  readonly referenceReview: ReferenceReviewEditOps;
  /** I124：统一 EntityLink 前进/返回路由；Search 等来源不得各自导航。 */
  readonly router: RouterEditOps;
  readonly outlineDetailGeneration: OutlineDetailGenerationEditOps;
}

/** 创作台全部领域状态（store 单一快照形状；render 层只消费，不经 actions 不写）。 */
export interface WorkbenchState {
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
  /** I117：引用更新审查状态；不承载任何叙事层写入。 */
  referenceReview: ReferenceReviewLayerState;
  /** I124：瞬态来源上下文与返回栈；不进入任何领域/作品文件。 */
  router: RouterState;
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
  /** 方案 A：剧情时间线面板状态（timeline 文档/选中节点/编辑脏标记，design §8 相关角色对）。 */
  timeline: TimelineLayerState;
  /** I134：范围细纲候选审阅态，不是 B5 真相。 */
  outlineDetailGeneration: OutlineDetailGenerationLayerState;
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

/**
 * I82 视图分发形参收敛（架构审查 §5.1）：13 个 Remote namespace 打包为一个对象，
 * 供 viewPanel/workbenchView 消费（原先逐个平铺 13 个形参）。
 */
export interface WorkbenchNamespaces {
  workspace: WorkspaceNamespace | undefined;
  writing: WritingNamespace | undefined;
  reviewNamespace: ReviewNamespace | undefined;
  reviewRepairNamespace: ReviewRepairNamespace | undefined;
  queueNamespace: QueueNamespace | undefined;
  knowledgeNamespace: KnowledgeNamespace | undefined;
  ruleStyleNamespace: RuleStyleNamespace | undefined;
  progressNamespace: ProgressNamespace | undefined;
  importExportNamespace: ImportExportNamespace | undefined;
  branchNamespace: BranchNamespace | undefined;
  searchNamespace: SearchNamespace | undefined;
  statisticsNamespace: StatisticsNamespace | undefined;
  timelineNamespace: TimelineNamespace | undefined;
  referenceAuditNamespace: ReferenceAuditNamespace | undefined;
  referenceCorrectionNamespace: ReferenceCorrectionNamespace | undefined;
  sceneOutlineBinding: SceneOutlineBindingNamespace | undefined;
  textMutation: TextMutationNamespace | undefined;
  textDeletion: TextDeletionNamespace | undefined;
  outlineReconciliation: OutlineReconciliationNamespace | undefined;
  onboardingNamespace: OnboardingNamespace | undefined;
  longDraft: LongDraftNamespace | undefined;
  outlineDetailGeneration: OutlineDetailGenerationNamespace | undefined;
}

/** I82 视图分发形参收敛：各面板 state + 层数据打包为一个对象。 */
export interface WorkbenchViewStates {
  layers: LayerData;
  chapters: ChaptersLayerState;
  review: ReviewLayerState;
  referenceReview: ReferenceReviewLayerState;
  queue: QueueLayerState;
  knowledge: KnowledgeLayerState;
  ruleStyle: RuleStyleLayerState;
  progress: ProgressLayerState;
  importExport: ImportExportLayerState;
  search: SearchLayerState;
  statistics: StatisticsLayerState;
  timeline: TimelineLayerState;
  outlineDetailGeneration: OutlineDetailGenerationLayerState;
  router: RouterState;
}
