import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { CharacterRepository } from '../core/characters/index.js';
import type {
  CharacterCore,
  CharacterCoreInput,
  CharacterCorePatch,
  CharacterKind,
  SceneCharacterView,
} from '../core/schema/characters.js';

export interface NovelCharacterService {
  open(projectId: string): Promise<void>;
  create(projectId: string, input: CharacterCoreInput): Promise<CharacterCore>;
  read(projectId: string, characterId: string): Promise<CharacterCore>;
  list(projectId: string): Promise<CharacterCore[]>;
  update(projectId: string, characterId: string, patch: CharacterCorePatch): Promise<CharacterCore>;
  listByKind(projectId: string, kind?: CharacterKind): Promise<CharacterCore[]>;
  listForScene(projectId: string, characterIds: string[]): Promise<SceneCharacterView[]>;
}

/**
 * Host facade for the I9 B3 character-core store; callers receive validated
 * CharacterCore values and never filesystem paths. Design §10.1 / R1-B3.
 */
export function createCharacterService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
): NovelCharacterService {
  const repositories = new Map<string, CharacterRepository>();
  const get = (projectId: string): CharacterRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Character project is not open: ${projectId}`);
    return repository;
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      const repository = new CharacterRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    create: (projectId, input) => get(projectId).create(input),
    read: (projectId, characterId) => get(projectId).read(characterId),
    list: (projectId) => get(projectId).list(),
    update: (projectId, characterId, patch) => get(projectId).update(characterId, patch),
    listByKind: (projectId, kind) => get(projectId).listByKind(kind),
    listForScene: (projectId, characterIds) => get(projectId).listForScene(characterIds),
  };
}
