import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import {
  TextLinkIndexRepository,
  buildTextLinkIndex,
  invalidateTextLinkIndex,
  rebuildTextLinkIndex,
  type TextLinkBuildResult,
  type TextLinkIndexFile,
  type TextLinkSource,
} from '../core/link/index.js';
import type { TextChangedEvent } from '../core/text/repository.js';
import type { NovelTextService } from './text-service.js';

/**
 * Host owner for the rebuildable text-link index (design §14.14.2 / R18-8c).
 *
 * C5 is read through `NovelTextService`; this service never edits chapters and
 * treats an index invalidation as best-effort derived state. A stale index is
 * not used as a range fallback: callers must rebuild it from current prose.
 */
export interface NovelLinkIndexService {
  open(projectId: string): Promise<void>;
  build(projectId: string, sources: readonly TextLinkSource[]): Promise<TextLinkBuildResult>;
  rebuild(projectId: string): Promise<TextLinkBuildResult>;
  load(projectId: string): Promise<TextLinkIndexFile | undefined>;
  drop(projectId: string): Promise<boolean>;
  /** Mark every anchor stale after a successful C5 edit; never blocks C5. */
  invalidate(projectId: string, change?: TextChangedEvent): Promise<boolean>;
}

export interface LinkIndexServiceDeps {
  readonly projectsRoot?: string;
  readonly text: Pick<NovelTextService, 'listChapters'>;
}

export function createLinkIndexService(deps: LinkIndexServiceDeps): NovelLinkIndexService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const repositories = new Map<string, TextLinkIndexRepository>();
  const get = (projectId: string): TextLinkIndexRepository => {
    validateProjectId(projectId);
    let repository = repositories.get(projectId);
    if (repository === undefined) {
      repository = new TextLinkIndexRepository(projectDirectory(projectsRoot, projectId));
      repositories.set(projectId, repository);
    }
    return repository;
  };

  return Object.freeze({
    async open(projectId: string) {
      get(projectId);
    },
    async build(projectId: string, sources: readonly TextLinkSource[]) {
      const result = buildTextLinkIndex(projectId, await deps.text.listChapters(projectId), sources);
      await get(projectId).build(result.index);
      return result;
    },
    async rebuild(projectId: string) {
      const previous = await get(projectId).load();
      if (previous === undefined) throw new Error('文本链接索引不存在：请先构建派生索引');
      const result = rebuildTextLinkIndex(projectId, await deps.text.listChapters(projectId), previous);
      await get(projectId).build(result.index);
      return result;
    },
    load: (projectId: string) => get(projectId).load(),
    drop: (projectId: string) => get(projectId).drop(),
    async invalidate(projectId: string, _change?: TextChangedEvent) {
      const repository = get(projectId);
      const current = await repository.load();
      if (current === undefined) return false;
      await repository.build(invalidateTextLinkIndex(current));
      return true;
    },
  });
}

