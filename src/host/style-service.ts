import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { StyleRepository } from '../core/style/index.js';
import type {
  ConstantStyleSegment,
  StyleProfile,
  StyleProfileInput,
} from '../core/schema/style.js';

/**
 * Host-only B4 facade. It exposes validated style data, never project file
 * paths, so Client and future assemblers use the same host-owned source.
 */
export interface NovelStyleService {
  open(projectId: string): Promise<void>;
  save(projectId: string, input: StyleProfileInput): Promise<StyleProfile>;
  read(projectId: string): Promise<StyleProfile>;
  forbiddenExpressions(projectId: string): Promise<string[]>;
  constantSegment(projectId: string): Promise<ConstantStyleSegment>;
}

/** Host facade for I10 B4 global style-profile storage (design §5.6 / §10.1). */
export function createStyleService(
  projectsRoot = join(homedir(), '.dsh', 'novel-projects'),
): NovelStyleService {
  const repositories = new Map<string, StyleRepository>();
  const get = (projectId: string): StyleRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Style project is not open: ${projectId}`);
    return repository;
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      const repository = new StyleRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    save: (projectId, input) => get(projectId).save(input),
    read: (projectId) => get(projectId).read(),
    forbiddenExpressions: (projectId) => get(projectId).forbiddenExpressions(),
    constantSegment: (projectId) => get(projectId).constantSegment(),
  };
}
