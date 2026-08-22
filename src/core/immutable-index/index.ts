import { DatabaseSync } from 'node:sqlite';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ruleSchema, type Rule } from '../schema/rules.js';
import { worldEntrySchema, type WorldEntry } from '../schema/worldview.js';
import { classifiedSettingsFileSchema, classifierCandidateSchema, settingEntrySchema, type SettingEntry as ClassifiedSettingEntry } from '../schema/classifier.js';
import { readYaml, writeYaml } from '../io/yaml.js';

/** I40 indexed SettingEntry contract (design §10.4). The YAML documents remain authoritative. */
export interface SettingEntry {
  readonly id: string;
  readonly sourceLayer: 'B1' | 'B2';
  readonly sourceId: string;
  readonly title: string;
  readonly content: string;
  readonly tags: readonly string[];
  readonly immutable: true;
  readonly supersededBy?: string;
  readonly version: number;
}

export interface ImmutableSettingQuery {
  readonly sourceLayer?: 'B1' | 'B2';
  readonly sourceId?: string;
  readonly title?: string;
  readonly tag?: string;
  readonly includeSuperseded?: boolean;
}

export const IMMUTABLE_INDEX_FILE = 'settings-index.sqlite';
export const CLASSIFIED_SETTINGS_FILE = 'classified-settings.yaml';

/**
 * Rebuildable exact index over B1 immutable rules and B2 immutable worldview
 * entries. It owns no domain writes: `sync` reads YAML, validates it, then
 * applies only the minimal row delta. A malformed database is discarded and
 * rebuilt, while malformed YAML fails closed (design §10.4, R8-5).
 */
export class ImmutableSettingsIndex {
  readonly projectRoot: string;
  readonly databasePath: string;
  private database?: DatabaseSync;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.databasePath = join(this.projectRoot, IMMUTABLE_INDEX_FILE);
  }

  async open(): Promise<void> {
    await mkdir(this.projectRoot, { recursive: true });
    try {
      this.database = new DatabaseSync(this.databasePath);
      this.ensureSchema();
      this.database.prepare('SELECT count(*) AS count FROM settings').get();
    } catch (error) {
      this.database?.close();
      this.database = undefined;
      await rm(this.databasePath, { force: true });
      this.database = new DatabaseSync(this.databasePath);
      this.ensureSchema();
    }
  }

  /** Fail closed when a candidate references a source not present in authoritative YAML. */
  async assertSources(sourceIds: readonly string[]): Promise<void> {
    const sources = await this.readAuthoritativeSourceIds();
    for (const sourceId of sourceIds) if (!sources.has(sourceId)) throw new Error(`Dangling classifier sourceId: ${sourceId}`);
  }

  async writeClassified(candidates: readonly { entry: ClassifiedSettingEntry; sourceIds: readonly string[]; sourceEvidence: readonly { sourceId: string; quote: string }[] }[]): Promise<void> {
    const parsed = candidates.map((candidate) => ({
      entry: settingEntrySchema.parse(candidate.entry),
      sourceIds: [...candidate.sourceIds],
      sourceEvidence: [...candidate.sourceEvidence],
    }));
    const validated = parsed.map((candidate) => classifierCandidateSchema.parse(candidate));
    await this.assertSources(validated.flatMap((candidate) => candidate.sourceIds));
    const existing = await this.readClassifiedCandidates();
    const byId = new Map(existing.map((candidate) => [candidate.entry.id, candidate]));
    for (const candidate of validated) byId.set(candidate.entry.id, candidate);
    await writeYaml(join(this.projectRoot, CLASSIFIED_SETTINGS_FILE), { candidates: [...byId.values()].sort((a, b) => a.entry.id.localeCompare(b.entry.id)) });
  }

  async sync(): Promise<{ added: number; updated: number; removed: number; total: number }> {
    const database = this.requireDatabase();
    const desired = await this.readSourceEntries();
    const current = new Map<string, SettingEntry>();
    for (const row of database.prepare('SELECT * FROM settings').all() as Array<Record<string, unknown>>) {
      current.set(String(row.id), this.decodeRow(row));
    }
    const insert = database.prepare('INSERT INTO settings (id, source_layer, source_id, title, content, tags, immutable, superseded_by, version) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)');
    const update = database.prepare('UPDATE settings SET source_layer=?, source_id=?, title=?, content=?, tags=?, immutable=1, superseded_by=?, version=? WHERE id=?');
    const remove = database.prepare('DELETE FROM settings WHERE id=?');
    let added = 0; let updated = 0; let removed = 0;
    database.exec('BEGIN');
    try {
      for (const entry of desired) {
        const previous = current.get(entry.id);
        if (!previous) { insert.run(entry.id, entry.sourceLayer, entry.sourceId, entry.title, entry.content, JSON.stringify(entry.tags), entry.supersededBy ?? null, entry.version); added += 1; }
        else if (JSON.stringify(previous) !== JSON.stringify(entry)) { update.run(entry.sourceLayer, entry.sourceId, entry.title, entry.content, JSON.stringify(entry.tags), entry.supersededBy ?? null, entry.version, entry.id); updated += 1; }
        current.delete(entry.id);
      }
      for (const stale of current.keys()) { remove.run(stale); removed += 1; }
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
    return { added, updated, removed, total: desired.length };
  }

  query(filter: ImmutableSettingQuery = {}): SettingEntry[] {
    const database = this.requireDatabase();
    const clauses = ['1=1']; const params: Array<string | number> = [];
    if (filter.sourceLayer) { clauses.push('source_layer=?'); params.push(filter.sourceLayer); }
    if (filter.sourceId) { clauses.push('source_id=?'); params.push(filter.sourceId); }
    if (filter.title) { clauses.push('title=?'); params.push(filter.title); }
    if (filter.tag) { clauses.push("EXISTS (SELECT 1 FROM json_each(settings.tags) WHERE value=?)"); params.push(filter.tag); }
    if (!filter.includeSuperseded) clauses.push('superseded_by IS NULL');
    const rows = database.prepare(`SELECT * FROM settings WHERE ${clauses.join(' AND ')} ORDER BY source_layer, source_id, version, id`).all(...params) as Array<Record<string, unknown>>;
    return rows.map((row) => this.decodeRow(row));
  }

  close(): void { this.database?.close(); this.database = undefined; }

  private ensureSchema(): void {
    this.requireDatabase().exec(`CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, source_layer TEXT NOT NULL, source_id TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, tags TEXT NOT NULL, immutable INTEGER NOT NULL CHECK (immutable=1), superseded_by TEXT, version INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS settings_source_id ON settings(source_id); CREATE INDEX IF NOT EXISTS settings_layer ON settings(source_layer);`);
  }

  private requireDatabase(): DatabaseSync { if (!this.database) throw new Error('Immutable settings index is not open'); return this.database; }

  private async readSourceEntries(): Promise<SettingEntry[]> {
    const entries: SettingEntry[] = [];
    for (const file of (await this.files('rules')).sort()) {
      const rule = ruleSchema.parse(await readYaml<unknown>(join(this.projectRoot, 'rules', file)));
      if (!rule.immutable) continue;
      entries.push({ id: `B1:${rule.id}`, sourceLayer: 'B1', sourceId: rule.id, title: rule.id, content: rule.statement, tags: [rule.scope, rule.kind], immutable: true, version: rule.version });
    }
    for (const file of (await this.files('worldview')).sort()) {
      const entry = worldEntrySchema.parse(await readYaml<unknown>(join(this.projectRoot, 'worldview', file)));
      if (entry.mutable) continue;
      entries.push({ id: `B2:${entry.id}`, sourceLayer: 'B2', sourceId: entry.id, title: entry.title, content: entry.content, tags: [entry.kind, ...entry.keywords], immutable: true, supersededBy: entry.supersededBy ?? undefined, version: entry.version });
    }
    entries.push(...(await this.readClassifiedCandidates()).map((candidate) => candidate.entry));
    return entries;
  }

  private async readClassifiedCandidates(): Promise<Array<{ entry: ClassifiedSettingEntry; sourceIds: string[]; sourceEvidence: Array<{ sourceId: string; quote: string }> }>> {
    try { return classifiedSettingsFileSchema.parse(await readYaml<unknown>(join(this.projectRoot, CLASSIFIED_SETTINGS_FILE))).candidates; }
    catch (error) {
      if (error instanceof Error && (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') return [];
      throw new Error(`Invalid classified settings document: ${CLASSIFIED_SETTINGS_FILE}`, { cause: error });
    }
  }

  private async readAuthoritativeSourceIds(): Promise<Set<string>> {
    const ids = new Set<string>();
    for (const file of (await this.files('rules')).sort()) ids.add(ruleSchema.parse(await readYaml<unknown>(join(this.projectRoot, 'rules', file))).id);
    for (const file of (await this.files('worldview')).sort()) ids.add(worldEntrySchema.parse(await readYaml<unknown>(join(this.projectRoot, 'worldview', file))).id);
    return ids;
  }

  private async files(directory: string): Promise<string[]> {
    try { return (await readdir(join(this.projectRoot, directory))).filter((file) => file.endsWith('.yaml')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }

  private decodeRow(row: Record<string, unknown>): SettingEntry {
    return { id: String(row.id), sourceLayer: String(row.source_layer) as 'B1' | 'B2', sourceId: String(row.source_id), title: String(row.title), content: String(row.content), tags: JSON.parse(String(row.tags)) as string[], immutable: true, ...(row.superseded_by === null ? {} : { supersededBy: String(row.superseded_by) }), version: Number(row.version) };
  }
}

export async function openImmutableSettingsIndex(projectRoot: string): Promise<ImmutableSettingsIndex> {
  const index = new ImmutableSettingsIndex(projectRoot);
  await index.open();
  return index;
}

export type IndexedSource = Rule | WorldEntry;
