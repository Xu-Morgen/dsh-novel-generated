import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { OutlineRepository } from '../core/outline/index.js';
import type { Outline, OutlineBeatCard, OutlineInput } from '../core/schema/outline.js';

/** Host facade for I14 B5 outline and nested detail-beat storage. */
export interface NovelOutlineService {
  open(projectId: string): Promise<void>;
  save(projectId: string, input: OutlineInput): Promise<Outline>;
  read(projectId: string): Promise<Outline>;
  beatCards(projectId: string): Promise<OutlineBeatCard[]>;
}

export function createOutlineService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
): NovelOutlineService {
  const repositories = new Map<string, OutlineRepository>();
  const get = (projectId: string): OutlineRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Outline project is not open: ${projectId}`);
    return repository;
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      const repository = new OutlineRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    save: (projectId, input) => get(projectId).save(input),
    read: (projectId) => get(projectId).read(),
    beatCards: (projectId) => get(projectId).beatCards(),
  };
}
