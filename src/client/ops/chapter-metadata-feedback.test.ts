import { expect, it, vi } from 'vitest';
import { createChaptersManagementOps } from './chapters-management.js';
import type { OpsPorts, OpsRuntime } from './context.js';
import { createDesktopWorkbenchStore } from '../../desktop/renderer/store-adapter.js';

it('I209 initializes each chapter target while preserving same-chapter edits', () => {
  const store = createDesktopWorkbenchStore();
  try {
    store.actions.setChapters('ready', [{ id: 'a', index: 1, title: 'A', pov: 'hero', status: 'revised', sceneCount: 0 }, { id: 'b', index: 2, title: 'B', pov: 'other', status: 'draft', sceneCount: 0 }]);
    store.actions.chaptersSelectChapter('a');
    expect(store.getSnapshot().chapters.management.chapterDraft).toEqual({ id: 'a', index: 1, title: 'A', pov: 'hero', status: 'revised' });
    store.actions.chaptersManagement({ chapterDraft: { ...store.getSnapshot().chapters.management.chapterDraft, title: 'unsaved' } });
    store.actions.chaptersSelectScene('scene'); store.actions.chaptersSelectChapter('a');
    expect(store.getSnapshot().chapters.management.chapterDraft.title).toBe('unsaved');
    store.actions.chaptersSelectChapter('b');
    expect(store.getSnapshot().chapters.management.chapterDraft).toMatchObject({ id: 'b', title: 'B', pov: 'other', status: 'draft' });
  } finally { store.dispose(); }
});

it('I209 validates saves, deduplicates requests and retains edits after rejection', async () => {
  const store = createDesktopWorkbenchStore();
  const active = new Set<string>();
  let rejectSave: (reason: Error) => void = () => {};
  const chapterUpdate = vi.fn(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
  const port = { textMutation: { chapterUpdate } } as unknown as OpsPorts;
  const ops = () => createChaptersManagementOps({ snapshot: store.getSnapshot(), act: store.actions, projectId: 'book', isActive: () => true,
    beginOp: key => { if (active.has(key)) return false; active.add(key); return true; }, endOp: key => { active.delete(key); }, queuePoll: { start: vi.fn(), stop: vi.fn() } } satisfies OpsRuntime, port);
  try {
    ops().updateChapter();
    expect(store.getSnapshot().chapters.management.message).toContain('选择要修改的章节');
    store.actions.setChapters('ready', [{ id: 'a', index: 1, title: '', pov: '', status: 'draft', sceneCount: 0 }]);
    store.actions.chaptersSelectChapter('a'); ops().updateChapter();
    expect(store.getSnapshot().chapters.management.message).toContain('请填写章节标题');
    ops().chapterDraft({ title: 'changed' }); ops().updateChapter();
    expect(store.getSnapshot().chapters.management.message).toContain('请选择视角角色');
    ops().chapterDraft({ pov: 'hero' }); ops().updateChapter();
    expect(store.getSnapshot().chapters.management.message).toContain('刷新管理状态');
    expect(chapterUpdate).not.toHaveBeenCalled();
    store.actions.chaptersManagement({ projectFingerprint: 'a'.repeat(64) });
    const current = ops(); current.updateChapter(); current.updateChapter();
    expect(chapterUpdate).toHaveBeenCalledTimes(1);
    expect(chapterUpdate).toHaveBeenCalledWith('book', { chapterId: 'a', patch: { title: 'changed', pov: 'hero', status: 'draft' }, expectedFingerprint: 'a'.repeat(64) });
    rejectSave(new Error('章节已变化，请刷新后重试。'));
    await vi.waitFor(() => expect(store.getSnapshot().chapters.management.status).toBe('error'));
    expect(store.getSnapshot().chapters.management.message).toContain('章节已变化');
    expect(store.getSnapshot().chapters.management.chapterDraft).toMatchObject({ title: 'changed', pov: 'hero' });
  } finally { store.dispose(); }
});
