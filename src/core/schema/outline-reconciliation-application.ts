import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { detailBeatSchema, type DetailBeat } from './outline.js';
import { outlineProgressSchema } from './outline-progress.js';
import {
  outlineReconciliationChoiceSchema,
  outlineReconciliationPlanSchema,
} from './outline-reconciliation.js';
import type { OutlineReconciliationChoice } from './outline-reconciliation.js';

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** One author decision; identity and planned status are immutable at the seam. */
export const outlineReconciliationDecisionSchema = z.object({
  detailBeatId: entityIdSchema,
  choice: outlineReconciliationChoiceSchema,
  manualValue: detailBeatSchema.optional(),
}).strict().superRefine((decision, context) => {
  if (decision.choice === 'manual' && decision.manualValue === undefined) {
    context.addIssue({ code: 'custom', path: ['manualValue'], message: 'Manual reconciliation requires a detail beat value' });
  }
  if (decision.choice !== 'manual' && decision.manualValue !== undefined) {
    context.addIssue({ code: 'custom', path: ['manualValue'], message: 'Manual value is only valid for manual choice' });
  }
  if (decision.manualValue !== undefined && (decision.manualValue.id !== decision.detailBeatId || decision.manualValue.status !== 'planned')) {
    context.addIssue({ code: 'custom', path: ['manualValue'], message: 'Manual value must preserve planned card identity/status' });
  }
});
export type OutlineReconciliationDecision = z.infer<typeof outlineReconciliationDecisionSchema>;

/** Strict input for the only command that can open an I11 application proposal. */
export const outlineReconciliationProposeInputSchema = z.object({
  planId: entityIdSchema,
  decisions: outlineReconciliationDecisionSchema.array().max(32),
}).strict();
export type OutlineReconciliationProposeInput = z.infer<typeof outlineReconciliationProposeInputSchema>;

/** Canonical payload persisted opaquely by I11 and revalidated by the Host owner. */
export const outlineReconciliationGatePayloadSchema = z.object({
  projectId: entityIdSchema,
  planId: entityIdSchema,
  proposalId: entityIdSchema,
  planRevision: z.number().int().positive(),
  planFingerprint: fingerprintSchema,
  reportId: entityIdSchema,
  baselineId: entityIdSchema,
  baselineSourceHash: fingerprintSchema,
  finalSourceHash: fingerprintSchema,
  b5ContentFingerprint: fingerprintSchema,
  expectedB5ContentFingerprint: fingerprintSchema,
  bindingFingerprint: fingerprintSchema,
  decisions: outlineReconciliationDecisionSchema.array().max(32),
}).strict();
export type OutlineReconciliationGatePayload = z.infer<typeof outlineReconciliationGatePayloadSchema>;

export const outlineReconciliationProposeResultSchema = z.object({
  projectId: entityIdSchema,
  planId: entityIdSchema,
  proposalId: entityIdSchema,
  status: z.literal('pending'),
  decisions: outlineReconciliationDecisionSchema.array().max(32),
}).strict();
export type OutlineReconciliationProposeResult = z.infer<typeof outlineReconciliationProposeResultSchema>;

const appliedResult = {
  projectId: entityIdSchema,
  planId: entityIdSchema,
  proposalId: entityIdSchema,
  appliedDetailBeatIds: entityIdSchema.array().max(32),
  pendingDetailBeatIds: entityIdSchema.array().max(32),
  b5ContentFingerprint: fingerprintSchema,
} as const;

export const outlineReconciliationAcceptResultSchema = z.object({
  ...appliedResult,
  status: z.enum(['accepted', 'already-accepted']),
}).strict();
export type OutlineReconciliationAcceptResult = z.infer<typeof outlineReconciliationAcceptResultSchema>;

export const outlineReconciliationRejectResultSchema = z.object({
  projectId: entityIdSchema,
  planId: entityIdSchema,
  proposalId: entityIdSchema,
  status: z.enum(['rejected', 'already-rejected']),
}).strict();
export type OutlineReconciliationRejectResult = z.infer<typeof outlineReconciliationRejectResultSchema>;

export const outlineReconciliationFinalizeInputSchema = z.object({
  planId: entityIdSchema,
  finalSourceHash: fingerprintSchema,
}).strict();
export type OutlineReconciliationFinalizeInput = z.infer<typeof outlineReconciliationFinalizeInputSchema>;

const finalizationResult = {
  projectId: entityIdSchema,
  planId: entityIdSchema,
  baselineId: entityIdSchema,
  current: z.object({
    chapterId: entityIdSchema,
    sceneId: entityIdSchema,
    detailBeatId: entityIdSchema,
    status: z.literal('done'),
  }).strict(),
  progress: outlineProgressSchema,
  b5ContentFingerprint: fingerprintSchema,
} as const;

export const outlineReconciliationFinalizeResultSchema = z.object({
  ...finalizationResult,
  status: z.enum(['finalized', 'already-finalized']),
}).strict();
export type OutlineReconciliationFinalizeResult = z.infer<typeof outlineReconciliationFinalizeResultSchema>;

const nextTargetSchema = z.object({
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  detailBeatId: entityIdSchema,
  baselineId: entityIdSchema,
}).strict();
export type OutlineReconciliationNextTarget = z.infer<typeof nextTargetSchema>;

export const outlineReconciliationContinueResultSchema = z.discriminatedUnion('status', [
  z.object({
    ...finalizationResult,
    status: z.literal('continued'),
    next: nextTargetSchema,
  }).strict(),
  z.object({
    ...finalizationResult,
    status: z.literal('needs-target'),
    reason: z.enum(['no-next-card', 'missing-binding', 'missing-scene']),
  }).strict(),
  z.object({
    ...finalizationResult,
    status: z.literal('blocked-pending'),
    detailBeatId: entityIdSchema,
  }).strict(),
]);
export type OutlineReconciliationContinueResult = z.infer<typeof outlineReconciliationContinueResultSchema>;

/** Shared compile-time vocabulary for Host and Client decision controls. */
export type { OutlineReconciliationChoice };
export type { DetailBeat };

/** The application service only accepts the canonical I113 plan shape. */
export function parseReconciliationPlan(value: unknown) {
  return outlineReconciliationPlanSchema.parse(value);
}
