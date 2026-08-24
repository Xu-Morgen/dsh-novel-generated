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

type WorkspaceState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly model: WorkspaceViewModel };

/**
 * I46「创作台」六层信息架构（design §14.6 / R10-1）。前两层（B3 角色、B2 世界观）
 * 自 I47 起渲染真表单；后四层仍为空态占位，真实内容分别在 I48（B5/C1）、
 * I49（C2/C4）交付。`id` 即测试契约 `data-novel-layer` 的取值。
 */
const LAYERS = [
  { id: 'characters', label: '角色', title: '角色核心（B3）', hint: '角色列表与详情表单（I47）。' },
  { id: 'worldview', label: '世界观', title: '世界观（B2）', hint: '世界观条目与改写（supersede）（I47）。' },
  { id: 'outline', label: '大纲', title: '大纲与细纲（B5）', hint: '幕→节→细纲结构化编辑将在 I48 交付。' },
  { id: 'relationship', label: '关系', title: '关系（C1）', hint: '关系对结构化编辑将在 I48 交付。' },
  { id: 'state', label: '状态', title: '状态快照（C2）', hint: '快照时间线 / 回滚 / diff 将在 I49 交付。' },
  { id: 'canon', label: '正史', title: '正史账本（C4）', hint: '只读账本与 supersede 更正将在 I49 交付。' },
] as const;
type LayerId = (typeof LAYERS)[number]['id'];

/** 面板交互态：overlay 面板与侧栏启动入口共享（关闭后由启动入口重开）。 */
interface WorkbenchUI {
  readonly open: boolean;
  readonly collapsed: boolean;
  readonly activeLayer: LayerId;
  collapse(): void;
  close(): void;
  launch(): void;
  activate(id: LayerId): void;
}

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
function brandHeader(h: El, subtitle: string | undefined, ui: WorkbenchUI): unknown {
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
function layerNav(h: El, ui: WorkbenchUI): unknown {
  return h('nav', { className: 'nv-workbench__nav', 'data-novel-nav': '', 'aria-label': '创作台层级' },
    LAYERS.map((layer) => h('button', {
      key: layer.id,
      type: 'button',
      className: 'nv-workbench__nav-item' + (ui.activeLayer === layer.id ? ' is-active' : ''),
      'data-novel-layer': layer.id,
      'aria-current': ui.activeLayer === layer.id ? 'page' : undefined,
      onClick: () => ui.activate(layer.id),
    }, layer.label)),
  );
}

/** 单层空态占位（I48/I49 仍占位的四层）。 */
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
  // `staticTraits`, `relationships`, `knowledgeIds` are forward refs / optional
  // values sent verbatim; the Host owns their validation (design §0.1.2).
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

/** 持久化角色表单态：跨渲染复用，避免每次 `createElement` 重建丢失输入。 */
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

/** 角色列表表单：列出全部 CharacterCore，可点选载入详情。 */
function characterLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: CharacterLayerState, editor: CharacterEditor, reload: () => void): unknown {
  const loadDraft = (character: CharacterShape): void => {
    editor.selectedId = character.id;
    editor.draft = { ...character };
    editor.dirty = false;
    editor.error = '';
  };
  const newDraft = (): void => {
    editor.selectedId = undefined;
    editor.draft = { id: '', name: '', kind: 'extra', aliases: [], personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] };
    editor.dirty = false;
    editor.error = '';
  };
  const save = (): void => {
    if (!workspace) { editor.error = '创作台远程服务不可用'; return; }
    if (editor.draft.name.trim() === '') { editor.error = '角色名不能为空'; return; }
    const effectiveId = editor.selectedId ?? slug(editor.draft.name);
    if (editor.selectedId === undefined) {
      void unwrap(workspace.characterCreate(projectId, characterCreateInput({ ...editor.draft, id: effectiveId })))
        .then((created) => { editor.draft = created as CharacterShape; editor.selectedId = (created as CharacterShape).id; editor.dirty = false; editor.error = ''; reload(); })
        .catch((cause: Error) => { editor.error = cause.message; });
    } else {
      void unwrap(workspace.characterUpdate(projectId, editor.selectedId, characterCreateInput({ ...editor.draft, id: editor.selectedId })))
        .then((updated) => { editor.draft = { ...(updated as CharacterShape) }; editor.dirty = false; editor.error = ''; reload(); })
        .catch((cause: Error) => { editor.error = cause.message; });
    }
  };
  const mutate = (update: (draft: CharacterShape) => CharacterShape): void => {
    editor.draft = update(editor.draft);
    editor.dirty = true;
  };

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
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-character-new': '', onClick: newDraft }, '新建角色'),
    ),
    layerState.list.map((character) => h('button', {
      key: character.id,
      type: 'button',
      role: 'listitem',
      className: 'nv-editor__item' + (editor.selectedId === character.id ? ' is-active' : ''),
      'data-novel-character-id': character.id,
      onClick: () => loadDraft(character),
    }, character.name)),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, editing ? `编辑角色：${d.name}` : '新建角色'),
    h('div', { className: 'nv-form' },
      characterText(h, '名称', d.name, (value) => mutate((draft) => ({ ...draft, name: value }))),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '类型'),
        h('select', { className: 'nv-field__input', value: d.kind ?? 'extra', onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, kind: event.target.value })) },
          ['protagonist', 'antagonist', 'supporting', 'extra', 'pov'].map((kind) => h('option', { key: kind, value: kind }, kind)),
        ),
      ),
      listField(h, '别名', d.aliases ?? [], (value) => mutate((draft) => ({ ...draft, aliases: value }))),
      characterText(h, '性格', d.personality ?? '', (value) => mutate((draft) => ({ ...draft, personality: value })), true),
      characterText(h, '背景', d.background ?? '', (value) => mutate((draft) => ({ ...draft, background: value })), true),
      characterText(h, '动机', d.motivation ?? '', (value) => mutate((draft) => ({ ...draft, motivation: value })), true),
      listField(h, '目标', d.goals ?? [], (value) => mutate((draft) => ({ ...draft, goals: value }))),
      listField(h, '缺陷', d.flaws ?? [], (value) => mutate((draft) => ({ ...draft, flaws: value }))),
      listField(h, '能力', d.abilities ?? [], (value) => mutate((draft) => ({ ...draft, abilities: value }))),
      characterText(h, '口吻', d.speechStyle ?? '', (value) => mutate((draft) => ({ ...draft, speechStyle: value })), true),
      h('fieldset', { className: 'nv-fieldset' },
        h('legend', { className: 'nv-fieldset__legend' }, '弧光'),
        characterText(h, '起点', d.arc?.startingPoint ?? '', (value) => mutate((draft) => ({ ...draft, arc: { ...draft.arc, startingPoint: value } }))),
        characterText(h, '归宿', d.arc?.desiredEnd ?? '', (value) => mutate((draft) => ({ ...draft, arc: { ...draft.arc, desiredEnd: value } }))),
        listField(h, '关键节拍', d.arc?.keyBeats ?? [], (value) => mutate((draft) => ({ ...draft, arc: { ...draft.arc, keyBeats: value } }))),
      ),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-character-save': '', onClick: save, disabled: !editor.dirty }, '保存'),
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

function worldviewLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: WorldLayerState, editor: WorldEditor, reload: () => void): unknown {
  const loadDraft = (entry: WorldShape): void => {
    editor.selectedId = entry.id;
    editor.draft = { ...entry };
    editor.dirty = false;
    editor.error = '';
  };
  const newDraft = (): void => {
    editor.selectedId = undefined;
    editor.draft = { id: '', kind: 'concept', title: '', content: '', keywords: [], triggerMode: 'constant', weight: 0, parent: null, mutable: true, status: 'active', supersededBy: null };
    editor.dirty = false;
    editor.error = '';
  };
  const save = (): void => {
    if (!workspace) { editor.error = '创作台远程服务不可用'; return; }
    if ((editor.draft.title ?? '').trim() === '') { editor.error = '标题不能为空'; return; }
    if (editor.selectedId === undefined) {
      const effectiveId = slug(editor.draft.title ?? 'untitled');
      void unwrap(workspace.worldviewCreate(projectId, worldviewInput({ ...editor.draft, id: effectiveId })))
        .then((created) => { editor.draft = created as WorldShape; editor.selectedId = (created as WorldShape).id; editor.dirty = false; editor.error = ''; reload(); })
        .catch((cause: Error) => { editor.error = cause.message; });
    } else {
      // 世界观「改写」= 提交替换内容走 `worldviewRewrite`（supersede，非就地覆写）。
      const replacementId = slug(editor.draft.title ?? editor.selectedId);
      void unwrap(workspace.worldviewRewrite(projectId, editor.selectedId, worldviewInput({ ...editor.draft, id: replacementId })))
        .then((result) => {
          const replacement = (result as { replacement: WorldShape }).replacement;
          editor.draft = replacement; editor.selectedId = replacement.id; editor.dirty = false; editor.error = ''; reload();
        })
        .catch((cause: Error) => { editor.error = cause.message; });
    }
  };
  const mutate = (update: (draft: WorldShape) => WorldShape): void => {
    editor.draft = update(editor.draft);
    editor.dirty = true;
  };

  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'loading' }, '正在装载世界观…');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '世界观素材读取失败');
  }
  const d = editor.draft;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-worldview-new': '', onClick: newDraft }, '新建条目'),
    ),
    layerState.list.map((entry) => h('button', {
      key: entry.id,
      type: 'button',
      role: 'listitem',
      className: 'nv-editor__item' + (editor.selectedId === entry.id ? ' is-active' : ''),
      'data-novel-worldview-id': entry.id,
      onClick: () => loadDraft(entry),
    }, entry.title ?? entry.id)),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, editor.selectedId === undefined ? '新建条目' : `编辑条目：${d.title ?? editor.selectedId}`),
    h('div', { className: 'nv-form' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '标题'),
        h('input', { type: 'text', className: 'nv-field__input', value: d.title ?? '', onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, title: event.target.value })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '类型'),
        h('select', { className: 'nv-field__input', value: d.kind ?? 'concept', onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, kind: event.target.value })) },
          ['geography', 'history', 'faction', 'culture', 'race', 'concept', 'artifact'].map((kind) => h('option', { key: kind, value: kind }, kind)),
        ),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '内容'),
        h('textarea', { className: 'nv-field__input', value: d.content ?? '', rows: 4, onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, content: event.target.value })) }),
      ),
      listField(h, '触发词', d.keywords ?? [], (value) => mutate((draft) => ({ ...draft, keywords: value }))),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '触发方式'),
        h('select', { className: 'nv-field__input', value: d.triggerMode ?? 'constant', onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, triggerMode: event.target.value })) },
          ['keyword', 'regex', 'constant'].map((mode) => h('option', { key: mode, value: mode }, mode)),
        ),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '权重'),
        h('input', { type: 'number', className: 'nv-field__input', value: String(d.weight ?? 0), onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, weight: Number.parseInt(event.target.value, 10) || 0 })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '父条目（可空）'),
        h('input', { type: 'text', className: 'nv-field__input', value: d.parent ?? '', onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, parent: event.target.value === '' ? null : event.target.value })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '可否改写'),
        h('input', { type: 'checkbox', className: 'nv-field__check', checked: d.mutable ?? true, onChange: (event: { target: { checked: boolean } }) => mutate((draft) => ({ ...draft, mutable: event.target.checked })) }),
      ),
      editor.selectedId !== undefined && d.status === 'rewritten'
        ? h('p', { className: 'nv-editor__badge', 'data-novel-worldview-rewritten': '' }, `已被 ${d.supersededBy ?? '?'} 改写`)
        : null,
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-worldview-save': '', onClick: save, disabled: !editor.dirty },
        editor.selectedId === undefined ? '创建' : '改写'),
    ),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'worldview', role: 'alert' }, editor.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, list, detail),
  );
}

/** 内容区：按激活层渲染真表单（I47）或空态（I48/I49）。 */
function contentArea(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, ui: WorkbenchUI, layers: LayerData): unknown {
  const layer = LAYERS.find((item) => item.id === ui.activeLayer) ?? LAYERS[0];
  if (layer.id === 'characters') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      characterLayer(h, projectId, workspace, layers.characters, layers.characterEditor, layers.reloadCharacters));
  }
  if (layer.id === 'worldview') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      worldviewLayer(h, projectId, workspace, layers.worldview, layers.worldEditor, layers.reloadWorldview));
  }
  return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' }, emptyState(h, layer));
}

/** I47 数据层：角色/世界观列表与表单态在面板装载后维护，供真表单渲染。 */
interface LayerData {
  readonly characters: CharacterLayerState;
  readonly worldview: WorldLayerState;
  readonly characterEditor: CharacterEditor;
  readonly worldEditor: WorldEditor;
  readonly reloadCharacters: () => void;
  readonly reloadWorldview: () => void;
}

/** 面板主体：品牌头栏 + 层级导航 + 内容区。 */
function workbenchView(React: ReactFace, state: WorkspaceState, workspace: WorkspaceNamespace | undefined, ui: WorkbenchUI, layers: LayerData): unknown {
  const h = el(React);
  if (!ui.open) return null;
  const ready = state.status === 'ready' && workspace !== undefined;
  const effectiveStatus: WorkspaceState['status'] = ready ? 'ready'
    : state.status === 'error' ? 'error' : state.status;
  const message = state.status === 'error' ? state.message
    : (effectiveStatus === 'error' ? '创作台远程服务不可用' : undefined);
  const subtitle = ready ? `已就绪 · ${state.model.version}` : undefined;
  const body = effectiveStatus === 'ready'
    ? h('div', { className: 'nv-workbench__body' }, layerNav(h, ui), contentArea(h, 'default', workspace!, ui, layers))
    : h('section', {
      className: 'nv-workbench__state' + (effectiveStatus === 'error' ? ' nv-workbench__state--error' : ''),
      'data-novel-workspace-state': effectiveStatus,
      role: effectiveStatus === 'error' ? 'alert' : undefined,
    }, effectiveStatus === 'loading' ? '正在装载创作台…' : message);
  return h('section', { className: 'nv-workbench', 'data-novel-workspace': effectiveStatus },
    brandHeader(h, subtitle, ui),
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

/** Public bundle factory; React and Remote are supplied by the DSH client shell. */
export default function factory(require: BundleRequire): ClientPluginEntry {
  const React = require('react') as ReactFace;
  return {
    name: 'novel-creation-tool-client',
    inject: ['slots', 'remote'],
    apply(ctx): void {
      let state: WorkspaceState = { status: 'loading' };
      let workspace: WorkspaceNamespace | undefined;
      let mounted = false;
      let remoteDisposer: TypertDisposer | undefined;
      let open = true;
      let collapsed = false;
      let activeLayer: LayerId = 'characters';
      const ui: WorkbenchUI = {
        get open() { return open; },
        get collapsed() { return collapsed; },
        get activeLayer() { return activeLayer; },
        collapse() { collapsed = !collapsed; },
        close() { open = false; },
        launch() { open = true; collapsed = false; },
        activate(id) { activeLayer = id; },
      };

      // I47 数据层：角色/世界观列表与表单态受 Host Remote 驱动，跨渲染复用。
      let characterState: CharacterLayerState = { status: 'loading', list: [] };
      let worldState: WorldLayerState = { status: 'loading', list: [] };
      const characterEditor: CharacterEditor = { selectedId: undefined, draft: { id: '', name: '' }, dirty: false, error: '' };
      const worldEditor: WorldEditor = { selectedId: undefined, draft: { id: '' }, dirty: false, error: '' };
      const reloadCharacters = (): void => {
        const target = workspace;
        if (!target) { characterState = { status: 'error', list: [], message: '创作台远程服务不可用' }; return; }
        characterState = { status: 'loading', list: [] };
        void unwrap(target.characterList('default')).then(
          (list) => { characterState = { status: 'ready', list: list as CharacterShape[] }; },
          (cause: Error) => { characterState = { status: 'error', list: [], message: cause.message }; },
        );
      };
      const reloadWorldview = (): void => {
        const target = workspace;
        if (!target) { worldState = { status: 'error', list: [], message: '创作台远程服务不可用' }; return; }
        worldState = { status: 'loading', list: [] };
        void unwrap(target.worldviewList('default')).then(
          (list) => { worldState = { status: 'ready', list: list as WorldShape[] }; },
          (cause: Error) => { worldState = { status: 'error', list: [], message: cause.message }; },
        );
      };
      const layers: LayerData = {
        get characters() { return characterState; },
        get worldview() { return worldState; },
        characterEditor,
        worldEditor,
        reloadCharacters,
        reloadWorldview,
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
        const slotDisposer = ctx.slots.register(
          { name: 'shell.overlay', id: 'novel-creation-tool-workspace', order: 0, label: '创作台' },
          () => workbenchView(React, state, workspace, ui, layers),
        );
        // Self-mount the namespace, then resolve it through `ctx.get` instead of
        // `inject`: injecting `remote.novelWorkspace` here would deadlock, because
        // that service only exists after `$mount` completes.
        void ctx.remote.$mount(workspaceRemoteContribution).then((dispose) => {
          if (!mounted) { void dispose(); return; }
          remoteDisposer = dispose;
          workspace = ctx.get('remote.novelWorkspace', false) as WorkspaceNamespace | undefined;
          if (!workspace) { state = { status: 'error', message: '创作台远程服务不可用' }; return; }
          return unwrap(workspace.viewModel()).then(
            (model) => {
              state = { status: 'ready', model: model as WorkspaceViewModel };
              reloadCharacters();
              reloadWorldview();
            },
            () => { state = { status: 'error', message: '创作台远程服务不可用' }; },
          );
        }, () => { state = { status: 'error', message: '创作台远程服务不可用' }; });
        mounted = true;
        return () => {
          mounted = false;
          slotDisposer();
          if (remoteDisposer) void remoteDisposer();
        };
      });

      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register(
        { name: 'sidebar.footer.action', id: 'novel-creation-tool-workspace', order: 0, label: '创作台' },
        () => launchButton(React, ui.launch),
      ));
    },
  };
}
