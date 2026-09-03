import { lstat, mkdir, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

import { PROJECT_ARCHIVE_DIRECTORY, assertContained, validateProjectId } from '../core/io/path.js';
import type { DesktopPaths } from '../app/paths.js';

export interface DesktopPathsOptions {
  /** Main supplies `app.getPath('userData')`; tests may use an isolated root. */
  readonly userDataRoot: string;
  /** Explicit user-selected library root; defaults below `userDataRoot`. */
  readonly libraryRoot?: string;
}

/**
 * Prepare the desktop filesystem roots and return the only path resolver used
 * by new Main consumers. The final directory of every root must be a real,
 * writable directory; a symlink or read-only root fails closed before a
 * repository can be opened (design §14.32.3; requirement H0-8).
 */
export async function createDesktopPaths(options: DesktopPathsOptions): Promise<DesktopPaths> {
  const userDataRoot = await prepareRoot(options.userDataRoot, 'userData root');
  const libraryRoot = await prepareRoot(options.libraryRoot ?? join(userDataRoot, 'library'), 'library root');
  const settingsRoot = await prepareRoot(join(userDataRoot, 'settings'), 'settings root');
  const cacheRoot = await prepareRoot(join(userDataRoot, 'cache'), 'cache root');
  const tempRoot = await prepareRoot(join(userDataRoot, 'temp'), 'temp root');

  const paths: DesktopPaths = {
    userDataRoot,
    libraryRoot,
    settingsRoot,
    cacheRoot,
    tempRoot,
    projectDirectory: (projectId: string): string => join(libraryRoot, validateProjectId(projectId)),
    archivedProjectDirectory: (projectId: string): string => join(libraryRoot, PROJECT_ARCHIVE_DIRECTORY, validateProjectId(projectId)),
    settingsFile: (fileName: string): string => safeChild(settingsRoot, fileName, 'settings file'),
    cacheFile: (fileName: string): string => safeChild(cacheRoot, fileName, 'cache file'),
    tempFile: (fileName: string): string => safeChild(tempRoot, fileName, 'temporary file'),
    assertLibraryContained: async (target: string): Promise<void> => {
      await assertContained(libraryRoot, target);
    },
  };
  return Object.freeze(paths);
}

async function prepareRoot(input: string, label: string): Promise<string> {
  if (typeof input !== 'string' || input.length === 0) throw new Error(`${label} is required`);
  const root = resolve(input);
  await mkdir(root, { recursive: true });
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe ${label}: symlink or non-directory`);
  if ((stat.mode & 0o222) === 0) throw new Error(`Read-only ${label}: ${root}`);
  return await realpath(root);
}

function safeChild(root: string, fileName: string, label: string): string {
  if (typeof fileName !== 'string' || fileName.length === 0 || fileName === '.' || fileName === '..' || fileName.includes('/') || fileName.includes('\\')) {
    throw new Error(`Invalid ${label}: ${fileName}`);
  }
  const target = resolve(root, fileName);
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`${label} escapes root: ${fileName}`);
  return target;
}
