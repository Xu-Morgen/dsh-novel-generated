import { access, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { projectMetaSchema, type ProjectMeta } from '../schema/base.js';
import { assertContained, projectDirectory, validateProjectId } from '../io/path.js';
import { readYaml, writeYaml } from '../io/yaml.js';

export const PROJECT_DIRECTORIES = [
  'rules', 'worldview', 'characters', 'relationships', 'state', 'knowledge', 'canon', 'text',
] as const;

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
}
