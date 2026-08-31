import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { projectFingerprintSchema } from './text-mutation.js';

/** I106 deletion target: the target identity is explicit and never inferred by Client. */
export const textDeletionTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('chapter'), chapterId: entityIdSchema }).strict(),
  z.object({ kind: z.literal('scene'), chapterId: entityIdSchema, sceneId: entityIdSchema }).strict(),
]);

export const textDeletionBranchSchema = z.object({
  id: entityIdSchema,
  label: z.string(),
  chosen: z.boolean(),
  sourceHash: projectFingerprintSchema,
}).strict();

/** Bounded C5 summary. Prose and branch bodies never cross this contract. */
export const textDeletionSourceSchema = z.object({
  sceneId: entityIdSchema,
  sourceHash: projectFingerprintSchema,
  branches: z.array(textDeletionBranchSchema),
}).strict();

export const textDeletionBindingSchema = z.object({
  sceneId: entityIdSchema,
  detailBeatId: entityIdSchema,
  chapterId: entityIdSchema,
  source: z.enum(['manual', 'default']),
}).strict();

const activityBase = {
  id: entityIdSchema,
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
};

export const textDeletionQueueActivitySchema = z.object({
  ...activityBase,
  status: z.enum(['queued', 'running', 'candidate-ready']),
  candidateId: entityIdSchema.nullable(),
}).strict();

export const textDeletionCandidateActivitySchema = z.object({
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  candidateId: entityIdSchema,
  intent: z.enum(['generate', 'continue', 'scene-card', 'rewrite']),
}).strict();

/** A stable, bounded pointer into an existing history projection. */
export const textDeletionHistoricalReferenceSchema = z.object({
  id: entityIdSchema,
  kind: z.string().trim().min(1).max(64),
  label: z.string().max(200),
  chapterId: entityIdSchema.optional(),
  sceneId: entityIdSchema.optional(),
}).strict();

/**
 * I106 impact contract. Arrays are projections, not new persistence owners;
 * `impactFingerprint` covers every mutable field except itself.
 */
export const textDeletionImpactSchema = z.object({
  kind: z.enum(['chapter', 'scene']),
  chapterId: entityIdSchema,
  sceneId: entityIdSchema.optional(),
  sceneCount: z.number().int().nonnegative(),
  branchCount: z.number().int().nonnegative(),
  proseCharacters: z.number().int().nonnegative(),
  sources: z.array(textDeletionSourceSchema),
  projectFingerprint: projectFingerprintSchema,
  targetFingerprint: projectFingerprintSchema,
  bindings: z.array(textDeletionBindingSchema),
  activeQueue: z.array(textDeletionQueueActivitySchema),
  activeCandidates: z.array(textDeletionCandidateActivitySchema),
  historicalReferences: z.array(textDeletionHistoricalReferenceSchema),
  opaqueHistoryCount: z.number().int().nonnegative(),
  blockers: z.array(z.enum(['last-scene-landing', 'active-queue', 'active-candidate'])),
  impactFingerprint: projectFingerprintSchema,
}).strict().superRefine((impact, context) => {
  const blockers = new Set(impact.blockers);
  if (blockers.size !== impact.blockers.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['blockers'], message: 'Duplicate deletion blocker' });
  }
  if (impact.kind === 'chapter' && impact.sceneId !== undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sceneId'], message: 'Chapter impact must not include sceneId' });
  }
  if (impact.kind === 'scene' && impact.sceneId === undefined) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['sceneId'], message: 'Scene impact requires sceneId' });
  }
});

export const textDeletionImpactResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ready'), impact: textDeletionImpactSchema }).strict(),
  z.object({ status: z.literal('blocked'), impact: textDeletionImpactSchema }).strict(),
]);

export const textDeletionProposeResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('pending'), proposalId: entityIdSchema, impact: textDeletionImpactSchema }).strict(),
  z.object({ status: z.literal('stale'), impact: textDeletionImpactSchema }).strict(),
  z.object({ status: z.literal('blocked'), impact: textDeletionImpactSchema }).strict(),
]);

export const textDeletionApplyResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('deleted'), proposalId: entityIdSchema, fingerprint: projectFingerprintSchema }).strict(),
  z.object({ status: z.literal('already-deleted'), proposalId: entityIdSchema, fingerprint: projectFingerprintSchema }).strict(),
  z.object({ status: z.literal('stale'), impact: textDeletionImpactSchema }).strict(),
  z.object({ status: z.literal('blocked'), impact: textDeletionImpactSchema }).strict(),
]);

export const textDeletionImpactInputSchema = textDeletionTargetSchema;
export const textDeletionProposeInputSchema = z.object({
  target: textDeletionTargetSchema,
  expectedImpactFingerprint: projectFingerprintSchema,
}).strict();
/** Frozen Host-owned payload stored in I11; Client never supplies this field. */
export const textDeletionProposalPayloadSchema = textDeletionProposeInputSchema.extend({
  impact: textDeletionImpactSchema,
}).strict();
export const textDeletionApplyInputSchema = z.object({ proposalId: entityIdSchema }).strict();
export const textDeletionRejectResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('rejected'), proposalId: entityIdSchema }).strict(),
  z.object({ status: z.literal('already-rejected'), proposalId: entityIdSchema }).strict(),
]);

export type TextDeletionTarget = z.infer<typeof textDeletionTargetSchema>;
export type TextDeletionSource = z.infer<typeof textDeletionSourceSchema>;
export type TextDeletionImpact = z.infer<typeof textDeletionImpactSchema>;
export type TextDeletionImpactResult = z.infer<typeof textDeletionImpactResultSchema>;
export type TextDeletionProposeInput = z.infer<typeof textDeletionProposeInputSchema>;
export type TextDeletionProposalPayload = z.infer<typeof textDeletionProposalPayloadSchema>;
export type TextDeletionProposeResult = z.infer<typeof textDeletionProposeResultSchema>;
export type TextDeletionApplyResult = z.infer<typeof textDeletionApplyResultSchema>;
