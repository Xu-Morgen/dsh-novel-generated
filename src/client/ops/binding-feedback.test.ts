import { expect, it, vi } from 'vitest';
import { createChaptersManagementOps } from './chapters-management.js';
import type { OpsPorts, OpsRuntime } from './context.js';
import { createDesktopWorkbenchStore } from '../../desktop/renderer/store-adapter.js';

it('I208 binding explains missing choices, deduplicates saves and preserves failure feedback', async () => {
  const store = createDesktopWorkbenchStore();
  const active = new Set<string>();
  let rejectSave: ((error: Error) => void) | undefined;
  let resolveSave: ((value: unknown) => void) | undefined;
  const save = vi.fn(() => new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject; }));
  const port = { sceneOutlineBinding: { save } } as unknown as OpsPorts;
  const ops = () => {
    const runtime: OpsRuntime = { snapshot: store.getSnapshot(), act: store.actions, projectId: 'book', isActive: () => true,
      beginOp: key => { if (active.has(key)) return false; active.add(key); return true; }, endOp: key => { active.delete(key); }, queuePoll: { start: vi.fn(), stop: vi.fn() } };
    return createChaptersManagementOps(runtime, port);
  };
  try {
    ops().bindingSave();
    expect(store.getSnapshot().chapters.management.binding?.message).toContain('选中一个具体的正文场景');
    store.actions.chaptersSelectChapter('chapter'); store.actions.chaptersSelectScene('scene');
    ops().bindingSave();
    expect(store.getSnapshot().chapters.management.binding?.message).toContain('细纲目标');
    store.actions.chaptersManagement({ bindingDetailBeatId: 'card' }); ops().bindingSave();
    expect(store.getSnapshot().chapters.management.binding?.message).toContain('刷新管理状态');
    expect(save).not.toHaveBeenCalled();
    store.actions.chaptersManagement({ binding: { status: 'ready', manual: [], effective: [], fingerprint: 'a'.repeat(64) } });
    const first = ops(); first.bindingSave(); first.bindingSave();
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().chapters.management.binding?.status).toBe('loading');
    rejectSave!(new Error('目标已发生变化，请刷新后重试。'));
    await vi.waitFor(() => expect(store.getSnapshot().chapters.management.status).toBe('error'));
    expect(store.getSnapshot().chapters.management.binding?.message).toContain('目标已发生变化');
    expect(store.getSnapshot().chapters.management.bindingDetailBeatId).toBe('card');
    expect(store.getSnapshot().chapters.selectedSceneId).toBe('scene');
    ops().bindingSave();
    resolveSave!({ ok: true, value: { fingerprint: 'b'.repeat(64), manual: [{ sceneId: 'scene', detailBeatId: 'card' }], effective: [{ sceneId: 'scene', detailBeatId: 'card', chapterId: 'chapter', source: 'manual' }] } });
    await vi.waitFor(() => expect(store.getSnapshot().chapters.management.status).toBe('ready'));
    expect(store.getSnapshot().chapters.management.binding).toMatchObject({ status: 'ready', message: '细纲绑定已保存。', fingerprint: 'b'.repeat(64) });
    expect(store.getSnapshot().chapters.management.binding?.manual).toHaveLength(1);
  } finally { store.dispose(); }
});
