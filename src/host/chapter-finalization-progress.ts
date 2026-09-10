import { z } from 'zod';
import { outlineProgressSchema } from '../core/schema/outline-progress.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import { nextProgress } from './outline-reconciliation-service.js';
import { structuralPreviewFingerprint as fingerprint } from './writing-adjudication/structural-preview-plan.js';

/** Frozen chapter progress, part of the same I11 decision; no changes to B5 semantics. */
export const chapterProgressPlanSchema = z.object({
  outlineFingerprint: z.string(), bindingFingerprint: z.string(), before: outlineProgressSchema, after: outlineProgressSchema,
}).strict();
export interface ChapterProgressOwners {
  readonly outline: NovelOutlineService;
  readonly binding: NovelSceneOutlineBindingService;
}

/** Only saved nonempty scenes identify owned beats. Other cards/beat states are not inferred from chapter names. */
export async function prepareChapterProgress(owners: ChapterProgressOwners, projectId: string, chapterId: string, sceneIds: readonly string[]) {
  const binding = await owners.binding.read(projectId);
  const ownedCards = new Set(binding.effective.filter(item => item.chapterId === chapterId && sceneIds.includes(item.sceneId)).map(item => item.detailBeatId));
  if (ownedCards.size === 0) return null;
  const outline = await owners.outline.read(projectId);
  const before = await owners.outline.readProgress(projectId);
  let after = before;
  for (const act of [...outline.acts].sort((a, b) => a.index - b.index || a.id.localeCompare(b.id))) {
    for (const beat of act.beats) {
      if (beat.detailBeats.some(card => ownedCards.has(card.id))) after = nextProgress(outline, after, beat.id);
    }
  }
  return chapterProgressPlanSchema.parse({ outlineFingerprint: await owners.outline.contentFingerprint(projectId), bindingFingerprint: binding.fingerprint, before, after });
}

/** A resumed accepted plan may observe its own completed progress; unrelated changes reject stale application. */
export async function chapterProgressFresh(owners: ChapterProgressOwners, projectId: string, plan: z.infer<typeof chapterProgressPlanSchema>, accepted: boolean): Promise<boolean> {
  if (await owners.outline.contentFingerprint(projectId) !== plan.outlineFingerprint || (await owners.binding.read(projectId)).fingerprint !== plan.bindingFingerprint) return false;
  const current = fingerprint(await owners.outline.readProgress(projectId));
  return current === fingerprint(plan.before) || (accepted && current === fingerprint(plan.after));
}
