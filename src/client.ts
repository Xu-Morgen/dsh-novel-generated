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
  { id: 'outline', label: '大纲', title: '大纲与细纲（B5）', hint: '幕→节→细纲结构化编辑（I48）。' },
  { id: 'relationship', label: '关系', title: '关系（C1）', hint: '关系对结构化编辑（I48）。' },
  { id: 'state', label: '状态', title: '状态快照（C2）', hint: '快照时间线 / 回滚 / diff（I49）。' },
  { id: 'canon', label: '正史', title: '正史账本（C4）', hint: '只读账本与 supersede 更正（I49）。' },
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

/**
 * I48 B5 大纲结构化编辑器（design §5.7 / R10-5）。替换裸 JSON 文本框：幕→节→
 * 细纲场景卡的三级层级编辑。所有读写只经 Host `outlineRead`/`outlineSave`/
 * `outlineBeatCards`，Client 不拥有领域校验（design §0.1.2），非法引用/越界由
 * Host 拒绝并回传错误。
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
function outlineLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: OutlineLayerState, editor: OutlineEditor, reload: () => void): unknown {
  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'loading' }, '正在装载大纲…');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '大纲读取失败');
  }
  const mutate = (update: (draft: OutlineShape) => OutlineShape): void => {
    editor.draft = update(editor.draft);
    editor.dirty = true;
  };
  const upsert = <T,>(list: T[], item: T): T[] => {
    const index = list.findIndex((entry) => (entry as { id?: string }).id === (item as { id?: string }).id);
    if (index >= 0) { const next = list.slice(); next[index] = item; return next; }
    return list.concat(item);
  };
  const setAct = (actId: string, update: (act: OutlineActShape) => OutlineActShape): void => mutate((draft) => ({ ...draft, acts: upsert(draft.acts ?? [], update(currentAct(draft, actId))) }));
  const setBeat = (actId: string, beatId: string, update: (beat: OutlineBeatShape) => OutlineBeatShape): void => mutate((draft) => {
    const act = currentAct(draft, actId);
    return { ...draft, acts: upsert(draft.acts ?? [], { ...act, beats: upsert(act.beats ?? [], update(currentBeat(act, beatId))) }) };
  });
  const currentAct = (draft: OutlineShape, actId: string): OutlineActShape =>
    (draft.acts ?? []).find((act) => act.id === actId)
    ?? { id: actId, index: (draft.acts ?? []).length, title: '', goal: '', beats: [] };
  const currentBeat = (act: OutlineActShape, beatId: string): OutlineBeatShape =>
    (act.beats ?? []).find((beat) => beat.id === beatId)
    ?? { id: beatId, title: '', description: '', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] };
  const addAct = (): void => {
    const id = `act-${(editor.draft.acts ?? []).length + 1}`;
    mutate((draft) => ({ ...draft, acts: (draft.acts ?? []).concat({ id, index: (draft.acts ?? []).length, title: '', goal: '', beats: [] }) }));
    editor.selectedActId = id; editor.selectedBeatId = undefined; editor.selectedDetailId = undefined;
  };
  const removeAct = (actId: string): void => {
    const acts = (editor.draft.acts ?? []).filter((act) => act.id !== actId)
      .map((act, index) => ({ ...act, index }));
    mutate((draft) => ({ ...draft, acts }));
    if (editor.selectedActId === actId) { editor.selectedActId = undefined; editor.selectedBeatId = undefined; editor.selectedDetailId = undefined; }
  };
  const addBeat = (actId: string): void => {
    const count = currentAct(editor.draft, actId).beats?.length ?? 0;
    const id = `beat-${count + 1}`;
    setBeat(actId, id, () => ({ id, title: '', description: '', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] }));
    editor.selectedActId = actId; editor.selectedBeatId = id; editor.selectedDetailId = undefined;
  };
  const removeBeat = (actId: string, beatId: string): void => {
    setAct(actId, (act) => ({ ...act, beats: (act.beats ?? []).filter((beat) => beat.id !== beatId) }));
    if (editor.selectedBeatId === beatId) { editor.selectedBeatId = undefined; editor.selectedDetailId = undefined; }
  };
  const save = (): void => {
    if (!workspace) { editor.error = '创作台远程服务不可用'; return; }
    if (editor.draft.logline.trim() === '') { editor.error = '一句话梗概（logline）不能为空'; return; }
    void unwrap(workspace.outlineSave(projectId, outlineInput(editor.draft)))
      .then((saved) => { editor.draft = { ...(saved as OutlineShape) }; editor.dirty = false; editor.error = ''; reload(); })
      .catch((cause: Error) => { editor.error = cause.message; });
  };

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
      sceneCards(h, beat, editor.selectedDetailId, (id) => { editor.selectedDetailId = id; }),
    );

  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-outline__toolbar' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '结构'),
        h('select', { className: 'nv-field__input', value: editor.draft.structure, onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, structure: event.target.value })) },
          ['three-act', 'hero-journey', 'serial', 'free'].map((s) => h('option', { key: s, value: s }, s)),
        ),
      ),
      characterText(h, '一句话梗概', editor.draft.logline, (value) => mutate((draft) => ({ ...draft, logline: value }))),
      listField(h, '主题', editor.draft.themes ?? [], (value) => mutate((draft) => ({ ...draft, themes: value }))),
    ),
    h('div', { className: 'nv-outline__columns' },
      h('div', { className: 'nv-editor__list' },
        h('div', { className: 'nv-editor__toolbar' },
          h('button', { type: 'button', className: 'nv-btn', 'data-novel-outline-add-act': '', onClick: addAct }, '+ 幕'),
        ),
        (editor.draft.acts ?? []).map((a) => h('div', { key: a.id, className: 'nv-outline__act' },
          h('button', {
            type: 'button', className: 'nv-editor__item' + (editor.selectedActId === a.id ? ' is-active' : ''),
            'data-novel-outline-act': a.id, onClick: () => { editor.selectedActId = a.id; editor.selectedBeatId = undefined; editor.selectedDetailId = undefined; },
          }, `幕${a.index} · ${a.title || a.id}`),
          h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-remove-act': a.id, onClick: () => removeAct(a.id) }, '删'),
          h('div', { className: 'nv-outline__beats' },
            (a.beats ?? []).map((b) => h('button', {
              key: b.id, type: 'button', className: 'nv-editor__item nv-outline__beat' + (editor.selectedBeatId === b.id ? ' is-active' : ''),
              'data-novel-outline-beat': b.id, onClick: () => { editor.selectedActId = a.id; editor.selectedBeatId = b.id; editor.selectedDetailId = undefined; },
            }, `节 · ${b.title || b.id}`)),
            h('button', { type: 'button', className: 'nv-btn', 'data-novel-outline-add-beat': a.id, onClick: () => addBeat(a.id) }, '+ 节'),
          ),
        )),
      ),
      h('div', { className: 'nv-outline__main' },
        actPanel,
        beatPanel,
      ),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-outline-save': '', onClick: save, disabled: !editor.dirty }, '保存大纲'),
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
function relationshipLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: RelationshipLayerState, editor: RelationshipEditor, reload: () => void): unknown {
  const loadDraft = (entry: RelationshipShape): void => {
    editor.selectedId = entry.id; editor.draft = { ...entry }; editor.dirty = false; editor.error = '';
  };
  const newDraft = (): void => {
    editor.selectedId = undefined; editor.draft = newRelationshipDraft(); editor.dirty = false; editor.error = '';
  };
  const mutate = (update: (draft: RelationshipShape) => RelationshipShape): void => {
    editor.draft = update(editor.draft); editor.dirty = true;
  };
  const save = (): void => {
    if (!workspace) { editor.error = '创作台远程服务不可用'; return; }
    if (editor.draft.from.trim() === '' || editor.draft.to.trim() === '') { editor.error = '关系两端（from/to）不能为空'; return; }
    const effectiveId = editor.selectedId ?? `${slug(editor.draft.from)}+${slug(editor.draft.to)}`;
    void unwrap(workspace.relationshipSave(projectId, relationshipInput({ ...editor.draft, id: effectiveId })))
      .then((saved) => { editor.draft = { ...(saved as RelationshipShape) }; editor.selectedId = (saved as RelationshipShape).id; editor.dirty = false; editor.error = ''; reload(); })
      .catch((cause: Error) => { editor.error = cause.message; });
  };

  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'loading' }, '正在装载关系…');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '关系素材读取失败');
  }
  const d = editor.draft;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-relationship-new': '', onClick: newDraft }, '新建关系'),
    ),
    layerState.list.map((entry) => h('button', {
      key: entry.id, type: 'button', role: 'listitem',
      className: 'nv-editor__item' + (editor.selectedId === entry.id ? ' is-active' : ''),
      'data-novel-relationship-id': entry.id, onClick: () => loadDraft(entry),
    }, `${entry.from} → ${entry.to}`)),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, editor.selectedId === undefined ? '新建关系' : `编辑关系：${d.from} → ${d.to}`),
    h('div', { className: 'nv-form' },
      h('div', { className: 'nv-form__row' },
        characterText(h, '从（角色 id）', d.from, (value) => mutate((draft) => ({ ...draft, from: value }))),
        characterText(h, '到（角色 id）', d.to, (value) => mutate((draft) => ({ ...draft, to: value }))),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '关系类型'),
        h('select', { className: 'nv-field__input', value: d.type ?? 'friendship', onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, type: event.target.value })) },
          ['kin', 'romantic', 'friendship', 'rivalry', 'enmity', 'allegiance', 'mentor', 'subordinate'].map((t) => h('option', { key: t, value: t }, t)),
        ),
      ),
      h('div', { className: 'nv-form__row' },
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, `亲密度（-100..100）：${d.affinity}`),
          h('input', { type: 'range', min: '-100', max: '100', step: '1', className: 'nv-field__range', value: String(d.affinity ?? 0), onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, affinity: Number.parseInt(event.target.value, 10) || 0 })) }),
        ),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, `信任（0..100）：${d.trust}`),
          h('input', { type: 'range', min: '0', max: '100', step: '1', className: 'nv-field__range', value: String(d.trust ?? 0), onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, trust: Number.parseInt(event.target.value, 10) || 0 })) }),
        ),
      ),
      characterText(h, '状态', d.status ?? 'active', (value) => mutate((draft) => ({ ...draft, status: value }))),
      listField(h, '里程碑', d.milestones ?? [], (value) => mutate((draft) => ({ ...draft, milestones: value }))),
      listField(h, '知情边界（knownTo）', d.knownTo ?? [], (value) => mutate((draft) => ({ ...draft, knownTo: value }))),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-relationship-save': '', onClick: save, disabled: !editor.dirty }, '保存'),
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
function stateLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: StateLayerState, editor: StateEditor, reload: () => void): unknown {
  const rollback = (): void => {
    if (!workspace) { editor.error = '创作台远程服务不可用'; return; }
    if (editor.selectedSeq === undefined) { editor.error = '请先选择要回滚到的快照'; return; }
    // 回滚是 Host 侧写操作：经 StateEngine 追加一个指向旧值的新快照，Client 无写回逻辑。
    void unwrap(workspace.stateRollback(projectId, editor.selectedSeq))
      .then((rolled) => {
        const next = rolled as StateSnapshotShape;
        editor.selectedSeq = next.seq; editor.diff = undefined; editor.error = ''; reload();
      })
      .catch((cause: Error) => { editor.error = cause.message; });
  };
  const showDiff = (): void => {
    if (!workspace) { editor.error = '创作台远程服务不可用'; return; }
    const from = editor.fromSeq; const to = editor.toSeq;
    if (from === undefined || to === undefined) { editor.error = '请从时间线选择两个快照再比对'; return; }
    void unwrap(workspace.stateDiff(projectId, from, to))
      .then((diff) => { editor.diff = diff as StateDiffShape; editor.error = ''; })
      .catch((cause: Error) => { editor.error = cause.message; editor.diff = undefined; });
  };
  const select = (seq: number): void => {
    editor.selectedSeq = seq;
    if (editor.fromSeq === undefined) editor.fromSeq = seq;
    else if (editor.toSeq === undefined && seq !== editor.fromSeq) editor.toSeq = seq;
    else { editor.fromSeq = seq; editor.toSeq = undefined; }
    editor.diff = undefined;
  };

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
      onClick: () => select(snapshot.seq),
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
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-state-diff': '', onClick: showDiff, disabled: editor.fromSeq === undefined || editor.toSeq === undefined }, '比对所选快照'),
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-state-rollback': '', onClick: rollback, disabled: editor.selectedSeq === undefined }, '回滚到此快照'),
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
function canonLayer(h: El, projectId: string, workspace: WorkspaceNamespace | undefined, layerState: CanonLayerState, editor: CanonEditor, reload: () => void): unknown {
  const loadDraft = (event: CanonEventShape): void => {
    editor.selectedId = event.id;
    editor.proposalId = undefined;
    editor.draft = { storyTime: event.storyTime, summary: event.summary, detail: event.detail ?? '' };
    editor.dirty = false;
    editor.error = '';
  };
  const mutate = (update: (draft: CanonEditor['draft']) => CanonEditor['draft']): void => {
    editor.draft = update(editor.draft);
    editor.dirty = true;
  };
  /** propose：生成 Gate 提案（pending），不写正史。 */
  const propose = (): void => {
    if (!workspace) { editor.error = '创作台远程服务不可用'; return; }
    if (editor.selectedId === undefined) { editor.error = '请先选择一个正史事件再发起更正'; return; }
    if ((editor.draft.summary ?? '').trim() === '') { editor.error = '更正摘要不能为空'; return; }
    void unwrap(workspace.canonCorrectionPropose(projectId, editor.selectedId, canonCorrectionInput(editor.draft)))
      .then((proposal) => {
        editor.proposalId = (proposal as { id?: string }).id;
        editor.error = '';
      })
      .catch((cause: Error) => { editor.error = cause.message; });
  };
  /** accept：确认后才追加 supersede 事件。 */
  const accept = (): void => {
    if (!workspace) { editor.error = '创作台远程服务不可用'; return; }
    if (editor.proposalId === undefined) { editor.error = '请先发起更正提案'; return; }
    void unwrap(workspace.canonCorrectionAccept(projectId, editor.proposalId))
      .then(() => { editor.proposalId = undefined; editor.dirty = false; editor.error = ''; reload(); })
      .catch((cause: Error) => { editor.error = cause.message; });
  };

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
      onClick: () => loadDraft(event),
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
          h('input', { type: 'text', className: 'nv-field__input', value: editor.draft.storyTime, onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, storyTime: event.target.value })) }),
        ),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, '更正摘要'),
          h('input', { type: 'text', className: 'nv-field__input', value: editor.draft.summary, onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, summary: event.target.value })) }),
        ),
        h('label', { className: 'nv-field' },
          h('span', { className: 'nv-field__label' }, '更正详情'),
          h('textarea', { className: 'nv-field__input', rows: 3, value: editor.draft.detail, onChange: (event: { target: { value: string } }) => mutate((draft) => ({ ...draft, detail: event.target.value })) }),
        ),
      ),
    h('div', { className: 'nv-editor__actions' },
      editor.proposalId !== undefined
        ? h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-canon-accept': '', onClick: accept }, '确认更正（追加 supersede）')
        : h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-canon-propose': '', onClick: propose, disabled: editor.selectedId === undefined || !editor.dirty }, '发起更正提案'),
    ),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'canon', role: 'alert' }, editor.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'canon', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, list, detail),
  );
}

/** 内容区：按激活层渲染真表单（I47/I48/I49），仅兜底空态。 */
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
  if (layer.id === 'outline') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      outlineLayer(h, projectId, workspace, layers.outline, layers.outlineEditor, layers.reloadOutline));
  }
  if (layer.id === 'relationship') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      relationshipLayer(h, projectId, workspace, layers.relationship, layers.relationshipEditor, layers.reloadRelationship));
  }
  if (layer.id === 'state') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      stateLayer(h, projectId, workspace, layers.state, layers.stateEditor, layers.reloadState));
  }
  if (layer.id === 'canon') {
    return h('main', { className: 'nv-workbench__content', 'data-novel-content': '' },
      canonLayer(h, projectId, workspace, layers.canon, layers.canonEditor, layers.reloadCanon));
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
  readonly reloadCharacters: () => void;
  readonly reloadWorldview: () => void;
  readonly reloadOutline: () => void;
  readonly reloadRelationship: () => void;
  readonly reloadState: () => void;
  readonly reloadCanon: () => void;
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

      // I47/I48/I49 数据层：各领域列表与表单态受 Host Remote 驱动，跨渲染复用。
      let characterState: CharacterLayerState = { status: 'loading', list: [] };
      let worldState: WorldLayerState = { status: 'loading', list: [] };
      let outlineState: OutlineLayerState = { status: 'loading' };
      let relationshipState: RelationshipLayerState = { status: 'loading', list: [] };
      let stateLayerState: StateLayerState = { status: 'loading', snapshots: [] };
      let canonLayerState: CanonLayerState = { status: 'loading', events: [] };
      const characterEditor: CharacterEditor = { selectedId: undefined, draft: { id: '', name: '' }, dirty: false, error: '' };
      const worldEditor: WorldEditor = { selectedId: undefined, draft: { id: '' }, dirty: false, error: '' };
      const outlineEditor: OutlineEditor = { draft: emptyOutline(), dirty: false, error: '', selectedActId: undefined, selectedBeatId: undefined, selectedDetailId: undefined };
      const relationshipEditor: RelationshipEditor = { selectedId: undefined, draft: newRelationshipDraft(), dirty: false, error: '' };
      const stateEditor: StateEditor = { selectedSeq: undefined, fromSeq: undefined, toSeq: undefined, diff: undefined, error: '' };
      const canonEditor: CanonEditor = { selectedId: undefined, proposalId: undefined, draft: { storyTime: '', summary: '', detail: '' }, dirty: false, error: '' };
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
      const reloadOutline = (): void => {
        const target = workspace;
        if (!target) { outlineState = { status: 'error', message: '创作台远程服务不可用' }; return; }
        outlineState = { status: 'loading' };
        void unwrap(target.outlineRead('default')).then(
          (outline) => {
            const shape = outline as OutlineShape;
            outlineState = { status: 'ready', outline: shape };
            // 载入后以 Host 大纲为唯一 draft 来源；未选中时选中第一幕/第一节。
            outlineEditor.draft = { ...shape };
            outlineEditor.dirty = false;
            outlineEditor.error = '';
            if (outlineEditor.selectedActId === undefined && (shape.acts ?? []).length > 0) {
              outlineEditor.selectedActId = (shape.acts ?? [])[0].id;
            }
            if (outlineEditor.selectedBeatId === undefined) {
              const act = (shape.acts ?? []).find((item) => item.id === outlineEditor.selectedActId)
                ?? (shape.acts ?? [])[0];
              outlineEditor.selectedBeatId = (act?.beats ?? [])[0]?.id;
            }
          },
          (cause: Error) => { outlineState = { status: 'error', message: cause.message }; },
        );
      };
      const reloadRelationship = (): void => {
        const target = workspace;
        if (!target) { relationshipState = { status: 'error', list: [], message: '创作台远程服务不可用' }; return; }
        relationshipState = { status: 'loading', list: [] };
        void unwrap(target.relationshipRead('default')).then(
          (list) => { relationshipState = { status: 'ready', list: list as RelationshipShape[] }; },
          (cause: Error) => { relationshipState = { status: 'error', list: [], message: cause.message }; },
        );
      };
      const reloadState = (): void => {
        const target = workspace;
        if (!target) { stateLayerState = { status: 'error', snapshots: [], message: '创作台远程服务不可用' }; return; }
        stateLayerState = { status: 'loading', snapshots: [] };
        void unwrap(target.stateSnapshots('default')).then(
          (snapshots) => {
            const list = (snapshots as StateSnapshotShape[]);
            stateLayerState = { status: 'ready', snapshots: list };
            // 载入后默认选中当前（最后一）快照；diff 端点初始化为前两快照。
            if (stateEditor.selectedSeq === undefined && list.length > 0) stateEditor.selectedSeq = list[list.length - 1].seq;
            if (stateEditor.fromSeq === undefined && list.length > 0) stateEditor.fromSeq = list[0].seq;
            if (stateEditor.toSeq === undefined && list.length > 1) stateEditor.toSeq = list[list.length - 1].seq;
          },
          (cause: Error) => { stateLayerState = { status: 'error', snapshots: [], message: cause.message }; },
        );
      };
      const reloadCanon = (): void => {
        const target = workspace;
        if (!target) { canonLayerState = { status: 'error', events: [], message: '创作台远程服务不可用' }; return; }
        canonLayerState = { status: 'loading', events: [] };
        void unwrap(target.canonQuery('default')).then(
          (events) => { canonLayerState = { status: 'ready', events: events as CanonEventShape[] }; },
          (cause: Error) => { canonLayerState = { status: 'error', events: [], message: cause.message }; },
        );
      };
      const layers: LayerData = {
        get characters() { return characterState; },
        get worldview() { return worldState; },
        get outline() { return outlineState; },
        get relationship() { return relationshipState; },
        get state() { return stateLayerState; },
        get canon() { return canonLayerState; },
        characterEditor,
        worldEditor,
        outlineEditor,
        relationshipEditor,
        stateEditor,
        canonEditor,
        reloadCharacters,
        reloadWorldview,
        reloadOutline,
        reloadRelationship,
        reloadState,
        reloadCanon,
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
              reloadOutline();
              reloadRelationship();
              reloadState();
              reloadCanon();
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
