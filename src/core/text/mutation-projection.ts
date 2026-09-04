import { textContentHash } from './index.js';
import type { Chapter, Scene } from '../schema/text.js';
import type { ChapterMutationView, SceneMutationView } from '../schema/text-mutation.js';

/** Main-owned C5 chapter projection; prose and branch bodies never cross IPC. */
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

/** Main-owned C5 scene projection; content crosses only as a stable hash. */
export function toSceneMutationView(scene: Scene): SceneMutationView {
  return {
    id: scene.id,
    index: scene.index,
    summary: scene.summary,
    contentHash: textContentHash(scene.content),
    branchCount: scene.branches.length,
  };
}
