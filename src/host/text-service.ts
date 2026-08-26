import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository, type TextRange } from '../core/text/index.js';
import type { AppendSceneInput, Chapter, CreateChapterInput, Scene } from '../core/schema/text.js';

export interface NovelTextService {
  open(projectId: string): Promise<void>;
  createChapter(projectId: string, input: CreateChapterInput): Promise<Chapter>;
  listChapters(projectId: string): Promise<Chapter[]>;
  readChapter(projectId: string, chapterId: string): Promise<Chapter>;
  appendScene(projectId: string, chapterId: string, input: AppendSceneInput): Promise<Scene>;
  replaceRange(projectId: string, chapterId: string, sceneId: string, range: TextRange, replacement: string): Promise<Scene>;
  readCompleteChapter(projectId: string, chapterId: string): Promise<string>;
}

/** Host facade for I6 C5 storage; callers never receive filesystem paths. */
export function createTextService(projectsRoot = join(homedir(), '.dsh', 'novel-projects')): NovelTextService {
  const repositories = new Map<string, TextRepository>();
  const get = (projectId: string): TextRepository => {
    validateProjectId(projectId);
    const repository = repositories.get(projectId);
    if (!repository) throw new Error(`Text project is not open: ${projectId}`);
    return repository;
  };
  return {
    async open(projectId) {
      validateProjectId(projectId);
      const repository = new TextRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    },
    createChapter: (projectId, input) => get(projectId).createChapter(input),
    listChapters: (projectId) => get(projectId).listChapters(),
    readChapter: (projectId, chapterId) => get(projectId).readChapter(chapterId),
    appendScene: (projectId, chapterId, input) => get(projectId).appendScene(chapterId, input),
    replaceRange: (projectId, chapterId, sceneId, range, replacement) => get(projectId).replaceRange(chapterId, sceneId, range, replacement),
    readCompleteChapter: (projectId, chapterId) => get(projectId).readCompleteChapter(chapterId),
  };
}
