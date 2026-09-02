import { characterText, type El, type TimelineNamespace } from '../shared.js';
import { toUserMessage } from '../presentation.js';
import { entityMultiSelect, type EntityOption } from '../entity-selectors.js';
import { renderSaveStatus, saveButtonLabel, saveStatusLine } from '../save-status.js';
import { contextLinkButton, entityContextLink, type ContextLinkSink } from '../link-adapters.js';

/**
 * 方案 A 剧情时间线面板（design §8「相关角色对」/ 剧情时间线）。
 *
 * C1/C3 IDs are edited through named selectors. Persisted IDs missing from the
 * current projection remain visible as explicit unknown options.
 */
export interface TimelineNodeShape {
  id: string;
  order: number;
  label: string;
  storyTime?: string;
  beatId?: string;
  detailBeatId?: string;
  reveals: Array<{ entryId: string; revealTo: string[] }>;
  relationships: string[];
  [key: string]: unknown;
}
export interface TimelineShape { id: string; version: number; nodes: TimelineNodeShape[]; currentNodeId: string | null; [key: string]: unknown; }
export interface TimelineLayerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly timeline: TimelineShape | undefined;
  readonly selectedId: string | undefined;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly saveMessage: string;
  readonly error: string;
  readonly message?: string;
}
export interface TimelineEditOps {
  refresh(): void;
  ensure(): void;
  select(nodeId: string): void;
  mutate(update: (draft: TimelineShape) => TimelineShape): void;
  setCurrent(nodeId: string | null): void;
  save(): void;
}
export function freshTimeline(): TimelineLayerState { return { status: 'idle', timeline: undefined, selectedId: undefined, dirty: false, saving: false, saveMessage: '', error: '' }; }

export function timelinePanel(
  h: El,
  projectId: string,
  namespace: TimelineNamespace | undefined,
  state: TimelineLayerState,
  ops: TimelineEditOps,
  relationshipOptions: readonly EntityOption[] = [],
  knowledgeOptions: readonly EntityOption[] = [],
  links?: ContextLinkSink,
): unknown {
  if (namespace === undefined) return h('section', { className: 'nv-panel', 'data-novel-view-panel': 'timeline', 'data-novel-timeline-state': 'error', role: 'alert' }, '时间线功能暂时不可用，请稍后重试。');
  if (state.status === 'loading') return h('section', { className: 'nv-panel', 'data-novel-view-panel': 'timeline', 'data-novel-timeline-state': 'loading' }, '正在加载时间线…');
  const timeline = state.timeline;
  if (timeline === undefined || timeline.nodes.length === 0) {
    return h('section', { className: 'nv-panel', 'data-novel-view-panel': 'timeline', 'data-novel-timeline-state': 'idle' },
      h('p', { className: 'nv-outline__nodetail', 'data-novel-timeline-empty': '' }, '尚未读取时间线：先「刷新」读取已保存内容，或「从大纲生成时间线」。'),
      h('div', { className: 'nv-editor__toolbar' },
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-timeline-refresh': '', onClick: ops.refresh }, '刷新'),
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-timeline-ensure': '', onClick: ops.ensure }, '从大纲生成时间线'),
      ),
      state.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'timeline', role: 'alert' }, toUserMessage(state.error)) : null,
    );
  }
  const current = timeline.currentNodeId;
  const selected = state.selectedId ?? current ?? timeline.nodes[0].id;
  const node = timeline.nodes.find((item) => item.id === selected) ?? timeline.nodes[0];
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' }, h('button', { type: 'button', className: 'nv-btn', 'data-novel-timeline-refresh': '', onClick: ops.refresh }, '刷新')),
    timeline.nodes.map((item) => h('div', { key: item.id, className: 'nv-editor__item-row', role: 'listitem' },
      h('button', { type: 'button', className: 'nv-editor__item' + (selected === item.id ? ' is-active' : '') + (current === item.id ? ' nv-timeline__current' : ''), 'data-novel-timeline-node': item.id, 'data-novel-timeline-current': current === item.id ? '' : undefined, onClick: () => ops.select(item.id) }, `${item.order + 1}. ${item.label}${item.storyTime ? `（${item.storyTime}）` : ''}`),
      contextLinkButton(h, '定位时间点', 'timeline', entityContextLink(projectId, 'timeline', item.id), links),
    )),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title', 'data-novel-timeline-node-title': node.id }, `${node.order + 1}. ${node.label}`),
    h('p', { className: 'nv-field__label' }, `当前时间点：${current === null ? '自动（按写作位置）' : `手动选择 ${timeline.nodes.find((item) => item.id === current)?.label ?? '引用已缺失'}`}`),
    h('div', { className: 'nv-form' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-timeline-set-current': node.id, onClick: () => ops.setCurrent(current === node.id ? null : node.id) }, current === node.id ? '取消手动选择（恢复自动）' : '设为当前时间点'),
      characterText(h, '故事内时间标注（storyTime）', node.storyTime ?? '', (value) => ops.mutate((draft) => ({ ...draft, nodes: draft.nodes.map((item) => item.id === node.id ? { ...item, storyTime: value } : item) }))),
      entityMultiSelect(h, '本节点建立/公开的关系', node.relationships ?? [], relationshipOptions, (value) => ops.mutate((draft) => ({ ...draft, nodes: draft.nodes.map((item) => item.id === node.id ? { ...item, relationships: value } : item) })), 'timeline-relationships'),
      entityMultiSelect(h, '本节点揭示的信息', (node.reveals ?? []).map((reveal) => reveal.entryId), knowledgeOptions, (value) => ops.mutate((draft) => ({ ...draft, nodes: draft.nodes.map((item) => item.id === node.id ? { ...item, reveals: value.map((entryId) => ({ entryId, revealTo: item.reveals.find((reveal) => reveal.entryId === entryId)?.revealTo ?? [] })) } : item) })), 'timeline-knowledge'),
    ),
    h('div', { className: 'nv-editor__actions' }, h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-timeline-save': '', onClick: ops.save, disabled: !state.dirty || state.saving }, saveButtonLabel(state.saving, '保存'))),
    renderSaveStatus(h, saveStatusLine(state.saving, state.saveMessage, state.error), 'timeline'),
    state.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'timeline', role: 'alert' }, toUserMessage(state.error)) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-view-panel': 'timeline', 'data-novel-timeline-state': 'ready' }, h('div', { className: 'nv-editor__columns' }, list, detail));
}
