import type { El, UnwrapValue, WorkspaceNamespace } from '../shared.js';
import { renderSaveStatus, saveButtonLabel, saveStatusLine } from '../save-status.js';
import type { ChaptersEditOps } from './chapters.js';
import { errorBlock, proseParagraphs } from './chapters-shared.js';
import type { TextAnchor } from '../../core/schema/link.js';

/**
 * I95 场景正文编辑片（计划 §18 I95 拆分：chapters 五职中的「场景编辑」）：
 * 受控编辑状态（SceneEditorState / ReparseUiState / SceneEditRange）、纯函数
 * computeEditRange 与编辑面板渲染（sceneEditorPanel）。章节树/候选/分支各归
 * 自有切片，本片只负责正文编辑。
 */

/** I61 单一连续范围（半开区间 [start, end)，UTF-16 code unit 偏移）。 */
export interface SceneEditRange { start: number; end: number; }

export type ReparseLayerPreviewShape = UnwrapValue<Awaited<ReturnType<WorkspaceNamespace['sceneReparsePreview']>>>;

/** I61 reparse 提案的 UI 状态机（kind 即三态 + 忙碌/终态）。 */
export type ReparseUiState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'proposed'; readonly proposalId: string; readonly range: SceneEditRange; readonly replacement: string; readonly baseHash: string; readonly preview?: ReparseLayerPreviewShape; readonly previewError?: string }
  | { readonly kind: 'accepting'; readonly proposalId: string; readonly range: SceneEditRange; readonly replacement: string; readonly baseHash: string; readonly preview?: ReparseLayerPreviewShape }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'done'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

/** I61 正文编辑表单状态（mode: read = 只读段落，edit = textarea 草稿）。 */
export interface SceneEditorState {
  readonly mode: 'read' | 'edit';
  /** 装载时的正文（baseHash 计算基准；保存成功/重解析成功后被新内容替换）。 */
  readonly original: string;
  readonly draft: string;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly saveMessage: string;
  readonly error: string;
  readonly reparse: ReparseUiState;
  /** 脏文本导航保护：true 时显示确认条，pendingNavigation 记录被推迟的切换。 */
  readonly leaveConfirm: boolean;
  readonly pendingNavigation: { readonly chapterId: string; readonly sceneId?: string; readonly anchor?: TextAnchor } | undefined;
  /** I128 route focus; transient and cleared when the loaded text does not match. */
  readonly focusAnchor?: TextAnchor;
}

/** 编辑器初始状态（只读模式，无草稿）。 */
export function freshSceneEditor(): SceneEditorState {
  return {
    mode: 'read', original: '', draft: '', dirty: false, saving: false,
    saveMessage: '', error: '', reparse: { kind: 'idle' }, leaveConfirm: false, pendingNavigation: undefined, focusAnchor: undefined,
  };
}

export function computeEditRange(original: string, draft: string): { kind: 'none' } | { kind: 'single'; range: SceneEditRange; replacement: string } {
  if (original === draft) return { kind: 'none' };
  const max = Math.min(original.length, draft.length);
  let start = 0;
  while (start < max && original[start] === draft[start]) start += 1;
  let endOriginal = original.length;
  let endDraft = draft.length;
  while (endOriginal > start && endDraft > start && original[endOriginal - 1] === draft[endDraft - 1]) {
    endOriginal -= 1;
    endDraft -= 1;
  }
  return { kind: 'single', range: { start, end: endOriginal }, replacement: draft.slice(start, endDraft) };
}

/** reparse 提案/接受进行中锁定草稿（禁止继续修改，避免 accept 用错范围）。 */
export function reparseLocked(state: SceneEditorState): boolean {
  return state.reparse.kind === 'proposed' || state.reparse.kind === 'accepting';
}

/**
 * I61 编辑模式面板：textarea 草稿 + 范围提示 + 保存/重解析动作 + 提案面板 +
 * 离开确认。契约与不变式见 chapters.ts 文件头注释（I61 受控编辑）。
 */
export function sceneEditorPanel(h: El, state: SceneEditorState, ops: ChaptersEditOps): unknown {
  const diff = computeEditRange(state.original, state.draft);
  const canSave = state.dirty && diff.kind === 'single' && !state.saving && !reparseLocked(state);
  const locked = reparseLocked(state);
  let rangeHint: unknown;
  if (diff.kind === 'none') {
    rangeHint = h('p', { className: 'nv-chapters__editor-range', 'data-novel-scene-range': 'none' }, '未检测到修改。');
  } else {
    rangeHint = h('p', { className: 'nv-chapters__editor-range', 'data-novel-scene-range': 'single' },
      `检测到 1 处修改：第 ${diff.range.start + 1}–${diff.range.end} 字符（范围外保持不变）。`);
  }
  let reparsePanel: unknown;
  if (state.reparse.kind === 'idle') {
    reparsePanel = h('p', { className: 'nv-chapters__reparse-hint', 'data-novel-scene-reparse-hint': '' },
      '可选：保存并重解析将把本次修改经 ConfirmationGate 同步到结构层（C2/C1/C3/C4/B2）。');
  } else if (state.reparse.kind === 'proposed') {
    reparsePanel = h('div', { className: 'nv-chapters__reparse nv-chapters__reparse--proposed', 'data-novel-scene-reparse-proposed': '', role: 'status', 'aria-live': 'polite' },
      h('p', { className: 'nv-chapters__reparse-status' }, '重解析提案已发起，确认后才会同步结构层。'),
      state.reparse.preview === undefined
        ? h('p', { className: 'nv-chapters__reparse-preview-error', 'data-novel-scene-reparse-preview-error': '' }, state.reparse.previewError ?? '正在准备五层变更预览…')
        : h('details', { className: 'nv-chapters__reparse-preview', 'data-novel-scene-reparse-preview': '' },
          h('summary', { 'data-novel-scene-reparse-preview-summary': '' }, `五层结构化变更预览（${state.reparse.preview.changes.length} 项）`),
          state.reparse.preview.changes.length === 0
            ? h('p', { className: 'nv-chapters__reparse-preview-empty', 'data-novel-scene-reparse-preview-empty': '' }, '五层没有需要写回的结构化变化。')
            : h('ul', { className: 'nv-chapters__reparse-preview-list' }, state.reparse.preview.changes.map((change, index) =>
              h('li', { key: `${change.layer}-${change.entityId}-${index}`, 'data-novel-scene-reparse-layer-change': `${change.layer}:${change.kind}` },
                `${change.layer}：${change.kind} ${change.entityType}/${change.entityId}（${change.changedFields.join('、')}）`))),
        ),
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-scene-reparse-accept': '', disabled: state.reparse.preview === undefined, onClick: () => ops.acceptReparse() }, '确认重解析'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-scene-reparse-reject': '', onClick: () => ops.rejectReparse() }, '拒绝'),
      ),
    );
  } else if (state.reparse.kind === 'accepting') {
    reparsePanel = h('div', { className: 'nv-chapters__reparse nv-chapters__reparse--accepting', 'data-novel-scene-reparse-accepting': '', role: 'status', 'aria-live': 'polite' },
      h('p', { className: 'nv-chapters__reparse-status' }, '正在重解析并同步结构层…'));
  } else if (state.reparse.kind === 'rejected') {
    reparsePanel = h('p', { className: 'nv-chapters__reparse nv-chapters__reparse--rejected', 'data-novel-scene-reparse-rejected': '', role: 'status', 'aria-live': 'polite' },
      '已拒绝重解析，结构层未改动。可再次「保存并重解析」或仅保存正文。');
  } else if (state.reparse.kind === 'done') {
    reparsePanel = h('p', { className: 'nv-chapters__reparse nv-chapters__reparse--done', 'data-novel-scene-reparse-done': '', role: 'status', 'aria-live': 'polite' }, state.reparse.message);
  } else {
    reparsePanel = h('p', { className: 'nv-chapters__reparse nv-chapters__reparse--error', 'data-novel-scene-reparse-error': '', role: 'alert', 'aria-live': 'assertive' },
      `重解析失败：${state.reparse.message}`);
  }
  const leaveConfirm = state.leaveConfirm
    ? h('div', { className: 'nv-chapters__leave', 'data-novel-scene-leave': '', role: 'alertdialog', 'aria-label': '放弃未保存的正文修改' },
      h('p', { className: 'nv-chapters__leave-hint', 'data-novel-scene-leave-hint': '' }, '有未保存的正文修改，放弃将丢失这些修改。'),
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-scene-discard': '', onClick: () => ops.discardDraft() }, '放弃并离开'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-scene-leave-cancel': '', onClick: () => ops.cancelLeave() }, '取消'),
      ),
    )
    : null;
  return h('div', { className: 'nv-chapters__editor', 'data-novel-scene-editor': '' },
    h('label', { className: 'nv-field' },
      h('span', { className: 'nv-field__label' }, '正文（编辑模式）'),
      h('textarea', {
        className: 'nv-field__input nv-chapters__editor-input',
        'data-novel-scene-text': '',
        value: state.draft,
        rows: 12,
        disabled: locked,
        onChange: (event: { target: { value: string } }) => ops.textChange(event.target.value),
      }),
    ),
    rangeHint,
    h('div', { className: 'nv-editor__actions' },
      h('button', {
        type: 'button',
        className: 'nv-btn',
        'data-novel-scene-save': '',
        disabled: !canSave,
        onClick: () => ops.save(false),
      }, saveButtonLabel(state.saving, '保存修改')),
      h('button', {
        type: 'button',
        className: 'nv-btn nv-btn--primary',
        'data-novel-scene-save-reparse': '',
        disabled: !canSave,
        onClick: () => ops.save(true),
      }, saveButtonLabel(state.saving, '保存并重解析')),
    ),
    renderSaveStatus(h, saveStatusLine(state.saving, state.saveMessage, state.error), 'scene'),
    reparsePanel,
    leaveConfirm,
  );
}

export type { El, WorkspaceNamespace };
