import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import {
  RelationshipRepository,
  type Relationship,
  type RelationshipInput,
} from '../core/relationship/index.js';

/** Host-owned C1 facade; relationship changes remain explicit writes until I27 parser. */
export interface NovelRelationshipService {
  open(projectId: string): Promise<void>;
  save(projectId: string, input: RelationshipInput): Promise<Relationship>;
  saveAll(projectId: string, inputs: readonly RelationshipInput[]): Promise<Relationship[]>;
  read(projectId: string): Promise<Relationship[]>;
}

export function createRelationshipService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
): NovelRelationshipService {
  const repositories = new Map<string, RelationshipRepository>();
  const get = (projectId: string): RelationshipRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Relationship project is not open: ${projectId}`);
    return repository;
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      const repository = new RelationshipRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    save: (projectId, input) => get(projectId).save(input),
    saveAll: (projectId, inputs) => get(projectId).saveAll(inputs),
    read: (projectId) => get(projectId).read(),
  };
}
