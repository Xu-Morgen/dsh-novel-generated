import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { createDesktopPaths } from './desktop-paths.js';
import { createDesktopProjectRepository } from './project-repository.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i168-'));
  roots.push(root);
  return root;
}

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('I168 DesktopPaths', () => {
  it('defaults all application roots below userData without a legacy .dsh path', async () => {
    const userDataRoot = await temporaryRoot();
    const paths = await createDesktopPaths({ userDataRoot });

    expect(paths.userDataRoot).toBe(userDataRoot);
    expect(paths.libraryRoot).toBe(join(userDataRoot, 'library'));
    expect(paths.settingsRoot).toBe(join(userDataRoot, 'settings'));
    expect(paths.cacheRoot).toBe(join(userDataRoot, 'cache'));
    expect(paths.tempRoot).toBe(join(userDataRoot, 'temp'));
    expect(paths.libraryRoot).not.toContain('.dsh');
    expect(paths.settingsFile('a2-settings.yaml')).toBe(join(paths.settingsRoot, 'a2-settings.yaml'));
    expect(() => paths.settingsFile('../escape')).toThrow(/Invalid settings file/);
    expect(() => paths.projectDirectory('../escape')).toThrow(/Invalid project ID/);
  });

  it('uses a controlled custom library root while keeping settings/cache/temp in userData', async () => {
    const userDataRoot = await temporaryRoot();
    const customLibrary = join(await temporaryRoot(), 'library');
    const paths = await createDesktopPaths({ userDataRoot, libraryRoot: customLibrary });

    expect(paths.libraryRoot).toBe(customLibrary);
    expect(paths.settingsRoot.startsWith(userDataRoot)).toBe(true);
    expect(paths.cacheRoot.startsWith(userDataRoot)).toBe(true);
    expect(paths.tempRoot.startsWith(userDataRoot)).toBe(true);
  });

  it('preserves project create/open/archive/restore semantics on the new root', async () => {
    const paths = await createDesktopPaths({ userDataRoot: await temporaryRoot() });
    const repository = createDesktopProjectRepository(paths);
    const created = await repository.createProject({ projectId: 'roundtrip', name: '桌面根往返' });
    const before = await readFile(paths.projectDirectory('roundtrip') + '/project.yaml', 'utf8');

    await expect(repository.loadProject('roundtrip')).resolves.toEqual(created);
    await expect(repository.archiveProject('roundtrip')).resolves.toEqual(created);
    await paths.assertLibraryContained(paths.archivedProjectDirectory('roundtrip'));
    await expect(repository.listProjects()).resolves.toEqual([]);
    await expect(repository.restoreProject('roundtrip')).resolves.toEqual(created);
    await expect(repository.listProjects()).resolves.toEqual([created]);
    expect(await readFile(paths.projectDirectory('roundtrip') + '/project.yaml', 'utf8')).toBe(before);
  });

  it('rejects symlink roots, escaping paths, read-only roots, and cross-root containment', async () => {
    const userDataRoot = await temporaryRoot();
    const outside = await temporaryRoot();
    const linkedLibrary = join(userDataRoot, 'linked-library');
    await symlink(outside, linkedLibrary, process.platform === 'win32' ? 'junction' : 'dir');
    await expect(createDesktopPaths({ userDataRoot, libraryRoot: linkedLibrary })).rejects.toThrow(/Unsafe library root/);

    const paths = await createDesktopPaths({ userDataRoot: await temporaryRoot() });
    const other = await createDesktopPaths({ userDataRoot: await temporaryRoot() });
    await createDesktopProjectRepository(other).createProject({ projectId: 'other', name: '另一个根' });
    await expect(paths.assertLibraryContained(other.projectDirectory('other'))).rejects.toThrow(/escapes projects root/);

    if (process.platform !== 'win32') {
      const readOnlyRoot = await temporaryRoot();
      await chmod(readOnlyRoot, 0o555);
      await expect(createDesktopPaths({ userDataRoot: readOnlyRoot })).rejects.toThrow(/Read-only userData root/);
    }

    await mkdir(paths.projectDirectory('safe'), { recursive: true });
    await writeFile(join(paths.projectDirectory('safe'), 'marker'), 'safe', 'utf8');
    await expect(paths.assertLibraryContained(paths.projectDirectory('safe'))).resolves.toBeUndefined();
  });
});
