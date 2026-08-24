import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { appendDeviation, OutlineNavigator, OutlineProgressRepository, OutlineRepository, reconcileDeviation } from '../core/outline/index.js';
import type { Outline, OutlineBeatCard, OutlineInput } from '../core/schema/outline.js';
import type { OutlineDeviation, OutlineNavigation, OutlineProgress, OutlineProgressInput } from '../core/schema/outline-progress.js';

/** Host facade for I14 B5 storage plus I15 C6 execution and deterministic navigation. */
export interface NovelOutlineService {
  open(projectId: string): Promise<void>;
  readiness(projectId: string): Promise<'ready' | 'uninitialized' | 'corrupt'>;
  save(projectId: string, input: OutlineInput): Promise<Outline>;
  read(projectId: string): Promise<Outline>;
  beatCards(projectId: string): Promise<OutlineBeatCard[]>;
  saveProgress(projectId: string, input: OutlineProgressInput): Promise<OutlineProgress>;
  readProgress(projectId: string): Promise<OutlineProgress>;
  navigate(projectId: string): Promise<OutlineNavigation>;
  recordDeviation(projectId: string, deviation: OutlineDeviation): Promise<OutlineProgress>;
  reconcileDeviation(projectId: string, deviationId: string): Promise<OutlineProgress>;
}

interface OpenOutlineRepositories { outline: OutlineRepository; progress: OutlineProgressRepository }

export function createOutlineService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
): NovelOutlineService {
  const repositories = new Map<string, OpenOutlineRepositories>();
  const get = (projectId: string): OpenOutlineRepositories => {
    validateProjectId(projectId);
    const repositoriesForProject = repositories.get(projectId);
    if (!repositoriesForProject) throw new Error(`Outline project is not open: ${projectId}`);
    return repositoriesForProject;
  };
  const navigator = new OutlineNavigator();
  return {
    async open(projectId) {
      validateProjectId(projectId);
      const directory = projectDirectory(projectsRoot, projectId);
      const outline = new OutlineRepository(directory);
      const progress = new OutlineProgressRepository(directory);
      await outline.open();
      await progress.open();
      repositories.set(projectId, { outline, progress });
    },
    async readiness(projectId) {
      return get(projectId).outline.readiness();
    },

    save: (projectId, input) => get(projectId).outline.save(input),
    read: (projectId) => get(projectId).outline.read(),
    beatCards: (projectId) => get(projectId).outline.beatCards(),
    async saveProgress(projectId, input) {
      const repositoriesForProject = get(projectId);
      return repositoriesForProject.progress.save(input, await repositoriesForProject.outline.read());
    },
    async readProgress(projectId) {
      const repositoriesForProject = get(projectId);
      return repositoriesForProject.progress.read(await repositoriesForProject.outline.read());
    },
    async navigate(projectId) {
      const repositoriesForProject = get(projectId);
      return navigator.navigate(await repositoriesForProject.outline.read(), await repositoriesForProject.progress.read(await repositoriesForProject.outline.read()));
    },
    async recordDeviation(projectId, deviation) {
      const repositoriesForProject = get(projectId);
      const outline = await repositoriesForProject.outline.read();
      const next = appendDeviation(await repositoriesForProject.progress.read(outline), deviation);
      return repositoriesForProject.progress.save(next, outline);
    },
    async reconcileDeviation(projectId, deviationId) {
      const repositoriesForProject = get(projectId);
      const outline = await repositoriesForProject.outline.read();
      const next = reconcileDeviation(await repositoriesForProject.progress.read(outline), deviationId);
      return repositoriesForProject.progress.save(next, outline);
    },
  };
}
