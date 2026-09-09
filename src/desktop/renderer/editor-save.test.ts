import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { createDesktopProjectHandlers } from '../main/project-handlers.js';
import { createDesktopIpcClient } from './desktop-ipc-client.js';
import { createDesktopWorkbenchStore } from './store-adapter.js';
import { createCharactersOps } from '../../client/ops/characters.js';
import { createChaptersManagementOps } from '../../client/ops/chapters-management.js';
import { characterCreateInput } from '../../client/layers/characters.js';
import type { OpsRuntime } from '../../client/ops/context.js';
import { unwrap } from '../../client/shared.js';

it('I204 editor consumers save through strict IPC and reject invalid forms without writes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'novel-i204-'));
  const dispose: Array<() => void> = [];
  const handlers = createDesktopProjectHandlers(await createDesktopPaths({ userDataRoot: root }), () => {}, { onDispose: fn => dispose.push(fn) });
  const invoke = vi.fn((method: string, args: readonly unknown[]) => desktopIpcRegistry.invoke(method, args, handlers.get(method)));
  const client = createDesktopIpcClient({ version: 1, invoke, cancel: async () => ({ ok: true, value: undefined }), onProgress: () => () => {} });
  const store = createDesktopWorkbenchStore();
  const active = new Set<string>();
  const runtime = (): OpsRuntime => ({ snapshot: store.getSnapshot(), act: store.actions, projectId: 'book', isActive: () => true,
    beginOp: key => { if (active.has(key)) return false; active.add(key); return true; }, endOp: key => { active.delete(key); }, queuePoll: { start: vi.fn(), stop: vi.fn() } });
  const characters = () => createCharactersOps(runtime(), { workspace: client.services.workspace });
  const chapters = () => createChaptersManagementOps(runtime(), client.services);
  try {
    await unwrap(client.services.workspace.projectCreate({ projectId: 'book', name: '测试' }));
    await unwrap(client.services.workspace.projectOpen('book'));
    store.actions.selectProject('book', '测试');
    const input = characterCreateInput({ ...store.getSnapshot().characterEditor.draft, id: 'hero', name: '旧名' });
    const created = await unwrap(client.services.workspace.characterCreate('book', input));
    characters().select(created);
    characters().mutate(draft => ({ ...draft, name: '新名' }));
    const save = characters(); save.save(); save.save();
    await vi.waitFor(() => expect(store.getSnapshot().characterEditor.saveMessage).toBe('已保存'));
    expect(invoke.mock.calls.filter(([method]) => method.endsWith('/characterUpdate'))).toHaveLength(1);
    expect(await unwrap(client.services.workspace.characterRead('book', 'hero'))).toMatchObject({ id: 'hero', name: '新名' });
    expect(await readFile(join(root, 'library/book/characters/hero.yaml'), 'utf8')).toContain('新名');
    expect(await invoke('novel-creation-tool/novelWorkspace/characterUpdate', ['book', 'hero', input])).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });

    const count = () => invoke.mock.calls.filter(([method]) => method.endsWith('/chapterCreate')).length;
    chapters().createChapter();
    expect(store.getSnapshot().chapters.management.message).toContain('章节标题');
    chapters().chapterDraft({ title: '第一章' }); chapters().createChapter();
    expect(store.getSnapshot().chapters.management.message).toContain('视角角色');
    chapters().chapterDraft({ pov: 'hero' }); chapters().createChapter();
    expect(store.getSnapshot().chapters.management.message).toContain('刷新管理状态');
    store.actions.chaptersManagement({ status: 'loading' }); chapters().createChapter();
    expect(count()).toBe(0);
    store.actions.chaptersManagement({ status: 'idle' }); chapters().refreshManagement();
    await vi.waitFor(() => expect(store.getSnapshot().chapters.management.status).toBe('ready'));
    expect(store.getSnapshot().chapters.management.message).toBe('管理状态已刷新。');
    chapters().chapterDraft({ title: '字'.repeat(201) }); chapters().createChapter();
    expect(count()).toBe(0);
    expect(store.getSnapshot().chapters.management.chapterDraft.title).toHaveLength(201);
    chapters().chapterDraft({ title: '第一章' });
    const create = chapters(); create.createChapter(); create.createChapter();
    await vi.waitFor(() => expect(store.getSnapshot().chapters.list).toHaveLength(1));
    expect(count()).toBe(1);
    expect(store.getSnapshot().chapters.management.chapterDraft).toMatchObject({ title: '', pov: 'hero', index: 2 });
    chapters().chapterDraft({ title: '第二章' }); chapters().createChapter();
    await vi.waitFor(() => expect(store.getSnapshot().chapters.list).toHaveLength(2));
    expect(await unwrap(client.services.workspace.chapterList('book'))).toHaveLength(2);
    const fingerprint = store.getSnapshot().chapters.management.projectFingerprint;
    expect(await invoke('novel-creation-tool/novelText/chapterCreate', ['book', { id: 'invalid', index: 3, title: '', pov: '', status: 'draft', expectedFingerprint: fingerprint }])).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    store.actions.chaptersManagement({ projectFingerprint: '0'.repeat(64) });
    chapters().chapterDraft({ title: '保留的输入' }); chapters().createChapter();
    await vi.waitFor(() => expect(store.getSnapshot().chapters.management.status).toBe('error'));
    expect(store.getSnapshot().chapters.management.chapterDraft.title).toBe('保留的输入');
    expect(await unwrap(client.services.workspace.chapterList('book'))).toHaveLength(2);
  } finally {
    client.dispose(); store.dispose(); dispose.forEach(fn => fn()); await rm(root, { recursive: true, force: true });
  }
});
