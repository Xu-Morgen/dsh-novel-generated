import { createHash } from 'node:crypto';
import { textContentHash } from '../core/text/index.js';
import { CROSS_LAYER_REFERENCE_MATRIX } from '../core/schema/reference-coordination.js';
import {
  finalizationCancelResultSchema,
  finalizationPlanSchema,
  finalizationPrepareInputSchema,
  type FinalizationPlan,
  type FinalizationPrepareInput,
  type FinalizationReferenceEntry,
} from '../core/schema/finalization.js';
import type { OutlineGenerationBaselineReadResult } from '../core/schema/outline-generation-baseline.js';
import type { OutlineReconciliationPlan } from '../core/schema/outline-reconciliation.js';
import type { StructuralPreviewPlan } from './writing-adjudication/structural-preview-plan.js';
import type { TextChangeImpactReport } from '../core/schema/text-change-impact.js';
import type { GenerationSettings } from '../llm/port/index.js';
import type { NovelOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import type { NovelOutlineReconciliationPlannerService } from './outline-reconciliation-planner-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelTextChangeImpactService } from './text-change-impact-service.js';
import type { NovelTextService } from './text-service.js';
import type { NovelWritingAdjudicationService } from './writing-adjudication-service.js';

/** Host-only zero-write owner for the I135 author summary. */
export interface NovelFinalizationPlanBuilder {
  prepare(projectId: string, input: FinalizationPrepareInput, settings: GenerationSettings, signal?: AbortSignal): Promise<FinalizationPlan>;
  read(projectId: string, planId: string): FinalizationPlan;
  /** Host-only handoff for I136; it exposes the frozen parser replay, never a Remote. */
  readForApplication(projectId: string, planId: string): FinalizationApplicationContext;
  cancel(projectId: string, planId: string): Promise<{ projectId: string; planId: string; status: 'cancelled' }>;
}

export interface FinalizationApplicationContext {
  readonly plan: FinalizationPlan;
  readonly structural: StructuralPreviewPlan;
  readonly reconciliationPlan?: OutlineReconciliationPlan;
}

interface PlanSession {
  readonly projectId: string;
  readonly planId: string;
  status: 'ready' | 'cancelled' | 'failed';
  plan?: FinalizationPlan;
  structural?: StructuralPreviewPlan;
  reconciliationPlan?: OutlineReconciliationPlan;
  error?: unknown;
}

interface FinalizationWritingSeam {
  adoptedDraft(candidateId: string): ReturnType<NonNullable<NovelWritingAdjudicationService['adoptedDraft']>>;
  prepareFinalizationStructuralPreview(candidateId: string, text: string, sourceHash: string, generationBaseline: Parameters<NonNullable<NovelWritingAdjudicationService['prepareFinalizationStructuralPreview']>>[3], settings?: unknown, signal?: AbortSignal): ReturnType<NonNullable<NovelWritingAdjudicationService['prepareFinalizationStructuralPreview']>>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function referencePolicy(owner: 'c1' | 'c3' | 'c4', field: string): 'deterministic-derived' | 'author-semantic-candidate' | 'forbidden-automatic' {
  const policy = CROSS_LAYER_REFERENCE_MATRIX.find((item) => item.owner === owner && (item.field.includes(field) || item.field.includes(`${owner}.`)));
  return policy?.disposition ?? 'author-semantic-candidate';
}

function referencesFor(
  sceneId: string,
  changes: FinalizationPlan['layerChanges'],
): { deterministic: FinalizationReferenceEntry[]; semanticCandidates: FinalizationReferenceEntry[]; forbiddenAutomatic: FinalizationReferenceEntry[] } {
  const deterministic: FinalizationReferenceEntry[] = [];
  const semanticCandidates: FinalizationReferenceEntry[] = [];
  const forbiddenAutomatic: FinalizationReferenceEntry[] = [{
    owner: 'c5', entityId: sceneId, field: 'scene.content', disposition: 'forbidden-automatic',
    reason: 'C5 正文已由 adoptDraft 保存；定稿计划不再隐式改写正文或版本。',
  }];
  for (const change of changes) {
    const owner = change.layer === 'c1' ? 'c1' : change.layer === 'c3' ? 'c3' : change.layer === 'c4' ? 'c4' : undefined;
    if (owner === undefined) continue;
    const field = owner === 'c1' ? `relationship.${change.changedFields.join('/')}`
      : owner === 'c3' ? `knowledge.${change.entityType}.${change.changedFields.join('/')}`
        : change.kind === 'add' ? 'canon.append' : `canon.${change.changedFields.join('/')}`;
    const disposition = referencePolicy(owner, field);
    const entry = { owner, entityId: change.entityId, field, disposition, reason: '由最终正文的五层纯预览投影；I136 决定是否交给既有授权 owner。' } satisfies FinalizationReferenceEntry;
    if (disposition === 'deterministic-derived') deterministic.push(entry);
    else if (disposition === 'forbidden-automatic') forbiddenAutomatic.push(entry);
    else semanticCandidates.push(entry);
  }
  return { deterministic, semanticCandidates, forbiddenAutomatic };
}

function reconciliationProjection(report: TextChangeImpactReport, plan: OutlineReconciliationPlan | undefined) {
  if (report.classification === 'wording-only') return { status: 'none' as const, reason: 'wording-only' as const, items: [] };
  if (plan === undefined || plan.items.length === 0) return { status: 'none' as const, reason: 'no-affected-future-cards' as const, classification: report.classification, items: [] };
  return {
    status: 'ready' as const,
    planId: plan.planId,
    reportId: report.impactId,
    classification: report.classification,
    items: plan.items.map((item) => ({
      detailBeatId: item.detailBeatId, position: item.position, choice: item.choice,
      before: structuredClone(item.before), after: structuredClone(item.after),
      ...(item.manualValue === undefined ? {} : { manualValue: structuredClone(item.manualValue) }),
      rationale: item.rationale,
    })),
  };
}

function baselineProjection(result: OutlineGenerationBaselineReadResult): FinalizationPlan['generationBaseline'] {
  const baseline = result.baseline;
  return {
    kind: 'baseline', generationBaselineId: baseline.baselineId, baselineRevision: baseline.revision,
    detailBeatId: baseline.detailBeatId, b5ContentFingerprint: baseline.b5ContentFingerprint,
    bindingFingerprint: baseline.bindingFingerprint, authoringSourceHash: baseline.authoringBase.sourceHash,
  };
}

/**
 * Build an ephemeral summary from current C5. Existing analysis/planner owners
 * remain the only owners of impact classification and future-card suggestions;
 * this builder only composes their read projections for I136.
 */
export function createFinalizationPlanBuilder(deps: {
  readonly writing: FinalizationWritingSeam;
  readonly text: Pick<NovelTextService, 'readChapter'>;
  readonly outline: Pick<NovelOutlineService, 'contentFingerprint'>;
  readonly binding: Pick<NovelSceneOutlineBindingService, 'read'>;
  readonly baseline: Pick<NovelOutlineGenerationBaselineService, 'read'>;
  readonly impact: Pick<NovelTextChangeImpactService, 'prepare' | 'read'>;
  readonly reconciliation: Pick<NovelOutlineReconciliationPlannerService, 'prepare'>;
  readonly onDispose?: (dispose: () => void) => void;
}): NovelFinalizationPlanBuilder {
  const sessions = new Map<string, PlanSession>();
  deps.onDispose?.(() => sessions.clear());

  const readSession = (projectId: string, planId: string): PlanSession => {
    const session = sessions.get(planId);
    if (session === undefined || session.projectId !== projectId) throw new Error(`Unknown finalization plan: ${planId}`);
    return session;
  };

  const prepare = async (projectId: string, rawInput: FinalizationPrepareInput, settings: GenerationSettings, signal?: AbortSignal): Promise<FinalizationPlan> => {
    const input = finalizationPrepareInputSchema.parse(rawInput);
    const adoption = deps.writing.adoptedDraft(input.candidateId);
    if (adoption.projectId !== projectId) throw new Error(`Finalization candidate belongs to another project: ${input.candidateId}`);
    const chapter = await deps.text.readChapter(projectId, adoption.chapterId);
    const scene = chapter.scenes.find((item) => item.id === adoption.sceneId);
    if (scene === undefined) throw new Error(`Finalization scene is missing: ${adoption.sceneId}`);
    if (textContentHash(scene.content) !== input.finalSourceHash) throw new Error('Finalization finalSourceHash does not match current C5 scene');

    let baselineResult: OutlineGenerationBaselineReadResult | undefined;
    let generationBaseline: FinalizationPlan['generationBaseline'] = { kind: 'no-outline-baseline' };
    const degradedReasons: Array<'no-generation-baseline' | 'legacy-unbound-candidate'> = [];
    if (adoption.generationBaselineId !== undefined) {
      baselineResult = await deps.baseline.read(projectId, adoption.generationBaselineId);
      if (baselineResult.baseline.projectId !== projectId) throw new Error('Finalization baseline project mismatch');
      const blockingStale = baselineResult.staleReasons.filter((reason) => reason !== 'source-changed');
      if (blockingStale.length > 0 || baselineResult.baseline.status === 'superseded') throw new Error(`Stale finalization baseline: ${blockingStale.join(', ') || 'superseded'}`);
      if (baselineResult.baseline.chapterId !== adoption.chapterId || baselineResult.baseline.sceneId !== adoption.sceneId) throw new Error('Finalization baseline target mismatch');
      generationBaseline = baselineProjection(baselineResult);
    } else {
      degradedReasons.push('no-generation-baseline');
      if (adoption.generationBaselineId === undefined && adoption.candidateId.startsWith('legacy-')) degradedReasons.push('legacy-unbound-candidate');
    }

    const structural = await deps.writing.prepareFinalizationStructuralPreview(input.candidateId, scene.content, input.finalSourceHash, generationBaseline.kind === 'baseline'
      ? { kind: 'baseline', generationBaselineId: generationBaseline.generationBaselineId, baselineRevision: generationBaseline.baselineRevision, detailBeatId: generationBaseline.detailBeatId, b5ContentFingerprint: generationBaseline.b5ContentFingerprint, bindingFingerprint: generationBaseline.bindingFingerprint }
      : { kind: 'no-outline-baseline' }, settings, signal);
    const layerFingerprints = Object.fromEntries(structural.layerBaselines.map((item) => [item.layer, item.fingerprint])) as FinalizationPlan['layerFingerprints'];
    const binding = await deps.binding.read(projectId);
    if (generationBaseline.kind === 'baseline' && binding.fingerprint !== generationBaseline.bindingFingerprint) throw new Error('Finalization binding freshness changed');
    const currentB5 = await deps.outline.contentFingerprint(projectId);
    if (generationBaseline.kind === 'baseline' && currentB5 !== generationBaseline.b5ContentFingerprint) throw new Error('Finalization B5 freshness changed');

    let report: TextChangeImpactReport | undefined;
    let reconciliationPlan: OutlineReconciliationPlan | undefined;
    let reconciliation: FinalizationPlan['reconciliation'];
    if (baselineResult === undefined) {
      reconciliation = { status: 'degraded', reason: 'no-generation-baseline', items: [] };
    } else {
      const impactReady = await deps.impact.prepare(projectId, { baselineId: baselineResult.baseline.baselineId, finalSourceHash: input.finalSourceHash }, settings, signal);
      report = deps.impact.read(projectId, impactReady.impactId);
      reconciliationPlan = report.classification === 'wording-only' || report.affectedDetailBeatIds.length === 0
        ? undefined
        : await deps.reconciliation.prepare(projectId, { report }, settings, signal);
      reconciliation = reconciliationProjection(report, reconciliationPlan);
    }
    const references = referencesFor(adoption.sceneId, structural.changes);
    const planId = `final-${fingerprint({ projectId, candidateId: input.candidateId, finalSourceHash: input.finalSourceHash, layerFingerprints, baseline: generationBaseline }).slice(0, 56)}`;
    const plan = finalizationPlanSchema.parse({
      planId, projectId, candidateId: input.candidateId, chapterId: adoption.chapterId, sceneId: adoption.sceneId,
      draftSourceHash: adoption.sourceHash, finalSourceHash: input.finalSourceHash, generationBaseline,
      layerFingerprints, layerChanges: structural.changes, references, reconciliation,
      completion: { current: { detailBeatId: generationBaseline.kind === 'baseline' ? generationBaseline.detailBeatId : null, status: 'unchanged' }, next: { status: 'deferred', reason: 'application-owned-by-i136' } },
      degradedReasons, createdAt: new Date().toISOString(),
    });
    sessions.set(planId, { projectId, planId, status: 'ready', plan, structural, reconciliationPlan });
    return plan;
  };

  return Object.freeze({
    prepare,
    read(projectId: string, planId: string) {
      const session = readSession(projectId, planId);
      if (session.status === 'ready' && session.plan !== undefined) return session.plan;
      if (session.status === 'failed') throw session.error instanceof Error ? session.error : new Error(`Finalization plan failed: ${planId}`);
      throw new Error(`Finalization plan is cancelled: ${planId}`);
    },
    readForApplication(projectId: string, planId: string) {
      const session = readSession(projectId, planId);
      if (session.status === 'failed') throw session.error instanceof Error ? session.error : new Error(`Finalization plan failed: ${planId}`);
      if (session.status !== 'ready' || session.plan === undefined || session.structural === undefined) {
        throw new Error(`Finalization plan is not ready: ${planId}`);
      }
      return Object.freeze({
        plan: session.plan,
        structural: session.structural,
        ...(session.reconciliationPlan === undefined ? {} : { reconciliationPlan: session.reconciliationPlan }),
      });
    },
    async cancel(projectId: string, planId: string) {
      const session = readSession(projectId, planId);
      session.status = 'cancelled';
      return finalizationCancelResultSchema.parse({ projectId, planId, status: 'cancelled' });
    },
  });
}
