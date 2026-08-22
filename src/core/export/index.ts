import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import type { ConfirmationGate } from '../confirm/index.js';
import { readYaml } from '../io/yaml.js';

export const PORTABLE_FORMAT = 'novel-creation-tool.portable';
export const PORTABLE_VERSION = 1;
export const ARCHIVE_MODES = ['full-project', 'shareable-template'] as const;
export type ArchiveMode = (typeof ARCHIVE_MODES)[number];

const LAYER_PATHS = [
  'rules', 'worldview', 'characters', 'outline.yaml', 'relationships.yaml',
  'state', 'knowledge.yaml', 'canon', 'text', 'outline-progress.yaml',
] as const;
const TEMPLATE_EXCLUDED = new Set(['text']);

export interface PortableArchive {
  readonly format: typeof PORTABLE_FORMAT;
  readonly version: typeof PORTABLE_VERSION;
  readonly mode: ArchiveMode;
  readonly exportedAt: string;
  readonly project: { readonly id: string; readonly name: string };
  readonly files: Readonly<Record<string, string>>;
  readonly checksum: string;
}

export interface ImportResult {
  readonly status: 'imported' | 'pending';
  readonly written: readonly string[];
  readonly conflicts: readonly string[];
  readonly proposalId?: string;
}

export interface PortableImportOptions {
  readonly gate?: ConfirmationGate;
  readonly proposalId?: string;
}

/**
 * I39 Host-owned portable package. The archive is a transport envelope only:
 * YAML/JSONL/Markdown files remain the source of truth after import.
 * Semantic comparisons canonicalize object key order and ignore exportedAt.
 */
export async function exportProject(projectDirectory: string, mode: ArchiveMode = 'full-project'): Promise<PortableArchive> {
  if (!ARCHIVE_MODES.includes(mode)) throw new Error(`Unsupported archive mode: ${mode}`);
  const root = resolve(projectDirectory);
  const meta = await readYaml<{ id?: string; name?: string }>(join(root, 'project.yaml'));
  if (!meta || typeof meta.id !== 'string' || typeof meta.name !== 'string') throw new Error('Invalid project metadata for portable export');
  const files: Record<string, string> = {};
  for (const path of LAYER_PATHS) {
    if (mode === 'shareable-template' && TEMPLATE_EXCLUDED.has(path)) continue;
    await collectFiles(root, path, files);
  }
  const exportedAt = new Date().toISOString();
  const envelope: Omit<PortableArchive, 'exportedAt' | 'checksum'> = { format: PORTABLE_FORMAT, version: PORTABLE_VERSION, mode, project: { id: meta.id ?? '', name: meta.name ?? '' }, files };
  return { ...envelope, exportedAt, checksum: checksum(envelope) };
}

/** Serialize exactly one portable package file. */
export function serializeArchive(archive: PortableArchive): string {
  validateArchive(archive);
  return `${JSON.stringify(archive, null, 2)}\n`;
}

/** Parse and verify a package before any target filesystem mutation. */
export function parseArchive(raw: string): PortableArchive {
  let value: unknown;
  try { value = JSON.parse(raw); } catch (error) { throw new Error('Invalid portable archive JSON', { cause: error }); }
  validateArchive(value);
  const archive = value as PortableArchive;
  if (archive.checksum !== checksum({ format: archive.format, version: archive.version, mode: archive.mode, project: archive.project, files: archive.files })) {
    throw new Error('Portable archive checksum mismatch');
  }
  return archive;
}

/** Canonical semantic equality used by round-trip verification, excluding exportedAt. */
export function semanticallyEqual(left: PortableArchive, right: PortableArchive): boolean {
  validateArchive(left); validateArchive(right);
  return canonical({ ...left, exportedAt: undefined, checksum: undefined }) === canonical({ ...right, exportedAt: undefined, checksum: undefined });
}

/** Export C5 chapters as deterministic text files and settings as readable Markdown. */
export async function exportPlainText(projectDirectory: string): Promise<Record<string, string>> {
  const root = resolve(projectDirectory);
  const output: Record<string, string> = {};
  const textRoot = join(root, 'text');
  for (const file of await filesUnder(textRoot)) {
    if (!file.endsWith('.json')) continue;
    const chapter = JSON.parse(await readFile(file, 'utf8')) as { id: string; scenes: Array<{ content: string }> };
    output[`${chapter.id}.txt`] = chapter.scenes.map((scene) => scene.content).join('\n\n');
    output[`${chapter.id}.md`] = `# ${chapter.id}\n\n${output[`${chapter.id}.txt`]}\n`;
  }
  for (const path of ['rules', 'worldview', 'characters', 'outline.yaml', 'relationships.yaml', 'knowledge.yaml', 'outline-progress.yaml']) {
    const files: Record<string, string> = {};
    await collectFiles(root, path, files);
    for (const [name, content] of Object.entries(files)) output[`settings/${name}.md`] = `# ${name}\n\n\`\`\`yaml\n${content.trim()}\n\`\`\`\n`;
  }
  return output;
}

/**
 * Import into a clean or existing Host project. Conflicts never overwrite data;
 * they become one durable I11 proposal when a gate is supplied.
 */
export async function importProject(archive: PortableArchive, targetDirectory: string, options: PortableImportOptions = {}): Promise<ImportResult> {
  validateArchive(archive);
  const root = resolve(targetDirectory);
  const conflicts: string[] = [];
  for (const [path, content] of Object.entries(archive.files)) {
    try {
      const current = await readFile(join(root, path), 'utf8');
      if (current !== content) conflicts.push(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (conflicts.length > 0) {
    if (!options.gate || !options.proposalId) throw new Error(`Portable import conflicts: ${conflicts.join(', ')}`);
    const record = options.gate.get(options.proposalId);
    if (record.status !== 'accepted') return { status: 'pending', written: [], conflicts, proposalId: options.proposalId };
  }
  const written: string[] = [];
  for (const [path, content] of Object.entries(archive.files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content, 'utf8');
    written.push(path);
  }
  return { status: 'imported', written: written.sort(), conflicts };
}

export async function proposePortableImport(gate: ConfirmationGate, proposalId: string, archive: PortableArchive, conflicts: readonly string[]) {
  return gate.propose({ id: proposalId, kind: 'portable-import-conflict', payload: { archiveChecksum: archive.checksum, conflicts: [...conflicts].sort() } });
}

function validateArchive(value: unknown): asserts value is PortableArchive {
  if (!value || typeof value !== 'object') throw new Error('Portable archive must be an object');
  const archive = value as Record<string, unknown>;
  if (archive.format !== PORTABLE_FORMAT || archive.version !== PORTABLE_VERSION) throw new Error('Unsupported portable archive version');
  if (!ARCHIVE_MODES.includes(archive.mode as ArchiveMode)) throw new Error('Unsupported portable archive mode');
  if (!archive.project || typeof archive.project !== 'object' || !archive.files || typeof archive.files !== 'object') throw new Error('Portable archive is missing project or files');
  for (const [path, content] of Object.entries(archive.files as Record<string, unknown>)) {
    if (!path || path.startsWith('/') || path.includes('..') || typeof content !== 'string') throw new Error(`Invalid portable file: ${path}`);
  }
}

async function collectFiles(root: string, path: string, output: Record<string, string>): Promise<void> {
  const absolute = join(root, path);
  try { if ((await stat(absolute)).isDirectory()) { for (const file of await filesUnder(absolute)) output[relative(root, file)] = await readFile(file, 'utf8'); } else output[path] = await readFile(absolute, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
async function filesUnder(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(root, entry.name);
      if (entry.isDirectory()) files.push(...await filesUnder(path)); else files.push(path);
    }
    return files;
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
function checksum(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}
