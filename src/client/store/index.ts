import type { LayerId, WorkspaceViewModel } from '../shared.js';
import type { UploadProgress } from '../upload.js';
import type { OnboardingAnalysisState, OnboardingDecision, OnboardingLayerId, OnboardingState } from '../onboarding.js';
import type { LlmConfigDraftShape, LlmConfigViewShape } from '../settings.js';
import type { WorkbenchSettingsDraftShape, WorkbenchSettingsViewShape } from '../workbench-settings.js';
import type { WorkbenchViewId } from '../nav.js';
import { DEFAULT_VIEW, resolveWorkbenchView } from '../nav.js';
import type { CharacterEditor, CharacterShape } from '../layers/characters.js';
import type { WorldEditor, WorldShape } from '../layers/worldview.js';
import type { OutlineEditor, OutlineShape } from '../layers/outline.js';
import { emptyOutline } from '../layers/outline.js';
import type { RelationshipEditor, RelationshipShape } from '../layers/relationship.js';
import { newRelationshipDraft } from '../layers/relationship.js';
import type { StateEditor, StateSnapshotShape } from '../layers/state.js';
import type { CanonEditor, CanonEventShape } from '../layers/canon.js';
import type { ChaptersLayerState } from '../layers/chapters.js';
import { freshChapters, freshSceneEditor } from '../layers/chapters.js';
import type { BranchPanelState, CandidatePanelState, ChapterListItemShape, ChapterReadShape, SceneEditorState, SceneReadShape } from '../layers/chapters.js';
import type { ReviewLayerState } from '../layers/review.js';
import { freshReview } from '../layers/review.js';
import type { QueueLayerState } from '../layers/queue.js';
import { freshQueue } from '../layers/queue.js';
import type { KnowledgeLayerState } from '../layers/knowledge.js';
import { freshKnowledge } from '../layers/knowledge.js';
import type { RuleStyleLayerState } from '../layers/rule-style.js';
import { freshRuleStyle } from '../layers/rule-style.js';
import type { ProgressLayerState } from '../layers/progress.js';
import { freshProgress } from '../layers/progress.js';
import type { ImportExportLayerState } from '../layers/import-export.js';
import { freshImportExport } from '../layers/import-export.js';
import type { SearchLayerState } from '../layers/search.js';
import { freshSearch } from '../layers/search.js';
import type { StatisticsLayerState } from '../layers/statistics.js';
import { freshStatistics } from '../layers/statistics.js';
import type { TimelineLayerState } from '../layers/timeline.js';
import { freshTimeline } from '../layers/timeline.js';
import { freshLlmConfigDraft } from '../settings.js';
import { freshWorkbenchSettingsDraft } from '../workbench-settings.js';
import type { DefineStore, StoreHandle, WorkbenchActions, WorkbenchState } from './types.js';
import { NAV_WIDTH_DEFAULT, NAV_WIDTH_MAX, NAV_WIDTH_MIN, PANEL_WIDTH_DEFAULT, PANEL_WIDTH_MAX, PANEL_WIDTH_MIN } from './types.js';

export * from './types.js';
export type { ChaptersLayerState };

/** Fresh form state for the reactive workbench store. */
export function freshCharacterEditor(): CharacterEditor {
  return { selectedId: undefined, draft: { id: '', name: '' }, dirty: false, error: '', saving: false, saveMessage: '' };
}
export function freshWorldEditor(): WorldEditor {
  return { selectedId: undefined, draft: { id: '' }, dirty: false, error: '', saving: false, saveMessage: '' };
}
export function freshOutlineEditor(): OutlineEditor {
  return { draft: emptyOutline(), dirty: false, error: '', selectedActId: undefined, selectedBeatId: undefined, selectedDetailId: undefined, saving: false, saveMessage: '' };
}
export function freshRelationshipEditor(): RelationshipEditor {
  return { selectedId: undefined, draft: newRelationshipDraft(), dirty: false, error: '', saving: false, saveMessage: '' };
}
export function freshStateEditor(): StateEditor {
  return { selectedSeq: undefined, fromSeq: undefined, toSeq: undefined, diff: undefined, error: '' };
}
export function freshCanonEditor(): CanonEditor {
  return { selectedId: undefined, proposalId: undefined, draft: { storyTime: '', summary: '', detail: '' }, dirty: false, error: '', saving: false, saveMessage: '' };
}

/**
 * I82 创作台 store 单一来源（架构审查 §5.1 / §9 #5）：`freshWorkbenchState` 是
 * defineStore `init` 的新鲜快照工厂；`createWorkbenchStore` 持完整 actions 表
 * （immer-draft 变换，全部经 store 持久化，render 层只消费快照）。actions 与
 * fresh 状态从 client.ts 迁入本模块后，client.ts 只保留渲染与 Remote 生命周期。
 */
export function freshWorkbenchState(): WorkbenchState {
  return {
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
    timeline: freshTimeline(),
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
  };
}

/**
 * Store 工厂：把新鲜快照 + actions 表交给 DSH `defineStore`（React-free 引擎）。
 * 返回的 `StoreHandle<WorkbenchState, WorkbenchActions>` 由 slot 注册的
 * `store:` 工厂持有；renderer 的 `useStore` 与 `inject` 的 baked actions 均出自
 * 同一实例（I46–I49 缺陷修复：任何写都经 action，避免 let 突变使 UI 过期）。
 */
export function createWorkbenchStore(defineStore: DefineStore) {
  return defineStore({
    init: freshWorkbenchState,
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
      resetEditors: (d) => { d.characterEditor = freshCharacterEditor(); d.worldEditor = freshWorldEditor(); d.outlineEditor = freshOutlineEditor(); d.relationshipEditor = freshRelationshipEditor(); d.stateEditor = freshStateEditor(); d.canonEditor = freshCanonEditor(); d.chapters = freshChapters(); d.review = freshReview(); d.queue = freshQueue(); d.knowledge = freshKnowledge(); d.ruleStyle = freshRuleStyle(); d.progress = freshProgress(); d.importExport = freshImportExport(); d.search = freshSearch(); d.statistics = freshStatistics(); d.timeline = freshTimeline(); d.onboarding = undefined; d.leaveConfirm = false; },
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
      timelinePatch: (d, patch: Partial<TimelineLayerState>) => { d.timeline = { ...d.timeline, ...patch }; },
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
}
