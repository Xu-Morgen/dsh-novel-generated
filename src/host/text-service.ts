import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository, type TextChangedEvent, type TextDeleteImpact, type TextDeleteResult, type TextRange } from '../core/text/index.js';
import type { AppendSceneInput, Chapter, CreateChapterInput, Scene } from '../core/schema/text.js';
import type {
  ChapterCreateMutation,
  ChapterUpdateMutation,
  ProjectReorderMutation,
  SceneCreateMutation,
  SceneUpdateMutation,
} from '../core/schema/text-mutation.js';

export interface NovelTextService {
  open(projectId: string): Promise<void>;
  createChapter(projectId: string, input: CreateChapterInput): Promise<Chapter>;
  listChapters(projectId: string): Promise<Chapter[]>;
  readChapter(projectId: string, chapterId: string): Promise<Chapter>;
  appendScene(projectId: string, chapterId: string, input: AppendSceneInput): Promise<Scene>;
  replaceRange(projectId: string, chapterId: string, sceneId: string, range: TextRange, replacement: string): Promise<Scene>;
  readCompleteChapter(projectId: string, chapterId: string): Promise<string>;
}

/** I104 additive mutation port; kept separate so legacy NovelTextService mocks remain compatible. */
export interface NovelTextMutationService {
  projectFingerprint(projectId: string): Promise<string>;
  createChapterMutation(projectId: string, input: ChapterCreateMutation): Promise<{ chapter: Chapter; fingerprint: string }>;
  updateChapterMutation(projectId: string, input: ChapterUpdateMutation): Promise<{ chapter: Chapter; fingerprint: string }>;
  createSceneMutation(projectId: string, input: SceneCreateMutation): Promise<{ scene: Scene; fingerprint: string }>;
  updateSceneMutation(projectId: string, input: SceneUpdateMutation): Promise<{ scene: Scene; fingerprint: string }>;
  reorderProject(projectId: string, input: ProjectReorderMutation): Promise<{ chapters: Chapter[]; fingerprint: string }>;
  inspectChapterDelete(projectId: string, chapterId: string): Promise<TextDeleteImpact>;
  inspectSceneDelete(projectId: string, chapterId: string, sceneId: string): Promise<TextDeleteImpact>;
  /** Host-only until I106 adds impact orchestration and I11 confirmation. */
  deleteChapterPrimitive(projectId: string, chapterId: string, expectedFingerprint: string): Promise<TextDeleteResult>;
  /** Host-only until I106 adds impact orchestration and I11 confirmation. */
  deleteScenePrimitive(projectId: string, chapterId: string, sceneId: string, expectedFingerprint: string): Promise<TextDeleteResult>;
}

export type NovelTextServiceBundle = NovelTextService & NovelTextMutationService;

export interface TextServiceOptions {
  /** Optional derived-view invalidation hook; it is never allowed to veto C5. */
  readonly onTextChanged?: (projectId: string, change: TextChangedEvent) => void | Promise<void>;
}

/** Host facade for I6 C5 storage; callers never receive filesystem paths. */
export function createTextService(projectsRoot = join(homedir(), '.dsh', 'novel-projects'), options: TextServiceOptions = {}): NovelTextServiceBundle {
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
      const repository = new TextRepository(projectDirectory(projectsRoot, projectId), {
        onTextChanged: (change) => options.onTextChanged?.(projectId, change),
      });
      await repository.open();
      repositories.set(projectId, repository);
    },
    createChapter: (projectId, input) => get(projectId).createChapter(input),
    listChapters: (projectId) => get(projectId).listChapters(),
    readChapter: (projectId, chapterId) => get(projectId).readChapter(chapterId),
    appendScene: (projectId, chapterId, input) => get(projectId).appendScene(chapterId, input),
    replaceRange: (projectId, chapterId, sceneId, range, replacement) => get(projectId).replaceRange(chapterId, sceneId, range, replacement),
    readCompleteChapter: (projectId, chapterId) => get(projectId).readCompleteChapter(chapterId),
    projectFingerprint: (projectId) => get(projectId).projectFingerprint(),
    createChapterMutation: (projectId, input) => get(projectId).createChapterAt({
      id: input.id, index: input.index, title: input.title, pov: input.pov, status: input.status,
    }, input.expectedFingerprint),
    updateChapterMutation: (projectId, input) => get(projectId).updateChapterMetadata(input.chapterId, input.patch, input.expectedFingerprint),
    createSceneMutation: (projectId, input) => get(projectId).insertScene(input.chapterId, input.index, input.scene, input.expectedFingerprint),
    updateSceneMutation: (projectId, input) => get(projectId).updateSceneMetadata(input.chapterId, input.sceneId, input.patch, input.expectedFingerprint),
    reorderProject: (projectId, input) => get(projectId).reorderProject(input),
    inspectChapterDelete: (projectId, chapterId) => get(projectId).inspectChapterDelete(chapterId),
    inspectSceneDelete: (projectId, chapterId, sceneId) => get(projectId).inspectSceneDelete(chapterId, sceneId),
    deleteChapterPrimitive: (projectId, chapterId, expectedFingerprint) => get(projectId).deleteChapterPrimitive(chapterId, expectedFingerprint),
    deleteScenePrimitive: (projectId, chapterId, sceneId, expectedFingerprint) => get(projectId).deleteScenePrimitive(chapterId, sceneId, expectedFingerprint),
  };
}
