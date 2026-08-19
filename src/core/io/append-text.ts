import { mkdir, open } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Appends text chunks to a file contained by one project directory.
 *
 * Chunks are persisted in iteration order. The target must be a relative path
 * below `projectRoot`; absolute paths and traversal outside that root are
 * rejected before any directory or file is created (design §10.1).
 */
export async function appendText(
  projectRoot: string,
  relativePath: string,
  chunks: Iterable<string> | AsyncIterable<string>,
): Promise<void> {
  const targetPath = resolveProjectPath(projectRoot, relativePath);

  await mkdir(dirname(targetPath), { recursive: true });

  const file = await open(targetPath, 'a');
  try {
    for await (const chunk of chunks) {
      await file.appendFile(chunk, 'utf8');
    }
  } finally {
    await file.close();
  }
}

function resolveProjectPath(projectRoot: string, relativePath: string): string {
  if (relativePath.length === 0 || isAbsolute(relativePath)) {
    throw new Error('Target path must be a non-empty relative path');
  }

  const rootPath = resolve(projectRoot);
  const targetPath = resolve(rootPath, relativePath);
  const pathFromRoot = relative(rootPath, targetPath);

  if (
    pathFromRoot === '..' ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error('Target path must stay inside the project directory');
  }

  return targetPath;
}
