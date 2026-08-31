import { describe, expect, it } from 'vitest';
import { advancedError, advancedReference, AUTHOR_VISIBLE_TERM_DENYLIST, toUserMessage } from './presentation.js';

interface NodeShape { tag: string; props: Record<string, unknown>; children: unknown[] }

function h(tag: string, props?: Record<string, unknown> | null, ...children: unknown[]): NodeShape {
  return { tag, props: props ?? {}, children };
}

function flatten(node: unknown): string {
  if (node == null) return '';
  if (Array.isArray(node)) return node.map(flatten).join('');
  if (typeof node === 'object') return flatten((node as NodeShape).children);
  return String(node);
}

function find(node: unknown, attribute: string): NodeShape | undefined {
  if (node == null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const item of node) { const found = find(item, attribute); if (found) return found; }
    return undefined;
  }
  const current = node as NodeShape;
  if (current.props[attribute] !== undefined) return current;
  for (const child of current.children) { const found = find(child, attribute); if (found) return found; }
  return undefined;
}

describe('I132 author presentation contract (R18-7)', () => {
  it('maps the five dynamic failure classes to actionable author language', () => {
    expect(toUserMessage(new Error('Stale branch source'))).toBe('内容已发生变化，请刷新后再试。');
    expect(toUserMessage(new Error('Unknown scene scene-1'))).toBe('找不到对应内容，请刷新后再试。');
    expect(toUserMessage(new Error('Host rejected malformed result'))).toBe('创作服务返回了无法使用的内容，请重试。');
    expect(toUserMessage(new Error('network timeout from provider'))).toBe('暂时无法连接创作服务，请稍后重试。');
    expect(toUserMessage(new Error('知情边界不允许。'))).toBe('知情边界不允许。');
  });

  it('fails closed for blank, structured, and unknown technical errors', () => {
    expect(toUserMessage(new Error(''))).toBe('操作未完成，请重试。');
    expect(toUserMessage('{"ok":false}')).toBe('操作未完成，请重试。');
    expect(toUserMessage(new Error('unexpected'))).toBe('操作未完成，请重试。');
    expect(toUserMessage(new Error('unexpected'), '请重新选择章节。')).toBe('请重新选择章节。');
  });

  it('keeps raw diagnostics behind an explicit advanced view', () => {
    const tree = advancedError(h, new Error('Host rejected sourceHash=abc'), '操作失败');
    expect(find(tree, 'data-novel-advanced-error')).toBeDefined();
    expect(find(tree, 'data-novel-advanced-view')?.tag).toBe('details');
    expect(flatten(tree)).toContain('内容已发生变化，请刷新后再试。');
    expect(flatten(tree)).toContain('Host rejected sourceHash=abc');

    const reference = advancedReference(h, '查看记录标识', 'record-1');
    expect(find(reference, 'data-novel-advanced-view')?.props['data-novel-advanced-view']).toBe('');
    expect(flatten(reference)).toContain('record-1');
  });

  it('keeps technical terms in one explicit scanner dictionary', () => {
    expect(AUTHOR_VISIBLE_TERM_DENYLIST).toContain('Remote');
    expect(AUTHOR_VISIBLE_TERM_DENYLIST).toContain('fingerprint');
    expect(new Set(AUTHOR_VISIBLE_TERM_DENYLIST).size).toBe(AUTHOR_VISIBLE_TERM_DENYLIST.length);
  });
});
