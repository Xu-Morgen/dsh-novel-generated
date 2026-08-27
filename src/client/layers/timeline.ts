import { characterText, listField, type El, type TimelineNamespace } from '../shared.js';
import { renderSaveStatus, saveButtonLabel, saveStatusLine } from '../save-status.js';

/**
 * 方案 A 剧情时间线面板（design §8「相关角色对」/ 剧情时间线）。
 *
 * 展示从 B5 大纲展开的有序剧情时间轴；每个节点可安排：
 * - `relationships`：该节点建立/公开的关系（C1 id 列表）——写作上下文据此
 *   只注入「当前时间点之前已建立」的关系；
 * - `reveals`：该节点揭示的信息（C3 entryId + revealTo）——为知情层提供
 *   「哪些信息在什么时候被角色知晓」的确定性安排；
 * - `storyTime`：故事内时间标注（自由文本）。
 *
 * 支持：手动选择当前节点（写入 timeline.currentNodeId，覆盖自动锚定）、
 * 大纲未自建时一键自建（ensureFromOutline）、保存作者安排（save）。
 * 所有读写只经 Host `novelTimeline` Remote；Client 只持有最小投影。
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
export interface TimelineShape {
  id: string;
  version: number;
  nodes: TimelineNodeShape[];
  currentNodeId: string | null;
  [key: string]: unknown;
}
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
  /** 大纲未自建时间线时，从 B5 生成骨架。 */
  ensure(): void;
  select(nodeId: string): void;
  mutate(update: (draft: TimelineShape) => TimelineShape): void;
  setCurrent(nodeId: string | null): void;
  save(): void;
}

export function freshTimeline(): TimelineLayerState {
  return { status: 'idle', timeline: undefined, selectedId: undefined, dirty: false, saving: false, saveMessage: '', error: '' };
}

export function timelinePanel(
  h: El,
  projectId: string,
  namespace: TimelineNamespace | undefined,
  state: TimelineLayerState,
  ops: TimelineEditOps,
): unknown {
  if (namespace === undefined) {
    return h('section', { className: 'nv-panel', 'data-novel-view-panel': 'timeline', 'data-novel-timeline-state': 'error', role: 'alert' }, '时间线服务不可用（novelTimeline Remote 未挂载）。');
  }
  if (state.status === 'loading') {
    return h('section', { className: 'nv-panel', 'data-novel-view-panel': 'timeline', 'data-novel-timeline-state': 'loading' }, '正在加载时间线…');
  }
  const timeline = state.timeline;
  if (timeline === undefined || timeline.nodes.length === 0) {
    return h('section', { className: 'nv-panel', 'data-novel-view-panel': 'timeline', 'data-novel-timeline-state': 'idle' },
      h('p', { className: 'nv-outline__nodetail', 'data-novel-timeline-empty': '' }, '尚未装载时间线：先「刷新」读取已自建文档，或「从大纲生成时间线」（B5 就绪后自动展开有序剧情时间轴）。'),
      h('div', { className: 'nv-editor__toolbar' },
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-timeline-refresh': '', onClick: ops.refresh }, '刷新'),
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-timeline-ensure': '', onClick: ops.ensure }, '从大纲生成时间线'),
      ),
      state.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'timeline', role: 'alert' }, state.error) : null,
    );
  }
  const current = timeline.currentNodeId;
  const selected = state.selectedId ?? current ?? timeline.nodes[0].id;
  const node = timeline.nodes.find((item) => item.id === selected) ?? timeline.nodes[0];
  const list = h('div', { className: 'nv-editor__list', role: 'list' },
    h('div', { className: 'nv-editor__toolbar' }, h('button', { type: 'button', className: 'nv-btn', 'data-novel-timeline-refresh': '', onClick: ops.refresh }, '刷新')),
    timeline.nodes.map((item) => h('button', {
      key: item.id,
      type: 'button',
      role: 'listitem',
      className: 'nv-editor__item' + (selected === item.id ? ' is-active' : '') + (current === item.id ? ' nv-timeline__current' : ''),
      'data-novel-timeline-node': item.id,
      'data-novel-timeline-current': current === item.id ? '' : undefined,
      onClick: () => ops.select(item.id),
    },
      `${item.order + 1}. ${item.label}${item.storyTime ? `（${item.storyTime}）` : ''}`)),
  );
  const detail = h('div', { className: 'nv-editor__detail' },
    h('h3', { className: 'nv-editor__title', 'data-novel-timeline-node-title': node.id }, `${node.order + 1}. ${node.label}`),
    h('p', { className: 'nv-field__label' }, `当前时间点：${current === null ? '自动（按写作位置）' : `手动选择 ${timeline.nodes.find((item) => item.id === current)?.label ?? current}`}`),
    h('div', { className: 'nv-form' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-timeline-set-current': node.id, onClick: () => ops.setCurrent(current === node.id ? null : node.id) },
        current === node.id ? '取消手动选择（恢复自动）' : '设为当前时间点'),
      characterText(h, '故事内时间标注（storyTime）', node.storyTime ?? '', (value) => ops.mutate((draft) => ({
        ...draft,
        nodes: draft.nodes.map((item) => item.id === node.id ? { ...item, storyTime: value } : item),
      }))),
      listField(h, '本节点建立/公开的关系（C1 id，每行一个）', node.relationships ?? [], (value) => ops.mutate((draft) => ({
        ...draft,
        nodes: draft.nodes.map((item) => item.id === node.id ? { ...item, relationships: value } : item),
      }))),
      listField(h, '本节点揭示的信息（C3 entryId，每行一个；揭示对象在知情面板安排）', (node.reveals ?? []).map((reveal) => reveal.entryId), (value) => ops.mutate((draft) => ({
        ...draft,
        nodes: draft.nodes.map((item) => item.id === node.id ? { ...item, reveals: value.map((entryId) => ({ entryId, revealTo: [] })) } : item),
      }))),
    ),
    h('div', { className: 'nv-editor__actions' }, h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-timeline-save': '', onClick: ops.save, disabled: !state.dirty || state.saving }, saveButtonLabel(state.saving, '保存'))),
    renderSaveStatus(h, saveStatusLine(state.saving, state.saveMessage, state.error), 'timeline'),
    state.error ? h('p', { className: 'nv-editor__error', 'data-novel-error': 'timeline', role: 'alert' }, state.error) : null,
  );
  return h('section', { className: 'nv-editor', 'data-novel-view-panel': 'timeline', 'data-novel-timeline-state': 'ready' }, h('div', { className: 'nv-editor__columns' }, list, detail));
}
