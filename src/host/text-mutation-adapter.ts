import { textContentHash } from '../core/text/index.js';
import type { Chapter, Scene } from '../core/schema/text.js';
import type { ChapterMutationView, SceneMutationView } from '../core/schema/text-mutation.js';
import { defineRemoteOnService } from './remote/shared.js';
import { textMutationInvocations } from './remote/text-mutation.js';
import type { NovelTextMutationService } from './text-service.js';

/** I104 minimal owned JSON chapter projection; no prose or branch bodies cross Remote. */
export function toChapterMutationView(chapter: Chapter): ChapterMutationView {
  return {
    id: chapter.id,
    index: chapter.index,
    title: chapter.title,
    pov: chapter.pov,
    status: chapter.status,
    sceneCount: chapter.scenes.length,
  };
}

/** I104 minimal owned JSON scene projection; content is represented only by SHA-256. */
export function toSceneMutationView(scene: Scene): SceneMutationView {
  return {
    id: scene.id,
    index: scene.index,
    summary: scene.summary,
    contentHash: textContentHash(scene.content),
    branchCount: scene.branches.length,
  };
}

/**
 * Explicit Domain→wire adapter for the additive `novelText` namespace.
 * Descriptor.service and Cordis service key remain `novelText`; wire aliases
 * decorate that same receiver so the real Host gateway resolves it, while all
 * legacy domain methods stay available to Host consumers.
 */
export function createTextMutationRemote(service: NovelTextMutationService) {
  return defineRemoteOnService('novelText', 'novelText', service, [
    { method: 'fingerprint', call: async (projectId: string) => ({ fingerprint: await service.projectFingerprint(projectId) }) },
    { method: 'chapterCreate', call: async (projectId: string, input: Parameters<NovelTextMutationService['createChapterMutation']>[1]) => {
      const result = await service.createChapterMutation(projectId, input);
      return { chapter: toChapterMutationView(result.chapter), fingerprint: result.fingerprint };
    } },
    { method: 'chapterUpdate', call: async (projectId: string, input: Parameters<NovelTextMutationService['updateChapterMutation']>[1]) => {
      const result = await service.updateChapterMutation(projectId, input);
      return { chapter: toChapterMutationView(result.chapter), fingerprint: result.fingerprint };
    } },
    { method: 'sceneCreate', call: async (projectId: string, input: Parameters<NovelTextMutationService['createSceneMutation']>[1]) => {
      const result = await service.createSceneMutation(projectId, input);
      return { chapterId: input.chapterId, scene: toSceneMutationView(result.scene), fingerprint: result.fingerprint };
    } },
    { method: 'sceneUpdate', call: async (projectId: string, input: Parameters<NovelTextMutationService['updateSceneMutation']>[1]) => {
      const result = await service.updateSceneMutation(projectId, input);
      return { chapterId: input.chapterId, scene: toSceneMutationView(result.scene), fingerprint: result.fingerprint };
    } },
    { method: 'reorder', call: async (projectId: string, input: Parameters<NovelTextMutationService['reorderProject']>[1]) => {
      const result = await service.reorderProject(projectId, input);
      return { chapters: result.chapters.map(toChapterMutationView), fingerprint: result.fingerprint };
    } },
  ], textMutationInvocations);
}
