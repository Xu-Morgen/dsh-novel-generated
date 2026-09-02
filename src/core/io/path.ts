import { existsSync } from 'node:fs';
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

/** I155：归档作品集中存放在无效实体 ID 目录，天然不会混入活动项目枚举。 */
export const PROJECT_ARCHIVE_DIRECTORY = '.archive';

/** Map an ID to one immediate active child without applying the archive policy. */
export function activeProjectDirectory(projectsRoot: string, projectId: string): string {
  validateProjectId(projectId);
  return join(resolve(projectsRoot), projectId);
}

/** Map an ID to its Host-owned archive location. */
export function archivedProjectDirectory(projectsRoot: string, projectId: string): string {
  validateProjectId(projectId);
  return join(resolve(projectsRoot), PROJECT_ARCHIVE_DIRECTORY, projectId);
}

/**
 * Map an ID to its active directory and fail closed for archived projects.
 *
 * Every project-scoped Host service resolves its repository through this seam,
 * so a fresh access cannot reopen or edit an archived work (design §14.22).
 */
export function projectDirectory(projectsRoot: string, projectId: string): string {
  const directory = activeProjectDirectory(projectsRoot, projectId);
  if (existsSync(archivedProjectDirectory(projectsRoot, projectId))) {
    throw new Error(`Project is archived and read-only: ${projectId}`);
  }
  return directory;
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
