import { createHash } from 'node:crypto';
import { textContentHash } from '../core/text/index.js';
import { outlineContentFingerprint } from '../core/outline/index.js';
import { OutlineNavigator } from '../core/outline/index.js';
import type { Outline, OutlineBeatCard } from '../core/schema/outline.js';
import type { OutlineDeviation, OutlineProgress } from '../core/schema/outline-progress.js';
import {
  outlineReconciliationAcceptResultSchema,
  outlineReconciliationContinueResultSchema,
  outlineReconciliationDecisionSchema,
  outlineReconciliationFinalizeInputSchema,
  outlineReconciliationFinalizeResultSchema,
  outlineReconciliationGatePayloadSchema,
  outlineReconciliationProposeInputSchema,
  outlineReconciliationProposeResultSchema,
  outlineReconciliationRejectResultSchema,
  type OutlineReconciliationAcceptResult,
  type OutlineReconciliationContinueResult,
  type OutlineReconciliationDecision,
  type OutlineReconciliationFinalizeInput,
  type OutlineReconciliationFinalizeResult,
  type OutlineReconciliationGatePayload,
  type OutlineReconciliationProposeInput,
  type OutlineReconciliationProposeResult,
  type OutlineReconciliationRejectResult,
} from '../core/schema/outline-reconciliation-application.js';
import type { OutlineReconciliationPlan } from '../core/schema/outline-reconciliation.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import type { NovelOutlineReconciliationPlannerService } from './outline-reconciliation-planner-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelTextServiceBundle } from './text-service.js';

const RECONCILIATION_KIND = 'outline-reconciliation.apply';

interface Snapshot {
  readonly outline: Outline;
  readonly progress: OutlineProgress;
  readonly plan: OutlineReconciliationPlan;
  readonly b5Fingerprint: string;
  readonly bindingFingerprint: string;
  readonly finalSourceHash: string;
}

interface AppliedState {
  readonly result: OutlineReconciliationAcceptResult;
  readonly desiredOutline: Outline;
  readonly desiredProgress: OutlineProgress;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function proposalIdFor(projectId: string, planId: string, decisions: readonly OutlineReconciliationDecision[]): string {
  return `reconcile-apply-${fingerprint({ projectId, planId, decisions }).slice(0, 47)}`;
}

function deviationIdFor(planId: string, detailBeatId: string): string {
  return `dev-reconcile-${fingerprint({ planId, detailBeatId }).slice(0, 50)}`;
}

function same(value: unknown, other: unknown): boolean {
  return canonical(value) === canonical(other);
}

function targetCard(cards: readonly OutlineBeatCard[], detailBeatId: string): OutlineBeatCard {
  const card = cards.find((item) => item.detailBeat.id === detailBeatId);
  if (card === undefined) throw new Error(`Reconciliation target card is missing: ${detailBeatId}`);
  return card;
}

function cardsOf(outline: Outline): OutlineBeatCard[] {
  return outline.acts
    .slice().sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .flatMap((act) => act.beats.slice().sort((left, right) => left.id.localeCompare(right.id))
      .flatMap((beat) => beat.detailBeats.map((detailBeat) => ({ actId: act.id, beatId: beat.id, beatTitle: beat.title, detailBeat }))));
}

function decisionsFor(plan: OutlineReconciliationPlan, decisions: readonly OutlineReconciliationDecision[]): Map<string, OutlineReconciliationDecision> {
  const byId = new Map<string, OutlineReconciliationDecision>();
  for (const decision of decisions) {
    if (byId.has(decision.detailBeatId)) throw new Error(`Duplicate reconciliation decision: ${decision.detailBeatId}`);
    byId.set(decision.detailBeatId, outlineReconciliationDecisionSchema.parse(decision));
  }
  if (byId.size !== plan.items.length || plan.items.some((item) => !byId.has(item.detailBeatId))) {
    throw new Error('Every reconciliation card requires exactly one decision');
  }
  for (const item of plan.items) {
    const decision = byId.get(item.detailBeatId)!;
    if (!item.allowedChoices.includes(decision.choice)) throw new Error(`Decision is not allowed for reconciliation card: ${item.detailBeatId}`);
  }
  return byId;
}

function outlineWithDecisions(outline: Outline, plan: OutlineReconciliationPlan, decisions: ReadonlyMap<string, OutlineReconciliationDecision>): Outline {
  const items = new Map(plan.items.map((item) => [item.detailBeatId, item]));
  return {
    ...outline,
    acts: outline.acts.map((act) => ({
      ...act,
      beats: act.beats.map((beat) => ({
        ...beat,
        detailBeats: beat.detailBeats.map((detailBeat) => {
          const item = items.get(detailBeat.id);
          const decision = item === undefined ? undefined : decisions.get(detailBeat.id);
          if (item === undefined || decision === undefined || (decision.choice !== 'ai' && decision.choice !== 'manual')) return detailBeat;
          if (detailBeat.status !== 'planned' || (!same(detailBeat, item.before) && !same(detailBeat, decision.choice === 'ai' ? item.after : decision.manualValue!))) {
            throw new Error(`Reconciliation card changed before apply: ${detailBeat.id}`);
          }
          const value = decision.choice === 'ai' ? item.after : decision.manualValue!;
          return { ...value, id: detailBeat.id, status: 'planned' as const };
        }),
      })),
    })),
  };
}

function progressWithPending(progress: OutlineProgress, plan: OutlineReconciliationPlan, decisions: ReadonlyMap<string, OutlineReconciliationDecision>): OutlineProgress {
  const deviations: OutlineDeviation[] = [...progress.deviations];
  for (const item of plan.items) {
    const decision = decisions.get(item.detailBeatId)!;
    if (decision.choice !== 'pending') continue;
    const id = deviationIdFor(plan.planId, item.detailBeatId);
    const existing = deviations.find((deviation) => deviation.id === id);
    const next: OutlineDeviation = {
      id,
      planned: item.before.summary,
      actual: item.after.summary,
      reason: `正文变化待作者决定：${item.detailBeatId}`,
      reconciled: false,
    };
    if (existing === undefined) deviations.push(next);
    else if (!same(existing, next) && existing.reconciled === false) throw new Error(`Pending reconciliation deviation changed: ${item.detailBeatId}`);
  }
  return { ...progress, deviations };
}

function nextProgress(outline: Outline, progress: OutlineProgress, currentBeatId: string): OutlineProgress {
  const currentBeat = outline.acts.flatMap((act) => act.beats).find((beat) => beat.id === currentBeatId);
  if (currentBeat === undefined) throw new Error(`Current C6 beat is missing: ${currentBeatId}`);
  if (currentBeat.detailBeats.length === 0 || !currentBeat.detailBeats.every((detailBeat) => detailBeat.status === 'done')) return progress;
  const completed = progress.completedBeats.includes(currentBeatId) ? [...progress.completedBeats] : [...progress.completedBeats, currentBeatId];
  const advanced = { ...progress, completedBeats: completed };
  const navigation = new OutlineNavigator().navigate(outline, advanced);
  return navigation.beatId === currentBeatId
    ? advanced
    : { ...advanced, currentAct: navigation.actId, currentBeat: navigation.beatId };
}

function isMissingTarget(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /Unknown (?:chapter|scene|bound scene|detail beat)/.test(message);
}

/**
 * I114 canonical application owner. The planner remains zero-write; this
 * service is the sole path from an accepted I11 decision to B5/C6/baseline
 * writes (design §14.14.2, §14.14.3).
 */
export interface NovelOutlineReconciliationService {
  propose(projectId: string, input: OutlineReconciliationProposeInput): Promise<OutlineReconciliationProposeResult>;
  accept(projectId: string, proposalId: string): Promise<OutlineReconciliationAcceptResult>;
  reject(projectId: string, proposalId: string): Promise<OutlineReconciliationRejectResult>;
  finalize(projectId: string, input: OutlineReconciliationFinalizeInput): Promise<OutlineReconciliationFinalizeResult>;
  continue(projectId: string, input: OutlineReconciliationFinalizeInput): Promise<OutlineReconciliationContinueResult>;
}

export function createOutlineReconciliationService(deps: {
  readonly planner: NovelOutlineReconciliationPlannerService;
  readonly text: Pick<NovelTextServiceBundle, 'readChapter'>;
  readonly outline: Pick<NovelOutlineService, 'read' | 'save' | 'contentFingerprint' | 'beatCards' | 'readProgress' | 'saveProgress'>;
  readonly binding: Pick<NovelSceneOutlineBindingService, 'read'>;
  readonly baseline: Pick<NovelOutlineGenerationBaselineService, 'read' | 'create' | 'finalize'>;
  readonly confirmation: NovelConfirmationService;
  readonly onDispose?: (dispose: () => void) => void;
}): NovelOutlineReconciliationService {
  const lanes = new Map<string, Promise<unknown>>();
  const applied = new Map<string, AppliedState>();
  const finalized = new Map<string, OutlineReconciliationFinalizeResult>();
  const continued = new Map<string, OutlineReconciliationContinueResult>();

  const run = <T>(projectId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = lanes.get(projectId) ?? Promise.resolve();
    const current = previous.then(operation, operation);
    lanes.set(projectId, current.catch(() => undefined));
    return current;
  };

  onDisposeCleanup(deps.onDispose, () => {
    lanes.clear();
    applied.clear();
    finalized.clear();
    continued.clear();
  });

  const readPlan = (projectId: string, planId: string): OutlineReconciliationPlan => deps.planner.read(projectId, planId);

  const snapshot = async (projectId: string, plan: OutlineReconciliationPlan, finalSourceHash: string, allowAppliedB5 = false): Promise<Snapshot> => {
    const baselineResult = await deps.baseline.read(projectId, plan.baselineId);
    const baseline = baselineResult.baseline;
    if (baseline.projectId !== projectId || baseline.baselineId !== plan.baselineId) throw new Error('Outline reconciliation baseline belongs to another project');
    if (baseline.status === 'superseded') throw new Error('Cannot reconcile a superseded baseline');
    const invalidStale = baselineResult.staleReasons.filter((reason) => reason !== 'source-changed' && !(allowAppliedB5 && reason === 'b5-changed'));
    if (invalidStale.length > 0) throw new Error(`Stale outline reconciliation baseline: ${invalidStale.join(', ')}`);
    if (baseline.authoringBase.sourceHash !== plan.baselineSourceHash) throw new Error('Outline reconciliation baseline source mismatch');
    const chapter = await deps.text.readChapter(projectId, baseline.chapterId);
    const scene = chapter.scenes.find((item) => item.id === baseline.sceneId);
    if (scene === undefined || textContentHash(scene.content) !== finalSourceHash || finalSourceHash !== plan.finalSourceHash) throw new Error('Outline reconciliation final C5 source is stale');
    const [outline, progress, b5Fingerprint, binding] = await Promise.all([
      deps.outline.read(projectId), deps.outline.readProgress(projectId), deps.outline.contentFingerprint(projectId), deps.binding.read(projectId),
    ]);
    if (binding.fingerprint !== plan.bindingFingerprint) throw new Error('Outline reconciliation binding is stale');
    const owned = binding.effective.find((item) => item.sceneId === baseline.sceneId && item.detailBeatId === baseline.detailBeatId && item.chapterId === baseline.chapterId);
    if (owned === undefined) throw new Error('Outline reconciliation target binding is stale');
    return { outline, progress, plan, b5Fingerprint, bindingFingerprint: binding.fingerprint, finalSourceHash };
  };

  const validateProposalRecord = (projectId: string, proposalId: string): OutlineReconciliationGatePayload => {
    const record = deps.confirmation.get(projectId, proposalId);
    if (record.kind !== RECONCILIATION_KIND) throw new Error(`Confirmation is not an outline reconciliation proposal: ${proposalId}`);
    const payload = outlineReconciliationGatePayloadSchema.parse(record.payload);
    if (payload.projectId !== projectId || payload.proposalId !== proposalId) throw new Error('Outline reconciliation confirmation project/id mismatch');
    return payload;
  };

  const expectedOutline = (snapshotValue: Snapshot, payload: OutlineReconciliationGatePayload): Outline => {
    const plan = snapshotValue.plan;
    if (payload.planRevision !== plan.revision || payload.planFingerprint !== fingerprint(plan)) throw new Error('Outline reconciliation plan is stale');
    const decisions = decisionsFor(plan, payload.decisions);
    return outlineWithDecisions(snapshotValue.outline, plan, decisions);
  };

  const pendingIds = (payload: OutlineReconciliationGatePayload): string[] => payload.decisions.filter((decision) => decision.choice === 'pending').map((decision) => decision.detailBeatId);
  const appliedIds = (payload: OutlineReconciliationGatePayload): string[] => payload.decisions.filter((decision) => decision.choice === 'ai' || decision.choice === 'manual').map((decision) => decision.detailBeatId);

  const restore = async (projectId: string, outline: Outline, progress: OutlineProgress): Promise<void> => {
    await deps.outline.save(projectId, outline);
    await deps.outline.saveProgress(projectId, progress);
  };

  const applyAccepted = async (projectId: string, payload: OutlineReconciliationGatePayload, status: 'accepted' | 'already-accepted'): Promise<OutlineReconciliationAcceptResult> => {
    const plan = readPlan(projectId, payload.planId);
    const current = await snapshot(projectId, plan, payload.finalSourceHash, true);
    if (current.b5Fingerprint !== plan.b5ContentFingerprint && current.b5Fingerprint !== payload.expectedB5ContentFingerprint) {
      throw new Error('Outline reconciliation B5 changed before accepted application');
    }
    const desiredOutline = expectedOutline(current, payload);
    const decisions = decisionsFor(plan, payload.decisions);
    const desiredProgress = progressWithPending(current.progress, plan, decisions);
    const desiredFingerprint = outlineContentFingerprint(desiredOutline);
    const cached = applied.get(payload.proposalId);
    if (current.b5Fingerprint === desiredFingerprint && same(current.progress, desiredProgress)) {
      const result = outlineReconciliationAcceptResultSchema.parse({
        projectId, planId: plan.planId, proposalId: payload.proposalId, status: cached === undefined ? status : 'already-accepted',
        appliedDetailBeatIds: appliedIds(payload), pendingDetailBeatIds: pendingIds(payload), b5ContentFingerprint: current.b5Fingerprint,
      });
      applied.set(payload.proposalId, { result, desiredOutline, desiredProgress });
      return result;
    }
    if (desiredFingerprint !== payload.expectedB5ContentFingerprint) throw new Error('Outline reconciliation expected B5 fingerprint is inconsistent');
    let outlineWritten = false;
    let progressWritten = false;
    try {
      if (current.b5Fingerprint !== desiredFingerprint) {
        await deps.outline.save(projectId, desiredOutline);
        outlineWritten = true;
      }
      if (!same(current.progress, desiredProgress)) {
        await deps.outline.saveProgress(projectId, desiredProgress);
        progressWritten = true;
      }
      const result = outlineReconciliationAcceptResultSchema.parse({
        projectId, planId: plan.planId, proposalId: payload.proposalId, status,
        appliedDetailBeatIds: appliedIds(payload), pendingDetailBeatIds: pendingIds(payload), b5ContentFingerprint: desiredFingerprint,
      });
      applied.set(payload.proposalId, { result, desiredOutline, desiredProgress });
      return result;
    } catch (cause) {
      if (outlineWritten || progressWritten) {
        try { await restore(projectId, current.outline, current.progress); } catch { /* preserve the original write fault */ }
      }
      applied.delete(payload.proposalId);
      throw cause;
    }
  };

  const acceptedPayload = (projectId: string, planId: string): OutlineReconciliationGatePayload => {
    const records = deps.confirmation.list(projectId);
    const record = records.find((item) => item.kind === RECONCILIATION_KIND && item.status === 'accepted' && (() => {
      try { return outlineReconciliationGatePayloadSchema.parse(item.payload).planId === planId; } catch { return false; }
    })());
    if (record === undefined) throw new Error(`No accepted outline reconciliation proposal for plan: ${planId}`);
    return outlineReconciliationGatePayloadSchema.parse(record.payload);
  };

  const finalizeInternal = async (projectId: string, input: OutlineReconciliationFinalizeInput): Promise<OutlineReconciliationFinalizeResult> => {
    const parsed = outlineReconciliationFinalizeInputSchema.parse(input);
    const prior = finalized.get(parsed.planId);
    if (prior !== undefined) return outlineReconciliationFinalizeResultSchema.parse({ ...prior, status: 'already-finalized' });
    const payload = acceptedPayload(projectId, parsed.planId);
    if (payload.finalSourceHash !== parsed.finalSourceHash) throw new Error('Final source hash does not match accepted reconciliation proposal');
    const plan = readPlan(projectId, parsed.planId);
    const before = await snapshot(projectId, plan, parsed.finalSourceHash, true);
    const baseline = (await deps.baseline.read(projectId, plan.baselineId)).baseline;
    const target = targetCard(cardsOf(before.outline), baseline.detailBeatId);
    const currentLocation = before.outline.acts.flatMap((act) => act.beats.map((beat) => ({ act, beat }))).find(({ beat }) => beat.id === target.beatId);
    if (currentLocation === undefined || before.progress.currentBeat !== target.beatId) throw new Error('Current C6 beat is not the bound reconciliation beat');
    if (target.detailBeat.status !== 'writing' && target.detailBeat.status !== 'done') throw new Error('Current detail beat must be writing before finalize');
    await applyAccepted(projectId, payload, 'accepted');
    const afterApply = await snapshot(projectId, plan, parsed.finalSourceHash, true);
    const targetAfter = targetCard(cardsOf(afterApply.outline), target.detailBeat.id);
    const completedOutline: Outline = targetAfter.detailBeat.status === 'done' ? afterApply.outline : {
      ...afterApply.outline,
      acts: afterApply.outline.acts.map((act) => ({ ...act, beats: act.beats.map((beat) => ({ ...beat, detailBeats: beat.detailBeats.map((detailBeat) => detailBeat.id === target.detailBeat.id ? { ...detailBeat, status: 'done' as const } : detailBeat) })) })),
    };
    const completedProgress = nextProgress(completedOutline, afterApply.progress, target.beatId);
    const changedOutline = !same(completedOutline, afterApply.outline);
    const changedProgress = !same(completedProgress, afterApply.progress);
    const baselineAfter = await deps.baseline.read(projectId, plan.baselineId);
    const alreadyBaselineFinalized = baselineAfter.baseline.status === 'finalized';
    // Validate the final wire result before any completion write. The append-only
    // baseline owner has no rollback event, so no fallible parsing may follow its
    // finalize append (design §14.14.3).
    const result = outlineReconciliationFinalizeResultSchema.parse({
      projectId, planId: plan.planId, baselineId: plan.baselineId, status: alreadyBaselineFinalized ? 'already-finalized' : 'finalized',
      current: { chapterId: baselineAfter.baseline.chapterId, sceneId: baselineAfter.baseline.sceneId, detailBeatId: target.detailBeat.id, status: 'done' },
      progress: completedProgress, b5ContentFingerprint: outlineContentFingerprint(completedOutline),
    });
    let outlineWritten = false;
    let progressWritten = false;
    try {
      if (changedOutline) {
        await deps.outline.save(projectId, completedOutline);
        outlineWritten = true;
      }
      if (changedProgress) {
        await deps.outline.saveProgress(projectId, completedProgress);
        progressWritten = true;
      }
      if (!alreadyBaselineFinalized) await deps.baseline.finalize(projectId, plan.baselineId, parsed.finalSourceHash);
      finalized.set(plan.planId, result);
      return result;
    } catch (cause) {
      if (outlineWritten || progressWritten) {
        try { await restore(projectId, afterApply.outline, afterApply.progress); } catch { /* preserve the original write fault */ }
      }
      applied.delete(payload.proposalId);
      throw cause;
    }
  };

  const service: NovelOutlineReconciliationService = {
    propose: (projectId, rawInput) => run(projectId, async () => {
      const input = outlineReconciliationProposeInputSchema.parse(rawInput);
      const plan = readPlan(projectId, input.planId);
      const decisions = decisionsFor(plan, input.decisions);
      const ordered = plan.items.map((item) => decisions.get(item.detailBeatId)!);
      const current = await snapshot(projectId, plan, plan.finalSourceHash);
      if (current.b5Fingerprint !== plan.b5ContentFingerprint) throw new Error('Outline reconciliation B5 changed before proposal');
      const desired = outlineWithDecisions(current.outline, plan, decisions);
      const expectedB5ContentFingerprint = outlineContentFingerprint(desired);
      const proposalId = proposalIdFor(projectId, plan.planId, ordered);
      const payload: OutlineReconciliationGatePayload = outlineReconciliationGatePayloadSchema.parse({
        projectId, planId: plan.planId, proposalId, planRevision: plan.revision, planFingerprint: fingerprint(plan),
        reportId: plan.reportId, baselineId: plan.baselineId, baselineSourceHash: plan.baselineSourceHash, finalSourceHash: plan.finalSourceHash,
        b5ContentFingerprint: plan.b5ContentFingerprint, expectedB5ContentFingerprint, bindingFingerprint: plan.bindingFingerprint, decisions: ordered,
      });
      try {
        const existing = deps.confirmation.get(projectId, proposalId);
        if (existing.kind !== RECONCILIATION_KIND || !same(existing.payload, payload)) throw new Error('Reconciliation proposal id collision');
      } catch (cause) {
        if (!(cause instanceof Error) || !cause.message.startsWith('Unknown confirmation:')) throw cause;
        await deps.confirmation.propose(projectId, { id: proposalId, kind: RECONCILIATION_KIND, payload });
      }
      return outlineReconciliationProposeResultSchema.parse({ projectId, planId: plan.planId, proposalId, status: 'pending', decisions: ordered });
    }),
    accept: (projectId, proposalId) => run(projectId, async () => {
      const payload = validateProposalRecord(projectId, proposalId);
      const record = deps.confirmation.get(projectId, proposalId);
      if (record.status !== 'accepted' && record.status !== 'pending') throw new Error(`Cannot accept rejected reconciliation proposal: ${proposalId}`);
      const resolved = record.status === 'pending' ? await deps.confirmation.accept(projectId, proposalId) : record;
      return applyAccepted(projectId, payload, resolved.status === 'accepted' && record.status === 'accepted' ? 'already-accepted' : 'accepted');
    }),
    reject: (projectId, proposalId) => run(projectId, async () => {
      const payload = validateProposalRecord(projectId, proposalId);
      const record = deps.confirmation.get(projectId, proposalId);
      if (record.status === 'accepted') throw new Error(`Cannot reject accepted reconciliation proposal: ${proposalId}`);
      const resolved = record.status === 'pending' ? await deps.confirmation.reject(projectId, proposalId) : record;
      return outlineReconciliationRejectResultSchema.parse({ projectId, planId: payload.planId, proposalId, status: resolved.status === 'rejected' && record.status === 'rejected' ? 'already-rejected' : 'rejected' });
    }),
    finalize: (projectId, input) => run(projectId, () => finalizeInternal(projectId, input)),
    continue: (projectId, input) => run(projectId, async () => {
      const parsed = outlineReconciliationFinalizeInputSchema.parse(input);
      const cached = continued.get(parsed.planId);
      if (cached !== undefined) return cached;
      const finalResult = await finalizeInternal(projectId, parsed);
      const outline = await deps.outline.read(projectId);
      const cards = cardsOf(outline);
      const currentIndex = cards.findIndex((card) => card.detailBeat.id === finalResult.current.detailBeatId);
      const next = cards.slice(currentIndex + 1).find((card) => card.detailBeat.status === 'planned');
      if (next === undefined) return outlineReconciliationContinueResultSchema.parse({ ...finalResult, status: 'needs-target', reason: 'no-next-card' });
      const progress = await deps.outline.readProgress(projectId);
      const pending = progress.deviations.find((deviation) => deviation.id === deviationIdFor(parsed.planId, next.detailBeat.id) && !deviation.reconciled);
      if (pending !== undefined) return outlineReconciliationContinueResultSchema.parse({ ...finalResult, status: 'blocked-pending', detailBeatId: next.detailBeat.id });
      const binding = await deps.binding.read(projectId);
      const owned = binding.effective.find((item) => item.detailBeatId === next.detailBeat.id);
      if (owned === undefined) return outlineReconciliationContinueResultSchema.parse({ ...finalResult, status: 'needs-target', reason: 'missing-binding' });
      try {
        const chapter = await deps.text.readChapter(projectId, owned.chapterId);
        if (!chapter.scenes.some((scene) => scene.id === owned.sceneId)) return outlineReconciliationContinueResultSchema.parse({ ...finalResult, status: 'needs-target', reason: 'missing-scene' });
        const nextBaseline = await deps.baseline.create(projectId, { chapterId: owned.chapterId, sceneId: owned.sceneId, detailBeatId: next.detailBeat.id });
        const result = outlineReconciliationContinueResultSchema.parse({ ...finalResult, status: 'continued', next: { chapterId: owned.chapterId, sceneId: owned.sceneId, detailBeatId: next.detailBeat.id, baselineId: nextBaseline.baseline.baselineId } });
        continued.set(parsed.planId, result);
        return result;
      } catch (cause) {
        if (isMissingTarget(cause)) return outlineReconciliationContinueResultSchema.parse({ ...finalResult, status: 'needs-target', reason: 'missing-scene' });
        throw cause;
      }
    }),
  };
  return service;
}

function onDisposeCleanup(onDispose: ((dispose: () => void) => void) | undefined, cleanup: () => void): void {
  onDispose?.(cleanup);
}
