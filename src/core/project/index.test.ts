import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROJECT_DIRECTORIES, ProjectRepository } from './index.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i3-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('I3 ProjectRepository', () => {
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
