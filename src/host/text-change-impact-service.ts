import { createHash } from 'node:crypto';
import { textContentHash } from '../core/text/index.js';
import { buildTextChangeDelta, textChangeHash } from '../core/text-change-impact/index.js';
import {
  textChangeImpactPrepareInputSchema,
  textChangeImpactPrepareResultSchema,
  textChangeImpactReportSchema,
  textChangeImpactCancelResultSchema,
  type TextChangeImpactPrepareInput,
  type TextChangeImpactPrepareResult,
  type TextChangeImpactReport,
  type TextChangeImpactCancelResult,
  type TextChangeFutureCard,
} from '../core/schema/text-change-impact.js';
import type { NovelOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelTextServiceBundle } from './text-service.js';
import { classifyTextChangeImpact } from '../llm/analyze/text-change-impact.js';
import { asLlmBackend } from '../llm/port/index.js';
import type { GenerationSettings } from '../llm/port/index.js';

/** Host-owned zero-write impact analysis session. It never edits C5/B5/C6. */
export interface NovelTextChangeImpactService {
  prepare(projectId: string, input: TextChangeImpactPrepareInput, settings: GenerationSettings, signal?: AbortSignal): Promise<TextChangeImpactPrepareResult>;
  read(projectId: string, impactId: string): TextChangeImpactReport;
  cancel(projectId: string, impactId: string): Promise<TextChangeImpactCancelResult>;
}

interface ImpactSession {
  readonly projectId: string;
  readonly impactId: string;
  readonly controller: AbortController;
  status: 'running' | 'ready' | 'cancelled' | 'failed';
  report?: TextChangeImpactReport;
  error?: unknown;
}

function impactIdFor(baselineId: string, finalSourceHash: string): string {
  return `impact-${createHash('sha256').update(`${baselineId}\u0000${finalSourceHash}`, 'utf8').digest('hex').slice(0, 56)}`;
}

function assertCurrentSourceHash(actual: string, expected: string): void {
  if (actual !== expected) throw new Error('Text change impact finalSourceHash does not match current C5 scene');
}

function futureCardsAfterTarget(
  cards: readonly { actId: string; beatId: string; beatTitle: string; detailBeat: { id: string; title: string; summary: string; pov: string; status: string } }[],
  targetId: string,
): TextChangeFutureCard[] {
  const targetIndex = cards.findIndex((card) => card.detailBeat.id === targetId);
  if (targetIndex < 0) throw new Error(`Baseline detail beat is missing from current B5: ${targetId}`);
  return cards.map((card, index) => ({ card, index }))
    .filter(({ card, index }) => index > targetIndex && card.detailBeat.status === 'planned')
    .slice(0, 128)
    .map(({ card, index }) => ({
      detailBeatId: card.detailBeat.id,
      position: index,
      title: card.detailBeat.title,
      summary: card.detailBeat.summary,
      pov: card.detailBeat.pov,
    }));
}

/**
 * I112 owner: compare an I108 authoring base with the current C5 scene, apply
 * deterministic formatting/delta rules, then ask one isolated classifier only
 * for semantic changes. The result is a bounded read model for I113; no write
 * owner or ConfirmationGate is invoked (design §14.14.2 / R18-11b).
 */
export function createTextChangeImpactService(deps: {
  readonly llm: unknown;
  readonly text: Pick<NovelTextServiceBundle, 'readChapter'>;
  readonly outline: Pick<NovelOutlineService, 'contentFingerprint' | 'beatCards'>;
  readonly binding: Pick<NovelSceneOutlineBindingService, 'read'>;
  readonly baseline: Pick<NovelOutlineGenerationBaselineService, 'read'>;
  readonly resolveSettings?: () => Promise<unknown>;
  readonly onDispose?: (dispose: () => void) => void;
}): NovelTextChangeImpactService {
  const backend = asLlmBackend(deps.llm);
  const sessions = new Map<string, ImpactSession>();
  deps.onDispose?.(() => {
    for (const session of sessions.values()) session.controller.abort();
    sessions.clear();
  });

  const sessionFor = (projectId: string, impactId: string): ImpactSession => {
    const session = sessions.get(impactId);
    if (session === undefined || session.projectId !== projectId) throw new Error(`Unknown text change impact: ${impactId}`);
    return session;
  };

  const run = async (session: ImpactSession, input: TextChangeImpactPrepareInput, settings: GenerationSettings): Promise<TextChangeImpactReport> => {
    const baselineResult = await deps.baseline.read(session.projectId, input.baselineId);
    const baseline = baselineResult.baseline;
    if (baseline.projectId !== session.projectId) throw new Error(`Baseline belongs to another project: ${input.baselineId}`);
    if (baseline.status === 'superseded') throw new Error(`Cannot analyze superseded baseline: ${input.baselineId}`);
    const ownerStaleReasons = baselineResult.staleReasons.filter((reason) => reason !== 'source-changed');
    if (ownerStaleReasons.length > 0) throw new Error(`Stale text change impact baseline ${input.baselineId}: ${ownerStaleReasons.join(', ')}`);

    const chapter = await deps.text.readChapter(session.projectId, baseline.chapterId);
    const scene = chapter.scenes.find((item) => item.id === baseline.sceneId);
    if (scene === undefined) throw new Error(`Baseline scene is missing from current C5: ${baseline.sceneId}`);
    assertCurrentSourceHash(textContentHash(scene.content), input.finalSourceHash);
    if (textChangeHash(scene.content) !== input.finalSourceHash) throw new Error('Text change impact hash implementation mismatch');

    const [b5Fingerprint, binding] = await Promise.all([
      deps.outline.contentFingerprint(session.projectId),
      deps.binding.read(session.projectId),
    ]);
    if (b5Fingerprint !== baseline.b5ContentFingerprint) throw new Error(`Stale text change impact B5: ${input.baselineId}`);
    if (binding.fingerprint !== baseline.bindingFingerprint) throw new Error(`Stale text change impact binding: ${input.baselineId}`);
    const cards = await deps.outline.beatCards(session.projectId);
    const futureCards = futureCardsAfterTarget(cards, baseline.detailBeatId);
    const delta = buildTextChangeDelta(baseline.authoringBase.content, scene.content);
    const evidence = {
      sourceHash: delta.afterHash,
      beforeRange: delta.beforeRange,
      afterRange: delta.afterRange,
      beforeQuote: delta.beforeQuote,
      afterQuote: delta.afterQuote,
    };

    let classification: TextChangeImpactReport['classification'];
    let confidence: TextChangeImpactReport['confidence'];
    let reportEvidence: TextChangeImpactReport['evidence'];
    let affectedDetailBeatIds: string[];
    let rationale: string;
    if (delta.pureFormatting) {
      classification = 'wording-only';
      confidence = 'high';
      reportEvidence = [evidence];
      affectedDetailBeatIds = [];
      rationale = 'Only whitespace/formatting changed; semantic B5 impact analysis was not invoked.';
    } else {
      const parsed = await classifyTextChangeImpact(backend, {
        before: baseline.authoringBase.content,
        after: scene.content,
        delta,
        futureCards,
      }, settings, session.controller.signal);
      classification = parsed.classification;
      confidence = parsed.confidence;
      reportEvidence = parsed.evidence;
      affectedDetailBeatIds = parsed.affectedDetailBeatIds;
      rationale = parsed.rationale;
    }
    if (session.status === 'cancelled' || session.controller.signal.aborted) throw new Error(`Text change impact cancelled: ${session.impactId}`);
    return textChangeImpactReportSchema.parse({
      impactId: session.impactId, projectId: session.projectId, baselineId: baseline.baselineId,
      chapterId: baseline.chapterId, sceneId: baseline.sceneId,
      baselineSourceHash: baseline.authoringBase.sourceHash, finalSourceHash: input.finalSourceHash,
      delta, classification, confidence, evidence: reportEvidence,
      eligibleFutureDetailBeatIds: futureCards.map((card) => card.detailBeatId),
      affectedDetailBeatIds, rationale, analyzedAt: new Date().toISOString(),
    });
  };

  const service: NovelTextChangeImpactService = {
    async prepare(projectId: string, rawInput: TextChangeImpactPrepareInput, settings: GenerationSettings, signal?: AbortSignal) {
      const input = textChangeImpactPrepareInputSchema.parse(rawInput);
      const impactId = impactIdFor(input.baselineId, input.finalSourceHash);
      const existing = sessions.get(impactId);
      if (existing?.status === 'ready' && existing.report !== undefined) return { impactId, status: 'ready' as const };
      if (existing?.status === 'cancelled') throw new Error(`Text change impact is cancelled: ${impactId}`);
      if (existing?.status === 'running') throw new Error(`Text change impact is already running: ${impactId}`);
      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      const session: ImpactSession = { projectId, impactId, controller, status: 'running' };
      sessions.set(impactId, session);
      try {
        session.report = await run(session, input, settings);
        session.status = 'ready';
        return textChangeImpactPrepareResultSchema.parse({ impactId, status: 'ready' });
      } catch (error) {
        session.error = error;
        session.status = controller.signal.aborted ? 'cancelled' : 'failed';
        throw error;
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
      }
    },
    read(projectId: string, impactId: string) {
      const session = sessionFor(projectId, impactId);
      if (session.status === 'ready' && session.report !== undefined) return session.report;
      if (session.status === 'failed') throw session.error instanceof Error ? session.error : new Error(`Text change impact failed: ${impactId}`);
      if (session.status === 'cancelled') throw new Error(`Text change impact cancelled: ${impactId}`);
      throw new Error(`Text change impact is not ready: ${impactId}`);
    },
    async cancel(projectId: string, impactId: string) {
      const session = sessionFor(projectId, impactId);
      session.controller.abort();
      session.status = 'cancelled';
      return textChangeImpactCancelResultSchema.parse({ impactId, status: 'cancelled' });
    },
  };
  return Object.freeze(service);
}
