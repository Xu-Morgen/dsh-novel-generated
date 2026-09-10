import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import { validateProjectId } from '../io/path.js';
import { characterLifecycleFileSchema, type CharacterLifecycleRecord } from './lifecycle.js';
import {
  characterCoreSchema,
  type CharacterCore,
  type CharacterCoreInput,
  type CharacterKind,
  type CharacterCorePatch,
  type SceneCharacterView,
} from '../schema/characters.js';

const FILE_SUFFIX = '.yaml';

/**
 * B3 character-core store (design §5.5 / §10.1): one validated YAML document
 * per CharacterCore under the project's `characters` directory.
 *
 * Contract / invariants:
 * - The YAML file is source of truth; every read re-validates against
 *   {@link characterCoreSchema}, so a corrupt or tampered document fails loudly.
 * - `kind` is a closed enum and a missing/blank `name` fails validation.
 * - `arc.keyBeats`, `relationships` and `knowledgeIds` replicate on round-trip.
 * - `relationships`/`knowledgeIds` are forward references to C1/C3; I9 stores
 *   them verbatim and only enforces id shape, never existence (C1/C3 arrive in
 *   I16/I18). The `.strict()` schema guards the C2 boundary (R1-B3): no mutable
 *   C2 field may ever be stored here.
 * - Queries are deterministic: `listForScene` returns matching characters
 *   ordered by name, then id, for stable downstream injection order.
 */
export class CharacterRepository {
  private readonly charactersDirectory: string;
  private readonly lifecyclePath: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.charactersDirectory = join(projectDirectory, 'characters');
    this.lifecyclePath = join(projectDirectory, 'character-lifecycle.yaml');
  }

  async open(): Promise<void> {
    await mkdir(this.charactersDirectory, { recursive: true });
  }

  async create(input: CharacterCoreInput): Promise<CharacterCore> {
    return this.enqueue(async () => {
      const character = characterCoreSchema.parse({ ...input, version: input.version ?? 1 });
      const filePath = this.characterPath(character.id);
      if (await this.exists(filePath)) throw new Error(`CharacterCore already exists: ${character.id}`);
      await this.writeCharacterDocument(character);
      return structuredClone(character);
    });
  }

  async read(characterId: string): Promise<CharacterCore> {
    const raw = await this.readDocument(characterId);
    try {
      return characterCoreSchema.parse(raw);
    } catch (error) {
      throw new Error(`Invalid character document: ${characterId}`, { cause: error });
    }
  }

  async list(): Promise<CharacterCore[]> {
    const records = await this.lifecycleRecords();
    return (await this.listAll()).filter(character => !records.some(record => record.characterId === character.id && record.status === 'deleted'));
  }

  /** Historical records remain readable; normal selection excludes deleted records. */
  async listAll(): Promise<CharacterCore[]> {
    return this.enqueue(async () => {
      const files = (await this.readCharacterFiles()).sort();
      const characters: CharacterCore[] = [];
      for (const file of files) {
        const raw = await readYaml<unknown>(join(this.charactersDirectory, file));
        try {
          characters.push(characterCoreSchema.parse(raw));
        } catch (error) {
          throw new Error(`Invalid character document: ${file.replace(FILE_SUFFIX, '')}`, { cause: error });
        }
      }
      return characters;
    });
  }

  async update(characterId: string, patch: CharacterCorePatch, expectedVersion?:number): Promise<CharacterCore> {
    return this.enqueue(async () => {
      await this.assertActive(characterId);
      const current = await this.read(characterId);
      if(expectedVersion!==undefined&&current.version!==expectedVersion)throw new Error('角色资料已变化，请重新预览。');
      const character = characterCoreSchema.parse({ ...patch, id: current.id, version: current.version + 1 });
      await this.writeCharacterDocument(character);
      return structuredClone(character);
    });
  }

  /**
   * Deterministic query by `kind`; no filter means "all", ordered name then id.
   * Not self-enqueued: `list()` already serializes reads, so wrapping this
   * would deadlock against the shared tail.
   */
  async listByKind(kind?: CharacterKind): Promise<CharacterCore[]> {
    const characters = await this.list();
    return characters
      .filter((character) => kind === undefined || character.kind === kind)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }

  /**
   * Deterministic consumer fixture (I9): filter the characters present in a
   * scene by id, excluding unknown ids loudly, and emit a stable `SceneCharacterView`
   * per match. This is the downstream slice I13 will serialize into the prompt;
   * I9 proves the storage + selection contract without any injection.
   */
  async listForScene(characterIds: string[]): Promise<SceneCharacterView[]> {
    for (const id of characterIds) await this.assertActive(id);
    const characters = await this.list();
    const byId = new Map(characters.map((character) => [character.id, character]));
    const unknown = characterIds.filter((id) => !byId.has(id));
    if (unknown.length > 0) throw new Error(`Unknown character reference: ${unknown.join(', ')}`);
    return characterIds
      .map((id) => byId.get(id)!)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map((character) => ({
        character,
        name: character.name,
        kind: character.kind,
        pov: character.kind === 'pov',
      }));
  }

  private characterPath(characterId: string): string {
    return join(this.charactersDirectory, `${validateProjectId(characterId)}${FILE_SUFFIX}`);
  }

  /** Main-only lifecycle query. Missing record means active; malformed storage fails closed. */
  async lifecycleRecords(): Promise<CharacterLifecycleRecord[]> {
    try { return characterLifecycleFileSchema.parse(await readYaml(this.lifecyclePath)).records; }
    catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT' || ((cause as {cause?:NodeJS.ErrnoException}).cause)?.code === 'ENOENT') return [];
      throw cause;
    }
  }

  /** Required by generation and edits; frozen identities remain available for historical reads. */
  async assertActive(characterId: string): Promise<void> {
    const record=(await this.lifecycleRecords()).find(record=>record.characterId===characterId);
    if(record && record.status!=='active') throw new Error('当前角色已冻结或删除，请在角色管理中恢复后再使用。');
  }

  /** Compare-and-set shares the B3 update lane and retains an operation token for replay. */
  async changeLifecycle(characterId: string, status: CharacterLifecycleRecord['status'], expectedVersion: number, expectedRevision: number, operationId: string): Promise<void> {
    return this.enqueue(async()=>{
      const character=await this.read(characterId);
      const records=await this.lifecycleRecords();
      const old=records.find(record=>record.characterId===characterId);
      if(old?.operationId===operationId)return;
      if(character.version!==expectedVersion || (old?.revision??0)!==expectedRevision)throw new Error('角色已变化，请重新预览操作。');
      const completedMergeIds=[...new Set([...(old?.completedMergeIds??[]),...(operationId.startsWith('character-merge-')?[operationId]:[])])];
      const next=characterLifecycleFileSchema.parse({version:1,records:[...records.filter(record=>record.characterId!==characterId),{characterId,status,revision:expectedRevision+1,operationId,...(completedMergeIds.length?{completedMergeIds}:{})}]});
      await writeYaml(this.lifecyclePath+'.tmp',next);await rename(this.lifecyclePath+'.tmp',this.lifecyclePath);
    });
  }

  private async readCharacterFiles(): Promise<string[]> {
    const entries = await readdir(this.charactersDirectory);
    return entries.filter((file) => file.endsWith(FILE_SUFFIX));
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await readFile(filePath, 'utf8');
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  private async readDocument(characterId: string): Promise<unknown> {
    const raw = await readYaml<unknown>(this.characterPath(characterId));
    if (raw === null || raw === undefined) throw new Error(`Invalid character document: ${characterId}`);
    return raw;
  }

  private async writeCharacterDocument(character: CharacterCore): Promise<void> {
    const filePath = this.characterPath(character.id);
    const temporaryPath = `${filePath}.tmp`;
    await writeYaml(temporaryPath, character);
    await rename(temporaryPath, filePath);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
