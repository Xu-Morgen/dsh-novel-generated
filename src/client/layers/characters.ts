import { characterText, listField, type El, type WorkspaceNamespace } from '../shared.js';
import { renderSaveStatus, saveButtonLabel, saveStatusLine } from '../save-status.js';
import { characterKindSchema, type CharacterKind } from '../../core/schema/characters.js';
// I78：表单模型单一来源 `src/client/shapes.ts`（派生自 core schema，见 shapes.ts 契约注释）。
export type { CharacterShape } from '../shapes.js';
import type { CharacterShape } from '../shapes.js';

/** B3 kind 下拉选项：直接来自 core 枚举（消除硬编码副本，review §6.2 #6）。 */
export const CHARACTER_KINDS: readonly CharacterKind[] = characterKindSchema.options;

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
export function characterCreateInput(draft: CharacterShape): unknown {
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
): unknown {
  if (layerState.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'characters', 'data-novel-layer-state': 'loading' }, '\u6b63\u5728\u88c5\u8f7d\u89d2\u8272\u2026');
  }
  if (layerState.status === 'error') {
    return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'characters', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '\u89d2\u8272\u7d20\u6750\u8bfb\u53d6\u5931\u8d25');
  }
  const d = editor.draft;
  const editing = editor.selectedId !== undefined;
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-character-new': '', onClick: ops.newDraft }, '\u65b0\u5efa\u89d2\u8272'),
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
    h('h3', { className: 'nv-editor__title' }, editing ? `\u7f16\u8f91\u89d2\u8272\uff1a${d.name}` : '\u65b0\u5efa\u89d2\u8272'),
    h('div', { className: 'nv-form' },
      characterText(h, '\u540d\u79f0', d.name, (value) => ops.mutate((draft) => ({ ...draft, name: value }))),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '\u7c7b\u578b'),
        h('select', { className: 'nv-field__input', value: d.kind ?? 'extra', onChange: (event: { target: { value: string } }) => ops.mutate((draft) => ({ ...draft, kind: event.target.value as CharacterKind })) },
          CHARACTER_KINDS.map((kind) => h('option', { key: kind, value: kind }, kind)),
        ),
      ),
      listField(h, '\u522b\u540d', d.aliases ?? [], (value) => ops.mutate((draft) => ({ ...draft, aliases: value }))),
      characterText(h, '\u6027\u683c', d.personality ?? '', (value) => ops.mutate((draft) => ({ ...draft, personality: value })), true),
      characterText(h, '\u80cc\u666f', d.background ?? '', (value) => ops.mutate((draft) => ({ ...draft, background: value })), true),
      characterText(h, '\u52a8\u673a', d.motivation ?? '', (value) => ops.mutate((draft) => ({ ...draft, motivation: value })), true),
      listField(h, '\u76ee\u6807', d.goals ?? [], (value) => ops.mutate((draft) => ({ ...draft, goals: value }))),
      listField(h, '\u7f3a\u9677', d.flaws ?? [], (value) => ops.mutate((draft) => ({ ...draft, flaws: value }))),
      listField(h, '\u80fd\u529b', d.abilities ?? [], (value) => ops.mutate((draft) => ({ ...draft, abilities: value }))),
      characterText(h, '\u53e3\u543b', d.speechStyle ?? '', (value) => ops.mutate((draft) => ({ ...draft, speechStyle: value })), true),
      h('fieldset', { className: 'nv-fieldset' },
        h('legend', { className: 'nv-fieldset__legend' }, '\u5f27\u5149'),
        characterText(h, '\u8d77\u70b9', d.arc?.startingPoint ?? '', (value) => ops.mutate((draft) => ({ ...draft, arc: { startingPoint: value, desiredEnd: draft.arc?.desiredEnd ?? '', keyBeats: draft.arc?.keyBeats ?? [] } }))),
        characterText(h, '\u5f52\u5bbf', d.arc?.desiredEnd ?? '', (value) => ops.mutate((draft) => ({ ...draft, arc: { startingPoint: draft.arc?.startingPoint ?? '', desiredEnd: value, keyBeats: draft.arc?.keyBeats ?? [] } }))),
        listField(h, '\u5173\u952e\u8282\u62cd', d.arc?.keyBeats ?? [], (value) => ops.mutate((draft) => ({ ...draft, arc: { startingPoint: draft.arc?.startingPoint ?? '', desiredEnd: draft.arc?.desiredEnd ?? '', keyBeats: value } }))),
      ),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-character-save': '', onClick: ops.save, disabled: !editor.dirty || editor.saving }, saveButtonLabel(editor.saving, '\u4fdd\u5b58')),
    ),
    renderSaveStatus(h, saveStatusLine(editor.saving, editor.saveMessage, editor.error), 'characters'),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'character', role: 'alert' }, editor.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'characters', 'data-novel-layer-state': 'ready' },
    h('div', { className: 'nv-editor__columns' }, list, detail),
  );
}
