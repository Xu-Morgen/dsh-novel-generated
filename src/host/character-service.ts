import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { CharacterRepository } from '../core/characters/index.js';
import type { CharacterLifecycleRecord } from '../core/characters/lifecycle.js';
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
  listAll(projectId: string): Promise<CharacterCore[]>;
  listActive(projectId: string): Promise<CharacterCore[]>;
  assertActive(projectId: string, characterId: string): Promise<void>;
  lifecycleRecords(projectId: string): Promise<CharacterLifecycleRecord[]>;
  changeLifecycle(projectId: string, characterId: string, status: CharacterLifecycleRecord['status'], expectedVersion: number, expectedRevision: number, operationId: string): Promise<void>;
  update(projectId: string, characterId: string, patch: CharacterCorePatch): Promise<CharacterCore>;
  /** Internal CAS for I221; public characterUpdate keeps its original contract. */
  updateIfVersion?(projectId:string,characterId:string,patch:CharacterCorePatch,expectedVersion:number):Promise<CharacterCore>;
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
    listAll: (projectId) => get(projectId).listAll(),
    assertActive: (projectId, characterId) => get(projectId).assertActive(characterId),
    listActive: async projectId => { const records=await get(projectId).lifecycleRecords();return (await get(projectId).list()).filter(character=>!records.some(record=>record.characterId===character.id&&record.status!=='active')); },
    lifecycleRecords: projectId => get(projectId).lifecycleRecords(),
    changeLifecycle: (projectId,characterId,status,version,revision,operationId)=>get(projectId).changeLifecycle(characterId,status,version,revision,operationId),
    update: (projectId, characterId, patch) => get(projectId).update(characterId, patch),
    updateIfVersion:(projectId,characterId,patch,expectedVersion)=>get(projectId).update(characterId,patch,expectedVersion),
    listByKind: (projectId, kind) => get(projectId).listByKind(kind),
    listForScene: (projectId, characterIds) => get(projectId).listForScene(characterIds),
  };
}
