import { type El, type WorkspaceNamespace } from '../shared.js';
import { toUserMessage } from '../presentation.js';

export interface StateSnapshotShape { seq: number; storyTime: string; scene?: { location?: string }; [key: string]: unknown; }
export interface StateDiffShape { fromSeq: number; toSeq: number; changes: Array<{ path: string; before: unknown; after: unknown }>; }
export interface StateLayerState { readonly status: 'loading' | 'ready' | 'error'; readonly snapshots: StateSnapshotShape[]; readonly message?: string; }
export interface StateEditor { selectedSeq: number | undefined; fromSeq: number | undefined; toSeq: number | undefined; diff: StateDiffShape | undefined; error: string; }
export interface StateEditOps { select(seq: number): void; showDiff(): void; rollback(): void; }
function displayValue(value: unknown): string { if (value === undefined || value === null) return '∅'; if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value); return JSON.stringify(value); }
function snapshotMeta(snapshot: StateSnapshotShape): string { const parts = [`快照 ${snapshot.seq}`]; if (snapshot.storyTime) parts.push(snapshot.storyTime); if (snapshot.scene?.location) parts.push(snapshot.scene.location); return parts.join(' · '); }

export function stateLayer(h: El, _projectId: string, _workspace: WorkspaceNamespace | undefined, layerState: StateLayerState, editor: StateEditor, ops: StateEditOps): unknown {
  if (layerState.status === 'loading') return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'state', 'data-novel-layer-state': 'loading' }, '正在装载状态快照…');
  if (layerState.status === 'error') return h('section', { className: 'nv-panel', 'data-novel-layer-panel': 'state', 'data-novel-layer-state': 'error', role: 'alert' }, layerState.message ?? '状态快照读取失败');
  const current = layerState.snapshots.at(-1);
  const selected = layerState.snapshots.find((snapshot) => snapshot.seq === editor.selectedSeq);
  const timeline = h('div', { className: 'nv-editor__list', role: 'list' }, h('div', { className: 'nv-editor__toolbar' }, h('span', { className: 'nv-state__hint' }, current === undefined ? '暂无快照' : `当前快照 ${current.seq}`)), layerState.snapshots.map((snapshot) => h('button', { key: snapshot.seq, type: 'button', role: 'listitem', className: 'nv-editor__item' + (editor.selectedSeq === snapshot.seq ? ' is-active' : ''), 'data-novel-state-snapshot': String(snapshot.seq), onClick: () => ops.select(snapshot.seq) }, snapshotMeta(snapshot))));
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title' }, selected === undefined ? '状态快照' : `快照 ${selected.seq} · ${selected.storyTime ?? ''}`),
    selected === undefined ? h('p', { className: 'nv-outline__nodetail' }, '从左侧时间线选择一个快照，或选择一个回滚目标。') : h('div', { className: 'nv-form' }, h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '故事时间'), h('input', { type: 'text', className: 'nv-field__input', value: selected.storyTime ?? '', disabled: true })), h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '场景地点'), h('input', { type: 'text', className: 'nv-field__input', value: selected.scene?.location ?? '', disabled: true }))),
    h('div', { className: 'nv-editor__actions' }, h('button', { type: 'button', className: 'nv-btn', 'data-novel-state-diff': '', onClick: ops.showDiff, title: editor.fromSeq === undefined || editor.toSeq === undefined ? '依次选择两个快照后可比对' : undefined, disabled: editor.fromSeq === undefined || editor.toSeq === undefined }, '比对所选快照'), h('button', { type: 'button', className: 'nv-btn nv-btn--danger', 'data-novel-state-rollback': '', onClick: ops.rollback, disabled: editor.selectedSeq === undefined }, '回滚到此快照')),
    editor.diff === undefined ? null : h('div', { className: 'nv-state__diff', 'data-novel-state-diff-view': '' }, h('h4', { className: 'nv-outline__subtitle' }, `快照差异 ${editor.diff.fromSeq} → ${editor.diff.toSeq}`), editor.diff.changes.length === 0 ? h('p', { className: 'nv-outline__nodetail' }, '两快照无差异。') : h('ul', { className: 'nv-state__diff-list' }, editor.diff.changes.map((change) => h('li', { key: change.path, className: 'nv-state__diff-row', 'data-novel-state-diff-row': change.path }, h('span', { className: 'nv-state__diff-path' }, '变化项'), h('span', { className: 'nv-state__diff-before' }, displayValue(change.before)), h('span', { className: 'nv-state__diff-arrow' }, '→'), h('span', { className: 'nv-state__diff-after' }, displayValue(change.after)))))),
    editor.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'state', role: 'alert' }, toUserMessage(editor.error)) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-layer-panel': 'state', 'data-novel-layer-state': 'ready' }, h('div', { className: 'nv-editor__columns' }, timeline, detail));
}
