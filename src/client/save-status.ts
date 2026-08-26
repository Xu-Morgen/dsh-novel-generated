import type { El } from './shared.js';

/**
 * I59 保存状态（design §14.8 / R12-6）：保存中 / 已保存 / 失败三态 + 空闲的统一
 * 渲染与按钮忙碌文案。
 *
 * 契约与不变式：
 * - 状态行必须可播报：saving/saved 使用 `role="status"` + `aria-live="polite"`，
 *   failed 使用 `role="alert"`（assertive），异步结果对辅助技术可见。
 * - 每个状态行携带 `data-novel-save-status={anchor}` 与
 *   `data-novel-save-state={kind}` 两个稳定测试锚点。
 * - idle（未开始保存）不渲染任何节点；渲染纯展示，不持有状态、不触发副作用。
 */

/** 保存状态的四个取值：空闲 / 保存中 / 已保存 / 失败。 */
export type SaveStatusKind = 'idle' | 'saving' | 'saved' | 'failed';

/** 一条保存状态行：`kind` 决定语义与播报方式，`message` 是给用户的文案。 */
export interface SaveStatusLine {
  readonly kind: SaveStatusKind;
  readonly message: string;
}

/**
 * 渲染一条保存状态行；`anchor` 是稳定 data 锚点值（如 'llm' / 'characters'）。
 * idle 或 undefined 返回 null（无节点）。
 */
export function renderSaveStatus(h: El, line: SaveStatusLine | undefined, anchor: string): unknown {
  if (line === undefined || line.kind === 'idle') return null;
  if (line.kind === 'failed') {
    return h('p', {
      className: 'nv-save-status nv-save-status--failed',
      'data-novel-save-status': anchor,
      'data-novel-save-state': 'failed',
      role: 'alert',
      'aria-live': 'assertive',
    }, line.message);
  }
  const cls = line.kind === 'saving' ? 'nv-save-status nv-save-status--saving' : 'nv-save-status nv-save-status--saved';
  return h('p', {
    className: cls,
    'data-novel-save-status': anchor,
    'data-novel-save-state': line.kind,
    role: 'status',
    'aria-live': 'polite',
  }, line.message);
}

/** 保存按钮忙碌文案：saving 时固定「保存中…」，否则返回原始标签（R12-6 按钮 busy 状态）。 */
export function saveButtonLabel(saving: boolean, label: string): string {
  return saving ? '保存中…' : label;
}

/** 把 draft 上的 saving/saveMessage/error 投影为 SaveStatusLine；无状态时返回 undefined。 */
export function saveStatusLine(saving: boolean, saveMessage: string, error: string): SaveStatusLine | undefined {
  if (error.length > 0) return { kind: 'failed', message: error };
  if (saving) return { kind: 'saving', message: '正在保存…' };
  if (saveMessage.length > 0) return { kind: 'saved', message: saveMessage };
  return undefined;
}
