import { describe, expect, it } from 'vitest';
import { longDraftGuidePanel } from './client/long-draft-guide.js';
import type { LongDraftNamespace } from './client/shared.js';

interface NodeShape {
  tag: string;
  props: Record<string, unknown>;
  children: unknown[];
}

function h(tag: string, props?: Record<string, unknown> | null, ...children: unknown[]): NodeShape {
  return { tag, props: props ?? {}, children };
}

function find(node: unknown, attribute: string): NodeShape | undefined {
  if (node === null || typeof node !== 'object') return undefined;
  const candidate = node as NodeShape;
  if (candidate.props?.[attribute] !== undefined) return candidate;
  for (const child of candidate.children ?? []) {
    const found = find(child, attribute);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe('I120 long-draft Client guidance', () => {
  it('explains Host empty-project gating, I11 confirmation, B5-only apply, and recovery', () => {
    const tree = longDraftGuidePanel(h, 'fixture-project', {} as LongDraftNamespace);
    expect(find(tree, 'data-novel-long-draft-guide')?.props['data-novel-long-draft-state']).toBe('host-ready');
    const text = JSON.stringify(tree);
    expect(text).toContain('I11 Gate');
    expect(text).toContain('C5');
    expect(text).toContain('checkpoint');
  });

  it('shows a fail-closed unavailable state when the Remote is not mounted', () => {
    const tree = longDraftGuidePanel(h, 'fixture-project', undefined);
    expect(find(tree, 'data-novel-long-draft-error')).toBeDefined();
    expect(find(tree, 'data-novel-long-draft-guide')?.props['data-novel-long-draft-state']).toBe('unavailable');
  });
});
