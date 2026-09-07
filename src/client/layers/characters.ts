import { characterText, listField, type El, type WorkspaceNamespace } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import { renderSaveStatus, saveButtonLabel, saveStatusLine } from '../save-status.js';
import { characterKindSchema, type CharacterKind } from '../../core/schema/characters.js';
// I78：表单模型单一来源 `src/client/shapes.ts`（派生自 core schema，见 shapes.ts 契约注释）。
export type { CharacterShape } from '../shapes.js';
import type { CharacterShape } from '../shapes.js';
import { contextLinkButton, entityContextLink, type ContextLinkSink } from '../link-adapters.js';

/** B3 kind 下拉选项：直接来自 core 枚举（消除硬编码副本，review §6.2 #6）。 */
export const CHARACTER_KINDS: readonly CharacterKind[] = characterKindSchema.options;
export const CHARACTER_KIND_LABELS: Readonly<Record<CharacterKind, string>> = {
  protagonist: '主角', antagonist: '对立角色', supporting: '重要配角', extra: '次要角色', pov: '视角角色',
};

export interface CharacterLayerState {
  readonly status: 'loading' | 'ready' | 'error';
  readonly list: CharacterShape[];
  readonly message?: string;
}

export interface CharacterEditor {
  selectedId: string | undefined;
  draft: CharacterShape;
  dirty: boolean;
  error: string;
  /** I59 保存中（R12-6）：按钮忙碌禁用 + 状态行。 */
  saving: boolean;
  /** I59 已保存反馈文案（R12-6）。 */
  saveMessage: string;
}

export interface CharacterEditOps {
  select(character: CharacterShape): void;
  newDraft(): void;
  mutate(update: (draft: CharacterShape) => CharacterShape): void;
  save(): void;
}

/** Host-validated create/update copy of a character form model. */
export function characterCreateInput(draft: CharacterShape): Parameters<WorkspaceNamespace['characterCreate']>[1] {
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

/** B3 character list and editor. Client state is persisted through the supplied ops only. */
export function characterLayer(
  h: El,
  _projectId: string,
  _workspace: WorkspaceNamespace | undefined,
  layerState: CharacterLayerState,
  editor: CharacterEditor,
  ops: CharacterEditOps,
  links?: ContextLinkSink,
): unknown {
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
    layerState.list.map((character) => h('div', { key: character.id, className: 'nv-editor__item-row', role: 'listitem' },
      h('button', {
        type: 'button',
        className: 'nv-editor__item' + (editor.selectedId === character.id ? ' is-active' : ''),
        'data-novel-character-id': character.id,
        onClick: () => ops.select(character),
      }, character.name),
      contextLinkButton(h, '定位角色', 'character', entityContextLink(_projectId, 'character', character.id), links),
    )),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, editing ? `编辑角色：${d.name}` : '新建角色'),
    h('div', { className: 'nv-form' },
      characterText(h, '名称', d.name, (value) => ops.mutate((draft) => ({ ...draft, name: value }))),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '类型'),
        h('select', { className: 'nv-field__input', value: d.kind ?? 'extra', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, kind: event.target.value as CharacterKind })) },
          CHARACTER_KINDS.map((kind) => h('option', { key: kind, value: kind }, CHARACTER_KIND_LABELS[kind])),
        ),
      ),
      listField(h, '别名', d.aliases ?? [], (value) => ops.mutate((draft) => ({ ...draft, aliases: value }))),
      characterText(h, '性格', d.personality ?? '', (value) => ops.mutate((draft) => ({ ...draft, personality: value })), true),
      characterText(h, '背景', d.background ?? '', (value) => ops.mutate((draft) => ({ ...draft, background: value })), true),
      characterText(h, '动机', d.motivation ?? '', (value) => ops.mutate((draft) => ({ ...draft, motivation: value })), true),
      h('details', { className: 'nv-fieldset', 'data-novel-character-depth': '' },
        h('summary', { className: 'nv-fieldset__legend' }, '目标、能力与口吻'),
      listField(h, '目标', d.goals ?? [], (value) => ops.mutate((draft) => ({ ...draft, goals: value }))),
      listField(h, '缺陷', d.flaws ?? [], (value) => ops.mutate((draft) => ({ ...draft, flaws: value }))),
      listField(h, '能力', d.abilities ?? [], (value) => ops.mutate((draft) => ({ ...draft, abilities: value }))),
      characterText(h, '口吻', d.speechStyle ?? '', (value) => ops.mutate((draft) => ({ ...draft, speechStyle: value })), true),
      ),
      h('details', { className: 'nv-fieldset', 'data-novel-character-arc': '' },
        h('summary', { className: 'nv-fieldset__legend' }, '人物弧光'),
        characterText(h, '起点', d.arc?.startingPoint ?? '', (value) => ops.mutate((draft) => ({ ...draft, arc: { startingPoint: value, desiredEnd: draft.arc?.desiredEnd ?? '', keyBeats: draft.arc?.keyBeats ?? [] } }))),
        characterText(h, '归宿', d.arc?.desiredEnd ?? '', (value) => ops.mutate((draft) => ({ ...draft, arc: { startingPoint: draft.arc?.startingPoint ?? '', desiredEnd: value, keyBeats: draft.arc?.keyBeats ?? [] } }))),
        listField(h, '关键节拍', d.arc?.keyBeats ?? [], (value) => ops.mutate((draft) => ({ ...draft, arc: { startingPoint: draft.arc?.startingPoint ?? '', desiredEnd: draft.arc?.desiredEnd ?? '', keyBeats: value } }))),
      ),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-character-save': '', onClick: ops.save, disabled: !editor.dirty || editor.saving }, saveButtonLabel(editor.saving, '保存角色')),
    ),
    renderSaveStatus(h, saveStatusLine(editor.saving, editor.saveMessage, editor.error), 'characters'),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'character', role: 'alert' }, toUserMessage(editor.error)) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'characters', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, list, detail),
  );
}
