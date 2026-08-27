import { characterText, listField, type El, type WorkspaceNamespace } from '../shared.js';
import { renderSaveStatus, saveButtonLabel, saveStatusLine } from '../save-status.js';
import {
  conflictTypeSchema,
  detailBeatStatusSchema,
  outlineStructureSchema,
  type ConflictType,
  type DetailBeatStatus,
  type OutlineStructure,
} from '../../core/schema/outline.js';
// I78：表单模型单一来源 `src/client/shapes.ts`（派生自 core schema，见 shapes.ts 契约注释）。
export type { OutlineShape, OutlineActShape, OutlineBeatShape, OutlineDetailBeatShape } from '../shapes.js';
import type { OutlineShape, OutlineActShape, OutlineBeatShape, OutlineDetailBeatShape } from '../shapes.js';

/** B5 下拉选项：直接来自 core 枚举（消除硬编码副本，review §6.2/§6.3）。 */
export const OUTLINE_STRUCTURES: readonly OutlineStructure[] = outlineStructureSchema.options;
export const CONFLICT_TYPES: readonly ConflictType[] = conflictTypeSchema.options;
export const DETAIL_BEAT_STATUSES: readonly DetailBeatStatus[] = detailBeatStatusSchema.options;
export interface OutlineLayerState { readonly status: 'loading' | 'ready' | 'error'; readonly outline?: OutlineShape; readonly message?: string; }
export interface OutlineEditor { draft: OutlineShape; dirty: boolean; error: string; selectedActId: string | undefined; selectedBeatId: string | undefined; selectedDetailId: string | undefined; saving: boolean; saveMessage: string; }
export interface OutlineEditOps {
  mutate(update: (draft: OutlineShape) => OutlineShape): void;
  selectAct(id: string): void;
  selectBeat(actId: string, beatId: string): void;
  selectDetail(id: string): void;
  addAct(): void;
  removeAct(actId: string): void;
  addBeat(actId: string): void;
  removeBeat(actId: string, beatId: string): void;
  addDetailBeat(actId: string, beatId: string): void;
  removeDetailBeat(actId: string, beatId: string, cardId: string): void;
  save(): void;
}

export function emptyOutline(): OutlineShape { return { id: 'outline', structure: 'free', logline: '', themes: [], acts: [], foreshadowing: [], endings: [] }; }
export function outlineInput(draft: OutlineShape): unknown { return { id: draft.id, structure: draft.structure, logline: draft.logline, themes: draft.themes ?? [], acts: draft.acts.map((act) => ({ id: act.id, index: act.index, title: act.title, goal: act.goal, beats: act.beats.map((beat) => ({ id: beat.id, title: beat.title, description: beat.description, charactersInvolved: beat.charactersInvolved ?? [], conflictType: beat.conflictType ?? 'external', prerequisites: beat.prerequisites ?? [], optional: beat.optional ?? false, detailBeats: beat.detailBeats.map((card) => ({ id: card.id, title: card.title, summary: card.summary, pov: card.pov, wordTarget: card.wordTarget, points: card.points ?? [], status: card.status ?? 'planned' })) })) })), foreshadowing: draft.foreshadowing ?? [], endings: draft.endings ?? [] }; }
function upsert<T>(list: T[], item: T): T[] { const index = list.findIndex((entry) => (entry as { id?: string }).id === (item as { id?: string }).id); if (index < 0) return list.concat(item); const next = list.slice(); next[index] = item; return next; }
function currentAct(draft: OutlineShape, actId: string): OutlineActShape { return draft.acts.find((act) => act.id === actId) ?? { id: actId, index: draft.acts.length, title: '', goal: '', beats: [] }; }
function currentBeat(act: OutlineActShape, beatId: string): OutlineBeatShape { return act.beats.find((beat) => beat.id === beatId) ?? { id: beatId, title: '', description: '', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] }; }
function emptyDetailBeat(actId: string, beatId: string, index: number): OutlineDetailBeatShape {
  return { id: `detail-${actId}-${beatId}-${index + 1}`, title: '', summary: '', pov: '', wordTarget: 500, points: [], status: 'planned' };
}

function sceneCards(h: El, beat: OutlineBeatShape, selectedDetailId: string | undefined, onSelect: (id: string) => void): unknown {
  const cards = beat.detailBeats;
  if (cards.length === 0) return h('p', { className: 'nv-outline__nodetail' }, '\u6b64\u8282\u5c1a\u65e0\u7ec6\u7eb2\u573a\u666f\u5361\u3002');
  return h('div', { className: 'nv-outline__cards', 'data-novel-beat-cards': '' }, cards.map((card) => h('button', {
    key: card.id, type: 'button',
    className: 'nv-outline__card' + (selectedDetailId === card.id ? ' is-active' : ''),
    'data-novel-detail-card': card.id,
    onClick: () => onSelect(card.id),
  },
  h('span', { className: 'nv-outline__card-title' }, card.title),
  h('span', { className: 'nv-outline__card-meta' }, `POV ${card.pov || '—'} \u00b7 ${card.wordTarget} \u5b57 \u00b7 ${card.status}`),
  h('span', { className: 'nv-outline__card-summary' }, card.summary))));
}

/** 细纲场景卡编辑器：点击卡片后查看并编辑具体内容。 */
function detailBeatEditor(
  h: El,
  card: OutlineDetailBeatShape,
  setDetail: (update: (item: OutlineDetailBeatShape) => OutlineDetailBeatShape) => void,
  remove: () => void,
): unknown {
  return h('div', { className: 'nv-outline__card-editor', 'data-novel-detail-card-editor': card.id },
    h('h4', { className: 'nv-outline__subtitle' }, `\u7ec6\u7eb2\u573a\u666f\u5361\uff1a${card.title || card.id}`),
    h('div', { className: 'nv-form' },
      characterText(h, '\u573a\u666f\u5361\u6807\u9898', card.title, (value) => setDetail((item) => ({ ...item, title: value }))),
      characterText(h, '\u6458\u8981', card.summary, (value) => setDetail((item) => ({ ...item, summary: value })), true),
      characterText(h, 'POV \u89c6\u89d2\u89d2\u8272', card.pov, (value) => setDetail((item) => ({ ...item, pov: value }))),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '\u76ee\u6807\u5b57\u6570'),
        h('input', { type: 'number', className: 'nv-field__input', min: 1, step: 100, value: card.wordTarget, onChange: (event: { target: { value: string } }) => setDetail((item) => ({ ...item, wordTarget: Number(event.target.value) })) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '\u72b6\u6001'),
        h('select', { className: 'nv-field__input', value: card.status, onChange: (event: { target: { value: string } }) => setDetail((item) => ({ ...item, status: event.target.value as DetailBeatStatus })) },
          DETAIL_BEAT_STATUSES.map((value) => h('option', { key: value, value }, value))),
      ),
      listField(h, '\u8981\u70b9', card.points, (value) => setDetail((item) => ({ ...item, points: value }))),
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-detail-remove': card.id, onClick: () => remove() }, '\u5220\u9664\u8be5\u5361'),
      ),
    ),
  );
}

export function outlineLayer(h: El, _projectId: string, _workspace: WorkspaceNamespace | undefined, layerState: OutlineLayerState, editor: OutlineEditor, ops: OutlineEditOps): unknown {
  if (layerState.status === 'loading') return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'loading' }, '\u6b63\u5728\u88c5\u8f7d\u5927\u7eb2\u2026');
  if (layerState.status === 'error') return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '\u5927\u7eb2\u8bfb\u53d6\u5931\u8d25');
  const setAct = (id: string, update: (act: OutlineActShape) => OutlineActShape): void => ops.mutate((draft) => ({ ...draft, acts: upsert(draft.acts, update(currentAct(draft, id))) }));
  const setBeat = (actId: string, beatId: string, update: (beat: OutlineBeatShape) => OutlineBeatShape): void => ops.mutate((draft) => { const act = currentAct(draft, actId); return { ...draft, acts: upsert(draft.acts, { ...act, beats: upsert(act.beats, update(currentBeat(act, beatId))) }) }; });
  const setDetail = (actId: string, beatId: string, cardId: string, update: (card: OutlineDetailBeatShape) => OutlineDetailBeatShape): void => ops.mutate((draft) => {
    const act = currentAct(draft, actId);
    const beat = currentBeat(act, beatId);
    const card = beat.detailBeats.find((item) => item.id === cardId) ?? emptyDetailBeat(actId, beatId, beat.detailBeats.length);
    return { ...draft, acts: upsert(draft.acts, { ...act, beats: upsert(act.beats, { ...beat, detailBeats: upsert(beat.detailBeats, update(card)) }) }) };
  });
  const act = editor.selectedActId === undefined ? undefined : editor.draft.acts.find((item) => item.id === editor.selectedActId);
  const beat = act === undefined || editor.selectedBeatId === undefined ? undefined : act.beats.find((item) => item.id === editor.selectedBeatId);
  const detail = beat === undefined || editor.selectedDetailId === undefined ? undefined : beat.detailBeats.find((item) => item.id === editor.selectedDetailId);
  const actPanel = act === undefined ? h('div', { className: 'nv-outline__detail' }, h('h3', { className: 'nv-editor__title' }, '\u7ec6\u7eb2\u5927\u7eb2'), h('p', { className: 'nv-outline__nodetail' }, '\u9009\u62e9\u5de6\u4fa7\u7684\u5e55\u4e0e\u8282\uff0c\u6216\u65b0\u5efa\u4e00\u5e55\u540e\u7ee7\u7eed\u7f16\u8f91\u3002')) : h('div', { className: 'nv-outline__detail' }, h('h3', { className: 'nv-editor__title' }, `\u5e55\uff1a${act.title || act.id}`), h('div', { className: 'nv-form' }, characterText(h, '\u5e55\u6807\u9898', act.title, (value) => setAct(act.id, (item) => ({ ...item, title: value }))), characterText(h, '\u5e55\u76ee\u6807', act.goal, (value) => setAct(act.id, (item) => ({ ...item, goal: value })), true)));
  const beatPanel = beat === undefined ? h('div', { className: 'nv-outline__detail' }, h('h3', { className: 'nv-editor__title' }, '\u8282'), h('p', { className: 'nv-outline__nodetail' }, '\u9009\u62e9\u6216\u65b0\u5efa\u4e00\u8282\u4ee5\u7f16\u8f91\u8282\u4e0e\u7ec6\u7eb2\u573a\u666f\u5361\u3002')) : h('div', { className: 'nv-outline__detail' }, h('h3', { className: 'nv-editor__title' }, `\u8282\uff1a${beat.title || beat.id}`), h('div', { className: 'nv-form' }, characterText(h, '\u8282\u6807\u9898', beat.title, (value) => setBeat(act!.id, beat.id, (item) => ({ ...item, title: value }))), characterText(h, '\u63cf\u8ff0', beat.description, (value) => setBeat(act!.id, beat.id, (item) => ({ ...item, description: value })), true), h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '\u51b2\u7a81\u7c7b\u578b'), h('select', { className: 'nv-field__input', value: beat.conflictType, onChange: (event: { target: { value: string } }) => setBeat(act!.id, beat.id, (item) => ({ ...item, conflictType: event.target.value as ConflictType })) }, CONFLICT_TYPES.map((value) => h('option', { key: value, value }, value)))), listField(h, '\u53c2\u4e0e\u89d2\u8272', beat.charactersInvolved, (value) => setBeat(act!.id, beat.id, (item) => ({ ...item, charactersInvolved: value }))), listField(h, '\u524d\u7f6e\u8282', beat.prerequisites, (value) => setBeat(act!.id, beat.id, (item) => ({ ...item, prerequisites: value }))), h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '\u53ef\u9009\u8282'), h('input', { type: 'checkbox', className: 'nv-field__check', checked: beat.optional, onChange: (event: { target: { checked: boolean } }) => setBeat(act!.id, beat.id, (item) => ({ ...item, optional: event.target.checked })) }))), h('div', { className: 'nv-editor__actions' }, h('button', { type: 'button', className: 'nv-btn', 'data-novel-outline-add-detail': '', onClick: () => ops.addDetailBeat(act!.id, beat.id) }, '+ \u7ec6\u7eb2\u573a\u666f\u5361')), h('h4', { className: 'nv-outline__subtitle' }, '\u7ec6\u7eb2\u573a\u666f\u5361'), sceneCards(h, beat, editor.selectedDetailId, ops.selectDetail), detail === undefined ? null : detailBeatEditor(h, detail, (update) => setDetail(act!.id, beat.id, detail.id, update), () => ops.removeDetailBeat(act!.id, beat.id, detail.id)));
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'ready' }, h('div', { className: 'nv-outline__toolbar' }, h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '\u7ed3\u6784'), h('select', { className: 'nv-field__input', value: editor.draft.structure, onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, structure: event.target.value as OutlineStructure })) }, OUTLINE_STRUCTURES.map((value) => h('option', { key: value, value }, value)))), characterText(h, '\u4e00\u53e5\u8bdd\u6897\u6982', editor.draft.logline, (value) => ops.mutate((draft) => ({ ...draft, logline: value }))), listField(h, '\u4e3b\u9898', editor.draft.themes, (value) => ops.mutate((draft) => ({ ...draft, themes: value }))), h('div', { className: 'nv-editor__actions' }, h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-outline-save': '', disabled: !editor.dirty || editor.saving, onClick: ops.save }, saveButtonLabel(editor.saving, '\u4fdd\u5b58\u5927\u7eb2')))), h('div', { className: 'nv-outline__columns' }, h('div', { className: 'nv-editor__list' }, h('div', { className: 'nv-editor__toolbar' }, h('button', { type: 'button', className: 'nv-btn', 'data-novel-outline-add-act': '', onClick: ops.addAct }, '+ \u5e55')), editor.draft.acts.map((entry) => h('div', { key: entry.id, className: 'nv-outline__act' }, h('button', { type: 'button', className: 'nv-editor__item' + (editor.selectedActId === entry.id ? ' is-active' : ''), 'data-novel-outline-act': entry.id, onClick: () => ops.selectAct(entry.id) }, `\u5e55${entry.index} \u00b7 ${entry.title || entry.id}`), h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-remove-act': entry.id, onClick: () => ops.removeAct(entry.id) }, '\u5220'), h('div', { className: 'nv-outline__beats' }, entry.beats.map((entryBeat) => h('button', { key: entryBeat.id, type: 'button', className: 'nv-editor__item nv-outline__beat' + (editor.selectedBeatId === entryBeat.id ? ' is-active' : ''), 'data-novel-outline-beat': entryBeat.id, onClick: () => ops.selectBeat(entry.id, entryBeat.id) }, `\u8282 \u00b7 ${entryBeat.title || entryBeat.id}`)), h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-add-beat': entry.id, onClick: () => ops.addBeat(entry.id) }, '+ \u8282'), h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-remove-beat': entry.id, onClick: () => ops.removeBeat(entry.id, editor.selectedBeatId ?? '') }, '\u5220\u8282'))))), h('div', { className: 'nv-outline__main' }, actPanel, beatPanel)), renderSaveStatus(h, saveStatusLine(editor.saving, editor.saveMessage, editor.error), 'outline'), editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'outline', role: 'alert' }, editor.error) : null);
}
