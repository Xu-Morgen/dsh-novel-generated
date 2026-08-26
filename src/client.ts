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
  LAYERS,
  characterText,
  el as createElement,
  listField,
  slug,
  unwrap,
  workspaceRemoteContribution,
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
import { freshCanonEditor, freshCharacterEditor, freshOutlineEditor, freshRelationshipEditor, freshStateEditor, freshWorldEditor } from './client/store.js';
import { reloadProject, type ProjectOpenLayers } from './client/project-session.js';
import { uploadDocx, type UploadProgress } from './client/upload.js';
import { analysisPanel, ANALYSIS_POLL_INTERVAL_MS, analysisResult, applyAccepted, beginAnalysis, onboardingReview, ONBOARDING_LAYERS, adjudicateOne, type OnboardingAdjudicationExtra, type OnboardingAnalysisState, type OnboardingAnalyzerNamespace, type OnboardingDecision, type OnboardingLayerId, type OnboardingNamespace, type OnboardingState } from './client/onboarding.js';
import { onboardingRemoteContribution, onboardingAnalyzerRemoteContribution } from './client/onboarding.js';
import { freshLlmConfigDraft, llmSettingsPanel, llmConfigRemoteContribution, type LlmConfigDraftShape, type LlmConfigNamespace, type LlmConfigViewShape } from './client/settings.js';
import { freshWorkbenchSettingsDraft, workbenchSettingsPanel, workbenchSettingsRemoteContribution, type WorkbenchSettingsDraftShape, type WorkbenchSettingsNamespace, type WorkbenchSettingsViewShape } from './client/workbench-settings.js';
import { WORKBENCH_STYLES } from './client/styles.js';

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
  activate(id: string): void;
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

/** 品牌头栏：砚台朱砂标记 + 衬线标题 + 折叠/关闭。 */
function brandHeader(h: El, subtitle: string | undefined, ui: { collapsed: boolean; collapse(): void; close(): void }): unknown {
  return h('header', { className: 'nv-workbench__brand', 'data-novel-brand': '' },
    h('span', { className: 'nv-workbench__mark', 'aria-hidden': 'true' }, '砚'),
    h('div', null,
      h('h2', { className: 'nv-workbench__title' }, '创作台'),
      subtitle === undefined ? null : h('span', { className: 'nv-workbench__subtitle' }, subtitle),
    ),
    h('button', { type: 'button', className: 'nv-workbench__toggle', 'aria-expanded': String(!ui.collapsed), onClick: () => ui.collapse() }, ui.collapsed ? '展开' : '折叠'),
    h('button', { type: 'button', className: 'nv-workbench__close', 'aria-label': '关闭创作台', onClick: () => ui.close() }, '关闭'),
  );
}

/** 左侧层级导航：六层一桌 + 六层初始化审阅 + 创作设置 + LLM 设置页，激活项打朱砂。 */
function layerNav(h: El, activeLayer: LayerId, activate: (id: LayerId) => void, showOnboarding: boolean, activateOnboarding: () => void, showCreationSettings: boolean, activateCreationSettings: () => void, showSettings: boolean, toggleSettings: () => void): unknown {
  return h('nav', { className: 'nv-workbench__nav', 'data-novel-nav': '', 'aria-label': '创作台层级' },
    LAYERS.map((layer) => h('button', {
      key: layer.id,
      type: 'button',
      className: 'nv-workbench__nav-item' + (activeLayer === layer.id && !showOnboarding ? ' is-active' : ''),
      'data-novel-layer': layer.id,
      'aria-current': activeLayer === layer.id && !showOnboarding ? 'page' : undefined,
      onClick: () => activate(layer.id),
    }, layer.label)),
    h('button', {
      key: '__onboarding__',
      type: 'button',
      className: 'nv-workbench__nav-item' + (showOnboarding ? ' is-active' : ''),
      'data-novel-onboarding-nav': '',
      'aria-current': showOnboarding ? 'page' : undefined,
      onClick: () => activateOnboarding(),
    }, '六层初始化审阅'),
    h('button', {
      key: '__creation-settings__',
      type: 'button',
      className: 'nv-workbench__nav-item' + (showCreationSettings ? ' is-active' : ''),
      'data-novel-workbench-settings-nav': '',
      'aria-current': showCreationSettings ? 'page' : undefined,
      onClick: () => activateCreationSettings(),
    }, '创作设置'),
    h('button', {
      key: '__settings__',
      type: 'button',
      className: 'nv-workbench__nav-item' + (showSettings ? ' is-active' : ''),
      'data-novel-settings-nav': '',
      'aria-current': showSettings ? 'page' : undefined,
      onClick: () => toggleSettings(),
    }, 'LLM 设置'),
  );
}

/** I55 脏表单检测：任一编辑层存在未保存草案即需在切换离开前裁决（§14.8 / R12-2）。 */
function hasDirtyDrafts(snapshot: { characterEditor: { dirty: boolean }; worldEditor: { dirty: boolean }; outlineEditor: { dirty: boolean }; relationshipEditor: { dirty: boolean }; canonEditor: { dirty: boolean } }): boolean {
  return snapshot.characterEditor.dirty || snapshot.worldEditor.dirty || snapshot.outlineEditor.dirty || snapshot.relationshipEditor.dirty || snapshot.canonEditor.dirty;
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
}

/** 面板主体：品牌头栏 + 层级导航 + 内容区（六层 / 六层初始化审阅 / 创作设置 / LLM 设置页）。 */
function workbenchView(React: ReactFace, status: WorkspaceStatus, workspace: WorkspaceNamespace | undefined, ui: { open: boolean; collapsed: boolean; activeLayer: LayerId; showSettings: boolean; onboardingTab: boolean; creationSettingsTab: boolean; collapse(): void; close(): void; activate(id: LayerId): void; activateOnboarding(): void; activateCreationSettings(): void; toggleSettings(): void; selectProject(id: string): void; createProject(input: { projectId: string; name: string }): void; uploadFile(file: File): void; analyzeText(text: string): void; cancelAnalysis(): void; retryAnalysis(): void; requestBrowse(): void; cancelBrowse(): void; confirmLeave(): void; cancelLeave(): void }, layers: LayerData, ops: WorkbenchOps, selectedProjectId?: string, selectedProjectName?: string, projects: Array<{ id: string; name: string }> = [], browsing = false, leaveConfirm = false, projectError?: string, upload?: UploadProgress, uploadResult?: { sourceHash: string; fileName: string; text: string; chunks: unknown[] }, onboardingState?: OnboardingState, onboardingNamespace?: OnboardingNamespace, decideOnboarding?: (layer: OnboardingLayerId, decision: OnboardingDecision, extra?: OnboardingAdjudicationExtra) => void, applyOnboarding?: () => void, patchOnboarding?: (patch: Partial<OnboardingState>) => void, settings?: { view: LlmConfigViewShape | undefined; draft: LlmConfigDraftShape; namespace: LlmConfigNamespace | undefined; mutate(patch: Partial<LlmConfigDraftShape>): void; save(): void }, creationSettings?: { view: WorkbenchSettingsViewShape | undefined; draft: WorkbenchSettingsDraftShape; namespace: WorkbenchSettingsNamespace | undefined; mutate(patch: Partial<WorkbenchSettingsDraftShape>): void; save(): void; projectId: string | undefined; openFolder(): void }): unknown {
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
      h('span', { className: 'nv-upload__label' }, uploadStatusLabel(upload)),
      h('input', { type: 'file', accept: '.docx', 'data-novel-upload-input': '', onChange: (event: { target: { files: FileList | null } }) => { const file = event.target.files?.[0]; if (file) ui.uploadFile(file); } }),
    ),
    uploadResult ? h('p', { 'data-novel-upload-result': '' }, `已提取「${uploadResult.fileName}」：${uploadResult.chunks.length} 个文本块`) : null,
  );
  const review = onboardingState === undefined ? null : onboardingReview(h, onboardingNamespace, onboardingState, patchOnboarding ?? (() => {}), decideOnboarding ?? (() => {}), applyOnboarding ?? (() => {}));
  const body = effectiveStatus === 'ready' && selectedProjectId !== undefined && !browsing
    ? h('div', { className: 'nv-workbench__body', 'data-novel-project-open': selectedProjectId },
      projectContextBar(h, selectedProjectName ?? selectedProjectId, ui.requestBrowse, leaveConfirm, ui.confirmLeave, ui.cancelLeave),
      h('div', { className: 'nv-workbench__body-row' },
        layerNav(h, ui.activeLayer, ui.activate, ui.onboardingTab, ui.activateOnboarding, ui.creationSettingsTab, ui.activateCreationSettings, ui.showSettings, () => ui.toggleSettings()),
        h('div', { className: 'nv-workbench__main' },
          // 四个互斥页签：LLM 设置 / 创作设置 / 六层初始化审阅（原文入口+审阅）/ 六层编辑。
          ui.showSettings
            ? (settings !== undefined ? llmSettingsPanel(h, settings.namespace, settings.view, settings.draft, settings.mutate, settings.save) : null)
            : ui.creationSettingsTab
              ? (creationSettings !== undefined ? workbenchSettingsPanel(h, creationSettings.namespace, creationSettings.draft, creationSettings.mutate, creationSettings.save, creationSettings.projectId, creationSettings.openFolder) : null)
              : ui.onboardingTab
                ? h('div', { className: 'nv-onboarding-stack', 'data-novel-onboarding-tab': '' }, sourceEntry, review)
                : contentArea(h, selectedProjectId, workspace!, ui.activeLayer, layers, ops),
        ),
      ),
    )
    : effectiveStatus === 'ready' && (selectedProjectId === undefined || browsing)
      ? h('section', { className: 'nv-workbench__state', 'data-novel-project-chooser': '', ...(browsing ? { 'data-novel-project-browsing': '' } : {}) },
        browsing ? h('button', { type: 'button', className: 'nv-workbench__nav-item', 'data-novel-browse-cancel': '', onClick: () => ui.cancelBrowse() }, '返回当前作品') : null,
        projectError !== undefined ? h('p', { className: 'nv-workbench__project-error', 'data-novel-project-error': '', role: 'alert' }, projectError) : null,
        h('button', { type: 'button', className: 'nv-workbench__nav-item' + (ui.showSettings ? ' is-active' : ''), 'data-novel-settings-nav': '', onClick: () => ui.toggleSettings() }, 'LLM 设置'),
        ui.showSettings
          ? (settings !== undefined ? llmSettingsPanel(h, settings.namespace, settings.view, settings.draft, settings.mutate, settings.save) : null)
          : (projects.length === 0 ? h('div', null,
              h('p', { 'data-novel-project-empty': '' }, '尚无作品，请新建空白作品或上传 DOCX。'),
              h('button', { type: 'button', 'data-novel-project-create': '', onClick: () => ui.createProject({ projectId: 'untitled', name: '未命名作品' }) }, '新建空白作品'),
              h('label', { className: 'nv-upload', 'data-novel-upload': '' },
                h('span', { className: 'nv-upload__label' }, uploadStatusLabel(upload)),
                h('input', { type: 'file', accept: '.docx', 'data-novel-upload-input': '', onChange: (event: { target: { files: FileList | null } }) => { const file = event.target.files?.[0]; if (file) ui.uploadFile(file); } }),
              ),
              uploadResult ? h('p', { 'data-novel-upload-result': '' }, `已提取「${uploadResult.fileName}」：${uploadResult.chunks.length} 个文本块`) : null,
            )
              : h('ul', { 'data-novel-project-list': '' }, projects.map((project) => h('button', { type: 'button', onClick: () => ui.selectProject(project.id), 'data-novel-project-open': project.id }, project.name)))),
      )
    : h('section', {
      className: 'nv-workbench__state' + (effectiveStatus === 'error' ? ' nv-workbench__state--error' : ''),
      'data-novel-workspace-state': effectiveStatus,
      role: effectiveStatus === 'error' ? 'alert' : undefined,
    }, effectiveStatus === 'loading' ? '正在装载创作台…' : message);
  return h('section', { className: 'nv-workbench', 'data-novel-workspace': effectiveStatus, 'data-novel-project-open': selectedProjectId },
    brandHeader(h, subtitle, { collapsed: ui.collapsed, collapse: ui.collapse, close: ui.close }),
    ui.collapsed ? null : body,
  );
}

/** 侧栏启动入口（D11）：可发现的「创作台」按钮，点击后（重新）打开 overlay 面板。 */
function launchButton(React: ReactFace, launch: () => void): unknown {
  const h = el(React);
  return h('button', {
    type: 'button',
    className: 'nv-launch',
    'data-novel-launch': '',
    onClick: () => launch(),
  }, '创作台');
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
  activeLayer: LayerId;
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
  showSettings: boolean;
  /** 六层初始化审阅是否为当前激活页签（独立边栏，设计 §14.7.4）。 */
  showOnboarding: boolean;
  /** 创作设置（目标字数/询问开关）是否为当前激活页签。 */
  showCreationSettings: boolean;
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
      let currentProjectId: string | undefined;
      let active = true;
      let remoteDisposer: TypertDisposer | undefined;
      let onboardingDisposer: TypertDisposer | undefined;
      let analyzerDisposer: TypertDisposer | undefined;
      let llmConfigDisposer: TypertDisposer | undefined;
      let workbenchSettingsDisposer: TypertDisposer | undefined;

      // The store is the wiring hub: actions write it; the component subscribes
      // via useStore and re-renders. Every load result and every editor draft
      // mutation flows through an action, so no plain `let` mutation can leave
      // the UI stale (the I46–I49 defect this fixes).
      const storeHandle = defineStore({
        init: (): WorkbenchState => ({
          open: true,
          collapsed: false,
          activeLayer: 'characters',
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
          showSettings: false,
          showOnboarding: false,
          showCreationSettings: false,
          settingsView: undefined,
          settingsDraft: freshLlmConfigDraft(),
          creationSettingsView: undefined,
          creationSettingsDraft: freshWorkbenchSettingsDraft(),
        }),
        actions: {
          open: (d) => { d.open = true; d.collapsed = false; },
          close: (d) => { d.open = false; },
          collapse: (d) => { d.collapsed = !d.collapsed; },
          activate: (d, id: LayerId) => { d.activeLayer = id; d.showSettings = false; d.showOnboarding = false; d.showCreationSettings = false; },
          activateOnboarding: (d) => { d.showOnboarding = true; d.showSettings = false; d.showCreationSettings = false; },
          activateCreationSettings: (d) => { d.showCreationSettings = true; d.showSettings = false; d.showOnboarding = false; },
          ready: (d, model: WorkspaceViewModel) => { d.status = { status: 'ready', model }; },
          fail: (d, message: string) => { d.status = { status: 'error', message }; },
          setProjects: (d, list: unknown[]) => { d.projects = list as Array<{ id: string; name: string }>; d.projectLoading = false; },
          selectProject: (d, projectId: string, name?: string) => { d.selectedProjectId = projectId; d.selectedProjectName = name ?? d.selectedProjectName; d.browsing = false; d.leaveConfirm = false; d.projectError = undefined; d.projectLoading = false; },
          resetEditors: (d) => { d.characterEditor = freshCharacterEditor(); d.worldEditor = freshWorldEditor(); d.outlineEditor = freshOutlineEditor(); d.relationshipEditor = freshRelationshipEditor(); d.stateEditor = freshStateEditor(); d.canonEditor = freshCanonEditor(); d.onboarding = undefined; d.leaveConfirm = false; },
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
          characterDraft: (d, patch: Partial<CharacterEditor>) => { Object.assign(d.characterEditor, patch); },
          worldDraft: (d, patch: Partial<WorldEditor>) => { Object.assign(d.worldEditor, patch); },
          outlineDraft: (d, patch: Partial<OutlineEditor>) => { Object.assign(d.outlineEditor, patch); },
          relationshipDraft: (d, patch: Partial<RelationshipEditor>) => { Object.assign(d.relationshipEditor, patch); },
          stateDraft: (d, patch: Partial<StateEditor>) => { Object.assign(d.stateEditor, patch); },
          canonDraft: (d, patch: Partial<CanonEditor>) => { Object.assign(d.canonEditor, patch); },
          // Mutator actions: apply an update function to the LIVE draft (immer
          // semantics) so consecutive edits in one tick never read a stale render
          // snapshot — the root of the "unresponsive UI" defect.
          characterMutate: (d, update: (draft: CharacterShape) => CharacterShape) => { d.characterEditor.draft = update(d.characterEditor.draft); d.characterEditor.dirty = true; },
          worldMutate: (d, update: (draft: WorldShape) => WorldShape) => { d.worldEditor.draft = update(d.worldEditor.draft); d.worldEditor.dirty = true; },
          outlineMutate: (d, update: (draft: OutlineShape) => OutlineShape) => { d.outlineEditor.draft = update(d.outlineEditor.draft); d.outlineEditor.dirty = true; },
          relationshipMutate: (d, update: (draft: RelationshipShape) => RelationshipShape) => { d.relationshipEditor.draft = update(d.relationshipEditor.draft); d.relationshipEditor.dirty = true; },
          toggleSettings: (d) => { d.showSettings = !d.showSettings; d.showOnboarding = false; d.showCreationSettings = false; },
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
        void unwrap(target.projectOpen(projectId)).then((result) => {
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
        }, (cause: Error) => dispatch((actions) => actions.projectFailed(`作品打开失败：${cause?.message ?? '未知错误'}`)));
      };
      const createProject = (input: { projectId: string; name: string }, onOpened?: () => void): void => {
        const target = workspace;
        if (!active || target === undefined) return;
        dispatch((actions) => actions.createProject(input));
        void unwrap(target.projectCreate(input)).then((project) => {
          if (!active) return;
          dispatch((actions) => actions.setProjects([project]));
          openProject((project as { id: string }).id, onOpened);
        }, () => dispatch((actions) => actions.fail('作品创建失败')));
      };
      // I55：返回作品列表（切换入口）。脏表单裁决由组件层 `requestBrowse` 先行完成，
      // 这里只切换为列表视图并刷新作品列表，不丢当前作品（browseProjects 保留 selectedProjectId）。
      const browseToProjects = (): void => {
        dispatch((actions) => actions.browseProjects());
        const target = workspace;
        if (target !== undefined) {
          void unwrap(target.projectList()).then(
            (projects) => { if (active) dispatch((actions) => actions.setProjects(projects as unknown[])); },
            () => undefined, // 列表刷新失败不 brick：保留既有列表，切换本身非破坏性。
          );
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
        dispatch((actions) => actions.onboardingDecision(layer, decision));
        void adjudicateOne(target, state, layer, decision, extra).then(() => {
          if (!active) return;
          // 裁决成功即关闭该层打开的裁决面板（草稿保留，可再次编辑）。
          patchOnboarding({ openPanel: { ...(currentOnboarding?.openPanel ?? {}), [layer]: undefined } });
        }, (cause: Error) => dispatch((actions) => actions.onboardingError((cause as Error).message)));
      };
      // I57 (R12-4): final apply 成功后刷新六层并激活创作台；partial-retryable
      // 只重试未完成层 —— 重试按钮直接再次调用 finalApply，Host 侧按领域身份
      // 幂等（已应用层不重复写，见 I53 验收「重复 apply 语义幂等」）。
      const applyOnboarding = (): void => {
        const target = onboarding;
        const state = currentOnboarding;
        if (!active || target === undefined || !state) return;
        void applyAccepted(target, state).then((result) => {
          if (!active) return;
          if (result.blockedLayers.length === 0 && result.pendingLayers.length === 0 && !result.retryable) {
            // 成功：离开审阅页签，经 Host projectOpen 复核并刷新六层（成功刷新六层）。
            setOnboarding(undefined);
            openProject(state.projectId);
            dispatch((actions) => actions.activate('characters'));
            return;
          }
          dispatch((actions) => actions.onboardingApplyResult(result));
        }, (cause: Error) => dispatch((actions) => actions.onboardingError((cause as Error).message)));
      };

      // Edit-op closures: derive from the current store snapshot and write back
      // via actions. `makeOps` runs at render time, after `inject` has captured
      // the renderer's baked actions, so `capturedActions` resolves safely.
      const makeOps = (snapshot: WorkbenchState): WorkbenchOps => {
        const act = capturedActions as WorkbenchActions;
        const projectId = currentProjectId;
        return {
          characters: {
            select: (character) => act.characterDraft({ selectedId: character.id, draft: { ...character }, dirty: false, error: '' }),
            newDraft: () => { const draft: CharacterShape = { id: '', name: '', kind: 'extra', aliases: [], personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }; act.characterDraft({ selectedId: undefined, draft, dirty: false, error: '' }); },
            mutate: (update) => act.characterMutate(update),
            save: () => {
              const e = snapshot.characterEditor;
              if (!workspace || projectId === undefined) { act.characterDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.draft.name.trim() === '') { act.characterDraft({ error: '角色名不能为空' }); return; }
              const effectiveId = e.selectedId ?? slug(e.draft.name);
              if (e.selectedId === undefined) {
                void unwrap(workspace.characterCreate(projectId, buildCharacterCreateInput({ ...e.draft, id: effectiveId }))).then((created) => { if (!active) return; act.characterDraft({ draft: created as CharacterShape, selectedId: (created as CharacterShape).id, dirty: false, error: '' }); act.setCharacters('loading', []); void unwrap(workspace!.characterList(projectId)).then((list) => act.setCharacters('ready', list as unknown[]), (cause: Error) => { act.setCharacters('error', [], cause.message); act.characterDraft({ error: cause.message }); }); }, (cause: Error) => act.characterDraft({ error: cause.message }));
              } else {
                void unwrap(workspace.characterUpdate(projectId, e.selectedId, buildCharacterCreateInput({ ...e.draft, id: e.selectedId }))).then((updated) => { if (!active) return; act.characterDraft({ draft: { ...(updated as CharacterShape) }, dirty: false, error: '' }); act.setCharacters('loading', []); void unwrap(workspace!.characterList(projectId)).then((list) => act.setCharacters('ready', list as unknown[]), (cause: Error) => { act.setCharacters('error', [], cause.message); act.characterDraft({ error: cause.message }); }); }, (cause: Error) => act.characterDraft({ error: cause.message }));
              }
            },
          },
          worldview: {
            select: (entry) => act.worldDraft({ selectedId: entry.id, draft: { ...entry }, dirty: false, error: '' }),
            newDraft: () => { const draft: WorldShape = { id: '', kind: 'concept', title: '', content: '', keywords: [], triggerMode: 'constant', weight: 0, parent: null, mutable: true, status: 'active', supersededBy: null }; act.worldDraft({ selectedId: undefined, draft, dirty: false, error: '' }); },
            mutate: (update) => act.worldMutate(update),
            save: () => {
              const e = snapshot.worldEditor;
              if (!workspace || projectId === undefined) { act.worldDraft({ error: '创作台远程服务不可用' }); return; }
              if ((e.draft.title ?? '').trim() === '') { act.worldDraft({ error: '标题不能为空' }); return; }
              if (e.selectedId === undefined) {
                const effectiveId = slug(e.draft.title ?? 'untitled');
                void unwrap(workspace.worldviewCreate(projectId, buildWorldviewInput({ ...e.draft, id: effectiveId }))).then((created) => { if (!active) return; act.worldDraft({ draft: created as WorldShape, selectedId: (created as WorldShape).id, dirty: false, error: '' }); void unwrap(workspace!.worldviewList(projectId)).then((list) => act.setWorldview('ready', list as unknown[]), (cause: Error) => { act.setWorldview('error', [], cause.message); act.worldDraft({ error: cause.message }); }); }, (cause: Error) => act.worldDraft({ error: cause.message }));
              } else {
                const replacementId = slug(e.draft.title ?? e.selectedId);
                void unwrap(workspace.worldviewRewrite(projectId, e.selectedId, buildWorldviewInput({ ...e.draft, id: replacementId }))).then((result) => { if (!active) return; const replacement = (result as { replacement: WorldShape }).replacement; act.worldDraft({ draft: replacement, selectedId: replacement.id, dirty: false, error: '' }); void unwrap(workspace!.worldviewList(projectId)).then((list) => act.setWorldview('ready', list as unknown[]), (cause: Error) => { act.setWorldview('error', [], cause.message); act.worldDraft({ error: cause.message }); }); }, (cause: Error) => act.worldDraft({ error: cause.message }));
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
              if (!workspace || projectId === undefined) { act.outlineDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.draft.logline.trim() === '') { act.outlineDraft({ error: '一句话梗概（logline）不能为空' }); return; }
              void unwrap(workspace.outlineSave(projectId, buildOutlineInput(e.draft))).then((saved) => { if (!active) return; const outline = saved as OutlineShape; act.outlineDraft({ draft: { ...outline }, dirty: false, error: '' }); act.setOutline('ready', outline); }, (cause: Error) => act.outlineDraft({ error: cause.message }));
            },
          },
          relationship: {
            select: (entry) => act.relationshipDraft({ selectedId: entry.id, draft: { ...entry }, dirty: false, error: '' }),
            newDraft: () => act.relationshipDraft({ selectedId: undefined, draft: freshRelationshipEditor().draft, dirty: false, error: '' }),
            mutate: (update) => act.relationshipMutate(update),
            save: () => {
              const e = snapshot.relationshipEditor;
              if (!workspace || projectId === undefined) { act.relationshipDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.draft.from.trim() === '' || e.draft.to.trim() === '') { act.relationshipDraft({ error: '关系两端（from/to）不能为空' }); return; }
              const effectiveId = e.selectedId ?? `${slug(e.draft.from)}+${slug(e.draft.to)}`;
              void unwrap(workspace.relationshipSave(projectId, buildRelationshipInput({ ...e.draft, id: effectiveId }))).then((saved) => { if (!active) return; act.relationshipDraft({ draft: { ...(saved as RelationshipShape) }, selectedId: (saved as RelationshipShape).id, dirty: false, error: '' }); void unwrap(workspace!.relationshipRead(projectId)).then((list) => act.setRelationship('ready', list as unknown[]), (cause: Error) => { act.setRelationship('error', [], cause.message); act.relationshipDraft({ error: cause.message }); }); }, (cause: Error) => act.relationshipDraft({ error: cause.message }));
            },
          },
          state: {
            select: (seq) => { const e = snapshot.stateEditor; let fromSeq = e.fromSeq; let toSeq = e.toSeq; if (fromSeq === undefined) fromSeq = seq; else if (toSeq === undefined && seq !== fromSeq) toSeq = seq; else { fromSeq = seq; toSeq = undefined; } act.stateDraft({ selectedSeq: seq, fromSeq, toSeq, diff: undefined }); },
            showDiff: () => {
              const e = snapshot.stateEditor;
              if (!workspace || projectId === undefined) { act.stateDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.fromSeq === undefined || e.toSeq === undefined) { act.stateDraft({ error: '请从时间线选择两个快照再比对' }); return; }
              void unwrap(workspace.stateDiff(projectId, e.fromSeq, e.toSeq)).then((diff) => act.stateDraft({ diff: diff as StateDiffShape, error: '' }), (cause: Error) => act.stateDraft({ error: cause.message, diff: undefined }));
            },
            rollback: () => {
              const e = snapshot.stateEditor;
              if (!workspace || projectId === undefined) { act.stateDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.selectedSeq === undefined) { act.stateDraft({ error: '请先选择要回滚到的快照' }); return; }
              void unwrap(workspace.stateRollback(projectId, e.selectedSeq)).then((rolled) => { if (!active) return; const next = rolled as StateSnapshotShape; act.stateDraft({ selectedSeq: next.seq, diff: undefined, error: '' }); void unwrap(workspace!.stateSnapshots(projectId)).then((snapshots) => act.setState('ready', snapshots as unknown[]), (cause: Error) => { act.setState('error', [], cause.message); act.stateDraft({ error: cause.message }); }); }, (cause: Error) => act.stateDraft({ error: cause.message }));
            },
          },
          canon: {
            select: (event) => act.canonDraft({ selectedId: event.id, proposalId: undefined, draft: { storyTime: event.storyTime, summary: event.summary, detail: event.detail ?? '' }, dirty: false, error: '' }),
            mutate: (update) => act.canonDraft({ draft: update(snapshot.canonEditor.draft), dirty: true }),
            propose: () => {
              const e = snapshot.canonEditor;
              if (!workspace || projectId === undefined) { act.canonDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.selectedId === undefined) { act.canonDraft({ error: '请先选择一个正史事件再发起更正' }); return; }
              if ((e.draft.summary ?? '').trim() === '') { act.canonDraft({ error: '更正摘要不能为空' }); return; }
              void unwrap(workspace.canonCorrectionPropose(projectId, e.selectedId, buildCanonCorrectionInput(e.draft))).then((proposal) => act.canonDraft({ proposalId: (proposal as { id?: string }).id, error: '' }), (cause: Error) => act.canonDraft({ error: cause.message }));
            },
            accept: () => {
              const e = snapshot.canonEditor;
              if (!workspace || projectId === undefined) { act.canonDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.proposalId === undefined) { act.canonDraft({ error: '请先发起更正提案' }); return; }
              void unwrap(workspace.canonCorrectionAccept(projectId, e.proposalId)).then(() => { if (!active) return; act.canonDraft({ proposalId: undefined, dirty: false, error: '' }); void unwrap(workspace!.canonQuery(projectId, undefined)).then((events) => act.setCanon('ready', events as unknown[]), (cause: Error) => { act.setCanon('error', [], cause.message); act.canonDraft({ error: cause.message }); }); }, (cause: Error) => act.canonDraft({ error: cause.message }));
            },
          },
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
        // The component is a real React function component subscribing to the
        // store; close/collapse/activate and every draft mutation dispatch an
        // action, and `useStore` re-renders this component on every change.
        const Overlay = (props: { useStore: <S>(sel: (s: WorkbenchState) => S) => S; actions: WorkbenchActions }): unknown => {
          const s = props.useStore((snapshot) => snapshot);
          const ui = {
            get open() { return s.open; },
            get collapsed() { return s.collapsed; },
            get activeLayer() { return s.activeLayer; },
            get showSettings() { return s.showSettings; },
            get onboardingTab() { return s.showOnboarding; },
            get creationSettingsTab() { return s.showCreationSettings; },
            collapse() { props.actions.collapse(); },
            close() { props.actions.close(); },
            activate(id: LayerId) { props.actions.activate(id); },
            activateOnboarding() { props.actions.activateOnboarding(); },
            activateCreationSettings() {
              const next = !s.showCreationSettings;
              props.actions.activateCreationSettings();
              if (next && s.creationSettingsView === undefined && workbenchSettings) {
                void unwrap(workbenchSettings.load()).then((view) => { if (active) dispatch((x) => x.creationSettingsLoaded(view as WorkbenchSettingsViewShape)); }, () => dispatch((x) => x.creationSettingsSettled({ error: '创作设置读取失败' })));
              }
            },
            toggleSettings() {
              const next = !s.showSettings;
              dispatch((x) => x.toggleSettings());
              if (next && s.settingsView === undefined && llmConfig) {
                void unwrap(llmConfig.load()).then((view) => { if (active) dispatch((x) => x.settingsLoaded(view as LlmConfigViewShape)); }, () => dispatch((x) => x.settingsSettled({ error: '设置读取失败' })));
              }
            },
            saveLlmConfig() {
              const target = llmConfig;
              const draft = s.settingsDraft;
              if (!target) { dispatch((x) => x.settingsSettled({ error: '设置服务不可用' })); return; }
              const baseUrl = draft.baseUrl.trim();
              const model = draft.model.trim();
              if (baseUrl === '' || model === '') { dispatch((x) => x.settingsSettled({ error: '请填写 API URL 与模型名称' })); return; }
              if (draft.apiKey === '' && !(s.settingsView?.hasKey ?? false)) { dispatch((x) => x.settingsSettled({ error: '请填写 API Key（留空将保留已保存的 Key）' })); return; }
              dispatch((x) => x.settingsSettled({ saving: true, message: '', error: '' }));
              void unwrap(target.save({ baseUrl, model, apiKey: draft.apiKey, maxTokens: draft.maxTokens, thinking: draft.thinking, reasoningEffort: draft.reasoningEffort })).then(
                (result) => {
                  dispatch((x) => x.settingsSettled({ saving: false, message: `已保存路由 ${(result as { modelRef: string }).modelRef}（重启 DSH 服务后生效）` }));
                  void unwrap(llmConfig?.load()).then((view) => { if (active && view !== undefined) dispatch((x) => x.settingsLoaded(view as LlmConfigViewShape)); }, () => undefined);
                },
                (cause: Error) => dispatch((x) => x.settingsSettled({ saving: false, error: (cause as Error).message })),
              );
            },
            saveCreationSettings() {
              const target = workbenchSettings;
              const draft = s.creationSettingsDraft;
              if (!target) { dispatch((x) => x.creationSettingsSettled({ error: '创作设置服务不可用' })); return; }
              if (!Number.isFinite(draft.wordTarget) || draft.wordTarget < 100) { dispatch((x) => x.creationSettingsSettled({ error: '目标字数至少 100' })); return; }
              dispatch((x) => x.creationSettingsSettled({ saving: true, message: '', error: '' }));
              void unwrap(target.save({ wordTarget: draft.wordTarget, askWhenThin: draft.askWhenThin })).then(
                (view) => {
                  dispatch((x) => x.creationSettingsSettled({ saving: false, message: '创作设置已保存' }));
                  if (active && view !== undefined) dispatch((x) => x.creationSettingsLoaded(view as WorkbenchSettingsViewShape));
                },
                (cause: Error) => dispatch((x) => x.creationSettingsSettled({ saving: false, error: (cause as Error).message })),
              );
            },
            openCreationFolder() {
              const target = workbenchSettings;
              const projectId = currentProjectId;
              if (!target || projectId === undefined) { dispatch((x) => x.creationSettingsSettled({ error: '请先选择作品' })); return; }
              dispatch((x) => x.creationSettingsSettled({ message: '', error: '' }));
              void unwrap(target.openProjectFolder(projectId)).then(
                (result) => {
                  if (!active) return;
                  dispatch((x) => x.creationSettingsSettled({ message: `已打开作品落地文件夹：${(result as { path: string }).path}` }));
                },
                (cause: Error) => dispatch((x) => x.creationSettingsSettled({ error: (cause as Error).message })),
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
              void uploadDocx(target, file, (progress) => dispatch((x) => x.uploadProgress(progress))).then(
                (result) => {
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
                () => dispatch((x) => x.uploadSettled(undefined)),
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
          return workbenchView(React, s.status, workspace, ui, layers, makeOps(s), s.selectedProjectId, s.selectedProjectName, s.projects, s.browsing, s.leaveConfirm, s.projectError, s.upload, s.uploadResult, s.onboarding, onboarding, decideLayer, applyOnboarding, patchOnboarding, {
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
          slotDisposer();
          if (remoteDisposer) void remoteDisposer();
          if (onboardingDisposer) void onboardingDisposer();
          if (analyzerDisposer) void analyzerDisposer();
          if (llmConfigDisposer) void llmConfigDisposer();
        };
      });

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'novel-creation-tool-workspace', order: 0, label: '创作台' },
        () => launchButton(React, () => dispatch((x) => x.open())),
      ));
    },
  };
}
