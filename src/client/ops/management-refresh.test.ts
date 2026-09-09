import { expect, it, vi } from 'vitest';
import { createChaptersManagementOps } from './chapters-management.js';
import type { OpsPorts, OpsRuntime } from './context.js';
import { createDesktopWorkbenchStore } from '../../desktop/renderer/store-adapter.js';

it.each(['text', 'binding'] as const)('I206 refresh clears old errors, preserves inputs, and recovers from %s failure', async (failedRead) => {
  const store = createDesktopWorkbenchStore();
  const active = new Set<string>();
  let fail = true;
  let finishText: (() => void) | undefined;
  const fingerprint = vi.fn(() => new Promise<{ ok: true; value: { fingerprint: string } }>((resolve, reject) => {
    finishText = () => fail && failedRead === 'text' ? reject(new Error('正文读取暂时失败。')) : resolve({ ok: true, value: { fingerprint: 'a'.repeat(64) } });
  }));
  const read = vi.fn(async () => {
    if (fail && failedRead === 'binding') throw new Error('绑定读取暂时失败。');
    return { ok: true, value: { manual: [], effective: [], fingerprint: 'b'.repeat(64) } };
  });
  const ports = { textMutation: { fingerprint }, sceneOutlineBinding: { read } } as unknown as OpsPorts;
  const ops = () => {
    const runtime: OpsRuntime = { snapshot: store.getSnapshot(), act: store.actions, projectId: 'book', isActive: () => true,
      beginOp: key => { if (active.has(key)) return false; active.add(key); return true; }, endOp: key => { active.delete(key); }, queuePoll: { start: vi.fn(), stop: vi.fn() } };
    return createChaptersManagementOps(runtime, ports);
  };
  try {
    const draft = { ...store.getSnapshot().chapters.management.chapterDraft, title: '尚未保存的章节', pov: 'hero' };
    store.actions.chaptersManagement({ status: 'error', message: '操作未完成，请重试。', chapterDraft: draft });
    const first = ops(); first.refreshManagement(); first.refreshManagement();
    expect(fingerprint).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().chapters.management).toMatchObject({ status: 'loading', message: '', chapterDraft: draft });
    finishText!();
    await vi.waitFor(() => expect(store.getSnapshot().chapters.management.status).toBe('error'));
    expect(store.getSnapshot().chapters.management.message).toContain('读取暂时失败');
    expect(store.getSnapshot().chapters.management.projectFingerprint).toBeUndefined();
    fail = false;
    ops().refreshManagement();
    expect(store.getSnapshot().chapters.management.message).toBe('');
    finishText!();
    await vi.waitFor(() => expect(store.getSnapshot().chapters.management.status).toBe('ready'));
    expect(store.getSnapshot().chapters.management).toMatchObject({ message: '管理状态已刷新。', chapterDraft: draft, projectFingerprint: 'a'.repeat(64), binding: { status: 'ready' } });
  } finally { store.dispose(); }
});
