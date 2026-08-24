import { Context } from '@deepseek-ai/cordis';
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
