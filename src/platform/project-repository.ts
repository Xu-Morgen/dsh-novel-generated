import { ProjectRepository } from '../core/project/index.js';
import type { DesktopPaths } from '../app/paths.js';

/**
 * Main-side repository factory. New desktop consumers receive the path port,
 * never an independently guessed settings/library root.
 */
export function createDesktopProjectRepository(paths: DesktopPaths): ProjectRepository {
  return new ProjectRepository(paths.libraryRoot);
}
