import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ProjectMeta } from '../core/schema/base.js';
import { INITIAL_STATE, type ProjectLayerReadiness, type ProjectOpenResult } from '../core/schema/project-lifecycle.js';
import { ProjectRepository, type CreateProjectInput } from '../core/project/index.js';
import type { NovelCharacterService } from './character-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';

export interface NovelProjectService {
  listProjects(): Promise<ProjectMeta[]>;
  createProject(input: CreateProjectInput): Promise<ProjectMeta>;
  loadProject(projectId: string): Promise<ProjectMeta>;
  openProject(projectId: string): Promise<ProjectOpenResult>;
}

interface Owners {
  characters: NovelCharacterService;
  worldview: NovelWorldviewService;
  outline: NovelOutlineService;
  relationship: NovelRelationshipService;
  state: NovelStateService;
  canon: NovelCanonService;
  confirmation: NovelConfirmationService;
}

/** Host canonical lifecycle coordinator. It owns sequencing, not layer writes. */
export function createProjectService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'), owners?: Owners,
): NovelProjectService {
  const repository = new ProjectRepository(projectsRoot);
  const inFlight = new Map<string, Promise<ProjectOpenResult>>();
  const openProject = (projectId: string): Promise<ProjectOpenResult> => {
    const existing = inFlight.get(projectId);
    if (existing) return existing;
    const run = (async () => {
      const project = await repository.loadProject(projectId);
      if (!owners) throw new Error('Project lifecycle owners are required');
      await owners.confirmation.open(projectId);
      const [characters, worldview, outline, relationship, state, canon] = await Promise.all([
        classifyLayer(async () => classifyList(await openAndList(owners.characters, projectId))),
        classifyLayer(async () => classifyList(await openAndList(owners.worldview, projectId))),
        classifyLayer(async () => {
          await owners.outline.open(projectId);
          return owners.outline.readiness(projectId);
        }),
        classifyLayer(async () => classifyList(await openAndRead(owners.relationship, projectId))),
        classifyLayer(async () => {
          await owners.state.open(projectId, INITIAL_STATE);
          return 'ready';
        }),
        classifyLayer(async () => {
          await owners.canon.open(projectId);
          return owners.canon.query(projectId).length === 0 ? 'empty' : 'ready';
        }),
      ]);
      return {
        project,
        layers: { characters, worldview, outline, relationship, state, canon },
      };
    })();
    inFlight.set(projectId, run);
    return run.finally(() => { if (inFlight.get(projectId) === run) inFlight.delete(projectId); });
  };
  return {
    listProjects: () => repository.listProjects(),
    createProject: (input) => repository.createProject(input),
    loadProject: (projectId) => repository.loadProject(projectId),
    openProject,
  };
}

function classifyList(value: readonly unknown[]): ProjectLayerReadiness { return value.length === 0 ? 'empty' : 'ready'; }

async function classifyLayer(load: () => Promise<ProjectLayerReadiness>): Promise<ProjectLayerReadiness> {
  try {
    return await load();
  } catch {
    return 'corrupt';
  }
}

async function openAndList(service: { open(projectId: string): Promise<void>; list(projectId: string): Promise<readonly unknown[]> }, projectId: string): Promise<readonly unknown[]> {
  await service.open(projectId);
  return service.list(projectId);
}

async function openAndRead(service: { open(projectId: string): Promise<void>; read(projectId: string): Promise<readonly unknown[]> }, projectId: string): Promise<readonly unknown[]> {
  await service.open(projectId);
  return service.read(projectId);
}
