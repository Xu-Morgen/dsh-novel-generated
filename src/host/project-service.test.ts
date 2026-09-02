import { Context } from '@deepseek-ai/cordis';
import { access, mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apply } from '../index.js';
import { INITIAL_STATE } from '../core/schema/project-lifecycle.js';
import type { WorldState } from '../core/schema/state.js';
import type { NovelProjectService } from './project-service.js';

const roots: string[] = [];
const fibers: Array<{ dispose(): Promise<void> }> = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-service-i50-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(fibers.splice(0).map((fiber) => fiber.dispose()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const rootPath = await temporaryRoot();
  const root = new Context();
  fibers.push(await root.plugin(apply, { projectsRoot: rootPath }));
  return { root, rootPath, service: root.get('novelProject') as NovelProjectService };
}

describe('I3 Host project service consumer', () => {
  it('creates and loads through the Host service contract only', async () => {
    const { service } = await fixture();
    const created = await service.createProject({ projectId: 'consumer', name: '消费者夹具' });
    expect(await service.loadProject('consumer')).toEqual(created);
  });
});

describe('I50 Host project lifecycle', () => {
  it('opens a new project with the specified six-layer readiness contract', async () => {
    const { root, service } = await fixture();
    await service.createProject({ projectId: 'blank', name: 'Blank' });

    await expect(service.openProject('blank')).resolves.toEqual({
      project: { id: 'blank', version: 1, name: 'Blank' },
      layers: {
        characters: 'empty',
        worldview: 'empty',
        outline: 'uninitialized',
        relationship: 'empty',
        state: 'ready',
        canon: 'empty',
      },
    });
    expect(root.get('novelState').current('blank')).toEqual({ ...INITIAL_STATE, seq: 0 });
  });

  it('keeps two opened projects isolated', async () => {
    const { root, service } = await fixture();
    await service.createProject({ projectId: 'alpha', name: 'Alpha' });
    await service.createProject({ projectId: 'beta', name: 'Beta' });
    await Promise.all([service.openProject('alpha'), service.openProject('beta')]);

    const state = root.get('novelState');
    await state.transaction('alpha', (draft: WorldState) => { draft.scene.location = 'alpha-room'; });
    expect(state.current('alpha').scene.location).toBe('alpha-room');
    expect(state.current('beta')).toEqual({ ...INITIAL_STATE, seq: 0 });
  });

  it.each(['missing', '../escape', 'a/b', 'A'])('rejects unknown or unsafe ID %s without creating a phantom project', async (projectId) => {
    const { rootPath, service } = await fixture();
    await expect(service.openProject(projectId)).rejects.toThrow();
    await expect(service.listProjects()).resolves.toEqual([]);
    await expect(access(join(rootPath, projectId))).rejects.toThrow();
  });

  it('coalesces concurrent opens for the same project', async () => {
    const { root, service } = await fixture();
    await service.createProject({ projectId: 'shared', name: 'Shared' });
    const characters = root.get('novelCharacter');
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const open = vi.spyOn(characters, 'open').mockImplementation(async () => blocked);

    const first = service.openProject('shared');
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const second = service.openProject('shared');
    release();
    await Promise.all([first, second]);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('reports one corrupt layer while exposing the other layers', async () => {
    const { root, rootPath, service } = await fixture();
    await service.createProject({ projectId: 'damaged', name: 'Damaged' });
    await mkdir(join(rootPath, 'damaged', 'characters'), { recursive: true });
    await writeFile(join(rootPath, 'damaged', 'characters', 'corrupt.yaml'), 'id: [', 'utf8');

    await expect(service.openProject('damaged')).resolves.toMatchObject({
      layers: {
        characters: 'corrupt',
        worldview: 'empty',
        outline: 'uninitialized',
        relationship: 'empty',
        state: 'ready',
        canon: 'empty',
      },
    });
    expect(root.get('novelState').current('damaged')).toEqual({ ...INITIAL_STATE, seq: 0 });
  });
});

describe('I155 Host project archive lifecycle', () => {
  it('removes an archived work from the active catalog and denies open plus stale editor writes until restore', async () => {
    const { root, rootPath, service } = await fixture();
    await service.createProject({ projectId: 'finished', name: '完结作品' });
    await service.openProject('finished');

    await expect(service.archiveProject('finished')).resolves.toMatchObject({ id: 'finished', name: '完结作品' });
    await expect(service.listProjects()).resolves.toEqual([]);
    await expect(service.listArchivedProjects()).resolves.toEqual([{ id: 'finished', version: 1, name: '完结作品' }]);
    await expect(service.openProject('finished')).rejects.toThrow(/archived and read-only/);
    await expect(root.get('novelCharacter').create('finished', {
      id: 'late-character', name: '不得写入', aliases: [], kind: 'supporting', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    })).rejects.toThrow();
    expect((await stat(join(rootPath, 'finished'))).isFile()).toBe(true);

    await expect(service.restoreProject('finished')).resolves.toMatchObject({ id: 'finished' });
    await expect(service.openProject('finished')).resolves.toMatchObject({ project: { id: 'finished' } });
  });

  it('serializes archive behind an in-flight open for the same project', async () => {
    const { root, service } = await fixture();
    await service.createProject({ projectId: 'serial', name: 'Serial' });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const open = vi.spyOn(root.get('novelCharacter'), 'open').mockImplementation(async () => blocked);

    const opening = service.openProject('serial');
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    let settled = false;
    const archiving = service.archiveProject('serial').then((value) => { settled = true; return value; });
    await Promise.resolve();
    expect(settled).toBe(false);
    release();
    await opening;
    await expect(archiving).resolves.toMatchObject({ id: 'serial' });
    await expect(service.openProject('serial')).rejects.toThrow(/archived and read-only/);
  });
});
