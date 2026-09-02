import { characterText, type El, type WorkspaceNamespace } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import { entityMultiSelect, entitySelect, type EntityOption } from '../entity-selectors.js';
import { renderSaveStatus, saveButtonLabel, saveStatusLine } from '../save-status.js';
import { relationshipTypeSchema, type RelationshipType } from '../../core/schema/relationship.js';
// I78：表单模型单一来源 `src/client/shapes.ts`（派生自 core schema，见 shapes.ts 契约注释）。
export type { RelationshipShape } from '../shapes.js';
import type { RelationshipShape } from '../shapes.js';
import { contextLinkButton, entityContextLink, type ContextLinkSink } from '../link-adapters.js';

/** C1 关系类型下拉选项：直接来自 core 枚举（消除硬编码副本，review §6.2/§6.3）。 */
export const RELATIONSHIP_TYPES: readonly RelationshipType[] = relationshipTypeSchema.options;
export const RELATIONSHIP_TYPE_LABELS: Readonly<Record<RelationshipType, string>> = {
  kin: '亲属', romantic: '情感关系', friendship: '朋友', rivalry: '竞争对手', enmity: '敌对', allegiance: '同盟', mentor: '师徒', subordinate: '上下级',
};
export interface RelationshipLayerState { readonly status: 'loading' | 'ready' | 'error'; readonly list: RelationshipShape[]; readonly message?: string; }
export interface RelationshipEditor { selectedId: string | undefined; draft: RelationshipShape; dirty: boolean; error: string; saving: boolean; saveMessage: string; }
export interface RelationshipEditOps { select(entry: RelationshipShape): void; newDraft(): void; mutate(update: (draft: RelationshipShape) => RelationshipShape): void; save(): void; }

export function relationshipInput(draft: RelationshipShape): Parameters<WorkspaceNamespace['relationshipSave']>[1] {
  return { id: draft.id, from: draft.from, to: draft.to, type: draft.type ?? 'friendship', affinity: draft.affinity ?? 0, trust: draft.trust ?? 0, status: draft.status ?? 'active', milestones: draft.milestones ?? [], knownTo: draft.knownTo ?? [] };
}
export function newRelationshipDraft(): RelationshipShape {
  return { id: '', from: '', to: '', type: 'friendship', affinity: 0, trust: 0, status: 'active', milestones: [], knownTo: [] };
}

/** C1 editor: all entity-valued fields use named selectors and preserve missing IDs. */
export function relationshipLayer(h: El, _projectId: string, _workspace: WorkspaceNamespace | undefined, characters: readonly { id: string; name: string }[], layerState: RelationshipLayerState, editor: RelationshipEditor, ops: RelationshipEditOps, milestoneOptions: readonly EntityOption[] = [], links?: ContextLinkSink): unknown {
  const characterOptions = characters.map((character) => ({ id: character.id, label: character.name || '未命名角色' }));
  const nameOf = new Map(characters.map((character) => [character.id, character.name]));
  const labelOf = (id: string): string => nameOf.get(id) || '引用已缺失';
  if (layerState.status === 'loading') return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'loading' }, '正在装载关系…');
  if (layerState.status === 'error') return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '关系素材读取失败');
  const d = editor.draft;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' }, h('button', { type: 'button', className: 'nv-btn', 'data-novel-relationship-new': '', onClick: ops.newDraft }, '新建关系')),
    layerState.list.map((entry) => h('div', { key: entry.id, className: 'nv-editor__item-row', role: 'listitem' },
      h('button', { type: 'button', className: 'nv-editor__item' + (editor.selectedId === entry.id ? ' is-active' : ''), 'data-novel-relationship-id': entry.id, onClick: () => ops.select(entry) }, `${labelOf(entry.from)} → ${labelOf(entry.to)}`),
      contextLinkButton(h, '定位关系', 'relationship', entityContextLink(_projectId, 'relationship', entry.id), links),
    )),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, editor.selectedId === undefined ? '新建关系' : `编辑关系：${labelOf(d.from)} → ${labelOf(d.to)}`),
    h('div', { className: 'nv-form' },
      h('div', { className: 'nv-form__row' },
        entitySelect(h, '从', d.from, characterOptions, (value) => ops.mutate((draft) => ({ ...draft, from: value })), 'relationship-from'),
        entitySelect(h, '到', d.to, characterOptions, (value) => ops.mutate((draft) => ({ ...draft, to: value })), 'relationship-to'),
      ),
      h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '关系类型'), h('select', { className: 'nv-field__input', value: d.type ?? 'friendship', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, type: event.target.value as RelationshipType })) }, RELATIONSHIP_TYPES.map((type) => h('option', { key: type, value: type }, RELATIONSHIP_TYPE_LABELS[type])))),
      h('div', { className: 'nv-form__row' },
        h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, `亲密度（-100..100）：${d.affinity}`), h('input', { type: 'range', min: '-100', max: '100', step: '1', className: 'nv-field__range', value: String(d.affinity ?? 0), onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, affinity: Number.parseInt(event.target.value, 10) || 0 })) })),
        h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, `信任（0..100）：${d.trust}`), h('input', { type: 'range', min: '0', max: '100', step: '1', className: 'nv-field__range', value: String(d.trust ?? 0), onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, trust: Number.parseInt(event.target.value, 10) || 0 })) })),
      ),
      characterText(h, '状态', d.status ?? 'active', (value) => ops.mutate((draft) => ({ ...draft, status: value }))),
      entityMultiSelect(h, '里程碑', d.milestones ?? [], milestoneOptions, (value) => ops.mutate((draft) => ({ ...draft, milestones: value })), 'relationship-milestones'),
      entityMultiSelect(h, '知情边界', d.knownTo ?? [], characterOptions, (value) => ops.mutate((draft) => ({ ...draft, knownTo: value })), 'relationship-known-to'),
    ),
    h('div', { className: 'nv-editor__actions' }, h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-relationship-save': '', onClick: ops.save, disabled: !editor.dirty || editor.saving }, saveButtonLabel(editor.saving, '保存'))),
    renderSaveStatus(h, saveStatusLine(editor.saving, editor.saveMessage, editor.error), 'relationship'),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'relationship', role: 'alert' }, toUserMessage(editor.error)) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'relationship', 'data-novel-layer-state': 'ready' }, h('div', { className: 'nv-editor__columns' }, list, detail));
}
