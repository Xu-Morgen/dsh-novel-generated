import type { TypertRemoteContribution, TypertDisposer } from '@deepseek-ai/dsh-typert-protocol';
import { workspaceRemoteContribution, type WorkspaceViewModel } from './remote.js';
import { WORKBENCH_STYLES } from './client/styles.js';

export type BundleRequire = (spec: string) => unknown;
export interface ReactFace {
  createElement(tag: string, props: Record<string, unknown> | null, ...children: unknown[]): unknown;
}
export interface EditorRemote {
  characterList(projectId: string): Promise<unknown[]>;
  characterRead(projectId: string, entityId: string): Promise<unknown>;
  characterCreate(projectId: string, input: unknown): Promise<unknown>;
  characterUpdate(projectId: string, entityId: string, patch: unknown): Promise<unknown>;
  worldviewList(projectId: string): Promise<unknown[]>;
  worldviewRead(projectId: string, entityId: string): Promise<unknown>;
  worldviewCreate(projectId: string, input: unknown): Promise<unknown>;
  worldviewRewrite(projectId: string, entityId: string, input: unknown): Promise<unknown>;
  outlineRead(projectId: string): Promise<unknown>;
  outlineSave(projectId: string, input: unknown): Promise<unknown>;
  outlineBeatCards(projectId: string): Promise<unknown[]>;
  relationshipRead(projectId: string): Promise<unknown[]>;
  relationshipSave(projectId: string, input: unknown): Promise<unknown>;
  stateCurrent(projectId: string): Promise<unknown>;
  stateSnapshots(projectId: string): Promise<unknown[]>;
  stateRollback(projectId: string, seq: number): Promise<unknown>;
  stateDiff(projectId: string, fromSeq: number, toSeq: number): Promise<unknown>;
  canonQuery(projectId: string, filter?: unknown): Promise<unknown[]>;
  canonCorrectionPropose(projectId: string, targetId: string, input: unknown): Promise<unknown>;
  canonCorrectionAccept(projectId: string, proposalId: string): Promise<unknown>;
}
/** The mounted `remote.novelWorkspace` namespace service surface. */
export interface WorkspaceNamespace extends EditorRemote {
  viewModel(): Promise<unknown>;
}
export interface WorkspaceSlots {
  inject(key: string, cb: () => () => void): () => void;
  register(options: unknown, component: () => unknown): () => void;
}
export interface ClientPluginEntry {
  readonly name: string;
  readonly inject: readonly string[];
  apply(ctx: {
    slots: WorkspaceSlots;
    remote: { $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer> };
    get(name: string, silent?: boolean): unknown;
    /** Cordis effect: runs `callback` once, disposes its return on Fiber unload (H0-6). */
    effect(callback: () => void | (() => void), label?: string): () => void;
  }): void;
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

/** Minimal browser DOM surface for package-owned `<style>` injection (R10-3). */
interface WorkbenchStyleElement {
  setAttribute(name: string, value: string): void;
  remove(): void;
  textContent: string;
}
declare const document: {
  createElement(tag: 'style'): WorkbenchStyleElement;
  readonly head: { appendChild(node: WorkbenchStyleElement): unknown };
};

type WorkspaceStatus =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly model: WorkspaceViewModel };

/**
 * I46「创作台」六层信息架构（design §14.6 / R10-1）。前两层（B3 角色、B2 世界观）
 * 自 I47 起渲染真表单；后四层是 I48（B5/C1）与 I49（C2/C4）的真面板。`id` 即测试
 * 契约 `data-novel-layer` 的取值。
 */
const LAYERS = [
  { id: 'characters', label: '角色', title: '角色核心（B3）', hint: '角色列表与详情表单（I47）。' },
  { id: 'worldview', label: '世界观', title: '世界观（B2）', hint: '世界观条目与改写（supersede）（I47）。' },
  { id: 'outline', label: '大纲', title: '大纲与细纲（B5）', hint: '幕→节→细纲结构化编辑（I48）。' },
  { id: 'relationship', label: '关系', title: '关系（C1）', hint: '关系对结构化编辑（I48）。' },
  { id: 'state', label: '状态', title: '状态快照（C2）', hint: '快照时间线 / 回滚 / diff（I49）。' },
  { id: 'canon', label: '正史', title: '正史账本（C4）', hint: '只读账本与 supersede 更正（I49）。' },
] as const;
type LayerId = (typeof LAYERS)[number]['id'];

/** Unwrap a DSH RemoteResult envelope: resolve to `value`, reject on `!ok`. */
function unwrap(promise: Promise<unknown> | undefined): Promise<unknown> {
  if (promise === undefined) return Promise.resolve(undefined);
  return promise.then((result) => {
    const envelope = result as { ok?: boolean; value?: unknown; error?: { message?: string } };
    if (envelope !== null && typeof envelope === 'object' && 'ok' in envelope) {
      if (envelope.ok === true) return envelope.value;
      throw new Error(envelope.error?.message ?? 'Remote call failed');
    }
    return result;
  });
}

/**
 * 小型 `el()` 助手（D13）：薄封装 `React.createElement`，不引入 JSX runtime。
 * 组件仍以 `React.createElement` 为唯一渲染原语，`el()` 只省去 `null` props。
 */
type El = (tag: string, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
function el(React: ReactFace): El {
  return (tag, props, ...children) => React.createElement(tag, props ?? null, ...children);
}

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
 * I47 B3 角色核心真实表单（design §5.5 / R10-4）。列表 + 详情的双栏布局：
 * 左侧为可点选的 CharacterCore 列表，右侧为全字段表单。所有 saves 与 loads
 * 只经 Host `novelWorkspace` Remote，Client 不拥有任何领域校验（design §0.1.2）。
 */
interface CharacterShape {
  id: string;
  name: string;
  aliases?: string[];
  kind?: string;
  personality?: string;
  background?: string;
  motivation?: string;
  goals?: string[];
  flaws?: string[];
  abilities?: string[];
  speechStyle?: string;
  staticTraits?: string[];
  arc?: { startingPoint?: string; desiredEnd?: string; keyBeats?: string[] };
  relationships?: string[];
  knowledgeIds?: string[];
  [key: string]: unknown;
}
interface CharacterLayerState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly list: CharacterShape[];
  readonly message?: string;
}
/** Host-validated create/update copy of a character form model. */
function characterCreateInput(draft: CharacterShape): unknown {
  return {
    id: draft.id,
    name: draft.name,
    aliases: draft.aliases ?? [],
    kind: draft.kind ?? 'extra',
    personality: draft.personality ?? '',
    background: draft.background ?? '',
    motivation: draft.motivation ?? '',
    goals: draft.goals ?? [],
    flaws: draft.flaws ?? [],
    abilities: draft.abilities ?? [],
    speechStyle: draft.speechStyle ?? '',
    staticTraits: draft.staticTraits ?? [],
    arc: {
      startingPoint: draft.arc?.startingPoint ?? '',
      desiredEnd: draft.arc?.desiredEnd ?? '',
      keyBeats: draft.arc?.keyBeats ?? [],
    },
    relationships: draft.relationships ?? [],
    knowledgeIds: draft.knowledgeIds ?? [],
  };
}

/** 角色表单文本字段：label + value 受控 input/text/textarea。 */
function characterText(h: El, label: string, value: string, onChange: (value: string) => void, area = false): unknown {
  return h('label', { className: 'nv-field' },
    h('span', { className: 'nv-field__label' }, label),
    area
      ? h('textarea', { className: 'nv-field__input', value, onChange: (event: { target: { value: string } }) => onChange(event.target.value), rows: 3 })
      : h('input', { type: 'text', className: 'nv-field__input', value, onChange: (event: { target: { value: string } }) => onChange(event.target.value) }),
  );
}

/** 持久化角色表单态（存于 store，任何变更经 actions 触发重渲染）。 */
interface CharacterEditor {
  selectedId: string | undefined;
  draft: CharacterShape;
  dirty: boolean;
  error: string;
}
/** 持久化世界观表单态。 */
interface WorldEditor {
  selectedId: string | undefined;
  draft: WorldShape;
  dirty: boolean;
  error: string;
}

/** 角色编辑动作接口：render 助手只经它写入 store。 */
interface CharacterEditOps {
  select(character: CharacterShape): void;
  newDraft(): void;
  mutate(update: (draft: CharacterShape) => CharacterShape): void;
  save(): void;
}
/** 世界观编辑动作接口。 */
interface WorldEditOps {
  select(entry: WorldShape): void;
  newDraft(): void;
  mutate(update: (draft: WorldShape) => WorldShape): void;
  save(): void;
}

/** 角色列表表单：列出全部 CharacterCore，可点选载入详情。 */
function characterLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: CharacterLayerState, editor: CharacterEditor, ops: CharacterEditOps): unknown {
  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'characters', 'data-novel-layer-state': 'loading' }, '正在装载角色…');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'characters', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '角色素材读取失败');
  }
  const d = editor.draft;
  const editing = editor.selectedId !== undefined;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-character-new': '', onClick: ops.newDraft }, '新建角色'),
    ),
    layerState.list.map((character) => h('button', {
      key: character.id,
      type: 'button',
      role: 'listitem',
      className: 'nv-editor__item' + (editor.selectedId === character.id ? ' is-active' : ''),
      'data-novel-character-id': character.id,
      onClick: () => ops.select(character),
    }, character.name)),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, editing ? `编辑角色：${d.name}` : '新建角色'),
    h('div', { className: 'nv-form' },
      characterText(h, '名称', d.name, (value) => ops.mutate((draft) => ({ ...draft, name: value }))),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '类型'),
        h('select', { className: 'nv-field__input', value: d.kind ?? 'extra', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, kind: event.target.value })) },
          ['protagonist', 'antagonist', 'supporting', 'extra', 'pov'].map((kind) => h('option', { key: kind, value: kind }, kind)),
        ),
      ),
      listField(h, '别名', d.aliases ?? [], (value) => ops.mutate((draft) => ({ ...draft, aliases: value }))),
      characterText(h, '性格', d.personality ?? '', (value) => ops.mutate((draft) => ({ ...draft, personality: value })), true),
      characterText(h, '背景', d.background ?? '', (value) => ops.mutate((draft) => ({ ...draft, background: value })), true),
      characterText(h, '动机', d.motivation ?? '', (value) => ops.mutate((draft) => ({ ...draft, motivation: value })), true),
      listField(h, '目标', d.goals ?? [], (value) => ops.mutate((draft) => ({ ...draft, goals: value }))),
      listField(h, '缺陷', d.flaws ?? [], (value) => ops.mutate((draft) => ({ ...draft, flaws: value }))),
      listField(h, '能力', d.abilities ?? [], (value) => ops.mutate((draft) => ({ ...draft, abilities: value }))),
      characterText(h, '口吻', d.speechStyle ?? '', (value) => ops.mutate((draft) => ({ ...draft, speechStyle: value })), true),
      h('fieldset', { className: 'nv-fieldset' },
        h('legend', { className: 'nv-fieldset__legend' }, '弧光'),
        characterText(h, '起点', d.arc?.startingPoint ?? '', (value) => ops.mutate((draft) => ({ ...draft, arc: { ...draft.arc, startingPoint: value } }))),
        characterText(h, '归宿', d.arc?.desiredEnd ?? '', (value) => ops.mutate((draft) => ({ ...draft, arc: { ...draft.arc, desiredEnd: value } }))),
        listField(h, '关键节拍', d.arc?.keyBeats ?? [], (value) => ops.mutate((draft) => ({ ...draft, arc: { ...draft.arc, keyBeats: value } }))),
      ),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-character-save': '', onClick: ops.save, disabled: !editor.dirty }, '保存'),
    ),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'character', role: 'alert' }, editor.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'characters', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, list, detail),
  );
}

/** 字符串数组字段：每行一个值的文本框，逗号/换行分隔。 */
function listField(h: El, label: string, value: string[], onChange: (value: string[]) => void): unknown {
  const text = value.join('\n');
  return h('label', { className: 'nv-field' },
    h('span', { className: 'nv-field__label' }, label),
    h('textarea', {
      className: 'nv-field__input',
      value: text,
      rows: 3,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value.split('\n').map((item) => item.trim()).filter((item) => item.length > 0)),
    }),
  );
}

/** 空白 id → project id 形状（仅用于未命名新条目，Host 仍拥有最终校验）。 */
function slug(name: string): string {
  const lowered = name.toLowerCase().replaceAll(' ', '-').replace(/[^a-z0-9_-]/g, '');
  return lowered.slice(0, 64) || 'untitled';
}

/**
 * I47 B2 世界观真实表单（design §5.4 / R10-4）。列表 + 详情 + 「改写」入口：
 * 改写经 `worldviewRewrite`，Host 将旧条目标记为 `rewritten` 且 `supersededBy`
 * 指向新条目——Client 从不就地覆写，仅提交替换内容。
 */
interface WorldShape {
  id: string;
  kind?: string;
  title?: string;
  content?: string;
  keywords?: string[];
  triggerMode?: string;
  weight?: number;
  parent?: string | null;
  mutable?: boolean;
  status?: string;
  supersededBy?: string | null;
  [key: string]: unknown;
}
interface WorldLayerState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly list: WorldShape[];
  readonly message?: string;
}
function worldviewInput(draft: WorldShape): unknown {
  return {
    id: draft.id,
    kind: draft.kind ?? 'concept',
    title: draft.title ?? '',
    content: draft.content ?? '',
    keywords: draft.keywords ?? [],
    triggerMode: draft.triggerMode ?? 'constant',
    weight: draft.weight ?? 0,
    parent: draft.parent ?? null,
    mutable: draft.mutable ?? true,
    status: draft.status ?? 'active',
    supersededBy: draft.supersededBy ?? null,
  };
}

function worldviewLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: WorldLayerState, editor: WorldEditor, ops: WorldEditOps): unknown {
  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'loading' }, '正在装载世界观…');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '世界观素材读取失败');
  }
  const d = editor.draft;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-worldview-new': '', onClick: ops.newDraft }, '新建条目'),
    ),
    layerState.list.map((entry) => h('button', {
      key: entry.id,
      type: 'button',
      role: 'listitem',
      className: 'nv-editor__item' + (editor.selectedId === entry.id ? ' is-active' : ''),
      'data-novel-worldview-id': entry.id,
      onClick: () => ops.select(entry),
    }, entry.title ?? entry.id)),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, editor.selectedId === undefined ? '新建条目' : `编辑条目：${d.title ?? editor.selectedId}`),
    h('div', { className: 'nv-form' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '标题'),
        h('input', { type: 'text', className: 'nv-field__input', value: d.title ?? '', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, title: event.target.value })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '类型'),
        h('select', { className: 'nv-field__input', value: d.kind ?? 'concept', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, kind: event.target.value })) },
          ['geography', 'history', 'faction', 'culture', 'race', 'concept', 'artifact'].map((kind) => h('option', { key: kind, value: kind }, kind)),
        ),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '内容'),
        h('textarea', { className: 'nv-field__input', value: d.content ?? '', rows: 4, onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, content: event.target.value })) }),
      ),
      listField(h, '触发词', d.keywords ?? [], (value) => ops.mutate((draft) => ({ ...draft, keywords: value }))),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '触发方式'),
        h('select', { className: 'nv-field__input', value: d.triggerMode ?? 'constant', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, triggerMode: event.target.value })) },
          ['keyword', 'regex', 'constant'].map((mode) => h('option', { key: mode, value: mode }, mode)),
        ),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '权重'),
        h('input', { type: 'number', className: 'nv-field__input', value: String(d.weight ?? 0), onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, weight: Number.parseInt(event.target.value, 10) || 0 })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '父条目（可空）'),
        h('input', { type: 'text', className: 'nv-field__input', value: d.parent ?? '', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, parent: event.target.value === '' ? null : event.target.value })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '可否改写'),
        h('input', { type: 'checkbox', className: 'nv-field__check', checked: d.mutable ?? true, onChange: (event: { target: { checked: boolean } }) => ops.mutate((draft) => ({ ...draft, mutable: event.target.checked })) }),
      ),
      editor.selectedId !== undefined && d.status === 'rewritten'
        ? h('p', { className: 'nv-editor__badge', 'data-novel-worldview-rewritten': '' }, `已被 ${d.supersededBy ?? '?'} 改写`)
        : null,
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-worldview-save': '', onClick: ops.save, disabled: !editor.dirty },
        editor.selectedId === undefined ? '创建' : '改写'),
    ),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'worldview', role: 'alert' }, editor.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, list, detail),
  );
}

/**
 * I48 B5 大纲结构化编辑器（design §5.7 / R10-5）。替换裸 JSON 文本框：幕→节→
 * 细纲场景卡的三级层级编辑。所有读写只经 Host `outlineRead`/`outlineSave`/
 * `outlineBeatCards`，Client 不拥有领域校验（design §0.1.2）。
 */
interface OutlineActShape {
  id: string;
  index: number;
  title: string;
  goal: string;
  beats: OutlineBeatShape[];
  [key: string]: unknown;
}
interface OutlineBeatShape {
  id: string;
  title: string;
  description: string;
  charactersInvolved: string[];
  conflictType: string;
  prerequisites: string[];
  optional: boolean;
  detailBeats: OutlineDetailBeatShape[];
  [key: string]: unknown;
}
interface OutlineDetailBeatShape {
  id: string;
  title: string;
  summary: string;
  pov: string;
  wordTarget: number;
  points: string[];
  status: string;
  [key: string]: unknown;
}
interface OutlineShape {
  id: string;
  structure: string;
  logline: string;
  themes: string[];
  acts: OutlineActShape[];
  foreshadowing: unknown[];
  endings: unknown[];
  version?: number;
  [key: string]: unknown;
}
interface OutlineLayerState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly outline?: OutlineShape;
  readonly message?: string;
}
/** 大纲持久化表单态：跨渲染复用，保存后整树写回 Host。 */
interface OutlineEditor {
  draft: OutlineShape;
  dirty: boolean;
  error: string;
  selectedActId: string | undefined;
  selectedBeatId: string | undefined;
  selectedDetailId: string | undefined;
}
type OutlineEditOps = {
  mutate(update: (draft: OutlineShape) => OutlineShape): void;
  selectAct(id: string): void;
  selectBeat(actId: string, beatId: string): void;
  selectDetail(id: string): void;
  addAct(): void;
  removeAct(actId: string): void;
  addBeat(actId: string): void;
  removeBeat(actId: string, beatId: string): void;
  save(): void;
};

/** 按 id 就地 upsert 列表中的条目（同 id 覆盖，否则追加）。 */
function upsert<T>(list: T[], item: T): T[] {
  const index = list.findIndex((entry) => (entry as { id?: string }).id === (item as { id?: string }).id);
  if (index >= 0) { const next = list.slice(); next[index] = item; return next; }
  return list.concat(item);
}
/** 找到大纲中指定幕，缺失时给一个空的骨架幕（供新建/编辑兜底）。 */
function currentAct(draft: OutlineShape, actId: string): OutlineActShape {
  return (draft.acts ?? []).find((act) => act.id === actId)
    ?? { id: actId, index: (draft.acts ?? []).length, title: '', goal: '', beats: [] };
}
/** 找到幕下指定节，缺失时给一个空的骨架节。 */
function currentBeat(act: OutlineActShape, beatId: string): OutlineBeatShape {
  return (act.beats ?? []).find((beat) => beat.id === beatId)
    ?? { id: beatId, title: '', description: '', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] };
}

/** 空白大纲 → 可编辑骨架；id 由用户输入补全，Host 仍拥有最终校验。 */
function emptyOutline(): OutlineShape {
  return {
    id: 'outline', structure: 'free', logline: '', themes: [],
    acts: [], foreshadowing: [], endings: [],
  };
}
function outlineInput(draft: OutlineShape): unknown {
  return {
    id: draft.id,
    structure: draft.structure,
    logline: draft.logline,
    themes: draft.themes ?? [],
    acts: (draft.acts ?? []).map((act) => ({
      id: act.id, index: act.index, title: act.title, goal: act.goal,
      beats: (act.beats ?? []).map((beat) => ({
        id: beat.id, title: beat.title, description: beat.description,
        charactersInvolved: beat.charactersInvolved ?? [],
        conflictType: beat.conflictType ?? 'external',
        prerequisites: beat.prerequisites ?? [],
        optional: beat.optional ?? false,
        detailBeats: (beat.detailBeats ?? []).map((card) => ({
          id: card.id, title: card.title, summary: card.summary, pov: card.pov,
          wordTarget: card.wordTarget, points: card.points ?? [], status: card.status ?? 'planned',
        })),
      })),
    })),
    foreshadowing: draft.foreshadowing ?? [],
    endings: draft.endings ?? [],
  };
}

/** 细纲场景卡视图：选中的节下所有 scene card 以卡片栅格展示（I14 contract）。 */
function sceneCards(h: El, beat: OutlineBeatShape, selectedDetailId: string | undefined, onSelect: (id: string) => void): unknown {
  const cards = beat.detailBeats ?? [];
  if (cards.length === 0) {
    return h('p', { className: 'nv-outline__nodetail' }, '此节尚无细纲场景卡。');
  }
  return h('div', { className: 'nv-outline__cards', 'data-novel-beat-cards': '' },
    cards.map((card) => h('button', {
      key: card.id,
      type: 'button',
      className: 'nv-outline__card' + (selectedDetailId === card.id ? ' is-active' : ''),
      'data-novel-detail-card': card.id,
      onClick: () => onSelect(card.id),
    },
      h('span', { className: 'nv-outline__card-title' }, card.title),
      h('span', { className: 'nv-outline__card-meta' }, `POV ${card.pov} · ${card.wordTarget} 字 · ${card.status}`),
      h('span', { className: 'nv-outline__card-summary' }, card.summary),
    )),
  );
}

/** 大纲层级编辑器：左树（幕/节）+ 中间 edit 表单 + 底部 scene 卡片。 */
function outlineLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: OutlineLayerState, editor: OutlineEditor, ops: OutlineEditOps): unknown {
  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'loading' }, '正在装载大纲…');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '大纲读取失败');
  }
  const setAct = (actId: string, update: (act: OutlineActShape) => OutlineActShape): void => ops.mutate((draft) => ({ ...draft, acts: upsert(draft.acts ?? [], update(currentAct(draft, actId))) }));
  const setBeat = (actId: string, beatId: string, update: (beat: OutlineBeatShape) => OutlineBeatShape): void => ops.mutate((draft) => {
    const act = currentAct(draft, actId);
    return { ...draft, acts: upsert(draft.acts ?? [], { ...act, beats: upsert(act.beats ?? [], update(currentBeat(act, beatId))) }) };
  });

  const act = editor.selectedActId !== undefined
    ? (editor.draft.acts ?? []).find((item) => item.id === editor.selectedActId) : undefined;
  const beat = act !== undefined && editor.selectedBeatId !== undefined
    ? (act.beats ?? []).find((item) => item.id === editor.selectedBeatId) : undefined;

  const actPanel = act === undefined
    ? h('div', { className: 'nv-outline__detail' },
      h('h3', { className: 'nv-editor__title' }, '细纲大纲'),
      h('p', { className: 'nv-outline__nodetail' }, '选择左侧的幕与节，或新建一幕后继续编辑。'))
    : h('div', { className: 'nv-outline__detail' },
      h('h3', { className: 'nv-editor__title' }, `幕：${act.title || act.id}`),
      h('div', { className: 'nv-form' },
        characterText(h, '幕标题', act.title, (value) => setAct(act.id, (a) => ({ ...a, title: value }))),
        characterText(h, '幕目标', act.goal, (value) => setAct(act.id, (a) => ({ ...a, goal: value })), true),
      ),
    );
  const beatPanel = beat === undefined
    ? h('div', { className: 'nv-outline__detail' },
      h('h3', { className: 'nv-editor__title' }, '节'),
      h('p', { className: 'nv-outline__nodetail' }, '选择或新建一节以编辑节与细纲场景卡。'))
    : h('div', { className: 'nv-outline__detail' },
      h('h3', { className: 'nv-editor__title' }, `节：${beat.title || beat.id}`),
      h('div', { className: 'nv-form' },
        characterText(h, '节标题', beat.title, (value) => setBeat(act!.id, beat.id, (b) => ({ ...b, title: value }))),
        characterText(h, '描述', beat.description, (value) => setBeat(act!.id, beat.id, (b) => ({ ...b, description: value })), true),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, '冲突类型'),
          h('select', { className: 'nv-field__input', value: beat.conflictType, onChange: (event: { target: { value: string } }) => setBeat(act!.id, beat.id, (b) => ({ ...b, conflictType: event.target.value })) },
            ['internal', 'external', 'relational', 'world'].map((ct) => h('option', { key: ct, value: ct }, ct)),
          ),
        ),
        listField(h, '参与角色', beat.charactersInvolved ?? [], (value) => setBeat(act!.id, beat.id, (b) => ({ ...b, charactersInvolved: value }))),
        listField(h, '前置节', beat.prerequisites ?? [], (value) => setBeat(act!.id, beat.id, (b) => ({ ...b, prerequisites: value }))),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, '可选节'),
          h('input', { type: 'checkbox', className: 'nv-field__check', checked: beat.optional, onChange: (event: { target: { checked: boolean } }) => setBeat(act!.id, beat.id, (b) => ({ ...b, optional: event.target.checked })) }),
        ),
      ),
      h('h4', { className: 'nv-outline__subtitle' }, '细纲场景卡'),
      sceneCards(h, beat, editor.selectedDetailId, ops.selectDetail),
    );

  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-outline__toolbar' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '结构'),
        h('select', { className: 'nv-field__input', value: editor.draft.structure, onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, structure: event.target.value })) },
          ['three-act', 'hero-journey', 'serial', 'free'].map((s) => h('option', { key: s, value: s }, s)),
        ),
      ),
      characterText(h, '一句话梗概', editor.draft.logline, (value) => ops.mutate((draft) => ({ ...draft, logline: value }))),
      listField(h, '主题', editor.draft.themes ?? [], (value) => ops.mutate((draft) => ({ ...draft, themes: value }))),
    ),
    h('div', { className: 'nv-outline__columns' },
      h('div', { className: 'nv-editor__list' },
        h('div', { className: 'nv-editor__toolbar' },
          h('button', { type: 'button', className: 'nv-btn', 'data-novel-outline-add-act': '', onClick: ops.addAct }, '+ 幕'),
        ),
        (editor.draft.acts ?? []).map((a) => h('div', { key: a.id, className: 'nv-outline__act' },
          h('button', {
            type: 'button', className: 'nv-editor__item' + (editor.selectedActId === a.id ? ' is-active' : ''),
            'data-novel-outline-act': a.id, onClick: () => ops.selectAct(a.id),
          }, `幕${a.index} · ${a.title || a.id}`),
          h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-remove-act': a.id, onClick: () => ops.removeAct(a.id) }, '删'),
          h('div', { className: 'nv-outline__beats' },
            (a.beats ?? []).map((b) => h('button', {
              key: b.id, type: 'button', className: 'nv-editor__item nv-outline__beat' + (editor.selectedBeatId === b.id ? ' is-active' : ''),
              'data-novel-outline-beat': b.id, onClick: () => ops.selectBeat(a.id, b.id),
            }, `节 · ${b.title || b.id}`)),
            h('button', { type: 'button', className: 'nv-btn', 'data-novel-outline-add-beat': a.id, onClick: () => ops.addBeat(a.id) }, '+ 节'),
          ),
        )),
      ),
      h('div', { className: 'nv-outline__main' },
        actPanel,
        beatPanel,
      ),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-outline-save': '', onClick: ops.save, disabled: !editor.dirty }, '保存大纲'),
    ),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'outline', role: 'alert' }, editor.error) : null,
  );
}

/**
 * I48 C1 关系结构化编辑器（design §5.8 / R10-5）。替换裸 JSON 文本框：关系列表
 * + 从/到/类型/亲密度/信任/里程碑/知情边界表单。所有读写只经 Host
 * `relationshipRead`/`relationshipSave`，非法引用/端点由 Host 拒绝。
 */
interface RelationshipShape {
  id: string;
  from: string;
  to: string;
  type: string;
  affinity: number;
  trust: number;
  status: string;
  milestones: string[];
  knownTo: string[];
  version?: number;
  [key: string]: unknown;
}
interface RelationshipLayerState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly list: RelationshipShape[];
  readonly message?: string;
}
interface RelationshipEditor {
  selectedId: string | undefined;
  draft: RelationshipShape;
  dirty: boolean;
  error: string;
}
interface RelationshipEditOps {
  select(entry: RelationshipShape): void;
  newDraft(): void;
  mutate(update: (draft: RelationshipShape) => RelationshipShape): void;
  save(): void;
}
function relationshipInput(draft: RelationshipShape): unknown {
  return {
    id: draft.id, from: draft.from, to: draft.to, type: draft.type ?? 'friendship',
    affinity: draft.affinity ?? 0, trust: draft.trust ?? 0, status: draft.status ?? 'active',
    milestones: draft.milestones ?? [], knownTo: draft.knownTo ?? [],
  };
}
function newRelationshipDraft(): RelationshipShape {
  return { id: '', from: '', to: '', type: 'friendship', affinity: 0, trust: 0, status: 'active', milestones: [], knownTo: [] };
}
function relationshipLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: RelationshipLayerState, editor: RelationshipEditor, ops: RelationshipEditOps): unknown {
  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'loading' }, '正在装载关系…');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '关系素材读取失败');
  }
  const d = editor.draft;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-relationship-new': '', onClick: ops.newDraft }, '新建关系'),
    ),
    layerState.list.map((entry) => h('button', {
      key: entry.id, type: 'button', role: 'listitem',
      className: 'nv-editor__item' + (editor.selectedId === entry.id ? ' is-active' : ''),
      'data-novel-relationship-id': entry.id, onClick: () => ops.select(entry),
    }, `${entry.from} → ${entry.to}`)),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, editor.selectedId === undefined ? '新建关系' : `编辑关系：${d.from} → ${d.to}`),
    h('div', { className: 'nv-form' },
      h('div', { className: 'nv-form__row' },
        characterText(h, '从（角色 id）', d.from, (value) => ops.mutate((draft) => ({ ...draft, from: value }))),
        characterText(h, '到（角色 id）', d.to, (value) => ops.mutate((draft) => ({ ...draft, to: value }))),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '关系类型'),
        h('select', { className: 'nv-field__input', value: d.type ?? 'friendship', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, type: event.target.value })) },
          ['kin', 'romantic', 'friendship', 'rivalry', 'enmity', 'allegiance', 'mentor', 'subordinate'].map((t) => h('option', { key: t, value: t }, t)),
        ),
      ),
      h('div', { className: 'nv-form__row' },
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, `亲密度（-100..100）：${d.affinity}`),
          h('input', { type: 'range', min: '-100', max: '100', step: '1', className: 'nv-field__range', value: String(d.affinity ?? 0), onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, affinity: Number.parseInt(event.target.value, 10) || 0 })) }),
        ),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, `信任（0..100）：${d.trust}`),
          h('input', { type: 'range', min: '0', max: '100', step: '1', className: 'nv-field__range', value: String(d.trust ?? 0), onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, trust: Number.parseInt(event.target.value, 10) || 0 })) }),
        ),
      ),
      characterText(h, '状态', d.status ?? 'active', (value) => ops.mutate((draft) => ({ ...draft, status: value }))),
      listField(h, '里程碑', d.milestones ?? [], (value) => ops.mutate((draft) => ({ ...draft, milestones: value }))),
      listField(h, '知情边界（knownTo）', d.knownTo ?? [], (value) => ops.mutate((draft) => ({ ...draft, knownTo: value }))),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-relationship-save': '', onClick: ops.save, disabled: !editor.dirty }, '保存'),
    ),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'relationship', role: 'alert' }, editor.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, list, detail),
  );
}

/**
 * I49 C2 状态快照面板（design §14.6 / R10-6）。快照时间线 + 回滚 + 任意两快照
 * 的逐字段 diff 视图。回滚只经 Host `stateRollback`（走 StateEngine）；Client 不含
 * 任何回滚/写回逻辑，也不拥有领域真相（design §0.1.2）。
 */
interface StateSnapshotShape {
  seq: number;
  storyTime: string;
  scene?: { location?: string; timeOfDay?: string; weather?: string; season?: string; atmosphere?: string };
  characters?: Array<{ characterId?: string; location?: string; alive?: boolean; health?: string; mood?: string; currentGoal?: string }>;
  [key: string]: unknown;
}
interface StateDiffShape {
  fromSeq: number;
  toSeq: number;
  changes: Array<{ path: string; before: unknown; after: unknown }>;
}
interface StateLayerState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly snapshots: StateSnapshotShape[];
  readonly message?: string;
}
interface StateEditor {
  selectedSeq: number | undefined;
  fromSeq: number | undefined;
  toSeq: number | undefined;
  diff: StateDiffShape | undefined;
  error: string;
}
interface StateEditOps {
  select(seq: number): void;
  showDiff(): void;
  rollback(): void;
}
/** 持久化文案/值 → 单行文本（列表字段之外的对象/数组用 JSON 兜底）。 */
function displayValue(value: unknown): string {
  if (value === undefined || value === null) return '∅';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
/** C2 快照概要行：seq + storyTime + 场景地点（时间线条目）。 */
function snapshotMeta(snapshot: StateSnapshotShape): string {
  const parts = [`seq ${snapshot.seq}`];
  if (snapshot.storyTime) parts.push(snapshot.storyTime);
  if (snapshot.scene?.location) parts.push(snapshot.scene.location);
  return parts.join(' · ');
}
function stateLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: StateLayerState, editor: StateEditor, ops: StateEditOps): unknown {
  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'state', 'data-novel-layer-state': 'loading' }, '正在装载状态快照…');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'state', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '状态快照读取失败');
  }
  const current = layerState.snapshots.length > 0 ? layerState.snapshots[layerState.snapshots.length - 1] : undefined;
  const timeline = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' },
      h('span', { className: 'nv-state__hint' }, current === undefined ? '暂无快照' : `当前 seq ${current.seq}`),
    ),
    layerState.snapshots.map((snapshot) => h('button', {
      key: snapshot.seq,
      type: 'button',
      role: 'listitem',
      className: 'nv-editor__item' + (editor.selectedSeq === snapshot.seq ? ' is-active' : ''),
      'data-novel-state-snapshot': String(snapshot.seq),
      onClick: () => ops.select(snapshot.seq),
    }, snapshotMeta(snapshot))),
  );
  const selected = layerState.snapshots.find((snapshot) => snapshot.seq === editor.selectedSeq);
  const diffRows = (editor.diff?.changes ?? []).map((change) => h('li', { key: change.path, className: 'nv-state__diff-row', 'data-novel-state-diff-row': change.path },
    h('code', { className: 'nv-state__diff-path' }, change.path),
    h('span', { className: 'nv-state__diff-before' }, displayValue(change.before)),
    h('span', { className: 'nv-state__diff-arrow' }, '→'),
    h('span', { className: 'nv-state__diff-after' }, displayValue(change.after)),
  ));
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, selected === undefined ? '状态快照' : `快照 seq ${selected.seq} · ${selected.storyTime ?? ''}`),
    selected === undefined ? h('p', { className: 'nv-outline__nodetail' }, '从左侧时间线选择一个快照，或选择一个回滚目标。')
      : h('div', { className: 'nv-form' },
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, '故事时间'),
          h('input', { type: 'text', className: 'nv-field__input', value: selected.storyTime ?? '', disabled: true }),
        ),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, '场景地点'),
          h('input', { type: 'text', className: 'nv-field__input', value: selected.scene?.location ?? '', disabled: true }),
        ),
      ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-state-diff': '', onClick: ops.showDiff, disabled: editor.fromSeq === undefined || editor.toSeq === undefined }, '比对所选快照'),
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-state-rollback': '', onClick: ops.rollback, disabled: editor.selectedSeq === undefined }, '回滚到此快照'),
    ),
    editor.diff !== undefined
      ? h('div', { className: 'nv-state__diff', 'data-novel-state-diff-view': '' },
        h('h4', { className: 'nv-outline__subtitle' }, `diff seq ${editor.diff.fromSeq} → ${editor.diff.toSeq}`),
        editor.diff.changes.length === 0 ? h('p', { className: 'nv-outline__nodetail' }, '两快照无差异。')
          : h('ul', { className: 'nv-state__diff-list' }, diffRows),
      )
      : null,
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'state', role: 'alert' }, editor.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'state', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, timeline, detail),
  );
}

/**
 * I49 C4 正史账本面板（design §14.6 / R10-6）。只读账本带只读徽标；更正走
 * supersede 流程：`canonCorrectionPropose` 生成 ConfirmationGate 提案，确认后
 * `canonCorrectionAccept` 才经 Host `canon.supersede` 追加一条 correction 事件。
 * Client 无任何就地改写正史的入口（design §0.1.2 / R7-4）。
 */
interface CanonEventShape {
  id: string;
  seq: number;
  storyTime: string;
  kind: string;
  summary: string;
  detail?: string;
  participants?: string[];
  location?: string;
  consequences?: string[];
  affectedLayers?: string[];
  immutable?: boolean;
  supersedes?: string;
  supersededBy?: string | null;
  [key: string]: unknown;
}
interface CanonLayerState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly events: CanonEventShape[];
  readonly message?: string;
}
interface CanonEditor {
  selectedId: string | undefined;
  /** pending 提案 id：propose 成功后等待 accept。 */
  proposalId: string | undefined;
  draft: { storyTime: string; summary: string; detail: string };
  dirty: boolean;
  error: string;
}
interface CanonEditOps {
  select(event: CanonEventShape): void;
  mutate(update: (draft: CanonEditor['draft']) => CanonEditor['draft']): void;
  propose(): void;
  accept(): void;
}
function canonCorrectionInput(draft: CanonEditor['draft']): unknown {
  return {
    storyTime: draft.storyTime,
    summary: draft.summary,
    detail: draft.detail,
    participants: [],
    location: '',
    consequences: [],
    affectedLayers: [],
  };
}
function canonLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: CanonLayerState, editor: CanonEditor, ops: CanonEditOps): unknown {
  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'canon', 'data-novel-layer-state': 'loading' }, '正在装载正史账本…');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'canon', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '正史账本读取失败');
  }
  const selected = layerState.events.find((event) => event.id === editor.selectedId);
  const activeCount = layerState.events.filter((event) => event.supersededBy === null || event.supersededBy === undefined).length;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' },
      h('span', { className: 'nv-state__hint' }, `共 ${layerState.events.length} 条 · 有效 ${activeCount}`),
    ),
    layerState.events.map((event) => h('button', {
      key: event.id,
      type: 'button',
      role: 'listitem',
      className: 'nv-editor__item' + (editor.selectedId === event.id ? ' is-active' : ''),
      'data-novel-canon-id': event.id,
      onClick: () => ops.select(event),
    }, `${event.seq} · ${event.summary}${event.supersededBy ? '（已更正）' : ''}`)),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('div', { className: 'nv-canon__readonly', 'data-novel-canon-readonly': '', role: 'note' }, '只读账本 · 更正经 ConfirmationGate'),
    h('h3', { className: 'nv-editor__title' }, selected === undefined ? '正史账本' : `正史 ${selected.seq} · ${selected.summary}`),
    selected === undefined ? h('p', { className: 'nv-outline__nodetail' }, '从左侧选择一个正史事件，可发起 supersede 更正。')
      : h('div', { className: 'nv-form' },
        h('p', { className: 'nv-field__label' }, `类型 ${selected.kind} · 时间 ${selected.storyTime} · 地点 ${selected.location ?? '—'}`),
        selected.detail ? h('p', { className: 'nv-canon__detail' }, selected.detail) : null,
        selected.supersededBy ? h('p', { className: 'nv-editor__badge', 'data-novel-canon-superseded': '' }, `已被 ${selected.supersededBy} 更正`) : null,
        h('h4', { className: 'nv-outline__subtitle' }, '发起 supersede 更正'),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, '更正时间'),
          h('input', { type: 'text', className: 'nv-field__input', value: editor.draft.storyTime, onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, storyTime: event.target.value })) }),
        ),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, '更正摘要'),
          h('input', { type: 'text', className: 'nv-field__input', value: editor.draft.summary, onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, summary: event.target.value })) }),
        ),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, '更正详情'),
          h('textarea', { className: 'nv-field__input', rows: 3, value: editor.draft.detail, onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, detail: event.target.value })) }),
        ),
      ),
    h('div', { className: 'nv-editor__actions' },
      editor.proposalId !== undefined
        ? h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-canon-accept': '', onClick: ops.accept }, '确认更正（追加 supersede）')
        : h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-canon-propose': '', onClick: ops.propose, disabled: editor.selectedId === undefined || !editor.dirty }, '发起更正提案'),
    ),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'canon', role: 'alert' }, editor.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'canon', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, list, detail),
  );
}

/** 内容区：按激活层渲染真表单（I47/I48/I49），仅兜底空态。 */
function contentArea(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, activeLayer: LayerId, layers: LayerData, ops: WorkbenchOps): unknown {
  const layer = LAYERS.find((item) => item.id === activeLayer) ?? LAYERS[0];
  if (layer.id === 'characters') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      characterLayer(h, projectId, workspace, layers.characters, layers.characterEditor, ops.characters));
  }
  if (layer.id === 'worldview') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      worldviewLayer(h, projectId, workspace, layers.worldview, layers.worldEditor, ops.worldview));
  }
  if (layer.id === 'outline') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      outlineLayer(h, projectId, workspace, layers.outline, layers.outlineEditor, ops.outline));
  }
  if (layer.id === 'relationship') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      relationshipLayer(h, projectId, workspace, layers.relationship, layers.relationshipEditor, ops.relationship));
  }
  if (layer.id === 'state') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      stateLayer(h, projectId, workspace, layers.state, layers.stateEditor, ops.state));
  }
  if (layer.id === 'canon') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      canonLayer(h, projectId, workspace, layers.canon, layers.canonEditor, ops.canon));
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
function workbenchView(React: ReactFace, status: WorkspaceStatus, workspace: WorkspaceNamespace | undefined, ui: { open: boolean; collapsed: boolean; activeLayer: LayerId; collapse(): void; close(): void; activate(id: LayerId): void }, layers: LayerData, ops: WorkbenchOps): unknown {
  const h = el(React);
  if (!ui.open) return null;
  const ready = status.status === 'ready' && workspace !== undefined;
  const effectiveStatus: WorkspaceStatus['status'] = ready ? 'ready'
    : status.status === 'error' ? 'error' : status.status;
  const message = status.status === 'error' ? status.message
    : (effectiveStatus === 'error' ? '创作台远程服务不可用' : undefined);
  const subtitle = ready ? `已就绪 · ${status.model.version}` : undefined;
  const body = effectiveStatus === 'ready'
    ? h('div', { className: 'nv-workbench__body' }, layerNav(h, ui.activeLayer, ui.activate), contentArea(h, 'default', workspace!, ui.activeLayer, layers, ops))
    : h('section', {
      className: 'nv-workbench__state' + (effectiveStatus === 'error' ? ' nv-workbench__state--error' : ''),
      'data-novel-workspace-state': effectiveStatus,
      role: effectiveStatus === 'error' ? 'alert' : undefined,
    }, effectiveStatus === 'loading' ? '正在装载创作台…' : message);
  return h('section', { className: 'nv-workbench', 'data-novel-workspace': effectiveStatus },
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
}

const freshCharacterEditor = (): CharacterEditor => ({ selectedId: undefined, draft: { id: '', name: '' }, dirty: false, error: '' });
const freshWorldEditor = (): WorldEditor => ({ selectedId: undefined, draft: { id: '' }, dirty: false, error: '' });
const freshOutlineEditor = (): OutlineEditor => ({ draft: emptyOutline(), dirty: false, error: '', selectedActId: undefined, selectedBeatId: undefined, selectedDetailId: undefined });
const freshRelationshipEditor = (): RelationshipEditor => ({ selectedId: undefined, draft: newRelationshipDraft(), dirty: false, error: '' });
const freshStateEditor = (): StateEditor => ({ selectedSeq: undefined, fromSeq: undefined, toSeq: undefined, diff: undefined, error: '' });
const freshCanonEditor = (): CanonEditor => ({ selectedId: undefined, proposalId: undefined, draft: { storyTime: '', summary: '', detail: '' }, dirty: false, error: '' });

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
      let active = true;
      let remoteDisposer: TypertDisposer | undefined;

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
        }),
        actions: {
          open: (d) => { d.open = true; d.collapsed = false; },
          close: (d) => { d.open = false; },
          collapse: (d) => { d.collapsed = !d.collapsed; },
          activate: (d, id: LayerId) => { d.activeLayer = id; },
          ready: (d, model: WorkspaceViewModel) => { d.status = { status: 'ready', model }; },
          fail: (d, message: string) => { d.status = { status: 'error', message }; },
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
      const runReload = (target: WorkspaceNamespace, actions: WorkbenchActions): void => {
        actions.setCharacters('loading', []);
        actions.setWorldview('loading', []);
        actions.setOutline('loading', undefined);
        actions.setRelationship('loading', []);
        actions.setState('loading', []);
        actions.setCanon('loading', []);
        void unwrap(target.characterList('default')).then((list) => dispatch((x) => x.setCharacters('ready', list as unknown[])), (cause: Error) => dispatch((x) => x.setCharacters('error', [], cause.message)));
        void unwrap(target.worldviewList('default')).then((list) => dispatch((x) => x.setWorldview('ready', list as unknown[])), (cause: Error) => dispatch((x) => x.setWorldview('error', [], cause.message)));
        void unwrap(target.outlineRead('default')).then((outline) => {
          dispatch((x) => {
            x.setOutline('ready', outline);
            const shape = outline as OutlineShape;
            x.outlineDraft({ draft: { ...shape }, dirty: false, error: '' });
            if ((shape.acts ?? []).length > 0) {
              const actId = (shape.acts ?? [])[0].id;
              const beatId = ((shape.acts ?? [])[0].beats ?? [])[0]?.id;
              x.outlineDraft({ selectedActId: actId, selectedBeatId: beatId });
            }
          });
        }, (cause: Error) => dispatch((x) => x.setOutline('error', undefined, cause.message)));
        void unwrap(target.relationshipRead('default')).then((list) => dispatch((x) => x.setRelationship('ready', list as unknown[])), (cause: Error) => dispatch((x) => x.setRelationship('error', [], cause.message)));
        void unwrap(target.stateSnapshots('default')).then((snapshots) => {
          dispatch((x) => {
            const list = snapshots as unknown as StateSnapshotShape[];
            x.setState('ready', list);
            if (list.length > 0) x.stateDraft({ selectedSeq: list[list.length - 1].seq, fromSeq: list[0].seq, toSeq: list.length > 1 ? list[list.length - 1].seq : undefined });
          });
        }, (cause: Error) => dispatch((x) => x.setState('error', [], cause.message)));
        void unwrap(target.canonQuery('default')).then((events) => dispatch((x) => x.setCanon('ready', events as unknown[])), (cause: Error) => dispatch((x) => x.setCanon('error', [], cause.message)));
      };
      const reload = (): void => {
        const target = workspace;
        if (active && target !== undefined) dispatch((actions) => runReload(target, actions));
      };

      // Edit-op closures: derive from the current store snapshot and write back
      // via actions. `makeOps` runs at render time, after `inject` has captured
      // the renderer's baked actions, so `capturedActions` resolves safely.
      const makeOps = (snapshot: WorkbenchState): WorkbenchOps => {
        const act = capturedActions as WorkbenchActions;
        return {
          characters: {
            select: (character) => act.characterDraft({ selectedId: character.id, draft: { ...character }, dirty: false, error: '' }),
            newDraft: () => { const draft: CharacterShape = { id: '', name: '', kind: 'extra', aliases: [], personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }; act.characterDraft({ selectedId: undefined, draft, dirty: false, error: '' }); },
            mutate: (update) => act.characterMutate(update),
            save: () => {
              const e = snapshot.characterEditor;
              if (!workspace) { act.characterDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.draft.name.trim() === '') { act.characterDraft({ error: '角色名不能为空' }); return; }
              const effectiveId = e.selectedId ?? slug(e.draft.name);
              if (e.selectedId === undefined) {
                void unwrap(workspace.characterCreate('default', characterCreateInput({ ...e.draft, id: effectiveId }))).then((created) => { if (!active) return; act.characterDraft({ draft: created as CharacterShape, selectedId: (created as CharacterShape).id, dirty: false, error: '' }); act.setCharacters('loading', []); void unwrap(workspace!.characterList('default')).then((list) => act.setCharacters('ready', list as unknown[]), (cause: Error) => { act.setCharacters('error', [], cause.message); act.characterDraft({ error: cause.message }); }); }, (cause: Error) => act.characterDraft({ error: cause.message }));
              } else {
                void unwrap(workspace.characterUpdate('default', e.selectedId, characterCreateInput({ ...e.draft, id: e.selectedId }))).then((updated) => { if (!active) return; act.characterDraft({ draft: { ...(updated as CharacterShape) }, dirty: false, error: '' }); act.setCharacters('loading', []); void unwrap(workspace!.characterList('default')).then((list) => act.setCharacters('ready', list as unknown[]), (cause: Error) => { act.setCharacters('error', [], cause.message); act.characterDraft({ error: cause.message }); }); }, (cause: Error) => act.characterDraft({ error: cause.message }));
              }
            },
          },
          worldview: {
            select: (entry) => act.worldDraft({ selectedId: entry.id, draft: { ...entry }, dirty: false, error: '' }),
            newDraft: () => { const draft: WorldShape = { id: '', kind: 'concept', title: '', content: '', keywords: [], triggerMode: 'constant', weight: 0, parent: null, mutable: true, status: 'active', supersededBy: null }; act.worldDraft({ selectedId: undefined, draft, dirty: false, error: '' }); },
            mutate: (update) => act.worldMutate(update),
            save: () => {
              const e = snapshot.worldEditor;
              if (!workspace) { act.worldDraft({ error: '创作台远程服务不可用' }); return; }
              if ((e.draft.title ?? '').trim() === '') { act.worldDraft({ error: '标题不能为空' }); return; }
              if (e.selectedId === undefined) {
                const effectiveId = slug(e.draft.title ?? 'untitled');
                void unwrap(workspace.worldviewCreate('default', worldviewInput({ ...e.draft, id: effectiveId }))).then((created) => { if (!active) return; act.worldDraft({ draft: created as WorldShape, selectedId: (created as WorldShape).id, dirty: false, error: '' }); void unwrap(workspace!.worldviewList('default')).then((list) => act.setWorldview('ready', list as unknown[]), (cause: Error) => { act.setWorldview('error', [], cause.message); act.worldDraft({ error: cause.message }); }); }, (cause: Error) => act.worldDraft({ error: cause.message }));
              } else {
                const replacementId = slug(e.draft.title ?? e.selectedId);
                void unwrap(workspace.worldviewRewrite('default', e.selectedId, worldviewInput({ ...e.draft, id: replacementId }))).then((result) => { if (!active) return; const replacement = (result as { replacement: WorldShape }).replacement; act.worldDraft({ draft: replacement, selectedId: replacement.id, dirty: false, error: '' }); void unwrap(workspace!.worldviewList('default')).then((list) => act.setWorldview('ready', list as unknown[]), (cause: Error) => { act.setWorldview('error', [], cause.message); act.worldDraft({ error: cause.message }); }); }, (cause: Error) => act.worldDraft({ error: cause.message }));
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
              if (!workspace) { act.outlineDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.draft.logline.trim() === '') { act.outlineDraft({ error: '一句话梗概（logline）不能为空' }); return; }
              void unwrap(workspace.outlineSave('default', outlineInput(e.draft))).then((saved) => { if (!active) return; const outline = saved as OutlineShape; act.outlineDraft({ draft: { ...outline }, dirty: false, error: '' }); act.setOutline('ready', outline); }, (cause: Error) => act.outlineDraft({ error: cause.message }));
            },
          },
          relationship: {
            select: (entry) => act.relationshipDraft({ selectedId: entry.id, draft: { ...entry }, dirty: false, error: '' }),
            newDraft: () => act.relationshipDraft({ selectedId: undefined, draft: newRelationshipDraft(), dirty: false, error: '' }),
            mutate: (update) => act.relationshipMutate(update),
            save: () => {
              const e = snapshot.relationshipEditor;
              if (!workspace) { act.relationshipDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.draft.from.trim() === '' || e.draft.to.trim() === '') { act.relationshipDraft({ error: '关系两端（from/to）不能为空' }); return; }
              const effectiveId = e.selectedId ?? `${slug(e.draft.from)}+${slug(e.draft.to)}`;
              void unwrap(workspace.relationshipSave('default', relationshipInput({ ...e.draft, id: effectiveId }))).then((saved) => { if (!active) return; act.relationshipDraft({ draft: { ...(saved as RelationshipShape) }, selectedId: (saved as RelationshipShape).id, dirty: false, error: '' }); void unwrap(workspace!.relationshipRead('default')).then((list) => act.setRelationship('ready', list as unknown[]), (cause: Error) => { act.setRelationship('error', [], cause.message); act.relationshipDraft({ error: cause.message }); }); }, (cause: Error) => act.relationshipDraft({ error: cause.message }));
            },
          },
          state: {
            select: (seq) => { const e = snapshot.stateEditor; let fromSeq = e.fromSeq; let toSeq = e.toSeq; if (fromSeq === undefined) fromSeq = seq; else if (toSeq === undefined && seq !== fromSeq) toSeq = seq; else { fromSeq = seq; toSeq = undefined; } act.stateDraft({ selectedSeq: seq, fromSeq, toSeq, diff: undefined }); },
            showDiff: () => {
              const e = snapshot.stateEditor;
              if (!workspace) { act.stateDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.fromSeq === undefined || e.toSeq === undefined) { act.stateDraft({ error: '请从时间线选择两个快照再比对' }); return; }
              void unwrap(workspace.stateDiff('default', e.fromSeq, e.toSeq)).then((diff) => act.stateDraft({ diff: diff as StateDiffShape, error: '' }), (cause: Error) => act.stateDraft({ error: cause.message, diff: undefined }));
            },
            rollback: () => {
              const e = snapshot.stateEditor;
              if (!workspace) { act.stateDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.selectedSeq === undefined) { act.stateDraft({ error: '请先选择要回滚到的快照' }); return; }
              void unwrap(workspace.stateRollback('default', e.selectedSeq)).then((rolled) => { if (!active) return; const next = rolled as StateSnapshotShape; act.stateDraft({ selectedSeq: next.seq, diff: undefined, error: '' }); void unwrap(workspace!.stateSnapshots('default')).then((snapshots) => act.setState('ready', snapshots as unknown[]), (cause: Error) => { act.setState('error', [], cause.message); act.stateDraft({ error: cause.message }); }); }, (cause: Error) => act.stateDraft({ error: cause.message }));
            },
          },
          canon: {
            select: (event) => act.canonDraft({ selectedId: event.id, proposalId: undefined, draft: { storyTime: event.storyTime, summary: event.summary, detail: event.detail ?? '' }, dirty: false, error: '' }),
            mutate: (update) => act.canonDraft({ draft: update(snapshot.canonEditor.draft), dirty: true }),
            propose: () => {
              const e = snapshot.canonEditor;
              if (!workspace) { act.canonDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.selectedId === undefined) { act.canonDraft({ error: '请先选择一个正史事件再发起更正' }); return; }
              if ((e.draft.summary ?? '').trim() === '') { act.canonDraft({ error: '更正摘要不能为空' }); return; }
              void unwrap(workspace.canonCorrectionPropose('default', e.selectedId, canonCorrectionInput(e.draft))).then((proposal) => act.canonDraft({ proposalId: (proposal as { id?: string }).id, error: '' }), (cause: Error) => act.canonDraft({ error: cause.message }));
            },
            accept: () => {
              const e = snapshot.canonEditor;
              if (!workspace) { act.canonDraft({ error: '创作台远程服务不可用' }); return; }
              if (e.proposalId === undefined) { act.canonDraft({ error: '请先发起更正提案' }); return; }
              void unwrap(workspace.canonCorrectionAccept('default', e.proposalId)).then(() => { if (!active) return; act.canonDraft({ proposalId: undefined, dirty: false, error: '' }); void unwrap(workspace!.canonQuery('default')).then((events) => act.setCanon('ready', events as unknown[]), (cause: Error) => { act.setCanon('error', [], cause.message); act.canonDraft({ error: cause.message }); }); }, (cause: Error) => act.canonDraft({ error: cause.message }));
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
          return workbenchView(React, s.status, workspace, ui, layers, makeOps(s));
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
            (model) => { dispatch((x) => x.ready(model as WorkspaceViewModel)); reload(); },
            () => { dispatch((x) => x.fail('创作台远程服务不可用')); },
          );
        }, () => { dispatch((x) => x.fail('创作台远程服务不可用')); });
        return () => {
          active = false;
          capturedActions = undefined;
          pending.splice(0);
          workspace = undefined;
          slotDisposer();
          if (remoteDisposer) void remoteDisposer();
        };
      });

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'novel-creation-tool-workspace', order: 0, label: '创作台' },
        () => launchButton(React, () => dispatch((x) => x.open())),
      ));
    },
  };
}
