import { characterText, listField, type El, type WorkspaceNamespace } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import { entityMultiSelect, type EntityOption } from '../entity-selectors.js';
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
import { contextLinkButton, entityContextLink, type ContextLinkSink } from '../link-adapters.js';

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
export function outlineInput(draft: OutlineShape): Parameters<WorkspaceNamespace['outlineSave']>[1] { return { id: draft.id, structure: draft.structure, logline: draft.logline, themes: draft.themes ?? [], acts: draft.acts.map((act) => ({ id: act.id, index: act.index, title: act.title, goal: act.goal, beats: act.beats.map((beat) => ({ id: beat.id, title: beat.title, description: beat.description, charactersInvolved: beat.charactersInvolved ?? [], conflictType: beat.conflictType ?? 'external', prerequisites: beat.prerequisites ?? [], optional: beat.optional ?? false, detailBeats: beat.detailBeats.map((card) => ({ id: card.id, title: card.title, summary: card.summary, pov: card.pov, wordTarget: card.wordTarget, points: card.points ?? [], status: card.status ?? 'planned' })) })) })), foreshadowing: draft.foreshadowing ?? [], endings: draft.endings ?? [] }; }
function upsert<T>(list: T[], item: T): T[] { const index = list.findIndex((entry) => (entry as { id?: string }).id === (item as { id?: string }).id); if (index < 0) return list.concat(item); const next = list.slice(); next[index] = item; return next; }
function currentAct(draft: OutlineShape, actId: string): OutlineActShape { return draft.acts.find((act) => act.id === actId) ?? { id: actId, index: draft.acts.length, title: '', goal: '', beats: [] }; }
function currentBeat(act: OutlineActShape, beatId: string): OutlineBeatShape { return act.beats.find((beat) => beat.id === beatId) ?? { id: beatId, title: '', description: '', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] }; }
function emptyDetailBeat(actId: string, beatId: string, index: number): OutlineDetailBeatShape { return { id: `detail-${actId}-${beatId}-${index + 1}`, title: '', summary: '', pov: '', wordTarget: 500, points: [], status: 'planned' }; }

function sceneCards(h: El, projectId: string, beat: OutlineBeatShape, selectedDetailId: string | undefined, onSelect: (id: string) => void, links?: ContextLinkSink): unknown {
  const cards = beat.detailBeats;
  if (cards.length === 0) return h('p', { className: 'nv-outline__nodetail' }, '此节暂无细纲场景卡。');
  return h('div', { className: 'nv-outline__cards', 'data-novel-beat-cards': '' }, cards.map((card) => h('div', { key: card.id, className: 'nv-outline__card-row' },
    h('button', {
      type: 'button', className: 'nv-outline__card' + (selectedDetailId === card.id ? ' is-active' : ''),
      'data-novel-detail-card': card.id, onClick: () => onSelect(card.id),
    }, h('span', { className: 'nv-outline__card-title' }, card.title), h('span', { className: 'nv-outline__card-meta' }, `POV ${card.pov || '—'} · ${card.wordTarget} 字 · ${card.status}`), h('span', { className: 'nv-outline__card-summary' }, card.summary)),
    contextLinkButton(h, '定位场景卡', 'scene-card', entityContextLink(projectId, 'scene-card', card.id), links),
  )));
}

function detailBeatEditor(h: El, card: OutlineDetailBeatShape, setDetail: (update: (item: OutlineDetailBeatShape) => OutlineDetailBeatShape) => void, remove: () => void): unknown {
  return h('div', { className: 'nv-outline__card-editor', 'data-novel-detail-card-editor': card.id },
    h('h4', { className: 'nv-outline__subtitle' }, `细纲场景卡：${card.title || card.id}`),
    h('div', { className: 'nv-form' },
      characterText(h, '场景卡标题', card.title, (value) => setDetail((item) => ({ ...item, title: value }))),
      characterText(h, '摘要', card.summary, (value) => setDetail((item) => ({ ...item, summary: value })), true),
      characterText(h, 'POV 视角角色', card.pov, (value) => setDetail((item) => ({ ...item, pov: value }))),
      h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '目标字数'), h('input', { type: 'number', className: 'nv-field__input', min: 1, step: 100, value: card.wordTarget, onChange: (event: { target: { value: string } }) => setDetail((item) => ({ ...item, wordTarget: Number(event.target.value) })) })),
      h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '状态'), h('select', { className: 'nv-field__input', value: card.status, onChange: (event: { target: { value: string } }) => setDetail((item) => ({ ...item, status: event.target.value as DetailBeatStatus })) }, DETAIL_BEAT_STATUSES.map((value) => h('option', { key: value, value }, value)))),
      listField(h, '要点', card.points, (value) => setDetail((item) => ({ ...item, points: value }))),
      h('div', { className: 'nv-editor__actions' }, h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-detail-remove': card.id, onClick: remove }, '删除该卡')),
    ),
  );
}

/**
 * B5 editor. Character and prerequisite IDs use named selectors; free-form
 * text lists remain text fields because they are prose/content, not references.
 */
export function outlineLayer(h: El, _projectId: string, _workspace: WorkspaceNamespace | undefined, layerState: OutlineLayerState, editor: OutlineEditor, ops: OutlineEditOps, characterOptions: readonly EntityOption[] = [], links?: ContextLinkSink): unknown {
  if (layerState.status === 'loading') return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'loading' }, '正在装载大纲…');
  if (layerState.status === 'error') return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '大纲读取失败');
  const setAct = (id: string, update: (act: OutlineActShape) => OutlineActShape): void => ops.mutate((draft) => ({ ...draft, acts: upsert(draft.acts, update(currentAct(draft, id))) }));
  const setBeat = (actId: string, beatId: string, update: (beat: OutlineBeatShape) => OutlineBeatShape): void => ops.mutate((draft) => { const act = currentAct(draft, actId); return { ...draft, acts: upsert(draft.acts, { ...act, beats: upsert(act.beats, update(currentBeat(act, beatId))) }) }; });
  const setDetail = (actId: string, beatId: string, cardId: string, update: (card: OutlineDetailBeatShape) => OutlineDetailBeatShape): void => ops.mutate((draft) => { const act = currentAct(draft, actId); const beat = currentBeat(act, beatId); const card = beat.detailBeats.find((item) => item.id === cardId) ?? emptyDetailBeat(actId, beatId, beat.detailBeats.length); return { ...draft, acts: upsert(draft.acts, { ...act, beats: upsert(act.beats, { ...beat, detailBeats: upsert(beat.detailBeats, update(card)) }) }) }; });
  const act = editor.selectedActId === undefined ? undefined : editor.draft.acts.find((item) => item.id === editor.selectedActId);
  const beat = act === undefined || editor.selectedBeatId === undefined ? undefined : act.beats.find((item) => item.id === editor.selectedBeatId);
  const detail = beat === undefined || editor.selectedDetailId === undefined ? undefined : beat.detailBeats.find((item) => item.id === editor.selectedDetailId);
  const beatOptions: EntityOption[] = editor.draft.acts.flatMap((item) => item.beats).filter((item) => item.id !== beat?.id).map((item) => ({ id: item.id, label: item.title || item.id }));
  const actPanel = act === undefined ? h('div', { className: 'nv-outline__detail' }, h('h3', { className: 'nv-editor__title' }, '细纲大纲'), h('p', { className: 'nv-outline__nodetail' }, '选择左侧的幕与节，或新建一幕后继续编辑。')) : h('div', { className: 'nv-outline__detail' }, h('h3', { className: 'nv-editor__title' }, `幕：${act.title || act.id}`), h('div', { className: 'nv-form' }, characterText(h, '幕标题', act.title, (value) => setAct(act.id, (item) => ({ ...item, title: value }))), characterText(h, '幕目标', act.goal, (value) => setAct(act.id, (item) => ({ ...item, goal: value })), true)));
  const beatPanel = beat === undefined ? h('div', { className: 'nv-outline__detail' }, h('h3', { className: 'nv-editor__title' }, '节'), h('p', { className: 'nv-outline__nodetail' }, '选择或新建一节以编辑节与细纲场景卡。')) : h('div', { className: 'nv-outline__detail' }, h('h3', { className: 'nv-editor__title' }, `节：${beat.title || beat.id}`), h('div', { className: 'nv-form' },
    characterText(h, '节标题', beat.title, (value) => setBeat(act!.id, beat.id, (item) => ({ ...item, title: value }))),
    characterText(h, '描述', beat.description, (value) => setBeat(act!.id, beat.id, (item) => ({ ...item, description: value })), true),
    h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '冲突类型'), h('select', { className: 'nv-field__input', value: beat.conflictType, onChange: (event: { target: { value: string } }) => setBeat(act!.id, beat.id, (item) => ({ ...item, conflictType: event.target.value as ConflictType })) }, CONFLICT_TYPES.map((value) => h('option', { key: value, value }, value)))),
    entityMultiSelect(h, '参与角色', beat.charactersInvolved, characterOptions, (value) => setBeat(act!.id, beat.id, (item) => ({ ...item, charactersInvolved: value })), 'outline-characters-involved'),
    entityMultiSelect(h, '前置节', beat.prerequisites, beatOptions, (value) => setBeat(act!.id, beat.id, (item) => ({ ...item, prerequisites: value })), 'outline-prerequisites'),
    h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '可选节'), h('input', { type: 'checkbox', className: 'nv-field__check', checked: beat.optional, onChange: (event: { target: { checked: boolean } }) => setBeat(act!.id, beat.id, (item) => ({ ...item, optional: event.target.checked })) })),
    h('div', { className: 'nv-editor__actions' }, h('button', { type: 'button', className: 'nv-btn', 'data-novel-outline-add-detail': '', onClick: () => ops.addDetailBeat(act!.id, beat.id) }, '+ 细纲场景卡')),
    h('h4', { className: 'nv-outline__subtitle' }, '细纲场景卡'), sceneCards(h, _projectId, beat, editor.selectedDetailId, ops.selectDetail, links),
    detail === undefined ? null : detailBeatEditor(h, detail, (update) => setDetail(act!.id, beat.id, detail.id, update), () => ops.removeDetailBeat(act!.id, beat.id, detail.id)),
  ));
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'outline', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-outline__toolbar' },
      h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '结构'), h('select', { className: 'nv-field__input', value: editor.draft.structure, onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, structure: event.target.value as OutlineStructure })) }, OUTLINE_STRUCTURES.map((value) => h('option', { key: value, value }, value)))),
      characterText(h, '一句话梗概', editor.draft.logline, (value) => ops.mutate((draft) => ({ ...draft, logline: value }))),
      listField(h, '主题', editor.draft.themes, (value) => ops.mutate((draft) => ({ ...draft, themes: value }))),
      h('div', { className: 'nv-editor__actions' }, h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-outline-save': '', disabled: !editor.dirty || editor.saving, onClick: ops.save }, saveButtonLabel(editor.saving, '保存大纲'))),
    ),
    h('div', { className: 'nv-outline__columns' },
      h('div', { className: 'nv-editor__list' },
        h('div', { className: 'nv-editor__toolbar' }, h('button', { type: 'button', className: 'nv-btn', 'data-novel-outline-add-act': '', onClick: ops.addAct }, '+ 幕')),
        editor.draft.acts.map((entry) => h('div', { key: entry.id, className: 'nv-outline__act' },
          h('button', { type: 'button', className: 'nv-editor__item' + (editor.selectedActId === entry.id ? ' is-active' : ''), 'data-novel-outline-act': entry.id, onClick: () => ops.selectAct(entry.id) }, `幕${entry.index} · ${entry.title || entry.id}`),
          h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-remove-act': entry.id, onClick: () => ops.removeAct(entry.id) }, '删'),
          h('div', { className: 'nv-outline__beats' }, entry.beats.map((entryBeat) => h('button', { key: entryBeat.id, type: 'button', className: 'nv-editor__item nv-outline__beat' + (editor.selectedBeatId === entryBeat.id ? ' is-active' : ''), 'data-novel-outline-beat': entryBeat.id, onClick: () => ops.selectBeat(entry.id, entryBeat.id) }, `节 · ${entryBeat.title || entryBeat.id}`)), h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-add-beat': entry.id, onClick: () => ops.addBeat(entry.id) }, '+ 节'), h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-outline-remove-beat': entry.id, onClick: () => ops.removeBeat(entry.id, editor.selectedBeatId ?? '') }, '删节')),
        )),
      ),
      h('div', { className: 'nv-outline__main' }, actPanel, beatPanel),
    ),
    renderSaveStatus(h, saveStatusLine(editor.saving, editor.saveMessage, editor.error), 'outline'),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'outline', role: 'alert' }, toUserMessage(editor.error)) : null,
  );
}
