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
import { reloadProject } from './client/project-session.js';
import { uploadDocx, type UploadProgress } from './client/upload.js';
import { onboardingReview, ONBOARDING_LAYERS, adjudicateOne, applyAccepted, type OnboardingDecision, type OnboardingLayerId, type OnboardingNamespace, type OnboardingState } from './client/onboarding.js';
import { onboardingRemoteContribution, onboardingAnalyzerRemoteContribution } from './client/onboarding.js';
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
  ready(model: WorkspaceViewModel): void;
  fail(message: string): void;
  setProjects(list: unknown[]): void;
  selectProject(projectId: string): void;
  createProject(input: { projectId: string; name: string }): void;
  uploadProgress(progress: UploadProgress): void;
  uploadSettled(result: { sourceHash: string; fileName: string; text: string; chunks: unknown[] } | undefined): void;
  onboarding(state: OnboardingState | undefined): void;
  onboardingDecision(layer: OnboardingLayerId, decision: OnboardingDecision): void;
  onboardingApplyResult(result: OnboardingState['applyResult']): void;
  onboardingError(message: string): void;
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

/** 左侧层级导航：六层一桌，激活项打朱砂。 */
function layerNav(h: El, activeLayer: LayerId, activate: (id: LayerId) => void): unknown {
  return h('nav', { className: 'nv-workbench__nav', 'data-novel-nav': '', 'aria-label': '创作台层级' },
    LAYERS.map((layer) => h('button', {
      key: layer.id,
      type: 'button',
      className: 'nv-workbench__nav-item' + (activeLayer === layer.id ? ' is-active' : ''),
      'data-novel-layer': layer.id,
      'aria-current': activeLayer === layer.id ? 'page' : undefined,
      onClick: () => activate(layer.id),
    }, layer.label)),
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

/** 面板主体：品牌头栏 + 层级导航 + 内容区。 */
function workbenchView(React: ReactFace, status: WorkspaceStatus, workspace: WorkspaceNamespace | undefined, ui: { open: boolean; collapsed: boolean; activeLayer: LayerId; collapse(): void; close(): void; activate(id: LayerId): void; selectProject(id: string): void; createProject(input: { projectId: string; name: string }): void; uploadFile(file: File): void; analyzeText(text: string): void }, layers: LayerData, ops: WorkbenchOps, selectedProjectId?: string, projects: Array<{ id: string; name: string }> = [], upload?: UploadProgress, uploadResult?: { sourceHash: string; fileName: string; text: string; chunks: unknown[] }, onboardingState?: OnboardingState, onboardingNamespace?: OnboardingNamespace, decideOnboarding?: (layer: OnboardingLayerId, decision: OnboardingDecision) => void, applyOnboarding?: () => void): unknown {
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
    h('button', { type: 'button', className: 'nv-onboarding-entry__start', 'data-novel-onboarding-start': '', onClick: () => ui.analyzeText(sourceText) }, '分析原文'),
    h('label', { className: 'nv-upload', 'data-novel-onboarding-upload': '' },
      h('span', { className: 'nv-upload__label' }, uploadStatusLabel(upload)),
      h('input', { type: 'file', accept: '.docx', 'data-novel-upload-input': '', onChange: (event: { target: { files: FileList | null } }) => { const file = event.target.files?.[0]; if (file) ui.uploadFile(file); } }),
    ),
    uploadResult ? h('p', { 'data-novel-upload-result': '' }, `已提取「${uploadResult.fileName}」：${uploadResult.chunks.length} 个文本块`) : null,
  );
  const review = onboardingState === undefined ? null : onboardingReview(h, onboardingNamespace, onboardingState, () => {}, decideOnboarding ?? (() => {}), applyOnboarding ?? (() => {}));
  const body = effectiveStatus === 'ready' && selectedProjectId !== undefined
    ? h('div', { className: 'nv-workbench__body', 'data-novel-project-open': selectedProjectId },
      layerNav(h, ui.activeLayer, ui.activate),
      h('div', { className: 'nv-workbench__main' }, contentArea(h, selectedProjectId, workspace!, ui.activeLayer, layers, ops), sourceEntry, review),
    )
    : effectiveStatus === 'ready'
      ? h('section', { className: 'nv-workbench__state', 'data-novel-project-chooser': '' },
        projects.length === 0 ? h('div', null,
          h('p', { 'data-novel-project-empty': '' }, '尚无作品，请新建空白作品或上传 DOCX。'),
          h('button', { type: 'button', 'data-novel-project-create': '', onClick: () => ui.createProject({ projectId: 'untitled', name: '未命名作品' }) }, '新建空白作品'),
          h('label', { className: 'nv-upload', 'data-novel-upload': '' },
            h('span', { className: 'nv-upload__label' }, uploadStatusLabel(upload)),
            h('input', { type: 'file', accept: '.docx', 'data-novel-upload-input': '', onChange: (event: { target: { files: FileList | null } }) => { const file = event.target.files?.[0]; if (file) ui.uploadFile(file); } }),
          ),
          uploadResult ? h('p', { 'data-novel-upload-result': '' }, `已提取「${uploadResult.fileName}」：${uploadResult.chunks.length} 个文本块`) : null,
        )
          : h('ul', { 'data-novel-project-list': '' }, projects.map((project) => h('button', { type: 'button', onClick: () => ui.selectProject(project.id), 'data-novel-project-open': project.id }, project.name))),
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
  projects: Array<{ id: string; name: string }>;
  projectLoading: boolean;
  upload: UploadProgress;
  uploadResult: { sourceHash: string; fileName: string; text: string; chunks: unknown[] } | undefined;
  onboarding: OnboardingState | undefined;
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
      let analyzer: { start(input: unknown, settings: unknown): Promise<unknown> } | undefined;
      let currentProjectId: string | undefined;
      let active = true;
      let remoteDisposer: TypertDisposer | undefined;
      let onboardingDisposer: TypertDisposer | undefined;
      let analyzerDisposer: TypertDisposer | undefined;

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
          projects: [],
          projectLoading: false,
          upload: { phase: 'idle' },
          uploadResult: undefined,
          onboarding: undefined,
        }),
        actions: {
          open: (d) => { d.open = true; d.collapsed = false; },
          close: (d) => { d.open = false; },
          collapse: (d) => { d.collapsed = !d.collapsed; },
          activate: (d, id: LayerId) => { d.activeLayer = id; },
          ready: (d, model: WorkspaceViewModel) => { d.status = { status: 'ready', model }; },
          fail: (d, message: string) => { d.status = { status: 'error', message }; },
          setProjects: (d, list: unknown[]) => { d.projects = list as Array<{ id: string; name: string }>; d.projectLoading = false; },
          selectProject: (d, projectId: string) => { d.selectedProjectId = projectId; d.projectLoading = false; },
          createProject: (d) => { d.projectLoading = true; },
          uploadProgress: (d, progress: UploadProgress) => { d.upload = progress; },
          uploadSettled: (d, result: { sourceHash: string; fileName: string; text: string; chunks: unknown[] } | undefined) => { d.uploadResult = result; },
          onboarding: (d, state: OnboardingState | undefined) => { d.onboarding = state; },
          onboardingDecision: (d, layer: OnboardingLayerId, decision: OnboardingDecision) => { if (d.onboarding) d.onboarding.decisions = { ...d.onboarding.decisions, [layer]: decision }; },
          onboardingApplyResult: (d, result: OnboardingState['applyResult']) => { if (d.onboarding) d.onboarding.applyResult = result; },
          onboardingError: (d, message: string) => { if (d.onboarding) d.onboarding.error = message; },
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
        void unwrap(target.projectOpen(projectId)).then(() => {
          if (!active) return;
          currentProjectId = projectId;
          dispatch((actions) => {
            actions.selectProject(projectId);
            reloadProject(target, projectId, actions, dispatch, () => active);
          });
          if (onOpened) onOpened();
        }, () => dispatch((actions) => actions.fail('作品打开失败')));
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

      // I53: start six-layer analysis from a source text, then open the review.
      // The current onboarding state is mirrored in a closure so the verdict/apply
      // handlers can read it without reaching into the reactive store snapshot.
      let currentOnboarding: OnboardingState | undefined;
      const setOnboarding = (next: OnboardingState | undefined): void => {
        currentOnboarding = next;
        dispatch((actions) => actions.onboarding(next));
      };
      const startOnboarding = (projectId: string, sourceHash: string, text: string): void => {
        const target = analyzer;
        if (!active || target === undefined) { setOnboarding({ projectId, onboardingSessionId: '', sourceHash, decisions: {}, error: '分析服务不可用' }); return; }
        void unwrap(target.start({ projectId, sourceHash, text }, undefined)).then((result) => {
          if (!active) return;
          const session = result as { onboardingSessionId?: string };
          if (!session.onboardingSessionId) throw new Error('分析未返回会话 id');
          setOnboarding({ projectId, onboardingSessionId: session.onboardingSessionId, sourceHash, decisions: {} });
        }, (cause: Error) => setOnboarding(currentOnboarding ? { ...currentOnboarding, error: (cause as Error).message } : undefined));
      };
      const decideLayer = (layer: OnboardingLayerId, decision: OnboardingDecision): void => {
        const target = onboarding;
        const state = currentOnboarding;
        if (!active || target === undefined || !state) return;
        dispatch((actions) => actions.onboardingDecision(layer, decision));
        void adjudicateOne(target, state, layer, decision).catch((cause: Error) => dispatch((actions) => actions.onboardingError((cause as Error).message)));
      };
      const applyOnboarding = (): void => {
        const target = onboarding;
        const state = currentOnboarding;
        if (!active || target === undefined || !state) return;
        void applyAccepted(target, state).then((result) => {
          if (!active) return;
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
              void unwrap(workspace.canonCorrectionAccept(projectId, e.proposalId)).then(() => { if (!active) return; act.canonDraft({ proposalId: undefined, dirty: false, error: '' }); void unwrap(workspace!.canonQuery(projectId)).then((events) => act.setCanon('ready', events as unknown[]), (cause: Error) => { act.setCanon('error', [], cause.message); act.canonDraft({ error: cause.message }); }); }, (cause: Error) => act.canonDraft({ error: cause.message }));
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
            collapse() { props.actions.collapse(); },
            close() { props.actions.close(); },
            activate(id: LayerId) { props.actions.activate(id); },
            selectProject(id: string) { openProject(id); },
            createProject(input: { projectId: string; name: string }) { createProject(input); },
            uploadFile(file: File) {
              const target = workspace;
              if (!target || !active) return;
              void uploadDocx(target, file, (progress) => dispatch((x) => x.uploadProgress(progress))).then(
                (result) => {
                  dispatch((x) => { x.uploadSettled(result); x.uploadProgress({ phase: 'done' }); });
                  const projectId = currentProjectId;
                  if (projectId !== undefined) {
                    startOnboarding(projectId, result.sourceHash, result.text);
                    return;
                  }
                  // I53 DOCX new-work entry: with no project open yet, create one
                  // from the uploaded document, open it, then drive the six-layer
                  // review (design §14.7.4; I53 goal 三入口).
                  const name = result.fileName.replace(/\.docx$/i, '') || '未命名作品';
                  createProject({ projectId: slug(name), name }, () => {
                    if (currentProjectId !== undefined) startOnboarding(currentProjectId, result.sourceHash, result.text);
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
                startOnboarding(projectId, hash, normalized);
              });
            },
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
          return workbenchView(React, s.status, workspace, ui, layers, makeOps(s), s.selectedProjectId, s.projects, s.upload, s.uploadResult, s.onboarding, onboarding, decideLayer, applyOnboarding);
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
          analyzer = ctx.get('remote.novelOnboardingAnalyzer', false) as { start(input: unknown, settings: unknown): Promise<unknown> } | undefined;
        }, () => { /* analyzer remote unavailable; review stays disabled */ });
        void ctx.remote.$mount(onboardingRemoteContribution).then((dispose) => {
          if (!active) { void dispose(); return; }
          onboardingDisposer = dispose;
          onboarding = ctx.get('remote.novelOnboarding', false) as OnboardingNamespace | undefined;
        }, () => { /* adjudication remote unavailable */ });
        return () => {
          active = false;
          capturedActions = undefined;
          pending.splice(0);
          workspace = undefined;
          onboarding = undefined;
          analyzer = undefined;
          slotDisposer();
          if (remoteDisposer) void remoteDisposer();
          if (onboardingDisposer) void onboardingDisposer();
          if (analyzerDisposer) void analyzerDisposer();
        };
      });

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'novel-creation-tool-workspace', order: 0, label: '创作台' },
        () => launchButton(React, () => dispatch((x) => x.open())),
      ));
    },
  };
}
