import type { FakeNode } from './types.js';

/**
 * I95 test-harness 拆分（计划 §18 I95）：DOM helpers 片——collect/layerButtons
 * 深度遍历辅助。由 test-harness.ts 兼容重导出。
 */

/** Depth-first collect of every element whose tag matches `tag`. */
export function collect(node: unknown, tag: string): FakeNode[] {
  const out: FakeNode[] = [];
  const visit = (current: unknown): void => {
    if (current == null || typeof current !== 'object') return;
    if (Array.isArray(current)) { for (const item of current) visit(item); return; }
    const n = current as FakeNode;
    if (n.tag === tag) out.push(n);
    for (const child of n.children ?? []) visit(child);
  };
  visit(node);
  return out;
}

/** Collect every element carrying `data-novel-layer`. */
export function layerButtons(node: unknown): FakeNode[] {
  const out: FakeNode[] = [];
  const visit = (current: unknown): void => {
    if (current == null || typeof current !== 'object') return;
    if (Array.isArray(current)) { for (const item of current) visit(item); return; }
    const n = current as FakeNode;
    if (n.props?.['data-novel-layer'] !== undefined) out.push(n);
    for (const child of n.children ?? []) visit(child);
  };
  visit(node);
  return out;
}
