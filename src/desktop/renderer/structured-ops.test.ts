import { describe, expect, it, vi } from 'vitest';

import type { OpsPorts, OpsRuntime } from '../../client/ops/context.js';
import type { WorkbenchState } from '../../client/store/types.js';
import { createDesktopStructuredOps } from './structured-ops.js';
import { createDesktopWorkbenchStore } from './store-adapter.js';

const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });

function runtime(store: ReturnType<typeof createDesktopWorkbenchStore>): OpsRuntime {
  const active = new Set<string>();
  return {
    snapshot: store.getSnapshot(),
    act: store.actions,
    projectId: 'alpha',
    isActive: () => true,
    beginOp: (key) => {
      if (active.has(key)) return false;
      active.add(key);
      return true;
    },
    endOp: (key) => { active.delete(key); },
    queuePoll: { start: vi.fn(), stop: vi.fn() },
  };
}

function ports(workspace: OpsPorts['workspace'], knowledgeNamespace: OpsPorts['knowledgeNamespace'], ruleStyleNamespace: OpsPorts['ruleStyleNamespace']): Pick<OpsPorts, 'workspace' | 'knowledgeNamespace' | 'ruleStyleNamespace'> {
  return { workspace, knowledgeNamespace, ruleStyleNamespace };
}

describe('I176 desktop structured ops consumer', () => {
  it('routes structured editing through the DesktopServiceBag ports', async () => {
    const store = createDesktopWorkbenchStore();
    store.actions.selectProject('alpha', 'Alpha');
    store.actions.characterMutate((draft) => ({ ...draft, name: 'Hero' }));

    const characterCreate = vi.fn(async () => ok({ id: 'hero', name: 'Hero' }));
    const characterList = vi.fn(async () => ok([]));
    const knowledgeList = vi.fn(async () => ok({
      projectId: 'alpha', entries: [], characters: [],
      summary: { total: 0, hidden: 0, partiallyRevealed: 0, revealed: 0, withPlan: 0 },
    }));
    const knowledgePending = vi.fn(async () => ok([]));
    const ruleStyleList = vi.fn(async () => ok({ projectId: 'alpha', rules: [], style: null }));
    const chapterList = vi.fn(async () => ok([]));
    const workspace = {
      characterCreate,
      characterList,
      chapterList,
    } as unknown as OpsPorts['workspace'];
    const knowledgeNamespace = { list: knowledgeList, pending: knowledgePending } as unknown as OpsPorts['knowledgeNamespace'];
    const ruleStyleNamespace = { list: ruleStyleList } as unknown as OpsPorts['ruleStyleNamespace'];
    const ops = createDesktopStructuredOps(runtime(store), ports(workspace, knowledgeNamespace, ruleStyleNamespace));

    ops.characters.save();
    ops.knowledge.refresh();
    ops.ruleStyle.refresh();

    await vi.waitFor(() => {
      expect(characterCreate).toHaveBeenCalledWith('alpha', expect.objectContaining({ id: 'hero', name: 'Hero' }));
      expect(characterList).toHaveBeenCalledWith('alpha');
      expect(knowledgeList).toHaveBeenCalledWith('alpha');
      expect(knowledgePending).toHaveBeenCalledWith('alpha');
      expect(ruleStyleList).toHaveBeenCalledWith('alpha');
    });
    expect(store.getSnapshot().knowledge.status).toBe('ready');
    expect(store.getSnapshot().ruleStyle.status).toBe('ready');

    // C5 is intentionally still outside I176: its base port is unavailable.
    ops.chapters.retryChapter();
    expect(chapterList).not.toHaveBeenCalled();
    store.dispose();
  });

  it('keeps the structured composition typed as the existing WorkbenchOps contract', () => {
    const store = createDesktopWorkbenchStore();
    const state: WorkbenchState = store.getSnapshot();
    expect(state.selectedProjectId).toBeUndefined();
    const ops = createDesktopStructuredOps(runtime(store), ports(undefined, undefined, undefined));
    expect(ops.characters).toBeDefined();
    expect(ops.worldview).toBeDefined();
    expect(ops.outline).toBeDefined();
    expect(ops.relationship).toBeDefined();
    expect(ops.state).toBeDefined();
    expect(ops.canon).toBeDefined();
    expect(ops.knowledge).toBeDefined();
    expect(ops.ruleStyle).toBeDefined();
    store.dispose();
  });
});
