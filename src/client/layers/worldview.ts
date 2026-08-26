import { listField, type El, type WorkspaceNamespace } from '../shared.js';
import { renderSaveStatus, saveButtonLabel, saveStatusLine } from '../save-status.js';

export interface WorldShape {
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

export function worldviewInput(draft: WorldShape): unknown {
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
): unknown {
  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'loading' }, '\u6b63\u5728\u88c5\u8f7d\u4e16\u754c\u89c2\u2026');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '\u4e16\u754c\u89c2\u7d20\u6750\u8bfb\u53d6\u5931\u8d25');
  }
  const d = editor.draft;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-worldview-new': '', onClick: ops.newDraft }, '\u65b0\u5efa\u6761\u76ee'),
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
    h('h3', { className: 'nv-editor__title' }, editor.selectedId === undefined ? '\u65b0\u5efa\u6761\u76ee' : `\u7f16\u8f91\u6761\u76ee\uff1a${d.title ?? editor.selectedId}`),
    h('div', { className: 'nv-form' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '\u6807\u9898'),
        h('input', { type: 'text', className: 'nv-field__input', value: d.title ?? '', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, title: event.target.value })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '\u7c7b\u578b'),
        h('select', { className: 'nv-field__input', value: d.kind ?? 'concept', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, kind: event.target.value })) },
          ['geography', 'history', 'faction', 'culture', 'race', 'concept', 'artifact'].map((kind) => h('option', { key: kind, value: kind }, kind)),
        ),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '\u5185\u5bb9'),
        h('textarea', { className: 'nv-field__input', value: d.content ?? '', rows: 4, onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, content: event.target.value })) }),
      ),
      listField(h, '\u89e6\u53d1\u8bcd', d.keywords ?? [], (value) => ops.mutate((draft) => ({ ...draft, keywords: value }))),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '\u89e6\u53d1\u65b9\u5f0f'),
        h('select', { className: 'nv-field__input', value: d.triggerMode ?? 'constant', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, triggerMode: event.target.value })) },
          ['keyword', 'regex', 'constant'].map((mode) => h('option', { key: mode, value: mode }, mode)),
        ),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '\u6743\u91cd'),
        h('input', { type: 'number', className: 'nv-field__input', value: String(d.weight ?? 0), onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, weight: Number.parseInt(event.target.value, 10) || 0 })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '\u7236\u6761\u76ee\uff08\u53ef\u7a7a\uff09'),
        h('input', { type: 'text', className: 'nv-field__input', value: d.parent ?? '', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, parent: event.target.value === '' ? null : event.target.value })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '\u53ef\u5426\u6539\u5199'),
        h('input', { type: 'checkbox', className: 'nv-field__check', checked: d.mutable ?? true, onChange: (event: { target: { checked: boolean } }) => ops.mutate((draft) => ({ ...draft, mutable: event.target.checked })) }),
      ),
      editor.selectedId !== undefined && d.status === 'rewritten'
        ? h('p', { className: 'nv-editor__badge', 'data-novel-worldview-rewritten': '' }, `\u5df2\u88ab ${d.supersededBy ?? '?'} \u6539\u5199`)
        : null,
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-worldview-save': '', onClick: ops.save, disabled: !editor.dirty || editor.saving },
        saveButtonLabel(editor.saving, editor.selectedId === undefined ? '\u521b\u5efa' : '\u6539\u5199')),
    ),
    renderSaveStatus(h, saveStatusLine(editor.saving, editor.saveMessage, editor.error), 'worldview'),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'worldview', role: 'alert' }, editor.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'worldview', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, list, detail),
  );
}
