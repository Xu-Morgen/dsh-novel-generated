import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { load } from 'js-yaml';
import { z } from 'zod';

import { ConfirmationGate } from '../core/confirm/index.js';
import { assertKnowledgeStructure, knowledgeEntrySchema, knowledgeStateSchema } from '../core/schema/knowledge.js';
import { canonEventSchema } from '../core/schema/canon.js';
import { characterCoreSchema } from '../core/schema/characters.js';
import { confirmationFileSchema } from '../core/schema/confirm.js';
import { outlineProgressSchema } from '../core/schema/outline-progress.js';
import { outlineSchema } from '../core/schema/outline.js';
import { projectMetaSchema, type ProjectMeta } from '../core/schema/base.js';
import { relationshipSchema, assertRelationshipStructure } from '../core/schema/relationship.js';
import { stateSnapshotFileSchema } from '../core/schema/state.js';
import { styleProfileSchema } from '../core/schema/style.js';
import { worldEntrySchema } from '../core/schema/worldview.js';
import { A2_SETTINGS_FILE, A2SettingsSchema } from '../core/settings-index/index.js';
import { workbenchSettingsSchema } from '../core/schema/workbench-settings.js';
import { parseChapterDocument } from '../core/text/codec.js';
import { OutlineRepository } from '../core/outline/index.js';
import { validateProjectId } from '../core/io/path.js';
import {
  desktopMigrationIssueSchema,
  desktopMigrationExecutionSchema,
  type DesktopMigrationExecution,
  type DesktopMigrationPreview,
  type DesktopMigrationRollback,
  type DesktopMigrationProject,
} from '../core/schema/desktop-migration.js';
import { ruleSchema } from '../core/schema/rules.js';

const WORKBENCH_SETTINGS_FILE = 'workbench-settings.yaml';
const MIGRATABLE_SETTINGS = ['a2-settings.yaml', WORKBENCH_SETTINGS_FILE] as const;
const ISSUE_CODES = desktopMigrationIssueSchema.options;

export interface DesktopMigrationPaths {
  /** Fixed legacy source selected by Main; Renderer never supplies this path. */
  readonly legacyProjectsRoot: string;
  /** Legacy mechanism/workbench settings directory; credential stores are excluded. */
  readonly legacySettingsRoot: string;
  /** Current desktop library root, already owned by DesktopPaths. */
  readonly libraryRoot: string;
  /** Current desktop settings root, already owned by DesktopPaths. */
  readonly settingsRoot: string;
  /** Durable Main-only backup location under the desktop user data root. */
  readonly backupRoot: string;
  /** Optional active-root switch; the default desktop root is already active. */
  readonly activateTarget?: () => Promise<void>;
  /** Optional restoration hook for a host that tracks an alternate active root. */
  readonly restorePrevious?: () => Promise<void>;
}

export interface DesktopMigrationService {
  preview(): Promise<DesktopMigrationPreview>;
  execute(operationId: string): Promise<DesktopMigrationExecution>;
  rollback(operationId: string): Promise<DesktopMigrationRollback>;
  dispose(): void;
}

interface SourceFile {
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly bytes: number;
  readonly hash: string;
}

interface ProjectPlan {
  readonly meta: ProjectMeta;
  readonly sourceDirectory: string;
  readonly targetDirectory: string;
  readonly files: readonly SourceFile[];
  readonly sourceHash: string;
  readonly preview: DesktopMigrationProject;
}

interface SettingPlan {
  readonly name: typeof MIGRATABLE_SETTINGS[number];
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly bytes: number;
  readonly hash: string;
  readonly preview: { readonly status: 'ready' | 'absent' | 'corrupt' | 'conflict'; readonly bytes: number; readonly sourceHash?: string; readonly issue?: typeof ISSUE_CODES[number] };
}

interface MigrationPlan {
  readonly preview: DesktopMigrationPreview;
  readonly projects: readonly ProjectPlan[];
  readonly settings: readonly SettingPlan[];
}

const manifestSchema = desktopMigrationExecutionSchema.extend({
  createdProjectIds: z.array(z.string()),
  createdSettings: z.array(z.string()),
  status: z.enum(['completed', 'failed', 'rolled-back']),
});
type MigrationManifest = z.infer<typeof manifestSchema>;

/**
 * I182 explicit legacy-library migration owner (design §0.1.2 / §14.32 and
 * requirements H0-8/R34-11). It reads the fixed legacy source, validates only
 * canonical project/settings documents, backs up before copying, verifies byte
 * hashes after copying, and never mutates or deletes the source.
 *
 * Invariants:
 * - preview is read-only apart from one pending I11 ConfirmationGate record;
 * - API keys, credential files, arbitrary DSH settings, and symlinks are never
 *   migrated;
 * - conflicts and source changes fail before any target write;
 * - execute is idempotent for a completed operation and rollback is guarded by
 *   the recorded target hashes/ownership.
 */
export function createDesktopMigrationService(paths: DesktopMigrationPaths): DesktopMigrationService {
  const plans = new Map<string, MigrationPlan>();
  const gatePromise = ConfirmationGate.open(resolve(paths.backupRoot, '..'));
  let disposed = false;

  const requireActive = (): void => { if (disposed) throw new Error('Desktop migration service is disposed'); };

  async function preview(): Promise<DesktopMigrationPreview> {
    requireActive();
    const plan = await buildPlan();
    let confirmation: DesktopMigrationPreview['confirmation'] = null;
    if (plan.preview.canExecute) {
      const gate = await gatePromise;
      await gate.propose({ id: plan.preview.operationId, kind: 'desktop-migration', payload: { sourceFingerprint: plan.preview.sourceFingerprint, projectIds: plan.projects.map((project) => project.meta.id) } });
      confirmation = { id: plan.preview.operationId, status: 'pending' };
    }
    const result = Object.freeze({ ...plan.preview, confirmation });
    const stored = { ...plan, preview: result } as MigrationPlan;
    plans.set(result.operationId, stored);
    return result;
  }

  async function execute(operationId: string): Promise<DesktopMigrationExecution> {
    requireActive();
    validateProjectId(operationId);
    const plan = plans.get(operationId);
    if (plan === undefined) throw new Error(`Unknown desktop migration operation: ${operationId}`);
    const existing = await readManifest(operationId);
    if (existing?.status === 'completed') return executionFromManifest(existing);
    if (!plan.preview.canExecute || plan.preview.confirmation === null) throw new Error('Desktop migration is not executable');

    const fresh = await buildPlan(operationId);
    if (fresh.preview.sourceFingerprint !== plan.preview.sourceFingerprint || !fresh.preview.canExecute) throw new Error('Desktop migration source changed or is no longer executable');
    const gate = await gatePromise;
    const decision = gate.get(operationId);
    if (decision.status === 'pending') await gate.accept(operationId);
    else if (decision.status !== 'accepted') throw new Error('Desktop migration confirmation was rejected');

    const operationDirectory = join(resolve(paths.backupRoot), operationId);
    await ensureDirectory(resolve(paths.backupRoot));
    const createdProjectIds: string[] = [];
    const createdSettings: string[] = [];
    let activated = false;
    try {
      await ensureMissingOrDirectory(operationDirectory);
      await copyPlanToBackup(fresh, operationDirectory);
      const backupManifestHash = hashText(stableJson({ operationId, sourceFingerprint: fresh.preview.sourceFingerprint, projects: fresh.projects.map((project) => ({ id: project.meta.id, files: project.files.map((file) => ({ path: file.relativePath, hash: file.hash, bytes: file.bytes })) })), settings: fresh.settings.map((setting) => ({ name: setting.name, hash: setting.hash, bytes: setting.bytes })) }));
      await writeManifest(operationDirectory, { operationId, status: 'failed', sourceFingerprint: fresh.preview.sourceFingerprint, projectsCopied: 0, projectsSkipped: 0, settingsCopied: 0, settingsSkipped: 0, backupManifestHash, createdProjectIds, createdSettings });

      let projectsCopied = 0;
      for (const project of fresh.projects) {
        if (await pathExists(project.targetDirectory)) throw new Error(`Migration destination appeared during copy: ${project.meta.id}`);
        createdProjectIds.push(project.meta.id);
        await copyTree(project.sourceDirectory, project.targetDirectory);
        projectsCopied += 1;
      }
      let settingsCopied = 0;
      let settingsSkipped = 0;
      for (const setting of fresh.settings) {
        if (setting.preview.status === 'absent') continue;
        const existingHash = await fileHash(setting.targetPath);
        if (existingHash === setting.hash) { settingsSkipped += 1; continue; }
        if (existingHash !== undefined) throw new Error(`Migration destination appeared during copy: ${setting.name}`);
        await ensureDirectory(resolve(paths.settingsRoot));
        createdSettings.push(setting.name);
        await copyFile(setting.sourcePath, setting.targetPath);
        settingsCopied += 1;
      }
      await verifyCopied(fresh);
      if (paths.activateTarget !== undefined) {
        activated = true;
        await paths.activateTarget();
      }
      const manifest = { operationId, status: 'completed' as const, sourceFingerprint: fresh.preview.sourceFingerprint, projectsCopied, projectsSkipped: 0, settingsCopied, settingsSkipped, backupManifestHash, createdProjectIds, createdSettings };
      await writeManifest(operationDirectory, manifest);
      return executionFromManifest(manifest);
    } catch (error) {
      if (activated && paths.restorePrevious !== undefined) await paths.restorePrevious().catch(() => undefined);
      await removeCreatedTargets(fresh, createdProjectIds, createdSettings);
      throw error;
    }
  }

  async function rollback(operationId: string): Promise<DesktopMigrationRollback> {
    requireActive();
    validateProjectId(operationId);
    const manifest = await readManifest(operationId);
    if (manifest === undefined || manifest.status === 'rolled-back') return { operationId, status: 'rolled-back', projectsRemoved: 0, settingsRemoved: 0 };
    if (manifest.status !== 'completed' && manifest.status !== 'failed') throw new Error('Desktop migration is not rollbackable');
    const plan = plans.get(operationId);
    if (plan === undefined) throw new Error(`Unknown desktop migration operation: ${operationId}`);
    const projectById = new Map(plan.projects.map((project) => [project.meta.id, project]));
    let projectsRemoved = 0;
    for (const projectId of manifest.createdProjectIds) {
      const project = projectById.get(projectId);
      if (project === undefined) throw new Error(`Migration rollback project is unknown: ${projectId}`);
      await verifyTree(project.targetDirectory, project.files);
      await rm(project.targetDirectory, { recursive: true, force: true });
      projectsRemoved += 1;
    }
    let settingsRemoved = 0;
    for (const name of manifest.createdSettings) {
      const setting = plan.settings.find((candidate) => candidate.name === name);
      if (setting === undefined || !(await sameFile(setting.targetPath, setting.hash))) throw new Error(`Migration rollback setting changed: ${name}`);
      await rm(setting.targetPath, { force: true });
      settingsRemoved += 1;
    }
    await paths.restorePrevious?.();
    await writeManifest(join(resolve(paths.backupRoot), operationId), { ...manifest, status: 'rolled-back' });
    return { operationId, status: 'rolled-back', projectsRemoved, settingsRemoved };
  }

  return Object.freeze({ preview, execute, rollback, dispose: () => { disposed = true; plans.clear(); } });

  async function buildPlan(operationId = `migration-${randomUUID()}`): Promise<MigrationPlan> {
    validateProjectId(operationId);
    assertDistinctRoots();
    const sourceProjects = await inspectRoot(paths.legacyProjectsRoot);
    const sourceSettings = await inspectRoot(paths.legacySettingsRoot);
    const projects: ProjectPlan[] = [];
    const projectPreviews: DesktopMigrationProject[] = [];
    let invalidEntries = 0;
    if (sourceProjects === 'ready') {
      const entries = await readdir(resolve(paths.legacyProjectsRoot), { withFileTypes: true });
      for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
        try { validateProjectId(entry.name); }
        catch { invalidEntries += 1; continue; }
        try {
          const project = await inspectProject(entry.name);
          projects.push(project);
          projectPreviews.push(project.preview);
        } catch {
          invalidEntries += 1;
          projectPreviews.push(await invalidProjectPreview(entry.name));
        }
      }
    }
    const settings = sourceSettings === 'ready' ? await inspectSettings() : [];
    const sourceFingerprint = hashText(stableJson({ projects: projects.map((project) => ({ id: project.meta.id, hash: project.sourceHash })), settings: settings.map((setting) => ({ name: setting.name, hash: setting.hash })) }));
    const hasWork = projects.length > 0 || settings.some((setting) => setting.preview.status === 'ready');
    const canExecute = sourceProjects !== 'unsafe' && sourceSettings !== 'unsafe' && invalidEntries === 0 && hasWork && projectPreviews.every((project) => project.status === 'ready') && settings.every((setting) => setting.preview.status === 'ready' || setting.preview.status === 'absent');
    return {
      preview: {
        operationId,
        sourceFingerprint,
        source: { projects: sourceProjects, settings: sourceSettings, projectCount: projectPreviews.length, invalidEntries },
        projects: projectPreviews,
        settings: {
          a2: settings.find((setting) => setting.name === A2_SETTINGS_FILE)?.preview ?? { status: 'absent', bytes: 0 },
          workbench: settings.find((setting) => setting.name === WORKBENCH_SETTINGS_FILE)?.preview ?? { status: 'absent', bytes: 0 },
        },
        backup: { planned: true },
        canExecute,
        confirmation: null,
      },
      projects,
      settings,
    };
  }

  async function inspectProject(projectId: string): Promise<ProjectPlan> {
    const sourceDirectory = join(resolve(paths.legacyProjectsRoot), projectId);
    const targetDirectory = join(resolve(paths.libraryRoot), projectId);
    const files = await collectFiles(sourceDirectory);
    const metaFile = files.find((file) => file.relativePath === 'project.yaml');
    if (metaFile === undefined) throw new Error('missing-project-metadata');
    const meta = projectMetaSchema.parse(await readYamlFile(metaFile.absolutePath));
    if (meta.id !== projectId) throw new Error('invalid-project-metadata');
    await validateCanonicalProject(sourceDirectory, files);
    const sourceHash = hashFiles(files);
    const targetExists = await pathExists(targetDirectory);
    const status = targetExists ? 'conflict' as const : 'ready' as const;
    return {
      meta,
      sourceDirectory,
      targetDirectory,
      files,
      sourceHash,
      preview: { id: meta.id, name: meta.name, status, fileCount: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0), sourceHash, ...(targetExists ? { issue: 'destination-conflict' as const } : {}) },
    };
  }

  async function invalidProjectPreview(projectId: string): Promise<DesktopMigrationProject> {
    const sourceDirectory = join(resolve(paths.legacyProjectsRoot), projectId);
    try {
      const files = await collectFiles(sourceDirectory);
      const metaFile = files.find((file) => file.relativePath === 'project.yaml');
      let name = projectId;
      if (metaFile !== undefined) {
        const raw = await readYamlFile(metaFile.absolutePath);
        if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof (raw as { name?: unknown }).name === 'string') name = (raw as { name: string }).name;
      }
      const safeName = name.trim().slice(0, 200) || '损坏作品';
      return { id: projectId, name: safeName, status: 'corrupt', fileCount: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0), issue: 'invalid-canonical-document' };
    } catch {
      return { id: projectId, name: projectId, status: 'corrupt', fileCount: 0, bytes: 0, issue: 'unsafe-source' };
    }
  }

  async function inspectSettings(): Promise<SettingPlan[]> {
    const results: SettingPlan[] = [];
    for (const name of MIGRATABLE_SETTINGS) {
      const sourcePath = join(resolve(paths.legacySettingsRoot), name);
      const targetPath = join(resolve(paths.settingsRoot), name);
      if (!await pathExists(sourcePath)) {
        results.push({ name, sourcePath, targetPath, bytes: 0, hash: hashText(''), preview: { status: 'absent', bytes: 0 } });
        continue;
      }
      const stat = await lstat(sourcePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        results.push({ name, sourcePath, targetPath, bytes: 0, hash: hashText(''), preview: { status: 'corrupt', bytes: 0, issue: 'unsafe-source' } });
        continue;
      }
      const content = await readFile(sourcePath);
      const hash = hashBuffer(content);
      try {
        const parsed = load(content.toString('utf8'));
        if (name === A2_SETTINGS_FILE) A2SettingsSchema.parse(parsed);
        else workbenchSettingsSchema.parse(parsed);
      } catch {
        results.push({ name, sourcePath, targetPath, bytes: content.byteLength, hash, preview: { status: 'corrupt', bytes: content.byteLength, sourceHash: hash, issue: 'invalid-canonical-document' } });
        continue;
      }
      const targetHash = await fileHash(targetPath);
      const conflict = targetHash !== undefined && targetHash !== hash;
      results.push({ name, sourcePath, targetPath, bytes: content.byteLength, hash, preview: { status: conflict ? 'conflict' : 'ready', bytes: content.byteLength, sourceHash: hash, ...(conflict ? { issue: 'destination-conflict' as const } : {}) } });
    }
    return results;
  }

  async function copyPlanToBackup(plan: MigrationPlan, operationDirectory: string): Promise<void> {
    const backupProjects = join(operationDirectory, 'projects');
    const backupSettings = join(operationDirectory, 'settings');
    await ensureDirectory(backupProjects);
    await ensureDirectory(backupSettings);
    for (const project of plan.projects) await copyTree(project.sourceDirectory, join(backupProjects, project.meta.id));
    for (const setting of plan.settings) if (setting.preview.status === 'ready') await copyFile(setting.sourcePath, join(backupSettings, setting.name));
  }

  async function verifyCopied(plan: MigrationPlan): Promise<void> {
    for (const project of plan.projects) {
      const files = await collectFiles(project.targetDirectory);
      if (hashFiles(files) !== project.sourceHash) throw new Error(`Migration hash verification failed: ${project.meta.id}`);
      await validateCanonicalProject(project.targetDirectory, files);
    }
    for (const setting of plan.settings) if (setting.preview.status === 'ready' && !(await sameFile(setting.targetPath, setting.hash))) throw new Error(`Migration settings hash verification failed: ${setting.name}`);
  }

  async function removeCreatedTargets(plan: MigrationPlan, projectIds: readonly string[], settingNames: readonly string[]): Promise<void> {
    for (const projectId of projectIds) {
      const project = plan.projects.find((candidate) => candidate.meta.id === projectId);
      if (project) await rm(project.targetDirectory, { recursive: true, force: true });
    }
    for (const name of settingNames) {
      const setting = plan.settings.find((candidate) => candidate.name === name);
      if (setting && await sameFile(setting.targetPath, setting.hash)) await rm(setting.targetPath, { force: true });
    }
  }

  async function readManifest(operationId: string): Promise<MigrationManifest | undefined> {
    try { return manifestSchema.parse(JSON.parse(await readFile(join(resolve(paths.backupRoot), operationId, 'manifest.json'), 'utf8'))); }
    catch (error) { if (isMissing(error)) return undefined; throw new Error('Invalid desktop migration manifest', { cause: error }); }
  }

  function assertDistinctRoots(): void {
    const source = resolve(paths.legacyProjectsRoot);
    const target = resolve(paths.libraryRoot);
    if (source === target || isWithin(source, target) || isWithin(target, source)) throw new Error('Legacy and desktop library roots must be separate');
  }
}

function executionFromManifest(manifest: MigrationManifest): DesktopMigrationExecution {
  return { operationId: manifest.operationId, status: 'completed', sourceFingerprint: manifest.sourceFingerprint, projectsCopied: manifest.projectsCopied, projectsSkipped: manifest.projectsSkipped, settingsCopied: manifest.settingsCopied, settingsSkipped: manifest.settingsSkipped, backupManifestHash: manifest.backupManifestHash };
}

async function validateCanonicalProject(directory: string, files: readonly SourceFile[]): Promise<void> {
  const byPath = new Map(files.map((file) => [file.relativePath, file]));
  const readOptional = async (path: string): Promise<unknown | undefined> => {
    const file = byPath.get(path);
    return file === undefined ? undefined : load(await readFile(file.absolutePath, 'utf8'));
  };
  const meta = await readOptional('project.yaml');
  projectMetaSchema.parse(meta);
  const style = await readOptional('style.yaml');
  if (style !== undefined && !isEmptyDocument(style)) styleProfileSchema.parse(style);
  const outline = await readOptional('outline.yaml');
  if (outline !== undefined && !isEmptyDocument(outline)) {
    outlineSchema.parse(outline);
    await new OutlineRepository(directory).read();
  }
  const progress = await readOptional('outline-progress.yaml');
  if (progress !== undefined) outlineProgressSchema.parse(progress);
  const relationships = await readOptional('relationships.yaml');
  if (relationships !== undefined) {
    const parsed = relationshipSchema.array().parse(relationships);
    assertRelationshipStructure(parsed);
  }
  const knowledge = await readOptional('knowledge.yaml');
  if (knowledge !== undefined) {
    if (!knowledge || typeof knowledge !== 'object' || Array.isArray(knowledge)) throw new Error('knowledge');
    const entries = knowledgeEntrySchema.array().parse((knowledge as { entries?: unknown }).entries);
    const states = knowledgeStateSchema.array().parse((knowledge as { states?: unknown }).states);
    assertKnowledgeStructure(entries, states);
  }
  const confirmations = await readOptional('confirmations.yaml');
  if (confirmations !== undefined) confirmationFileSchema.parse(confirmations);
  const snapshots = await readOptional('state/snapshots.yaml');
  if (snapshots !== undefined) {
    const parsed = stateSnapshotFileSchema.parse(snapshots);
    for (let index = 1; index < parsed.snapshots.length; index += 1) if (parsed.snapshots[index].seq <= parsed.snapshots[index - 1].seq) throw new Error('state sequence');
  }
  for (const file of files) {
    if (file.relativePath.startsWith('rules/') && file.relativePath.endsWith('.yaml')) ruleSchema.parse(await readYamlFile(file.absolutePath));
    if (file.relativePath.startsWith('characters/') && file.relativePath.endsWith('.yaml')) characterCoreSchema.parse(await readYamlFile(file.absolutePath));
    if (file.relativePath.startsWith('worldview/') && file.relativePath.endsWith('.yaml')) worldEntrySchema.parse(await readYamlFile(file.absolutePath));
    if (file.relativePath.startsWith('text/') && file.relativePath.endsWith('.json')) parseChapterDocument(await readFile(file.absolutePath, 'utf8'));
    if (file.relativePath === 'canon/canon.jsonl') {
      const lines = (await readFile(file.absolutePath, 'utf8')).split('\n').filter((line) => line.trim() !== '');
      const ids = new Set<string>();
      let sequence = 0;
      for (const line of lines) {
        const event = canonEventSchema.parse(JSON.parse(line));
        if (event.seq !== sequence || ids.has(event.id)) throw new Error('canon sequence');
        if (event.supersedes !== undefined && !ids.has(event.supersedes)) throw new Error('canon supersedes');
        ids.add(event.id);
        sequence += 1;
      }
    }
  }
}

async function collectFiles(root: string, prefix = ''): Promise<SourceFile[]> {
  const stat = await lstat(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('unsafe-source');
  const entries = (await readdir(root, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
  const files: SourceFile[] = [];
  for (const entry of entries) {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error('unsafe-source');
    if (entry.isDirectory()) files.push(...await collectFiles(absolutePath, relativePath));
    else if (entry.isFile()) {
      if (entry.name.endsWith('.tmp') || entry.name.endsWith('.init.tmp')) throw new Error('unsafe-source');
      const content = await readFile(absolutePath);
      files.push({ absolutePath, relativePath, bytes: content.byteLength, hash: hashBuffer(content) });
    } else throw new Error('unsafe-source');
  }
  return files;
}

async function inspectRoot(input: string): Promise<'missing' | 'ready' | 'unsafe'> {
  if (!isAbsolute(input)) throw new Error('Migration source root must be absolute');
  try {
    const stat = await lstat(resolve(input));
    return stat.isDirectory() && !stat.isSymbolicLink() ? 'ready' : 'unsafe';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}

async function readYamlFile(path: string): Promise<unknown> { return load(await readFile(path, 'utf8')); }
function isEmptyDocument(value: unknown): boolean { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0; }
function hashBuffer(value: Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function hashText(value: string): string { return hashBuffer(Buffer.from(value, 'utf8')); }
function hashFiles(files: readonly SourceFile[]): string { return hashText(files.map((file) => `${file.relativePath}\0${file.bytes}\0${file.hash}`).join('\n')); }
function stableJson(value: unknown): string { return JSON.stringify(value); }
async function pathExists(path: string): Promise<boolean> { try { await lstat(path); return true; } catch (error) { if (isMissing(error)) return false; throw error; } }
async function fileHash(path: string): Promise<string | undefined> { try { const stat = await lstat(path); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe target'); return hashBuffer(await readFile(path)); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; } }
async function sameFile(path: string, hash: string): Promise<boolean> { return (await fileHash(path)) === hash; }
async function ensureDirectory(path: string): Promise<void> { await mkdir(path, { recursive: true }); const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe migration target'); }
async function ensureMissingOrDirectory(path: string): Promise<void> { if (await pathExists(path)) { const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe migration backup'); } else await mkdir(path, { recursive: true }); }
async function copyFile(source: string, target: string): Promise<void> { await ensureDirectory(resolve(target, '..')); await writeFile(target, await readFile(source)); }
async function copyTree(source: string, target: string): Promise<void> { await ensureDirectory(target); const entries = (await readdir(source, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name)); for (const entry of entries) { const sourceChild = join(source, entry.name); const targetChild = join(target, entry.name); if (entry.isSymbolicLink()) throw new Error('unsafe-source'); if (entry.isDirectory()) await copyTree(sourceChild, targetChild); else if (entry.isFile()) await copyFile(sourceChild, targetChild); else throw new Error('unsafe-source'); } }
async function verifyTree(directory: string, expected: readonly SourceFile[]): Promise<void> { const actual = await collectFiles(directory); if (actual.length !== expected.length || actual.some((file, index) => file.relativePath !== expected[index].relativePath || file.hash !== expected[index].hash)) throw new Error('Migration rollback target changed'); }
async function writeManifest(directory: string, value: MigrationManifest): Promise<void> { const path = join(directory, 'manifest.json'); const temp = `${path}.tmp`; await writeFile(temp, `${JSON.stringify(value)}\n`, 'utf8'); await rename(temp, path); }
function isMissing(error: unknown): boolean { return error !== null && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ENOENT'; }
function isWithin(root: string, target: string): boolean { const rel = relative(root, target); return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); }
