import { realpath } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { entityIdSchema } from '../schema/base.js';

/** Validate the portable ID before it can influence a filesystem path. */
export function validateProjectId(projectId: string): string {
  const result = entityIdSchema.safeParse(projectId);
  if (!result.success || projectId.includes('/') || projectId.includes('\\')) {
    throw new Error(`Invalid project ID: ${projectId}`);
  }
  return projectId;
}

/** Map an ID to one immediate child of the configured projects root. */
export function projectDirectory(projectsRoot: string, projectId: string): string {
  validateProjectId(projectId);
  return join(resolve(projectsRoot), projectId);
}

/** Ensure a path remains inside the root, including symlink-resolved paths. */
export async function assertContained(root: string, target: string): Promise<void> {
  const rootReal = await realpath(root);
  const targetReal = await realpath(target);
  const rel = relative(rootReal, targetReal);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) {
    throw new Error(`Path escapes projects root: ${target}`);
  }
}
