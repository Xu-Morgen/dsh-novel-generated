import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { detailBeatSchema } from './outline.js';
import { outlineReconciliationChoiceSchema } from './outline-reconciliation.js';
import { outlineReconciliationDecisionSchema, type OutlineReconciliationDecision } from './outline-reconciliation-application.js';

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** I135 bounded adoption command; the candidate id is resolved by Host. */
export const draftAdoptionInputSchema = z.object({
  candidateId: entityIdSchema,
}).strict();
export type DraftAdoptionInput = z.infer<typeof draftAdoptionInputSchema>;

/**
 * The only result of the main candidate path. `sourceHash` covers the chosen
 * C5 content after adoption; no parser output or structured-layer value is
 * transported here.
 */
export const draftAdoptionResultSchema = z.object({
  projectId: entityIdSchema,
  candidateId: entityIdSchema,
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  status: z.enum(['adopted', 'already-adopted']),
  sourceHash: fingerprintSchema,
  projectFingerprint: fingerprintSchema,
  generationBaselineId: entityIdSchema.optional(),
}).strict();
export type DraftAdoptionResult = z.infer<typeof draftAdoptionResultSchema>;

/** I135 final plan retains only the structural preview's hash/index projection. */
export const finalizationLayerChangeSchema = z.object({
  layer: z.enum(['c2', 'c1', 'c3', 'c4', 'b2']),
  kind: z.enum(['add', 'update', 'remove']),
  entityType: z.enum(['state', 'scene', 'character', 'relationship', 'knowledge-entry', 'knowledge-state', 'canon-event', 'world-entry']),
  entityId: entityIdSchema,
  beforeHash: fingerprintSchema.optional(),
  afterHash: fingerprintSchema.optional(),
  beforeIndex: z.number().int().nonnegative().optional(),
  afterIndex: z.number().int().nonnegative().optional(),
  changedFields: z.string().min(1).max(100).array().max(40),
}).strict().superRefine((change, context) => {
  if ((change.kind === 'remove' || change.kind === 'update') && change.beforeHash === undefined) context.addIssue({ code: 'custom', path: ['beforeHash'], message: 'Removal/update requires beforeHash' });
  if ((change.kind === 'add' || change.kind === 'update') && change.afterHash === undefined) context.addIssue({ code: 'custom', path: ['afterHash'], message: 'Addition/update requires afterHash' });
  if (change.kind === 'add' && change.beforeHash !== undefined) context.addIssue({ code: 'custom', path: ['beforeHash'], message: 'Addition cannot have beforeHash' });
  if (change.kind === 'remove' && change.afterHash !== undefined) context.addIssue({ code: 'custom', path: ['afterHash'], message: 'Removal cannot have afterHash' });
});
export type FinalizationLayerChange = z.infer<typeof finalizationLayerChangeSchema>;

/** Generation intent is evidence, not a second B5 editor. */
export const finalizationGenerationBaselineSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('baseline'),
    generationBaselineId: entityIdSchema,
    baselineRevision: z.number().int().positive(),
    detailBeatId: entityIdSchema,
    b5ContentFingerprint: fingerprintSchema,
    bindingFingerprint: fingerprintSchema,
    authoringSourceHash: fingerprintSchema,
  }).strict(),
  z.object({ kind: z.literal('no-outline-baseline') }).strict(),
]);
export type FinalizationGenerationBaseline = z.infer<typeof finalizationGenerationBaselineSchema>;

export const finalizationLayerFingerprintsSchema = z.object({
  c2: fingerprintSchema,
  c1: fingerprintSchema,
  c3: fingerprintSchema,
  c4: fingerprintSchema,
  b2: fingerprintSchema,
}).strict();
export type FinalizationLayerFingerprints = z.infer<typeof finalizationLayerFingerprintsSchema>;

const referenceOwnerSchema = z.enum(['c1', 'c3', 'c4', 'b5', 'timeline', 'c5']);
const referenceDispositionSchema = z.enum(['deterministic-derived', 'author-semantic-candidate', 'forbidden-automatic']);

/**
 * Reference projection deliberately contains no proposed values. It records
 * which existing I118 policy applies, so I136 can route semantic work through
 * its established candidate/Gate owner instead of silently mutating a layer.
 */
export const finalizationReferenceEntrySchema = z.object({
  owner: referenceOwnerSchema,
  entityId: entityIdSchema,
  field: z.string().trim().min(1).max(80),
  disposition: referenceDispositionSchema,
  reason: z.string().trim().min(1).max(240),
}).strict();
export type FinalizationReferenceEntry = z.infer<typeof finalizationReferenceEntrySchema>;

export const finalizationReferenceProjectionSchema = z.object({
  deterministic: finalizationReferenceEntrySchema.array().max(128),
  semanticCandidates: finalizationReferenceEntrySchema.array().max(128),
  forbiddenAutomatic: finalizationReferenceEntrySchema.array().max(128),
}).strict();
export type FinalizationReferenceProjection = z.infer<typeof finalizationReferenceProjectionSchema>;

const reconciliationItemSchema = z.object({
  detailBeatId: entityIdSchema,
  position: z.number().int().nonnegative(),
  choice: outlineReconciliationChoiceSchema,
  before: detailBeatSchema,
  after: detailBeatSchema,
  manualValue: detailBeatSchema.optional(),
  rationale: z.string().max(1_000),
}).strict().superRefine((item, context) => {
  if (item.detailBeatId !== item.before.id || item.detailBeatId !== item.after.id) context.addIssue({ code: 'custom', path: ['detailBeatId'], message: 'Reconciliation identity must remain stable' });
  if (item.before.status !== 'planned' || item.after.status !== 'planned') context.addIssue({ code: 'custom', path: ['after', 'status'], message: 'Only planned future detail beats may be projected' });
  if (item.choice === 'manual' && item.manualValue === undefined) context.addIssue({ code: 'custom', path: ['manualValue'], message: 'Manual choice requires a value' });
  if (item.choice !== 'manual' && item.manualValue !== undefined) context.addIssue({ code: 'custom', path: ['manualValue'], message: 'Manual value is only valid for manual choice' });
});
export type FinalizationReconciliationItem = z.infer<typeof reconciliationItemSchema>;

export const finalizationReconciliationProjectionSchema = z.object({
  status: z.enum(['none', 'ready', 'degraded']),
  reason: z.enum(['wording-only', 'no-affected-future-cards', 'no-generation-baseline']).optional(),
  planId: entityIdSchema.optional(),
  reportId: entityIdSchema.optional(),
  classification: z.enum(['wording-only', 'story-fact', 'plot-direction']).optional(),
  items: reconciliationItemSchema.array().max(32),
}).strict().superRefine((projection, context) => {
  if (projection.status === 'ready' && (projection.planId === undefined || projection.reportId === undefined || projection.classification === undefined)) {
    context.addIssue({ code: 'custom', path: ['planId'], message: 'Ready reconciliation requires source plan identity' });
  }
  if (projection.status === 'degraded' && projection.reason === undefined) context.addIssue({ code: 'custom', path: ['reason'], message: 'Degraded reconciliation requires an explicit reason' });
  if (projection.status === 'none' && projection.items.length > 0) context.addIssue({ code: 'custom', path: ['items'], message: 'No reconciliation cannot contain items' });
});
export type FinalizationReconciliationProjection = z.infer<typeof finalizationReconciliationProjectionSchema>;

/** I136 owns mutation/completion; I135 only exposes the bounded next-action projection. */
export const finalizationCompletionProjectionSchema = z.object({
  current: z.object({ detailBeatId: entityIdSchema.nullable(), status: z.literal('unchanged') }).strict(),
  next: z.object({ status: z.literal('deferred'), reason: z.literal('application-owned-by-i136') }).strict(),
}).strict();
export type FinalizationCompletionProjection = z.infer<typeof finalizationCompletionProjectionSchema>;

export const finalizationPrepareInputSchema = z.object({
  candidateId: entityIdSchema,
  finalSourceHash: fingerprintSchema,
}).strict();
export type FinalizationPrepareInput = z.infer<typeof finalizationPrepareInputSchema>;

/**
 * One author-facing, zero-write summary of all changes that a later I136
 * request may authorize. It is ephemeral and intentionally carries no prose.
 */
export const finalizationPlanSchema = z.object({
  planId: entityIdSchema,
  projectId: entityIdSchema,
  candidateId: entityIdSchema,
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  draftSourceHash: fingerprintSchema,
  finalSourceHash: fingerprintSchema,
  generationBaseline: finalizationGenerationBaselineSchema,
  layerFingerprints: finalizationLayerFingerprintsSchema,
  layerChanges: finalizationLayerChangeSchema.array().max(512),
  references: finalizationReferenceProjectionSchema,
  reconciliation: finalizationReconciliationProjectionSchema,
  completion: finalizationCompletionProjectionSchema,
  degradedReasons: z.enum(['no-generation-baseline', 'legacy-unbound-candidate']).array().max(2),
  createdAt: z.string().datetime({ offset: true }),
}).strict().superRefine((plan, context) => {
  if (plan.generationBaseline.kind === 'no-outline-baseline' && !plan.degradedReasons.includes('no-generation-baseline')) {
    context.addIssue({ code: 'custom', path: ['degradedReasons'], message: 'No-baseline plan must declare degradation' });
  }
  if (plan.generationBaseline.kind === 'baseline' && plan.degradedReasons.includes('no-generation-baseline')) {
    context.addIssue({ code: 'custom', path: ['degradedReasons'], message: 'Baseline plan cannot declare no-baseline degradation' });
  }
});
export type FinalizationPlan = z.infer<typeof finalizationPlanSchema>;

export const finalizationReadInputSchema = z.object({ planId: entityIdSchema }).strict();
export const finalizationCancelResultSchema = z.object({
  projectId: entityIdSchema,
  planId: entityIdSchema,
  status: z.literal('cancelled'),
}).strict();
export type FinalizationCancelResult = z.infer<typeof finalizationCancelResultSchema>;

/** One outer I11 decision; child layer owners never receive a second proposal. */
export const finalizationProposalInputSchema = z.object({
  planId: entityIdSchema,
  decisions: outlineReconciliationDecisionSchema.array().max(32),
}).strict();
export type FinalizationProposalInput = z.infer<typeof finalizationProposalInputSchema>;

/** The opaque authorization token persisted in the shared I11 record. */
export const finalizationGatePayloadSchema = z.object({
  projectId: entityIdSchema,
  planId: entityIdSchema,
  proposalId: entityIdSchema,
  operationId: entityIdSchema,
  planFingerprint: fingerprintSchema,
  finalSourceHash: fingerprintSchema,
  layerFingerprints: finalizationLayerFingerprintsSchema,
  generationBaseline: finalizationGenerationBaselineSchema,
  decisions: outlineReconciliationDecisionSchema.array().max(32),
}).strict();
export type FinalizationGatePayload = z.infer<typeof finalizationGatePayloadSchema>;

export const finalizationProposeResultSchema = z.object({
  projectId: entityIdSchema,
  planId: entityIdSchema,
  proposalId: entityIdSchema,
  operationId: entityIdSchema,
  status: z.literal('pending'),
}).strict();
export type FinalizationProposeResult = z.infer<typeof finalizationProposeResultSchema>;

export const finalizationRejectResultSchema = z.object({
  projectId: entityIdSchema,
  planId: entityIdSchema,
  proposalId: entityIdSchema,
  operationId: entityIdSchema,
  status: z.enum(['rejected', 'already-rejected']),
}).strict();
export type FinalizationRejectResult = z.infer<typeof finalizationRejectResultSchema>;

const finalizationCurrentSchema = z.object({
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  detailBeatId: entityIdSchema,
  status: z.literal('done'),
}).strict();
const finalizationNextSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('continued'),
    chapterId: entityIdSchema,
    sceneId: entityIdSchema,
    detailBeatId: entityIdSchema,
    baselineId: entityIdSchema,
  }).strict(),
  z.object({ status: z.literal('needs-target'), reason: z.enum(['no-next-card', 'missing-binding', 'missing-scene', 'no-generation-baseline', 'pending-reconciliation']) }).strict(),
]);

const finalizationAppliedFields = {
  projectId: entityIdSchema,
  planId: entityIdSchema,
  proposalId: entityIdSchema,
  operationId: entityIdSchema,
  appliedStages: z.enum(['c2', 'c1', 'c3', 'c4', 'b2', 'b5', 'c6', 'baseline']).array().max(8),
} as const;

export const finalizationApplyResultSchema = z.discriminatedUnion('status', [
  z.object({
    ...finalizationAppliedFields,
    status: z.enum(['applied', 'already-applied']),
    current: finalizationCurrentSchema,
    next: finalizationNextSchema,
  }).strict(),
  z.object({
    ...finalizationAppliedFields,
    status: z.literal('partial-failure'),
    failedStage: z.enum(['c2', 'c1', 'c3', 'c4', 'b2', 'b5', 'c6', 'baseline']),
    error: z.string().trim().min(1).max(240),
    retryable: z.literal(true),
  }).strict(),
  z.object({
    ...finalizationAppliedFields,
    status: z.literal('needs-target'),
    reason: z.literal('no-generation-baseline'),
  }).strict(),
  z.object({
    projectId: entityIdSchema,
    planId: entityIdSchema,
    proposalId: entityIdSchema,
    operationId: entityIdSchema,
    status: z.literal('stale'),
    reasons: z.enum(['source-changed', 'b5-changed', 'binding-changed', 'layer-changed', 'plan-changed', 'target-missing']).array().min(1).max(8),
  }).strict(),
]);
export type FinalizationApplyResult = z.infer<typeof finalizationApplyResultSchema>;

export type { OutlineReconciliationDecision };
