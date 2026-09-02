import { access, lstat, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { projectMetaSchema, type ProjectMeta } from '../schema/base.js';
import { activeProjectDirectory, archivedProjectDirectory, assertContained, PROJECT_ARCHIVE_DIRECTORY, projectDirectory, validateProjectId } from '../io/path.js';
import { readYaml, writeYaml } from '../io/yaml.js';

export const PROJECT_DIRECTORIES = [
  'rules', 'worldview', 'characters', 'relationships', 'state', 'knowledge', 'canon', 'text',
] as const;
const ARCHIVE_TOMBSTONE_PREFIX = 'novel-creation-tool:archived:';

export interface CreateProjectInput { projectId: string; name: string }

/** Host-owned file project repository for the §10.1 source-of-truth tree. */
export class ProjectRepository {
  readonly projectsRoot: string;
  constructor(projectsRoot: string) { this.projectsRoot = resolve(projectsRoot); }

  async createProject(input: CreateProjectInput): Promise<ProjectMeta> {
    const projectId = validateProjectId(input.projectId);
    const directory = projectDirectory(this.projectsRoot, projectId);
    await mkdir(this.projectsRoot, { recursive: true });
    await assertContained(this.projectsRoot, this.projectsRoot);
    try {
      await access(directory);
      throw new Error(`Project already exists: ${projectId}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const meta = projectMetaSchema.parse({ id: projectId, version: 1, name: input.name });
    try {
      await mkdir(directory);
      await Promise.all(PROJECT_DIRECTORIES.map((name) => mkdir(join(directory, name))));
      await writeYaml(join(directory, 'project.yaml'), meta);
      await writeYaml(join(directory, 'style.yaml'), {});
      await writeYaml(join(directory, 'outline.yaml'), {});
      return meta;
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  /** Lists only safe immediate project directories. Missing roots are inert. */
  async listProjects(): Promise<ProjectMeta[]> {
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(this.projectsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const ids = entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((id) => {
        try { validateProjectId(id); return true; } catch { return false; }
      })
      .sort((left, right) => left.localeCompare(right));
    for (const id of ids) {
      const directory = projectDirectory(this.projectsRoot, id);
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe project directory: ${id}`);
    }
    return Promise.all(ids.map((id) => this.loadProject(id)));
  }

  async loadProject(projectId: string): Promise<ProjectMeta> {
    validateProjectId(projectId);
    const directory = projectDirectory(this.projectsRoot, projectId);
    await assertContained(this.projectsRoot, directory);
    const meta = projectMetaSchema.parse(await readYaml<unknown>(join(directory, 'project.yaml')));
    if (meta.id !== projectId) throw new Error(`Project metadata ID mismatch: ${projectId}`);
    return meta;
  }

  /** Lists archived works separately; callers must not expose them as openable projects. */
  async listArchivedProjects(): Promise<ProjectMeta[]> {
    const archiveRoot = join(this.projectsRoot, PROJECT_ARCHIVE_DIRECTORY);
    let entries: import('node:fs').Dirent[];
    try {
      entries = await readdir(archiveRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const ids = entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((id) => {
        try { validateProjectId(id); return true; } catch { return false; }
      })
      .sort((left, right) => left.localeCompare(right));
    return Promise.all(ids.map((id) => this.loadArchivedProject(id)));
  }

  /** Move one complete Host-owned project tree into the read-only archive. */
  async archiveProject(projectId: string): Promise<ProjectMeta> {
    const id = validateProjectId(projectId);
    const active = activeProjectDirectory(this.projectsRoot, id);
    const archived = archivedProjectDirectory(this.projectsRoot, id);
    const meta = await this.loadProject(id);
    await mkdir(join(this.projectsRoot, PROJECT_ARCHIVE_DIRECTORY), { recursive: true });
    await this.assertRealDirectory(join(this.projectsRoot, PROJECT_ARCHIVE_DIRECTORY), 'archive root');
    await this.assertMissing(archived, `Project is already archived: ${id}`);
    await rename(active, archived);
    try {
      await writeFile(active, `${ARCHIVE_TOMBSTONE_PREFIX}${id}\n`, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      await rename(archived, active).catch(() => undefined);
      throw error;
    }
    return meta;
  }

  /** Restore an archived tree to the active catalog without mutating its contents. */
  async restoreProject(projectId: string): Promise<ProjectMeta> {
    const id = validateProjectId(projectId);
    const active = activeProjectDirectory(this.projectsRoot, id);
    const archived = archivedProjectDirectory(this.projectsRoot, id);
    const meta = await this.loadArchivedProject(id);
    const hadTombstone = await this.removeArchiveTombstone(active, id);
    try {
      await rename(archived, active);
    } catch (error) {
      if (hadTombstone) await writeFile(active, `${ARCHIVE_TOMBSTONE_PREFIX}${id}\n`, { encoding: 'utf8', flag: 'wx' }).catch(() => undefined);
      throw error;
    }
    return meta;
  }

  private async loadArchivedProject(projectId: string): Promise<ProjectMeta> {
    const directory = archivedProjectDirectory(this.projectsRoot, projectId);
    await this.assertRealDirectory(directory, `archived project ${projectId}`);
    await assertContained(this.projectsRoot, directory);
    const meta = projectMetaSchema.parse(await readYaml<unknown>(join(directory, 'project.yaml')));
    if (meta.id !== projectId) throw new Error(`Project metadata ID mismatch: ${projectId}`);
    return meta;
  }

  private async assertMissing(path: string, message: string): Promise<void> {
    try {
      await access(path);
      throw new Error(message);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  private async assertRealDirectory(path: string, label: string): Promise<void> {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe ${label}`);
  }

  private async removeArchiveTombstone(path: string, projectId: string): Promise<boolean> {
    let stat: import('node:fs').Stats;
    try {
      stat = await lstat(path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Active project already exists: ${projectId}`);
    const marker = await readFile(path, 'utf8');
    if (marker !== `${ARCHIVE_TOMBSTONE_PREFIX}${projectId}\n`) throw new Error(`Active project already exists: ${projectId}`);
    await unlink(path);
    return true;
  }
}
