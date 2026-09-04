import { describe, expect, it, vi } from 'vitest';

import type { DesktopServiceBag } from './desktop-ipc-client.js';
import { createDesktopProjectWorkflow, LAST_PROJECT_PREFERENCE, type ProjectPreferenceStore } from './project-workflow.js';
import { createDesktopWorkbenchStore } from './store-adapter.js';

const ok = <T>(value: T) => Promise.resolve({ ok: true as const, value });

function fixture(initialPreference?: string, characterList?: (projectId: string) => Promise<unknown>) {
  const projects = [{ id: 'alpha', name: '甲书' }, { id: 'beta', name: '乙书' }];
  const archived: Array<{ id: string; name: string }> = [];
  const opened: string[] = [];
  const chapterLoads: string[] = [];
  const memory = new Map<string, string>();
  if (initialPreference) memory.set(LAST_PROJECT_PREFERENCE, initialPreference);
  const preference: ProjectPreferenceStore = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => { memory.set(key, value); },
    removeItem: (key) => { memory.delete(key); },
  };
  const services = {
    workspace: {
      viewModel: () => ok({ product: 'novel-creation-tool', version: '2.0.0', ready: true, capabilities: [] }),
      projectList: () => ok([...projects]),
      projectArchiveList: () => ok([...archived]),
      projectOpen: (projectId: string) => { opened.push(projectId); const project = projects.find((item) => item.id === projectId); return project ? ok({ project, layers: {} }) : Promise.resolve({ ok: false as const, error: { message: 'missing' } }); },
      projectCreate: (input: { projectId: string; name: string }) => { projects.push({ id: input.projectId, name: input.name }); return ok(input); },
      projectArchive: (projectId: string) => { const index = projects.findIndex((item) => item.id === projectId); if (index >= 0) archived.push(...projects.splice(index, 1)); return ok({ id: projectId, name: '归档' }); },
      projectRestore: (projectId: string) => { const index = archived.findIndex((item) => item.id === projectId); if (index >= 0) projects.push(...archived.splice(index, 1)); return ok({ id: projectId, name: '恢复' }); },
      characterList: (projectId: string) => characterList?.(projectId) ?? ok([{ id: 'hero', name: 'Hero' }]),
      worldviewList: () => ok([]),
      outlineRead: () => ok({ id: 'outline', structure: 'free', logline: '', themes: [], acts: [], foreshadowing: [], endings: [] }),
      relationshipRead: () => ok([]),
      stateSnapshots: () => ok([]),
      canonQuery: () => ok([]),
      chapterList: (projectId: string) => { chapterLoads.push(projectId); return ok([]); },
    },
    workbenchSettings: {
      load: () => ok({ wordTarget: 500, askWhenThin: true }),
      save: (input: { wordTarget: number; askWhenThin: boolean }) => ok(input),
      openProjectFolder: () => ok({ opened: true, path: '[desktop-managed]' }),
    },
  } as unknown as Pick<DesktopServiceBag, 'workspace' | 'workbenchSettings'>;
  const store = createDesktopWorkbenchStore();
  const workflow = createDesktopProjectWorkflow({ store, services, preference });
  return { store, workflow, opened, memory, chapterLoads };
}

describe('I175 Renderer project workflow', () => {
  it('restores an id only through a fresh Main projectOpen validation', async () => {
    const first = fixture('alpha');
    await first.workflow.start();
    expect(first.opened).toEqual(['alpha']);
    expect(first.store.getSnapshot().selectedProjectId).toBe('alpha');
    await vi.waitFor(() => expect(first.store.getSnapshot().characters.list).toEqual([{ id: 'hero', name: 'Hero' }]));
    expect(first.chapterLoads).toEqual(['alpha']);

    const stale = fixture('missing');
    await stale.workflow.start();
    expect(stale.opened).toEqual([]);
    expect(stale.store.getSnapshot().selectedProjectId).toBeUndefined();
    expect(stale.memory.has(LAST_PROJECT_PREFERENCE)).toBe(false);
  });

  it('blocks a project switch on dirty drafts until the explicit discard decision', async () => {
    const { workflow, store, opened } = fixture();
    await workflow.start();
    workflow.requestOpen('alpha');
    await vi.waitFor(() => expect(store.getSnapshot().selectedProjectId).toBe('alpha'));
    store.actions.characterMutate((draft) => ({ ...draft, name: '未保存' }));

    workflow.requestOpen('beta');
    expect(store.getSnapshot().leaveConfirm).toBe(true);
    expect(opened).toEqual(['alpha']);
    workflow.confirmLeave();
    await vi.waitFor(() => expect(store.getSnapshot().selectedProjectId).toBe('beta'));
    expect(store.getSnapshot().characterEditor.dirty).toBe(false);
  });

  it('drops a late structured-layer response after switching projects', async () => {
    let resolveAlpha: ((value: { ok: true; value: unknown[] }) => void) | undefined;
    const alphaCharacters = new Promise<{ ok: true; value: unknown[] }>((resolve) => { resolveAlpha = resolve; });
    const { workflow, store } = fixture(undefined, (projectId) => projectId === 'alpha' ? alphaCharacters : ok([{ id: 'beta-hero', name: 'Beta Hero' }]));

    workflow.requestOpen('alpha');
    await vi.waitFor(() => expect(store.getSnapshot().selectedProjectId).toBe('alpha'));
    workflow.requestOpen('beta');
    await vi.waitFor(() => expect(store.getSnapshot().selectedProjectId).toBe('beta'));
    resolveAlpha?.({ ok: true, value: [{ id: 'alpha-hero', name: 'Alpha Hero' }] });
    await vi.waitFor(() => expect(store.getSnapshot().characters.list).toEqual([{ id: 'beta-hero', name: 'Beta Hero' }]));
  });

  it('never projects the folder result path into Renderer state', async () => {
    const { workflow, store } = fixture('alpha');
    await workflow.start();
    workflow.openProjectFolder();
    await vi.waitFor(() => expect(store.getSnapshot().creationSettingsDraft.message).toContain('系统文件管理器'));
    expect(JSON.stringify(store.getSnapshot())).not.toContain('[desktop-managed]');
  });
});
