import { characterText, listField, type El, type WorkspaceNamespace } from '../shared.js';

export interface RelationshipShape {
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
export interface RelationshipLayerState { readonly status: 'loading' | 'ready' | 'error'; readonly list: RelationshipShape[]; readonly message?: string; }
export interface RelationshipEditor { selectedId: string | undefined; draft: RelationshipShape; dirty: boolean; error: string; }
export interface RelationshipEditOps { select(entry: RelationshipShape): void; newDraft(): void; mutate(update: (draft: RelationshipShape) => RelationshipShape): void; save(): void; }

export function relationshipInput(draft: RelationshipShape): unknown {
  return { id: draft.id, from: draft.from, to: draft.to, type: draft.type ?? 'friendship', affinity: draft.affinity ?? 0, trust: draft.trust ?? 0, status: draft.status ?? 'active', milestones: draft.milestones ?? [], knownTo: draft.knownTo ?? [] };
}
export function newRelationshipDraft(): RelationshipShape {
  return { id: '', from: '', to: '', type: 'friendship', affinity: 0, trust: 0, status: 'active', milestones: [], knownTo: [] };
}

export function relationshipLayer(h: El, _projectId: string, _workspace: WorkspaceNamespace | undefined, layerState: RelationshipLayerState, editor: RelationshipEditor, ops: RelationshipEditOps): unknown {
  if (layerState.status === 'loading') return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'loading' }, '\u6b63\u5728\u88c5\u8f7d\u5173\u7cfb\u2026');
  if (layerState.status === 'error') return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '\u5173\u7cfb\u7d20\u6750\u8bfb\u53d6\u5931\u8d25');
  const d = editor.draft;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' }, h('button', { type: 'button', className: 'nv-btn', 'data-novel-relationship-new': '', onClick: ops.newDraft }, '\u65b0\u5efa\u5173\u7cfb')),
    layerState.list.map((entry) => h('button', { key: entry.id, type: 'button', role: 'listitem', className: 'nv-editor__item' + (editor.selectedId === entry.id ? ' is-active' : ''), 'data-novel-relationship-id': entry.id, onClick: () => ops.select(entry) }, `${entry.from} \u2192 ${entry.to}`)),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, editor.selectedId === undefined ? '\u65b0\u5efa\u5173\u7cfb' : `\u7f16\u8f91\u5173\u7cfb\uff1a${d.from} \u2192 ${d.to}`),
    h('div', { className: 'nv-form' },
      h('div', { className: 'nv-form__row' }, characterText(h, '\u4ece\uff08\u89d2\u8272 id\uff09', d.from, (value) => ops.mutate((draft) => ({ ...draft, from: value }))), characterText(h, '\u5230\uff08\u89d2\u8272 id\uff09', d.to, (value) => ops.mutate((draft) => ({ ...draft, to: value })))),
      h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '\u5173\u7cfb\u7c7b\u578b'), h('select', { className: 'nv-field__input', value: d.type ?? 'friendship', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, type: event.target.value })) }, ['kin', 'romantic', 'friendship', 'rivalry', 'enmity', 'allegiance', 'mentor', 'subordinate'].map((type) => h('option', { key: type, value: type }, type)))),
      h('div', { className: 'nv-form__row' },
        h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, `\u4eb2\u5bc6\u5ea6\uff08-100..100\uff09\uff1a${d.affinity}`), h('input', { type: 'range', min: '-100', max: '100', step: '1', className: 'nv-field__range', value: String(d.affinity ?? 0), onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, affinity: Number.parseInt(event.target.value, 10) || 0 })) })),
        h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, `\u4fe1\u4efb\uff080..100\uff09\uff1a${d.trust}`), h('input', { type: 'range', min: '0', max: '100', step: '1', className: 'nv-field__range', value: String(d.trust ?? 0), onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, trust: Number.parseInt(event.target.value, 10) || 0 })) })),
      ),
      characterText(h, '\u72b6\u6001', d.status ?? 'active', (value) => ops.mutate((draft) => ({ ...draft, status: value }))),
      listField(h, '\u91cc\u7a0b\u7891', d.milestones ?? [], (value) => ops.mutate((draft) => ({ ...draft, milestones: value }))),
      listField(h, '\u77e5\u60c5\u8fb9\u754c\uff08knownTo\uff09', d.knownTo ?? [], (value) => ops.mutate((draft) => ({ ...draft, knownTo: value }))),
    ),
    h('div', { className: 'nv-editor__actions' }, h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-relationship-save': '', onClick: ops.save, disabled: !editor.dirty }, '\u4fdd\u5b58')),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'relationship', role: 'alert' }, editor.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'ready' }, h('div', { className: 'nv-editor__columns' }, list, detail));
}
