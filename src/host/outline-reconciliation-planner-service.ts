import { createHash } from 'node:crypto';
import { textContentHash } from '../core/text/index.js';
import { assertTextChangeEvidence } from '../core/text-change-impact/index.js';
import { buildOutlineReconciliationDiff } from '../core/outline-reconciliation/index.js';
import {
  outlineReconciliationCancelResultSchema,
  outlineReconciliationPlanSchema,
  outlineReconciliationPrepareInputSchema,
  outlineReconciliationPrepareResultSchema,
  outlineReconciliationRegenerateOneInputSchema,
  outlineReconciliationRegenerateOneResultSchema,
  type OutlineReconciliationItem,
  type OutlineReconciliationPlan,
  type OutlineReconciliationPrepareInput,
  type OutlineReconciliationRegenerateOneInput,
} from '../core/schema/outline-reconciliation.js';
import type { OutlineBeatCard } from '../core/schema/outline.js';
import type { GenerationSettings } from '../llm/port/index.js';
import { asLlmBackend } from '../llm/port/index.js';
import { generateOutlineReconciliationSuggestions, type OutlineReconciliationParserInput } from '../llm/analyze/outline-reconciliation.js';
import type { NovelOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelTextServiceBundle } from './text-service.js';

/** Host-owned zero-write planner; I114 is the only future B5 writer. */
export interface NovelOutlineReconciliationPlannerService {
  prepare(projectId: string, input: OutlineReconciliationPrepareInput, settings: GenerationSettings, signal?: AbortSignal): Promise<OutlineReconciliationPlan>;
  regenerateOne(projectId: string, input: OutlineReconciliationRegenerateOneInput, settings: GenerationSettings, signal?: AbortSignal): Promise<OutlineReconciliationPlan>;
  read(projectId: string, planId: string): OutlineReconciliationPlan;
  cancel(projectId: string, planId: string): Promise<{ planId: string; status: 'cancelled' }>;
}

interface PlannerSession {
  readonly projectId: string;
  readonly planId: string;
  readonly report: OutlineReconciliationPrepareInput['report'];
  readonly controller: AbortController;
  status: 'running' | 'ready' | 'cancelled' | 'failed';
  plan?: OutlineReconciliationPlan;
  error?: unknown;
}

function planIdFor(projectId: string, reportId: string, b5ContentFingerprint: string, finalSourceHash: string): string {
  return `reconcile-${createHash('sha256').update(`${projectId}\u0000${reportId}\u0000${b5ContentFingerprint}\u0000${finalSourceHash}`, 'utf8').digest('hex').slice(0, 54)}`;
}

function futureCardsAfterTarget(cards: readonly OutlineBeatCard[], targetId: string): OutlineBeatCard[] {
  const targetIndex = cards.findIndex((card) => card.detailBeat.id === targetId);
  if (targetIndex < 0) throw new Error(`Baseline detail beat is missing from current B5: ${targetId}`);
  return cards.slice(targetIndex + 1).filter((card) => card.detailBeat.status === 'planned').slice(0, 128);
}

function cardInput(card: OutlineBeatCard): OutlineReconciliationParserInput['cards'][number] {
  return {
    detailBeatId: card.detailBeat.id, actId: card.actId, beatId: card.beatId,
    position: 0, title: card.detailBeat.title, summary: card.detailBeat.summary,
    pov: card.detailBeat.pov, wordTarget: card.detailBeat.wordTarget, points: [...card.detailBeat.points], status: 'planned',
  };
}

function parserCards(cards: readonly OutlineBeatCard[], allCards: readonly OutlineBeatCard[]): OutlineReconciliationParserInput['cards'] {
  return cards.map((card) => ({ ...cardInput(card), position: allCards.findIndex((item) => item.detailBeat.id === card.detailBeat.id) }));
}

function reportEvidence(report: PlannerSession['report'], before: string, after: string): void {
  if (report.delta.beforeHash !== textContentHash(before) || report.delta.afterHash !== textContentHash(after)) {
    throw new Error('Outline reconciliation report delta does not match baseline/current C5 text');
  }
  for (const evidence of report.evidence) assertTextChangeEvidence(before, after, report.finalSourceHash, evidence);
}

/** Build one canonical item while keeping detailBeat identity/status Host-owned. */
function buildItem(
  card: OutlineBeatCard,
  position: number,
  report: PlannerSession['report'],
  suggestion: { title: string; summary: string; pov: string; wordTarget: number; points: string[]; rationale: string },
  prior?: OutlineReconciliationItem,
): OutlineReconciliationItem {
  const before = structuredClone(card.detailBeat);
  const after = { ...before, title: suggestion.title, summary: suggestion.summary, pov: suggestion.pov, wordTarget: suggestion.wordTarget, points: [...suggestion.points] };
  return {
    detailBeatId: before.id, actId: card.actId, beatId: card.beatId, position,
    before, after, diff: buildOutlineReconciliationDiff(before, after),
    evidence: report.evidence.map((evidence) => ({ ...evidence, beforeRange: { ...evidence.beforeRange }, afterRange: { ...evidence.afterRange } })),
    allowedChoices: ['keep', 'ai', 'manual', 'pending'],
    choice: prior?.choice ?? 'pending',
    ...(prior?.manualValue === undefined ? {} : { manualValue: structuredClone(prior.manualValue) }),
    rationale: suggestion.rationale,
  };
}

/**
 * I113 canonical owner: validate the I112 report against live baseline/C5/B5
 * owners, generate only bounded future-card suggestions, and retain an
 * in-memory plan. No repository writer or ConfirmationGate is reachable here
 * (design §14.14.2 / R18-11c).
 */
export function createOutlineReconciliationPlannerService(deps: {
  readonly llm: unknown;
  readonly text: Pick<NovelTextServiceBundle, 'readChapter'>;
  readonly outline: Pick<NovelOutlineService, 'contentFingerprint' | 'beatCards'>;
  readonly binding: Pick<NovelSceneOutlineBindingService, 'read'>;
  readonly baseline: Pick<NovelOutlineGenerationBaselineService, 'read'>;
  readonly onDispose?: (dispose: () => void) => void;
}): NovelOutlineReconciliationPlannerService {
  const backend = asLlmBackend(deps.llm);
  const sessions = new Map<string, PlannerSession>();
  deps.onDispose?.(() => {
    for (const session of sessions.values()) session.controller.abort();
    sessions.clear();
  });

  const sessionFor = (projectId: string, planId: string): PlannerSession => {
    const session = sessions.get(planId);
    if (session === undefined || session.projectId !== projectId) throw new Error(`Unknown outline reconciliation plan: ${planId}`);
    return session;
  };

  const validate = async (projectId: string, report: PlannerSession['report']) => {
    const baselineResult = await deps.baseline.read(projectId, report.baselineId);
    const baseline = baselineResult.baseline;
    if (baseline.projectId !== projectId || report.projectId !== projectId) throw new Error('Outline reconciliation project mismatch');
    if (baseline.baselineId !== report.baselineId) throw new Error('Outline reconciliation report baseline mismatch');
    if (baseline.status === 'superseded') throw new Error(`Cannot reconcile superseded baseline: ${report.baselineId}`);
    const disallowedStale = baselineResult.staleReasons.filter((reason) => reason !== 'source-changed');
    if (disallowedStale.length > 0) throw new Error(`Stale outline reconciliation baseline: ${disallowedStale.join(', ')}`);
    if (baseline.authoringBase.sourceHash !== report.baselineSourceHash) throw new Error('Outline reconciliation baseline source mismatch');

    const chapter = await deps.text.readChapter(projectId, baseline.chapterId);
    const scene = chapter.scenes.find((item) => item.id === baseline.sceneId);
    if (scene === undefined) throw new Error(`Outline reconciliation scene is missing: ${baseline.sceneId}`);
    if (textContentHash(scene.content) !== report.finalSourceHash) throw new Error('Outline reconciliation current C5 source is stale');
    reportEvidence(report, baseline.authoringBase.content, scene.content);

    const [b5ContentFingerprint, binding, cards] = await Promise.all([
      deps.outline.contentFingerprint(projectId), deps.binding.read(projectId), deps.outline.beatCards(projectId),
    ]);
    if (b5ContentFingerprint !== baseline.b5ContentFingerprint) throw new Error('Stale outline reconciliation B5');
    if (binding.fingerprint !== baseline.bindingFingerprint) throw new Error('Stale outline reconciliation binding');
    const future = futureCardsAfterTarget(cards, baseline.detailBeatId);
    const futureIds = future.map((card) => card.detailBeat.id);
    if (JSON.stringify(report.eligibleFutureDetailBeatIds) !== JSON.stringify(futureIds)) throw new Error('Outline reconciliation report future-card window is stale');
    const futureSet = new Set(futureIds);
    if (report.classification === 'wording-only' && report.affectedDetailBeatIds.length > 0) throw new Error('wording-only report cannot reconcile future cards');
    for (const id of report.affectedDetailBeatIds) if (!futureSet.has(id)) throw new Error(`Outline reconciliation references ineligible card: ${id}`);
    const orderedAffected = future.filter((card) => report.affectedDetailBeatIds.includes(card.detailBeat.id));
    return { baseline, cards, future, orderedAffected, b5ContentFingerprint, bindingFingerprint: binding.fingerprint };
  };

  const generate = async (session: PlannerSession, report: PlannerSession['report'], cards: readonly OutlineBeatCard[], allCards: readonly OutlineBeatCard[], settings: GenerationSettings): Promise<OutlineReconciliationItem[]> => {
    if (cards.length === 0) return [];
    const output = await generateOutlineReconciliationSuggestions(backend, {
      report,
      cards: parserCards(cards, allCards),
    }, settings, session.controller.signal);
    const byId = new Map(output.suggestions.map((suggestion) => [suggestion.detailBeatId, suggestion]));
    return cards.map((card) => {
      const suggestion = byId.get(card.detailBeat.id);
      if (suggestion === undefined) throw new Error(`Outline reconciliation suggestion missing: ${card.detailBeat.id}`);
      return buildItem(card, allCards.findIndex((item) => item.detailBeat.id === card.detailBeat.id), report, suggestion);
    });
  };

  const service: NovelOutlineReconciliationPlannerService = {
    async prepare(projectId, rawInput, settings, signal) {
      const input = outlineReconciliationPrepareInputSchema.parse(rawInput);
      const owner = await validate(projectId, input.report);
      const planId = planIdFor(projectId, input.report.impactId, owner.b5ContentFingerprint, input.report.finalSourceHash);
      const existing = sessions.get(planId);
      if (existing?.status === 'ready' && existing.plan !== undefined) return existing.plan;
      if (existing?.status === 'running') throw new Error(`Outline reconciliation is already running: ${planId}`);
      if (existing?.status === 'cancelled') throw new Error(`Outline reconciliation is cancelled: ${planId}`);
      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      const session: PlannerSession = { projectId, planId, report: input.report, controller, status: 'running' };
      sessions.set(planId, session);
      try {
        const items = await generate(session, input.report, owner.orderedAffected, owner.cards, settings);
        const now = new Date().toISOString();
        session.plan = outlineReconciliationPlanSchema.parse({
          planId, projectId, reportId: input.report.impactId, baselineId: input.report.baselineId,
          baselineSourceHash: input.report.baselineSourceHash, finalSourceHash: input.report.finalSourceHash,
          b5ContentFingerprint: owner.b5ContentFingerprint, bindingFingerprint: owner.bindingFingerprint,
          reportClassification: input.report.classification, items, revision: 1, status: 'ready', createdAt: now, updatedAt: now,
        });
        session.status = 'ready';
        return outlineReconciliationPrepareResultSchema.parse(session.plan);
      } catch (error) {
        session.error = error;
        session.status = controller.signal.aborted ? 'cancelled' : 'failed';
        throw error;
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
      }
    },
    async regenerateOne(projectId, rawInput, settings, signal) {
      const input = outlineReconciliationRegenerateOneInputSchema.parse(rawInput);
      const session = sessionFor(projectId, input.planId);
      if (session.status !== 'ready' || session.plan === undefined) throw new Error(`Outline reconciliation is not ready: ${input.planId}`);
      const owner = await validate(projectId, session.report);
      const current = session.plan.items.find((item) => item.detailBeatId === input.detailBeatId);
      const card = owner.orderedAffected.find((item) => item.detailBeat.id === input.detailBeatId);
      if (current === undefined || card === undefined) throw new Error(`Cannot regenerate non-plan card: ${input.detailBeatId}`);
      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      signal?.addEventListener('abort', forwardAbort, { once: true });
      try {
        const generated = await generateOutlineReconciliationSuggestions(backend, {
          report: session.report, cards: parserCards([card], owner.cards),
        }, settings, controller.signal);
        const suggestion = generated.suggestions[0];
        if (suggestion === undefined) throw new Error(`Regeneration returned no suggestion: ${input.detailBeatId}`);
        const replacement = buildItem(card, owner.cards.findIndex((item) => item.detailBeat.id === card.detailBeat.id), session.report, suggestion, current);
        const updated = outlineReconciliationPlanSchema.parse({ ...session.plan, items: session.plan.items.map((item) => item.detailBeatId === input.detailBeatId ? replacement : item), revision: session.plan.revision + 1, updatedAt: new Date().toISOString() });
        session.plan = updated;
        return outlineReconciliationRegenerateOneResultSchema.parse(updated);
      } finally {
        signal?.removeEventListener('abort', forwardAbort);
      }
    },
    read(projectId, planId) {
      const session = sessionFor(projectId, planId);
      if (session.status === 'ready' && session.plan !== undefined) return session.plan;
      if (session.status === 'failed') throw session.error instanceof Error ? session.error : new Error(`Outline reconciliation failed: ${planId}`);
      if (session.status === 'cancelled') throw new Error(`Outline reconciliation cancelled: ${planId}`);
      throw new Error(`Outline reconciliation is not ready: ${planId}`);
    },
    async cancel(projectId, planId) {
      const session = sessionFor(projectId, planId);
      session.controller.abort();
      session.status = 'cancelled';
      return outlineReconciliationCancelResultSchema.parse({ planId, status: 'cancelled' });
    },
  };
  return Object.freeze(service);
}
