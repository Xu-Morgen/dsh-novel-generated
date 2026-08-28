import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readYaml, writeYaml } from '../io/yaml.js';
import { validateProjectId } from '../io/path.js';
import {
  worldEntrySchema,
  type WorldEntry,
  type WorldEntryHit,
  type WorldEntryInput,
} from '../schema/worldview.js';

const FILE_SUFFIX = '.yaml';

/**
 * B2 worldview store (design §5.4 / §10.1): one validated YAML document per
 * WorldEntry under the project's `worldview` directory.
 *
 * Contract / invariants:
 * - The YAML file is source of truth; every read re-validates against
 *   {@link worldEntrySchema}, so a corrupt or tampered document fails loudly.
 * - `kind`/`triggerMode`/`status` are closed enums; missing `title` or
 *   `content` fails validation; `vector` trigger mode is rejected (N-2).
 * - `parent` chains are validated to exist and to be acyclic, so hierarchy
 *   traversal (`ancestors`) is always terminating and deterministic.
 * - Rewrites are non-mutating: `rewrite` marks the old entry `status:
 *   'rewritten'` with `supersededBy` pointing at the new id, then stores the
 *   new entry as a fresh version-1 document. The old document is never edited
 *   in place beyond that mark. I8 stores this; I29 adds the Gate path.
 */
export class WorldRepository {
  private readonly worldviewDirectory: string;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(projectDirectory: string) {
    this.worldviewDirectory = join(projectDirectory, 'worldview');
  }

  async open(): Promise<void> {
    await mkdir(this.worldviewDirectory, { recursive: true });
  }

  async create(input: WorldEntryInput): Promise<WorldEntry> {
    return this.enqueue(async () => {
      const entry = worldEntrySchema.parse({ ...input, version: input.version ?? 1 });
      const existing = await this.loadAll();
      this.assertNoCycle(entry.id, entry.parent, existing);
      const filePath = this.entryPath(entry.id);
      if (await this.exists(filePath)) throw new Error(`WorldEntry already exists: ${entry.id}`);
      await this.writeEntryDocument(entry);
      return structuredClone(entry);
    });
  }

  async read(entryId: string): Promise<WorldEntry> {
    const raw = await this.readDocument(entryId);
    try {
      return worldEntrySchema.parse(raw);
    } catch (error) {
      throw new Error(`Invalid world entry document: ${entryId}`, { cause: error });
    }
  }

  async list(): Promise<WorldEntry[]> {
    return this.enqueue(() => this.loadAll());
  }

  /**
   * Non-mutating rewrite (design §5.4 / R1-B2): point the superseded entry at
   * the new id and store the new entry. The new id must not already exist.
   */
  async rewrite(entryId: string, input: WorldEntryInput): Promise<{ superseded: WorldEntry; replacement: WorldEntry }> {
    return this.enqueue(async () => {
      const [prepared] = await this.prepareRewriteBatch([{ entryId, input }]);
      await this.writeEntryDocument(prepared.replacement);
      await this.writeEntryDocument(prepared.marked);
      return { superseded: structuredClone(prepared.marked), replacement: structuredClone(prepared.replacement) };
    });
  }

  /**
   * I93 batch rewrite（review v2.0 §8#6 / 计划 §18 I93）：全部校验（含批内
   * 相互影响：replacement id 冲突、parent 环）通过后才开始写盘；先写全部新
   * 文档、再写全部标记；任一步失败即补偿——删除已写 replacement 文档、把已
   * 标记文档还原为原内容，不产生可见部分落库。
   */
  async rewriteBatch(
    operations: ReadonlyArray<{ entryId: string; input: WorldEntryInput }>,
  ): Promise<Array<{ superseded: WorldEntry; replacement: WorldEntry }>> {
    return this.enqueue(async () => {
      const prepared = await this.prepareRewriteBatch(operations);
      const writtenReplacements: string[] = [];
      let writtenMarks = 0;
      try {
        for (const item of prepared) {
          await this.writeEntryDocument(item.replacement);
          writtenReplacements.push(item.replacement.id);
        }
        for (const item of prepared) {
          await this.writeEntryDocument(item.marked);
          writtenMarks += 1;
        }
      } catch (error) {
        for (const id of writtenReplacements) await rm(this.entryPath(id), { force: true });
        for (let index = 0; index < writtenMarks; index += 1) {
          await this.writeEntryDocument(prepared[index].original);
        }
        throw error;
      }
      return prepared.map((item) => ({ superseded: structuredClone(item.marked), replacement: structuredClone(item.replacement) }));
    });
  }

  /** Pure batch preparation: parse/validate every operation against current + batch state, zero writes. */
  private async prepareRewriteBatch(
    operations: ReadonlyArray<{ entryId: string; input: WorldEntryInput }>,
  ): Promise<Array<{ entryId: string; original: WorldEntry; marked: WorldEntry; replacement: WorldEntry }>> {
    const existing = await this.loadAll();
    const byId = new Map(existing.map((entry) => [entry.id, entry]));
    const prepared: Array<{ entryId: string; original: WorldEntry; marked: WorldEntry; replacement: WorldEntry }> = [];
    for (const { entryId, input } of operations) {
      if (input.id === entryId) throw new Error(`Replacement id must differ from the superseded id: ${entryId}`);
      const superseded = byId.get(entryId);
      if (!superseded) throw new Error(`Unknown world entry: ${entryId}`);
      const replacement = worldEntrySchema.parse({ ...input, version: input.version ?? 1 });
      if (byId.has(replacement.id) || prepared.some((item) => item.replacement.id === replacement.id)) {
        throw new Error(`WorldEntry already exists: ${replacement.id}`);
      }
      const merged = [...existing, ...prepared.map((item) => item.replacement)];
      this.assertNoCycle(replacement.id, replacement.parent, merged);
      const marked = worldEntrySchema.parse({
        ...superseded,
        version: superseded.version + 1,
        status: 'rewritten' as const,
        supersededBy: replacement.id,
      });
      prepared.push({ entryId, original: structuredClone(superseded), marked, replacement });
    }
    return prepared;
  }

  /** Deterministic trigger query: constant hits + keyword/regex matches. */
  async matchTriggers(triggerKeywords: string[] = [], triggerRegex: string[] = []): Promise<WorldEntryHit[]> {
    return this.enqueue(async () => {
      const entries = await this.loadAll();
      const active = entries.filter((entry) => entry.status === 'active');
      const ids = new Set(active.map((entry) => entry.id));
      const byId = new Map(active.map((entry) => [entry.id, entry]));

      const matched = new Set<string>();
      for (const entry of active) {
        if (entry.triggerMode === 'constant') {
          matched.add(entry.id);
        } else if (entry.triggerMode === 'keyword') {
          const hit = entry.keywords.some((keyword) =>
            triggerKeywords.some((term) => term.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())),
          );
          if (hit) matched.add(entry.id);
        } else if (entry.triggerMode === 'regex') {
          const hit = entry.keywords.some((pattern) => {
            let source = pattern;
            try {
              source = new RegExp(pattern).source;
            } catch {
              // leave source as-is; an invalid pattern simply cannot match.
            }
            return triggerRegex.some((text) => new RegExp(source).test(text));
          });
          if (hit) matched.add(entry.id);
        }
      }

      const hits: WorldEntryHit[] = [];
      for (const entryId of matched) {
        const entry = byId.get(entryId);
        if (!entry) continue;
        const ancestors = this.parentChain(entryId, byId, ids);
        hits.push({ entry, entryId, ancestors, level: ancestors.length });
      }
      return hits.sort((left, right) => left.entryId.localeCompare(right.entryId));
    });
  }

  /** Walk `parent` pointers to the root; terminate and throw on any cycle. */
  private parentChain(start: string, byId: Map<string, WorldEntry>, ids: Set<string>): string[] {
    const chain: string[] = [];
    const seen = new Set<string>();
    let cursor: string | null = byId.get(start)?.parent ?? null;
    while (cursor !== null) {
      if (seen.has(cursor)) throw new Error(`Parent cycle detected at: ${cursor}`);
      seen.add(cursor);
      if (!ids.has(cursor)) throw new Error(`Parent reference is missing: ${cursor}`);
      chain.unshift(cursor);
      cursor = byId.get(cursor)?.parent ?? null;
    }
    return chain;
  }

  /** Validate the proposed parent edge against the current collection. */
  private assertNoCycle(newId: string, parent: string | null, existing: WorldEntry[]): void {
    if (parent === null) return;
    if (parent === newId) throw new Error(`Self-referential parent: ${newId}`);
    const byId = new Map(existing.map((entry) => [entry.id, entry]));
    if (!byId.has(parent)) throw new Error(`Parent reference is missing: ${parent}`);
    let cursor: string | null = parent;
    const seen = new Set<string>([newId]);
    while (cursor !== null) {
      if (cursor === newId) throw new Error(`Parent cycle detected at: ${newId}`);
      if (seen.has(cursor)) throw new Error(`Parent cycle detected at: ${cursor}`);
      seen.add(cursor);
      cursor = byId.get(cursor)?.parent ?? null;
    }
  }

  private entryPath(entryId: string): string {
    return join(this.worldviewDirectory, `${validateProjectId(entryId)}${FILE_SUFFIX}`);
  }

  private async loadAll(): Promise<WorldEntry[]> {
    const files = (await this.readEntryFiles()).sort();
    const entries: WorldEntry[] = [];
    for (const file of files) {
      const raw = await readYaml<unknown>(join(this.worldviewDirectory, file));
      try {
        entries.push(worldEntrySchema.parse(raw));
      } catch (error) {
        throw new Error(`Invalid world entry document: ${file.replace(FILE_SUFFIX, '')}`, { cause: error });
      }
    }
    return entries;
  }

  private async readEntryFiles(): Promise<string[]> {
    const entries = await readdir(this.worldviewDirectory);
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

  private async readDocument(entryId: string): Promise<unknown> {
    const raw = await readYaml<unknown>(this.entryPath(entryId));
    if (raw === null || raw === undefined) throw new Error(`Invalid world entry document: ${entryId}`);
    return raw;
  }

  private async writeEntryDocument(entry: WorldEntry): Promise<void> {
    const filePath = this.entryPath(entry.id);
    const temporaryPath = `${filePath}.tmp`;
    await writeYaml(temporaryPath, entry);
    await rename(temporaryPath, filePath);
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.tail.then(operation, operation);
    this.tail = run.catch(() => undefined);
    return run;
  }
}
