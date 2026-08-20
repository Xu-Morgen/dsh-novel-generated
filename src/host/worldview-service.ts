import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { WorldRepository } from '../core/worldview/index.js';
import type { WorldEntry, WorldEntryHit, WorldEntryInput } from '../core/schema/worldview.js';

export interface RewriteResult {
  superseded: WorldEntry;
  replacement: WorldEntry;
}

export interface NovelWorldviewService {
  open(projectId: string): Promise<void>;
  create(projectId: string, input: WorldEntryInput): Promise<WorldEntry>;
  read(projectId: string, entryId: string): Promise<WorldEntry>;
  list(projectId: string): Promise<WorldEntry[]>;
  rewrite(projectId: string, entryId: string, input: WorldEntryInput): Promise<RewriteResult>;
  matchTriggers(
    projectId: string,
    triggerKeywords?: string[],
    triggerRegex?: string[],
  ): Promise<WorldEntryHit[]>;
}

/**
 * Host facade for the I8 B2 worldview store; callers receive validated
 * WorldEntry values and never filesystem paths. Design §10.1 / R1-B2.
 */
export function createWorldviewService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
): NovelWorldviewService {
  const repositories = new Map<string, WorldRepository>();
  const get = (projectId: string): WorldRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Worldview project is not open: ${projectId}`);
    return repository;
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      const repository = new WorldRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    create: (projectId, input) => get(projectId).create(input),
    read: (projectId, entryId) => get(projectId).read(entryId),
    list: (projectId) => get(projectId).list(),
    rewrite: (projectId, entryId, input) => get(projectId).rewrite(entryId, input),
    matchTriggers: (projectId, triggerKeywords, triggerRegex) =>
      get(projectId).matchTriggers(triggerKeywords, triggerRegex),
  };
}
