import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProjectMeta } from '../core/schema/base.js';
import { ProjectRepository, type CreateProjectInput } from '../core/project/index.js';

export interface NovelProjectService {
  createProject(input: CreateProjectInput): Promise<ProjectMeta>;
  loadProject(projectId: string): Promise<ProjectMeta>;
}

/** Host service facade; callers can access projects only by validated IDs. */
export function createProjectService(projectsRoot = join(homedir(), '.dsh', 'novel-projects')): NovelProjectService {
  const repository = new ProjectRepository(projectsRoot);
  return {
    createProject: (input) => repository.createProject(input),
    loadProject: (projectId) => repository.loadProject(projectId),
  };
}
