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

function ports(workspace: OpsPorts['workspace'], knowledgeNamespace: OpsPorts['knowledgeNamespace'], ruleStyleNamespace: OpsPorts['ruleStyleNamespace']): Parameters<typeof createDesktopStructuredOps>[1] {
  return {
    workspace,
    knowledgeNamespace,
    ruleStyleNamespace,
    progressNamespace: undefined,
    importExportNamespace: undefined,
    writing: undefined,
    reviewNamespace: undefined,
    reviewRepairNamespace: undefined,
    queueNamespace: undefined,
    searchNamespace: undefined,
    statisticsNamespace: undefined,
    timelineNamespace: undefined,
    branchNamespace: undefined,
    textMutation: undefined,
    sceneOutlineBinding: undefined,
    textDeletion: undefined,
    outlineReconciliation: undefined,
    referenceAuditNamespace: undefined,
    referenceCorrectionNamespace: undefined,
    outlineDetailGeneration: undefined,
  };
}

describe('I178 desktop C5/review/queue structured ops consumer', () => {
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

    // C5 remains fail-closed when its owner ports are absent.
    ops.chapters.retryChapter();
    expect(chapterList).not.toHaveBeenCalled();
    store.dispose();
  });

  it('routes chapter navigation through the migrated C5 workspace port', async () => {
    const store = createDesktopWorkbenchStore();
    store.actions.selectProject('alpha', 'Alpha');
    const chapterRead = vi.fn(async () => ok({ id: 'chapter-1', index: 1, title: 'First', pov: 'hero', status: 'draft' as const, scenes: [] }));
    const workspace = {
      chapterList: vi.fn(async () => ok([])),
      chapterRead,
      sceneRead: vi.fn(async () => ok({})),
    } as unknown as OpsPorts['workspace'];
    const ops = createDesktopStructuredOps(runtime(store), ports(workspace, undefined, undefined));

    ops.chapters.selectChapter('chapter-1');
    await vi.waitFor(() => {
      expect(chapterRead).toHaveBeenCalledWith('alpha', 'chapter-1');
      expect(store.getSnapshot().chapters.selectedChapterId).toBe('chapter-1');
      expect(store.getSnapshot().chapters.chapter.read?.id).toBe('chapter-1');
    });
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

  it('routes review, queue, and reference actions through the migrated ports', async () => {
    const store = createDesktopWorkbenchStore();
    store.actions.selectProject('alpha', 'Alpha');
    const reviewScan = vi.fn(async () => ok({ projectId: 'alpha', scannedAt: '2026-01-01T00:00:00.000Z', issues: [], summary: { total: 0, hard: 0, soft: 0, byCategory: {} } }));
    const reviewRecords = vi.fn(async () => ok([]));
    const queueStatus = vi.fn(async () => ok({ projectId: 'alpha', runState: 'idle' as const, config: { wordBudget: null, maxRetries: 1, stopOnSoftWarnings: true }, consumedUnits: 0, updatedAt: '2026-01-01T00:00:00.000Z', error: null, tasks: [] }));
    const auditList = vi.fn(async () => ok({ records: [], nextCursor: null }));
    const correctionPending = vi.fn(async () => ok([]));
    const workspace = { chapterList: vi.fn(async () => ok([])), outlineBeatCards: vi.fn(async () => ok([])) } as unknown as OpsPorts['workspace'];
    const reviewNamespace = { scan: reviewScan, records: reviewRecords } as unknown as OpsPorts['reviewNamespace'];
    const queueNamespace = { status: queueStatus } as unknown as OpsPorts['queueNamespace'];
    const referenceAuditNamespace = { list: auditList } as unknown as OpsPorts['referenceAuditNamespace'];
    const referenceCorrectionNamespace = { pending: correctionPending } as unknown as OpsPorts['referenceCorrectionNamespace'];
    const ops = createDesktopStructuredOps(runtime(store), {
      ...ports(workspace, undefined, undefined),
      reviewNamespace,
      reviewRepairNamespace: undefined,
      queueNamespace,
      referenceAuditNamespace,
      referenceCorrectionNamespace,
    });

    ops.review.scan();
    ops.queue.refresh();
    ops.referenceReview.refresh();
    await vi.waitFor(() => {
      expect(reviewScan).toHaveBeenCalledWith('alpha', undefined);
      expect(reviewRecords).toHaveBeenCalledWith('alpha');
      expect(queueStatus).toHaveBeenCalledWith('alpha');
      expect(auditList).toHaveBeenCalledWith('alpha', {});
      expect(correctionPending).toHaveBeenCalledWith('alpha');
    });
    expect(store.getSnapshot().review.status).toBe('ready');
    expect(store.getSnapshot().queue.status).toBe('ready');
    expect(store.getSnapshot().referenceReview.status).toBe('ready');
    store.dispose();
  });

  it('routes I180 export actions through the Main-owned save port', async () => {
    const store = createDesktopWorkbenchStore();
    store.actions.selectProject('alpha', 'Alpha');
    const exportArchive = vi.fn(async () => ok({ fileName: 'alpha.json', mode: 'full', fileCount: 1, content: '{"project":"alpha"}' }));
    const saveFile = { saveFile: vi.fn(async () => ({ saved: true, fileName: 'alpha.json' })) };
    const ops = createDesktopStructuredOps(runtime(store), {
      ...ports(undefined, undefined, undefined),
      importExportNamespace: { exportArchive } as unknown as OpsPorts['importExportNamespace'],
      saveFile,
    });

    ops.importExport.exportArchive();
    await vi.waitFor(() => {
      expect(exportArchive).toHaveBeenCalledWith('alpha', 'full-project');
      expect(saveFile.saveFile).toHaveBeenCalledWith('alpha.json', '{"project":"alpha"}', 'application/json');
    });
    expect(store.getSnapshot().importExport.busy.exportArchive).toBe(false);
    store.dispose();
  });
});
