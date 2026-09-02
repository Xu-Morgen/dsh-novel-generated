import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_DIRECTORIES, ProjectRepository } from './index.js';
import { PROJECT_ARCHIVE_DIRECTORY } from '../io/path.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i3-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('I3 ProjectRepository', () => {
  it('treats a missing projects root as an empty catalog', async () => {
    const root = join(await temporaryRoot(), 'missing');
    await expect(new ProjectRepository(root).listProjects()).resolves.toEqual([]);
  });

  it('lists safe projects in stable ID order and ignores unsafe entries', async () => {
    const root = await temporaryRoot();
    const repository = new ProjectRepository(root);
    await repository.createProject({ projectId: 'zeta', name: 'Zeta' });
    await repository.createProject({ projectId: 'alpha', name: 'Alpha' });
    await mkdir(join(root, 'Upper'));
    await writeFile(join(root, 'plain-file'), 'ignored', 'utf8');
    const outside = await temporaryRoot();
    await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');

    await expect(repository.listProjects()).resolves.toEqual([
      { id: 'alpha', version: 1, name: 'Alpha' },
      { id: 'zeta', version: 1, name: 'Zeta' },
    ]);
  });

  it('fails closed when a listed project has corrupt metadata', async () => {
    const root = await temporaryRoot();
    const repository = new ProjectRepository(root);
    await repository.createProject({ projectId: 'good', name: 'Good' });
    await mkdir(join(root, 'broken'));
    await writeFile(join(root, 'broken', 'project.yaml'), 'id: [', 'utf8');

    await expect(repository.listProjects()).rejects.toThrow();
  });
  it('creates the §10.1 tree and round-trips Chinese metadata', async () => {
    const root = await temporaryRoot();
    const repository = new ProjectRepository(root);
    const created = await repository.createProject({ projectId: 'changye', name: '长夜将明' });
    expect(created).toEqual({ id: 'changye', version: 1, name: '长夜将明' });
    for (const directory of PROJECT_DIRECTORIES) {
      expect((await stat(join(root, 'changye', directory))).isDirectory()).toBe(true);
    }
    expect(await readFile(join(root, 'changye', 'style.yaml'), 'utf8')).toContain('{}');
    expect(await readFile(join(root, 'changye', 'outline.yaml'), 'utf8')).toContain('{}');
    await expect(new ProjectRepository(root).loadProject('changye')).resolves.toEqual(created);
  });

  it.each(['../escape', '..', '/absolute', 'C:\\absolute', '\\\\server\\share', 'a/b', 'a\\b', 'Upper'])('rejects unsafe project ID %s', async (projectId) => {
    await expect(new ProjectRepository(await temporaryRoot()).createProject({ projectId, name: 'x' })).rejects.toThrow(/Invalid project ID/);
  });

  it('rejects duplicate projects', async () => {
    const repository = new ProjectRepository(await temporaryRoot());
    await repository.createProject({ projectId: 'same', name: 'first' });
    await expect(repository.createProject({ projectId: 'same', name: 'second' })).rejects.toThrow(/already exists/);
  });

  it('I155 archives outside the active catalog, rejects active access, and restores byte-preserving metadata', async () => {
    const root = await temporaryRoot();
    const repository = new ProjectRepository(root);
    const created = await repository.createProject({ projectId: 'finished', name: '完结作品' });
    const before = await readFile(join(root, 'finished', 'project.yaml'), 'utf8');

    await expect(repository.archiveProject('finished')).resolves.toEqual(created);
    await expect(repository.listProjects()).resolves.toEqual([]);
    await expect(repository.listArchivedProjects()).resolves.toEqual([created]);
    await expect(repository.loadProject('finished')).rejects.toThrow(/archived and read-only/);
    await expect(repository.createProject({ projectId: 'finished', name: '重名作品' })).rejects.toThrow(/archived and read-only/);
    expect((await stat(join(root, 'finished'))).isFile()).toBe(true);
    expect(await readFile(join(root, PROJECT_ARCHIVE_DIRECTORY, 'finished', 'project.yaml'), 'utf8')).toBe(before);

    await expect(repository.restoreProject('finished')).resolves.toEqual(created);
    await expect(repository.listProjects()).resolves.toEqual([created]);
    await expect(repository.listArchivedProjects()).resolves.toEqual([]);
    expect(await readFile(join(root, 'finished', 'project.yaml'), 'utf8')).toBe(before);
  });

  it('I155 rejects duplicate transitions and unsafe archived entries', async () => {
    const root = await temporaryRoot();
    const repository = new ProjectRepository(root);
    await repository.createProject({ projectId: 'once', name: 'Once' });
    await repository.archiveProject('once');
    await expect(repository.archiveProject('once')).rejects.toThrow(/archived and read-only/);
    await repository.restoreProject('once');
    await expect(repository.restoreProject('once')).rejects.toThrow();

    await repository.createProject({ projectId: 'conflict', name: 'Conflict' });
    await repository.archiveProject('conflict');
    await rm(join(root, 'conflict'), { force: true });
    await mkdir(join(root, 'conflict'));
    await expect(repository.restoreProject('conflict')).rejects.toThrow(/Active project already exists/);
  });

  it('rejects a project directory symlink that escapes the root', async () => {
    const root = await temporaryRoot();
    const outside = await temporaryRoot();
    await mkdir(join(root, 'projects'), { recursive: true });
    await symlink(outside, join(root, 'projects', 'escaped'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(new ProjectRepository(join(root, 'projects')).loadProject('escaped')).rejects.toThrow(/escapes projects root/);
  });

  it.each([
    ['malformed YAML', 'id: ['],
    ['missing required field', 'id: broken\nversion: 1\n'],
    ['invalid version', 'id: broken\nversion: 0\nname: Broken\n'],
    ['metadata ID mismatch', 'id: other\nversion: 1\nname: Broken\n'],
  ])('rejects %s', async (_label, yaml) => {
    const root = await temporaryRoot();
    const directory = join(root, 'broken');
    await mkdir(directory);
    await writeFile(join(directory, 'project.yaml'), yaml, 'utf8');
    await expect(new ProjectRepository(root).loadProject('broken')).rejects.toThrow();
  });
});
