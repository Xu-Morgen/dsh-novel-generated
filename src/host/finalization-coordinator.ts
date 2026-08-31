import { createHash } from 'node:crypto';
import { textContentHash } from '../core/text/index.js';
import {
  finalizationApplyResultSchema,
  finalizationGatePayloadSchema,
  finalizationProposalInputSchema,
  finalizationProposeResultSchema,
  finalizationRejectResultSchema,
  type FinalizationApplyResult,
  type FinalizationGatePayload,
  type FinalizationProposalInput,
  type FinalizationProposeResult,
  type FinalizationRejectResult,
} from '../core/schema/finalization.js';
import { outlineReconciliationDecisionSchema, type OutlineReconciliationContinueResult } from '../core/schema/outline-reconciliation-application.js';
import type { OutlineReconciliationChoice } from '../core/schema/outline-reconciliation.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelFinalizationPlanBuilder, FinalizationApplicationContext } from './finalization-plan-builder.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import type { NovelOutlineReconciliationService } from './outline-reconciliation-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelTextServiceBundle } from './text-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import { buildFiveLayerWriters } from './five-layer-writeback.js';
import { structuralPreviewFingerprint } from './writing-adjudication/structural-preview-plan.js';

const FINALIZATION_KIND = 'finalization.apply';
const STRUCTURAL_STAGES = ['c2', 'c1', 'c3', 'c4', 'b2'] as const;
type StructuralStage = typeof STRUCTURAL_STAGES[number];
type FinalizationStage = StructuralStage | 'b5' | 'c6' | 'baseline';
type FreshnessReason = 'source-changed' | 'b5-changed' | 'binding-changed' | 'layer-changed' | 'plan-changed' | 'target-missing';
type FinalizationNext = Extract<FinalizationApplyResult, { status: 'applied' | 'already-applied' }>['next'];

interface OperationState {
  readonly payload: FinalizationGatePayload;
  readonly committedStages: FinalizationStage[];
  readonly appliedStages: FinalizationStage[];
  result?: FinalizationApplyResult;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function proposalIds(projectId: string, planId: string, planFingerprint: string, finalSourceHash: string, decisions: unknown): { proposalId: string; operationId: string } {
  const digest = fingerprint({ projectId, planId, planFingerprint, finalSourceHash, decisions });
  return { proposalId: `fin-${digest.slice(0, 60)}`, operationId: `fin-op-${digest.slice(0, 55)}` };
}

function errorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.length > 240 ? `${message.slice(0, 237)}...` : message;
}

function stageHasChanges(context: FinalizationApplicationContext, stage: StructuralStage): boolean {
  return context.plan.layerChanges.some((change) => change.layer === stage);
}

function decisionsFor(context: FinalizationApplicationContext, rawDecisions: FinalizationProposalInput['decisions']): FinalizationProposalInput['decisions'] {
  const decisions = rawDecisions.map((decision) => outlineReconciliationDecisionSchema.parse(decision));
  const reconciliation = context.reconciliationPlan;
  if (reconciliation === undefined) {
    if (decisions.length > 0) throw new Error('Finalization without reconciliation plan cannot contain child decisions');
    return [];
  }
  if (decisions.length !== reconciliation.items.length) throw new Error('Finalization requires exactly one decision for every reconciliation card');
  const byId = new Map<string, FinalizationProposalInput['decisions'][number]>();
  for (const decision of decisions) {
    if (byId.has(decision.detailBeatId)) throw new Error(`Duplicate finalization decision: ${decision.detailBeatId}`);
    byId.set(decision.detailBeatId, decision);
  }
  return reconciliation.items.map((item) => {
    const decision = byId.get(item.detailBeatId);
    if (decision === undefined) throw new Error(`Missing finalization decision: ${item.detailBeatId}`);
    if (!item.allowedChoices.includes(decision.choice as OutlineReconciliationChoice)) throw new Error(`Finalization decision is not allowed: ${item.detailBeatId}`);
    return decision;
  });
}

function nextFromReconciliation(result: OutlineReconciliationContinueResult): FinalizationNext {
  if (result.status === 'continued') return { status: 'continued', ...result.next };
  if (result.status === 'blocked-pending') return { status: 'needs-target', reason: 'pending-reconciliation' };
  return { status: 'needs-target', reason: result.reason };
}

/**
 * I136 single-confirmation owner. The Gate record authorizes this coordinator,
 * while each existing layer service remains the owner of its own document.
 * Operation state is deliberately keyed by the deterministic operation id so
 * an accepted request can resume after a partial stage failure without opening
 * another author confirmation (design §14.14.2–§14.14.3).
 */
export interface NovelFinalizationCoordinator {
  propose(projectId: string, input: FinalizationProposalInput): Promise<FinalizationProposeResult>;
  accept(projectId: string, proposalId: string): Promise<FinalizationApplyResult>;
  reject(projectId: string, proposalId: string): Promise<FinalizationRejectResult>;
}

export function createFinalizationCoordinator(deps: {
  readonly planBuilder: Pick<NovelFinalizationPlanBuilder, 'readForApplication'>;
  readonly text: Pick<NovelTextServiceBundle, 'readChapter'>;
  readonly state: NovelStateService;
  readonly relationship: NovelRelationshipService;
  readonly knowledge: NovelKnowledgeService;
  readonly canon: NovelCanonService;
  readonly worldview: NovelWorldviewService;
  readonly outline: NovelOutlineService;
  readonly binding: NovelSceneOutlineBindingService;
  readonly baseline: Pick<NovelOutlineGenerationBaselineService, 'read'>;
  readonly reconciliation: Pick<NovelOutlineReconciliationService, 'applyAuthorized' | 'completeAuthorized'>;
  readonly confirmation: NovelConfirmationService;
  readonly onDispose?: (dispose: () => void) => void;
}): NovelFinalizationCoordinator {
  const operations = new Map<string, OperationState>();
  const lanes = new Map<string, Promise<unknown>>();
  let disposed = false;

  const dispose = (): void => {
    disposed = true;
    operations.clear();
    lanes.clear();
  };
  deps.onDispose?.(dispose);

  const run = <T>(projectId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = lanes.get(projectId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const tail = current.then(() => undefined, () => undefined);
    lanes.set(projectId, tail);
    void tail.then(() => { if (lanes.get(projectId) === tail) lanes.delete(projectId); });
    return current;
  };

  const contextFor = (projectId: string, planId: string): FinalizationApplicationContext => {
    if (disposed) throw new Error('Finalization coordinator is disposed');
    return deps.planBuilder.readForApplication(projectId, planId);
  };

  const payloadFor = (projectId: string, rawInput: FinalizationProposalInput): FinalizationGatePayload => {
    const input = finalizationProposalInputSchema.parse(rawInput);
    const context = contextFor(projectId, input.planId);
    const decisions = decisionsFor(context, input.decisions);
    const planFingerprint = fingerprint(context.plan);
    const ids = proposalIds(projectId, input.planId, planFingerprint, context.plan.finalSourceHash, decisions);
    return finalizationGatePayloadSchema.parse({
      projectId,
      planId: input.planId,
      proposalId: ids.proposalId,
      operationId: ids.operationId,
      planFingerprint,
      finalSourceHash: context.plan.finalSourceHash,
      layerFingerprints: context.plan.layerFingerprints,
      generationBaseline: context.plan.generationBaseline,
      decisions,
    });
  };

  const currentLayerFingerprints = async (projectId: string): Promise<Record<StructuralStage, string>> => {
    const [relationships, knowledge, canon, worldview] = await Promise.all([
      deps.relationship.read(projectId), deps.knowledge.read(projectId), Promise.resolve(deps.canon.query(projectId)), deps.worldview.list(projectId),
    ]);
    return {
      c2: structuralPreviewFingerprint(deps.state.current(projectId)),
      c1: structuralPreviewFingerprint(relationships),
      c3: structuralPreviewFingerprint(knowledge),
      c4: structuralPreviewFingerprint(canon),
      b2: structuralPreviewFingerprint(worldview),
    };
  };

  const freshnessReasons = async (projectId: string, context: FinalizationApplicationContext, operation: OperationState): Promise<FreshnessReason[]> => {
    const reasons = new Set<FreshnessReason>();
    const chapter = await deps.text.readChapter(projectId, context.plan.chapterId);
    const scene = chapter.scenes.find((item) => item.id === context.plan.sceneId);
    if (scene === undefined) reasons.add('target-missing');
    else if (textContentHash(scene.content) !== context.plan.finalSourceHash) reasons.add('source-changed');
    if (fingerprint(context.plan) !== operation.payload.planFingerprint) reasons.add('plan-changed');
    if (context.structural.sourceHash !== context.plan.finalSourceHash) reasons.add('plan-changed');
    const current = await currentLayerFingerprints(projectId);
    for (const stage of STRUCTURAL_STAGES) {
      if (operation.committedStages.includes(stage)) continue;
      if (current[stage] !== context.plan.layerFingerprints[stage]) reasons.add('layer-changed');
    }
    if (context.plan.generationBaseline.kind === 'baseline') {
      const baseline = await deps.baseline.read(projectId, context.plan.generationBaseline.generationBaselineId);
      if (baseline.baseline.status === 'superseded') reasons.add('target-missing');
      for (const reason of baseline.staleReasons) {
        if (reason === 'source-changed') continue;
        if (reason === 'b5-changed') reasons.add('b5-changed');
        else if (reason === 'binding-changed') reasons.add('binding-changed');
        else reasons.add('target-missing');
      }
      const binding = await deps.binding.read(projectId);
      if (binding.fingerprint !== context.plan.generationBaseline.bindingFingerprint) reasons.add('binding-changed');
      const b5 = await deps.outline.contentFingerprint(projectId);
      if (b5 !== context.plan.generationBaseline.b5ContentFingerprint) reasons.add('b5-changed');
    }
    return [...reasons];
  };

  const applyPayload = async (projectId: string, payload: FinalizationGatePayload): Promise<FinalizationApplyResult> => {
    const context = contextFor(projectId, payload.planId);
    if (context.plan.finalSourceHash !== payload.finalSourceHash || fingerprint(context.plan) !== payload.planFingerprint) {
      return finalizationApplyResultSchema.parse({ projectId, planId: payload.planId, proposalId: payload.proposalId, operationId: payload.operationId, status: 'stale', reasons: ['plan-changed'] });
    }
    const existing = operations.get(payload.operationId);
    if (existing?.result !== undefined) {
      return finalizationApplyResultSchema.parse({ ...existing.result, status: existing.result.status === 'applied' ? 'already-applied' : existing.result.status });
    }
    const operation: OperationState = existing ?? { payload, committedStages: [], appliedStages: [] };
    operations.set(payload.operationId, operation);
    const reasons = await freshnessReasons(projectId, context, operation);
    if (reasons.length > 0) return finalizationApplyResultSchema.parse({ projectId, planId: payload.planId, proposalId: payload.proposalId, operationId: payload.operationId, status: 'stale', reasons });

    const writers = buildFiveLayerWriters({
      state: deps.state, relationship: deps.relationship, knowledge: deps.knowledge, canon: deps.canon, worldview: deps.worldview, confirmation: deps.confirmation,
    }, projectId, payload.operationId, { skipEmptyB2Proposal: true, authorizedFinalization: true });
    for (const stage of STRUCTURAL_STAGES) {
      if (operation.committedStages.includes(stage)) continue;
      try {
        if (stageHasChanges(context, stage)) {
          if (stage === 'c2') await writers.c2(context.structural.parserOutputs.c2);
          else if (stage === 'c1') await writers.c1(context.structural.parserOutputs.c1);
          else if (stage === 'c3') await writers.c3(context.structural.parserOutputs.c3);
          else if (stage === 'c4') await writers.c4(context.structural.parserOutputs.c4);
          else await writers.b2(context.structural.parserOutputs.b2);
          operation.appliedStages.push(stage);
        }
        operation.committedStages.push(stage);
      } catch (cause) {
        return finalizationApplyResultSchema.parse({
          projectId, planId: payload.planId, proposalId: payload.proposalId, operationId: payload.operationId,
          status: 'partial-failure', failedStage: stage, appliedStages: [...operation.appliedStages], error: errorMessage(cause), retryable: true,
        });
      }
    }

    if (context.plan.generationBaseline.kind !== 'baseline') {
      const result = finalizationApplyResultSchema.parse({
        projectId, planId: payload.planId, proposalId: payload.proposalId, operationId: payload.operationId,
        status: 'needs-target', reason: 'no-generation-baseline', appliedStages: [...operation.appliedStages],
      });
      operation.result = result;
      return result;
    }

    let completion: OutlineReconciliationContinueResult;
    try {
      if (context.reconciliationPlan !== undefined) {
        completion = await deps.reconciliation.applyAuthorized(projectId, {
          planId: context.reconciliationPlan.planId,
          finalSourceHash: payload.finalSourceHash,
          operationId: payload.operationId,
          decisions: payload.decisions,
        });
      } else {
        const baselineId = context.plan.generationBaseline.generationBaselineId;
        completion = await deps.reconciliation.completeAuthorized(projectId, { baselineId, finalSourceHash: payload.finalSourceHash, operationId: payload.operationId });
      }
    } catch (cause) {
      return finalizationApplyResultSchema.parse({
        projectId, planId: payload.planId, proposalId: payload.proposalId, operationId: payload.operationId,
        status: 'partial-failure', failedStage: 'b5', appliedStages: [...operation.appliedStages], error: errorMessage(cause), retryable: true,
      });
    }
    operation.appliedStages.push('b5', 'c6', 'baseline');
    const result = finalizationApplyResultSchema.parse({
      projectId, planId: payload.planId, proposalId: payload.proposalId, operationId: payload.operationId,
      status: 'applied', appliedStages: [...operation.appliedStages],
      current: completion.current, next: nextFromReconciliation(completion),
    });
    operation.result = result;
    return result;
  };

  const readPayload = (projectId: string, proposalId: string): FinalizationGatePayload => {
    const record = deps.confirmation.get(projectId, proposalId);
    if (record.kind !== FINALIZATION_KIND) throw new Error(`Confirmation is not a finalization proposal: ${proposalId}`);
    const payload = finalizationGatePayloadSchema.parse(record.payload);
    if (payload.projectId !== projectId || payload.proposalId !== proposalId) throw new Error('Finalization confirmation project/id mismatch');
    return payload;
  };

  const service: NovelFinalizationCoordinator = {
    propose: (projectId, rawInput) => run(projectId, async () => {
      const payload = payloadFor(projectId, rawInput);
      try {
        const existing = deps.confirmation.get(projectId, payload.proposalId);
        if (existing.kind !== FINALIZATION_KIND || canonical(existing.payload) !== canonical(payload)) throw new Error('Finalization proposal id collision');
      } catch (cause) {
        if (!(cause instanceof Error) || !cause.message.startsWith('Unknown confirmation:')) throw cause;
        await deps.confirmation.propose(projectId, { id: payload.proposalId, kind: FINALIZATION_KIND, payload });
      }
      return finalizationProposeResultSchema.parse({ projectId, planId: payload.planId, proposalId: payload.proposalId, operationId: payload.operationId, status: 'pending' });
    }),
    accept: (projectId, proposalId) => run(projectId, async () => {
      const payload = readPayload(projectId, proposalId);
      const record = deps.confirmation.get(projectId, proposalId);
      if (record.status === 'rejected') throw new Error(`Cannot accept rejected finalization proposal: ${proposalId}`);
      if (record.status === 'pending') await deps.confirmation.accept(projectId, proposalId);
      return applyPayload(projectId, payload);
    }),
    reject: (projectId, proposalId) => run(projectId, async () => {
      const payload = readPayload(projectId, proposalId);
      const record = deps.confirmation.get(projectId, proposalId);
      if (record.status === 'accepted') throw new Error(`Cannot reject accepted finalization proposal: ${proposalId}`);
      const resolved = record.status === 'pending' ? await deps.confirmation.reject(projectId, proposalId) : record;
      return finalizationRejectResultSchema.parse({ projectId, planId: payload.planId, proposalId, operationId: payload.operationId, status: resolved.status === 'rejected' && record.status === 'rejected' ? 'already-rejected' : 'rejected' });
    }),
  };
  return Object.freeze(service);
}
