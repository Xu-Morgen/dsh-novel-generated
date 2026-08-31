import { createHash } from 'node:crypto';
import { outlineContentFingerprint } from '../core/outline/index.js';
import {
  OUTLINE_GENERATION_SCOPE_MAX_NEW_DETAIL_BEATS,
  outlineGenerationScopeInputSchema,
  OUTLINE_GENERATION_SCOPE_PAGE_MAX_TARGET_BEATS,
  outlineGenerationScopeResultSchema,
  type OutlineGenerationScopeInput,
  type OutlineGenerationScopeResult,
  type OutlineGenerationScopeTarget,
} from '../core/schema/outline-generation-scope.js';
import type { Outline, OutlineBeatCard } from '../core/schema/outline.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelTextService } from './text-service.js';

/** I133 Host owner for resolving author scope into a bounded, freshness-locked B5 set. */
export interface NovelOutlineGenerationScopeService {
  resolve(projectId: string, input: OutlineGenerationScopeInput): Promise<OutlineGenerationScopeResult>;
}

function cardFingerprint(card: OutlineBeatCard): string {
  return createHash('sha256').update(JSON.stringify({ actId: card.actId, beatId: card.beatId, detailBeat: card.detailBeat }), 'utf8').digest('hex');
}

function orderedTargets(
  outline: Outline,
  cards: readonly OutlineBeatCard[],
  allowedBeatIds?: ReadonlySet<string>,
  allowedDetailBeatIds?: ReadonlySet<string>,
): OutlineGenerationScopeTarget[] {
  const cardById = new Map(cards.map((card) => [card.detailBeat.id, card]));
  const targets: OutlineGenerationScopeTarget[] = [];
  const seenBeats = new Set<string>();
  for (const [, act] of outline.acts.map((value, index) => [index, value] as const).sort((left, right) => left[1].index - right[1].index || left[1].id.localeCompare(right[1].id))) {
    for (const [beatIndex, beat] of act.beats.entries()) {
      if (allowedBeatIds !== undefined && !allowedBeatIds.has(beat.id)) continue;
      if (seenBeats.has(beat.id)) throw new Error(`Duplicate outline beat target: ${beat.id}`);
      seenBeats.add(beat.id);
      const beatCards = beat.detailBeats.flatMap((detailBeat, detailBeatIndex) => {
        if (allowedDetailBeatIds !== undefined && !allowedDetailBeatIds.has(detailBeat.id)) return [];
        const card = cardById.get(detailBeat.id);
        if (card === undefined || card.actId !== act.id || card.beatId !== beat.id) throw new Error(`Outline card target mismatch: ${detailBeat.id}`);
        return [{ detailBeatId: detailBeat.id, detailBeatIndex, fingerprint: cardFingerprint(card), detailBeat: structuredClone(detailBeat) }];
      });
      if (allowedDetailBeatIds !== undefined && beatCards.length === 0) continue;
      targets.push({ actId: act.id, actIndex: act.index, beatId: beat.id, beatIndex, cards: beatCards });
    }
  }
  return targets;
}

function protection(targets: readonly OutlineGenerationScopeTarget[]) {
  const actIds = [...new Set(targets.map((target) => target.actId))];
  const beatIds = targets.map((target) => target.beatId);
  const detailBeatIds = targets.flatMap((target) => target.cards.map((card) => card.detailBeatId));
  return { actIds, beatIds, detailBeatIds, preserveStableIds: true as const, preserveOrder: true as const, outsideScopeWritable: false as const };
}

function blocked(projectId: string, scope: OutlineGenerationScopeInput, reason: 'outline-unavailable' | 'empty-scope' | 'chapter-unbound' | 'cross-project-binding' | 'stale-b5'): OutlineGenerationScopeResult {
  const page = scope.page ?? { offset: 0, limit: OUTLINE_GENERATION_SCOPE_PAGE_MAX_TARGET_BEATS };
  return outlineGenerationScopeResultSchema.parse({
    projectId, scope, b5ContentFingerprint: '0'.repeat(64), readiness: 'cannot-generate', targets: [], targetBeatCount: 0, targetDetailBeatCount: 0,
    protectedSet: { actIds: [], beatIds: [], detailBeatIds: [], preserveStableIds: true, preserveOrder: true, outsideScopeWritable: false },
    mutationBudget: { maxNewDetailBeats: 0, allowExistingReplacement: false, allowReorder: false, allowScopeExpansion: false },
    page: { ...page, nextOffset: null, totalTargetBeatCount: 0, totalTargetDetailBeatCount: 0 }, blockReason: reason,
  });
}

/**
 * Resolve once from live owners. The result contains no prose and performs no
 * mutation; a future generator must carry the returned B5 fingerprint and obey
 * its protected set/budget (design §14.14.2, R18-12a).
 */
export function createOutlineGenerationScopeService(deps: {
  readonly text: Pick<NovelTextService, 'listChapters'>;
  readonly outline: Pick<NovelOutlineService, 'read' | 'contentFingerprint'> & Partial<Pick<NovelOutlineService, 'readiness'>>;
  readonly binding: Pick<NovelSceneOutlineBindingService, 'read'>;
}): NovelOutlineGenerationScopeService {
  return {
    async resolve(projectId, rawInput) {
      const scope = outlineGenerationScopeInputSchema.parse(rawInput);
      const readiness = deps.outline.readiness === undefined ? 'ready' : await deps.outline.readiness(projectId);
      if (readiness !== 'ready') return blocked(projectId, scope, 'outline-unavailable');
      let outline: Outline;
      try {
        const beforeFingerprint = await deps.outline.contentFingerprint(projectId);
        outline = await deps.outline.read(projectId);
        const afterReadFingerprint = await deps.outline.contentFingerprint(projectId);
        const readFingerprint = outlineContentFingerprint(outline);
        if (beforeFingerprint !== afterReadFingerprint || afterReadFingerprint !== readFingerprint) return blocked(projectId, scope, 'stale-b5');
      } catch (cause) {
        if (cause instanceof Error && /uninitialized|invalid outline|not found|enoent/i.test(cause.message)) return blocked(projectId, scope, 'outline-unavailable');
        throw cause;
      }
      const b5ContentFingerprint = outlineContentFingerprint(outline);
      let allowedBeatIds: Set<string> | undefined;
      let allowedDetailBeatIds: Set<string> | undefined;
      if (scope.kind === 'act') {
        const act = outline.acts.find((item) => item.id === scope.actId);
        if (act === undefined) throw new Error(`Unknown outline act: ${scope.actId}`);
        allowedBeatIds = new Set(act.beats.map((beat) => beat.id));
      } else if (scope.kind === 'outline-beat') {
        const beat = outline.acts.flatMap((act) => act.beats).find((item) => item.id === scope.beatId);
        if (beat === undefined) throw new Error(`Unknown outline beat: ${scope.beatId}`);
        allowedBeatIds = new Set([beat.id]);
      } else if (scope.kind === 'bound-chapter') {
        const chapter = (await deps.text.listChapters(projectId)).find((item) => item.id === scope.chapterId);
        if (chapter === undefined) throw new Error(`Unknown chapter: ${scope.chapterId}`);
        if (chapter.scenes.length === 0) return blocked(projectId, scope, 'chapter-unbound');
        const binding = await deps.binding.read(projectId);
        const sceneIds = new Set(chapter.scenes.map((scene) => scene.id));
        const chapterBindings = binding.effective.filter((item) => sceneIds.has(item.sceneId));
        if (chapterBindings.some((item) => item.chapterId !== scope.chapterId)) return blocked(projectId, scope, 'cross-project-binding');
        const boundSceneIds = new Set(chapterBindings.map((item) => item.sceneId));
        if (boundSceneIds.size !== sceneIds.size) return blocked(projectId, scope, 'chapter-unbound');
        const cardIds = new Set(chapterBindings.map((item) => item.detailBeatId));
        const cards = outline.acts.flatMap((act) => act.beats.flatMap((beat) => beat.detailBeats.map((detailBeat) => ({ actId: act.id, beatId: beat.id, detailBeat }))));
        const missing = [...cardIds].filter((id) => !cards.some((card) => card.detailBeat.id === id));
        if (missing.length > 0) return blocked(projectId, scope, 'cross-project-binding');
        allowedDetailBeatIds = cardIds;
      }
      const cards: OutlineBeatCard[] = outline.acts.flatMap((act) => act.beats.flatMap((beat) => beat.detailBeats.map((detailBeat) => ({ actId: act.id, beatId: beat.id, beatTitle: beat.title, detailBeat }))));
      const allTargets = orderedTargets(outline, cards, allowedBeatIds, allowedDetailBeatIds);
      if (allTargets.length === 0) return blocked(projectId, scope, 'empty-scope');
      const finalFingerprint = await deps.outline.contentFingerprint(projectId);
      if (finalFingerprint !== b5ContentFingerprint) return blocked(projectId, scope, 'stale-b5');
      const page = scope.page ?? { offset: 0, limit: OUTLINE_GENERATION_SCOPE_PAGE_MAX_TARGET_BEATS };
      const targets = allTargets.slice(page.offset, page.offset + page.limit);
      if (targets.length === 0) return blocked(projectId, scope, 'empty-scope');
      const targetDetailBeatCount = targets.reduce((sum, target) => sum + target.cards.length, 0);
      const totalTargetDetailBeatCount = allTargets.reduce((sum, target) => sum + target.cards.length, 0);
      const missingBeatCount = targets.filter((target) => target.cards.length === 0).length;
      const maxNewDetailBeats = Math.min(OUTLINE_GENERATION_SCOPE_MAX_NEW_DETAIL_BEATS, missingBeatCount * 8);
      const readinessValue = targetDetailBeatCount === 0 ? 'can-generate' : missingBeatCount > 0 ? 'fill-missing-only' : 'requires-explicit-regeneration';
      const nextOffset = page.offset + targets.length < allTargets.length ? page.offset + targets.length : null;
      return outlineGenerationScopeResultSchema.parse({
        projectId, scope, b5ContentFingerprint, readiness: readinessValue, targets, targetBeatCount: targets.length, targetDetailBeatCount,
        protectedSet: protection(targets), mutationBudget: { maxNewDetailBeats, allowExistingReplacement: false, allowReorder: false, allowScopeExpansion: false },
        page: { ...page, nextOffset, totalTargetBeatCount: allTargets.length, totalTargetDetailBeatCount },
      });
    },
  };
}
