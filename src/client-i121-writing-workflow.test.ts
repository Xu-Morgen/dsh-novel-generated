import { describe, expect, it } from 'vitest';
import { chaptersPanel, freshChapters, type ChaptersEditOps } from './client/layers/chapters.js';
import {
  beginWritingWorkflow,
  cancelWritingWorkflow,
  freshWritingWorkflow,
  resetWritingWorkflow,
  settleWritingWorkflow,
} from './client/writing-workflow.js';

interface NodeShape { tag: string; props: Record<string, unknown>; children: unknown[]; }

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

describe('I121 Client writing workflow state', () => {
  it('ignores late results after cancellation and resets cleanly for a new project/revision', () => {
    const started = beginWritingWorkflow(freshWritingWorkflow(4), { projectId: 'demo', chapterId: 'chapter-2', navigationRevision: 4 });
    const ready = settleWritingWorkflow(started, { status: 'ready', sceneId: 'scene-1', traceSectionCount: 4 }, 4);
    const cancelled = cancelWritingWorkflow(ready, 4);
    expect(cancelled.status).toBe('cancelled');
    expect(settleWritingWorkflow(cancelled, { status: 'saved', sourceHash: 'old-result' }, 4)).toBe(cancelled);
    expect(settleWritingWorkflow(cancelled, { status: 'saved', sourceHash: 'old-revision' }, 3)).toBe(cancelled);
    expect(resetWritingWorkflow(5)).toEqual({ status: 'idle', navigationRevision: 5 });
  });

  it('renders the workflow state in the chapters workspace without exposing raw fingerprint data', () => {
    const state = {
      ...freshChapters(),
      status: 'ready' as const,
      workflow: settleWritingWorkflow(
        beginWritingWorkflow(freshWritingWorkflow(0), { projectId: 'demo', chapterId: 'chapter-1', navigationRevision: 0 }),
        { status: 'saved', sceneId: 'scene-1', sourceHash: 'a'.repeat(64), message: '正文已保存，可继续下一场景。' },
        0,
      ),
    };
    const tree = chaptersPanel(h, 'demo', undefined, undefined, undefined, state, {} as ChaptersEditOps);
    expect(find(tree, 'data-novel-writing-workflow')?.props['data-novel-writing-workflow-state']).toBe('saved');
    expect(JSON.stringify(tree)).toContain('正文已保存');
    expect(JSON.stringify(tree)).not.toContain('a'.repeat(64));
  });
});
