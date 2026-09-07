import { listField, type El, type WorkspaceNamespace } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import { renderSaveStatus, saveButtonLabel, saveStatusLine } from '../save-status.js';
import { triggerModeSchema, worldKindSchema, type TriggerMode, type WorldKind } from '../../core/schema/worldview.js';
// I78：表单模型单一来源 `src/client/shapes.ts`（派生自 core schema，见 shapes.ts 契约注释）。
export type { WorldShape } from '../shapes.js';
import type { WorldShape } from '../shapes.js';
import { entitySelect, type EntityOption } from '../entity-selectors.js';

/** B2 下拉选项：直接来自 core 枚举（消除硬编码副本，review §6.2/§6.3）。 */
export const WORLD_KINDS: readonly WorldKind[] = worldKindSchema.options;
export const TRIGGER_MODES: readonly TriggerMode[] = triggerModeSchema.options;
export const WORLD_KIND_LABELS: Readonly<Record<WorldKind, string>> = {
  geography: '地理', history: '历史', faction: '阵营', culture: '文化', race: '族群', concept: '概念', artifact: '器物',
};
export const TRIGGER_MODE_LABELS: Readonly<Record<TriggerMode, string>> = {
  constant: '始终生效', keyword: '关键词触发', regex: '模式匹配',
};

export interface WorldLayerState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly list: WorldShape[];
  readonly message?: string;
}

export interface WorldEditor {
  selectedId: string | undefined;
  draft: WorldShape;
  dirty: boolean;
  error: string;
  /** I59 保存中（R12-6）：按钮忙碌禁用 + 状态行。 */
  saving: boolean;
  /** I59 已保存反馈文案（R12-6）。 */
  saveMessage: string;
}

export interface WorldEditOps {
  select(entry: WorldShape): void;
  newDraft(): void;
  mutate(update: (draft: WorldShape) => WorldShape): void;
  save(): void;
}

export function worldviewInput(draft: WorldShape): Parameters<WorkspaceNamespace['worldviewCreate']>[1] {
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

/** B2 worldview list and rewrite form. Mutations delegate to the supplied store operations. */
export function worldviewLayer(
  h: El,
  _projectId: string,
  _workspace: WorkspaceNamespace | undefined,
  layerState: WorldLayerState,
  editor: WorldEditor,
  ops: WorldEditOps,
  parentOptions: readonly EntityOption[] = [],
): unknown {
  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'loading' }, '正在装载世界观…');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '世界观素材读取失败');
  }
  const d = editor.draft;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-worldview-new': '', onClick: ops.newDraft }, '新建设定'),
    ),
    layerState.list.map((entry) => h('button', {
      key: entry.id,
      type: 'button',
      role: 'listitem',
      className: 'nv-editor__item' + (editor.selectedId === entry.id ? ' is-active' : ''),
      'data-novel-worldview-id': entry.id,
      onClick: () => ops.select(entry),
    }, entry.title || '未命名条目')),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, editor.selectedId === undefined ? '新建设定' : `编辑条目：${d.title || '未命名条目'}`),
    h('div', { className: 'nv-form' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '标题'),
        h('input', { type: 'text', className: 'nv-field__input', value: d.title ?? '', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, title: event.target.value })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '类型'),
        h('select', { className: 'nv-field__input', value: d.kind ?? 'concept', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, kind: event.target.value as WorldKind })) },
          WORLD_KINDS.map((kind) => h('option', { key: kind, value: kind }, WORLD_KIND_LABELS[kind])),
        ),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '内容'),
        h('textarea', { className: 'nv-field__input', value: d.content ?? '', rows: 4, onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, content: event.target.value })) }),
      ),
      listField(h, '触发词', d.keywords ?? [], (value) => ops.mutate((draft) => ({ ...draft, keywords: value }))),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '触发方式'),
        h('select', { className: 'nv-field__input', value: d.triggerMode ?? 'constant', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, triggerMode: event.target.value as TriggerMode })) },
          TRIGGER_MODES.map((mode) => h('option', { key: mode, value: mode }, TRIGGER_MODE_LABELS[mode])),
        ),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '权重'),
        h('input', { type: 'number', className: 'nv-field__input', value: String(d.weight ?? 0), onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, weight: Number.parseInt(event.target.value, 10) || 0 })) }),
      ),
      entitySelect(h, '父条目（可空）', d.parent ?? '', parentOptions.filter((option) => option.id !== d.id), (value) => ops.mutate((draft) => ({ ...draft, parent: value === '' ? null : value })), 'worldview-parent'),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '可否改写'),
        h('input', { type: 'checkbox', className: 'nv-field__check', checked: d.mutable ?? true, onChange: (event: { target: { checked: boolean } }) => ops.mutate((draft) => ({ ...draft, mutable: event.target.checked })) }),
      ),
      editor.selectedId !== undefined && d.status === 'rewritten'
        ? h('p', { className: 'nv-editor__badge', 'data-novel-worldview-rewritten': '' }, '已有后续改写')
        : null,
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-worldview-save': '', onClick: ops.save, disabled: !editor.dirty || editor.saving },
        saveButtonLabel(editor.saving, editor.selectedId === undefined ? '保存设定' : '保存设定修订')),
    ),
    renderSaveStatus(h, saveStatusLine(editor.saving, editor.saveMessage, editor.error), 'worldview'),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'worldview', role: 'alert' }, toUserMessage(editor.error)) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, list, detail),
  );
}
