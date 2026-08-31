import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { detailBeatSchema } from './outline.js';

/**
 * I108 immutable generation-intent contract (design §14.14 / R18-11a).
 * This is evidence for a generation request, not a second B5 editor or a
 * portable narrative layer. B5/C5 remain owned by their existing repositories.
 */
export const OUTLINE_GENERATION_BASELINE_AUTHORING_BASE_LIMIT = 200_000;
export const OUTLINE_GENERATION_BASELINE_CANDIDATE_LIMIT = 32;

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

/** Frozen B5 detail-beat projection, including its owning act/beat identity. */
export const outlineGenerationBaselineSceneCardSchema = z.object({
  actId: entityIdSchema,
  beatId: entityIdSchema,
  beatTitle: z.string().trim().min(1).max(200),
  detailBeat: detailBeatSchema,
}).strict();
export type OutlineGenerationBaselineSceneCard = z.infer<typeof outlineGenerationBaselineSceneCardSchema>;

/** Bounded authoring evidence retained for later change comparison. */
export const outlineGenerationBaselineAuthoringBaseSchema = z.object({
  content: z.string().max(OUTLINE_GENERATION_BASELINE_AUTHORING_BASE_LIMIT),
  sourceHash: fingerprintSchema,
}).strict();
export type OutlineGenerationBaselineAuthoringBase = z.infer<typeof outlineGenerationBaselineAuthoringBaseSchema>;

export const outlineGenerationBaselineStatusSchema = z.enum(['current', 'stale', 'finalized', 'superseded']);
export type OutlineGenerationBaselineStatus = z.infer<typeof outlineGenerationBaselineStatusSchema>;

/**
 * Read/projection shape of one baseline. `revision` is assigned by the
 * append-only project event stream; status is projected from events plus live
 * owner freshness and never edits a previously recorded event.
 */
export const outlineGenerationBaselineSchema = z.object({
  baselineId: entityIdSchema,
  projectId: entityIdSchema,
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  detailBeatId: entityIdSchema,
  b5ContentFingerprint: fingerprintSchema,
  bindingFingerprint: fingerprintSchema,
  sceneCard: outlineGenerationBaselineSceneCardSchema,
  revision: z.number().int().positive(),
  authoringBase: outlineGenerationBaselineAuthoringBaseSchema,
  status: outlineGenerationBaselineStatusSchema,
  generatedCandidateIds: z.array(entityIdSchema).max(OUTLINE_GENERATION_BASELINE_CANDIDATE_LIMIT),
  createdAt: z.string().datetime({ offset: true }),
  finalizedAt: z.string().datetime({ offset: true }).optional(),
  supersededBy: entityIdSchema.optional(),
}).strict().superRefine((baseline, context) => {
  if (baseline.sceneCard.detailBeat.id !== baseline.detailBeatId) {
    context.addIssue({ code: 'custom', path: ['sceneCard', 'detailBeat', 'id'], message: 'Scene card detail beat must match baseline detailBeatId' });
  }
  if (baseline.status === 'finalized' && baseline.finalizedAt === undefined) {
    context.addIssue({ code: 'custom', path: ['finalizedAt'], message: 'Finalized baseline requires finalizedAt' });
  }
  if (baseline.status === 'superseded' && baseline.supersededBy === undefined) {
    context.addIssue({ code: 'custom', path: ['supersededBy'], message: 'Superseded baseline requires supersededBy' });
  }
});
export type OutlineGenerationBaseline = z.infer<typeof outlineGenerationBaselineSchema>;

/** Input used by the Host to resolve one already bound C5 scene to a B5 card. */
export const outlineGenerationBaselineCreateInputSchema = z.object({
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  detailBeatId: entityIdSchema,
}).strict();
export type OutlineGenerationBaselineCreateInput = z.infer<typeof outlineGenerationBaselineCreateInputSchema>;

/** Target selector for the current-baseline lookup; card is optional for UI recovery. */
export const outlineGenerationBaselineCurrentInputSchema = z.object({
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  detailBeatId: entityIdSchema.optional(),
}).strict();
export type OutlineGenerationBaselineCurrentInput = z.infer<typeof outlineGenerationBaselineCurrentInputSchema>;

/** Candidate linkage is an append-only event and is idempotent by candidateId. */
export const outlineGenerationBaselineAttachGeneratedInputSchema = z.object({
  baselineId: entityIdSchema,
  candidateId: entityIdSchema,
}).strict();
export type OutlineGenerationBaselineAttachGeneratedInput = z.infer<typeof outlineGenerationBaselineAttachGeneratedInputSchema>;

export const outlineGenerationBaselineStaleReasonSchema = z.enum([
  'target-missing',
  'b5-changed',
  'binding-changed',
  'source-changed',
]);
export type OutlineGenerationBaselineStaleReason = z.infer<typeof outlineGenerationBaselineStaleReasonSchema>;

/** Freshness is separate from lifecycle status so finalized evidence remains readable. */
export const outlineGenerationBaselineReadResultSchema = z.object({
  baseline: outlineGenerationBaselineSchema,
  freshness: z.enum(['fresh', 'stale']),
  staleReasons: z.array(outlineGenerationBaselineStaleReasonSchema),
}).strict();
export type OutlineGenerationBaselineReadResult = z.infer<typeof outlineGenerationBaselineReadResultSchema>;

export const outlineGenerationBaselineCurrentResultSchema = z.object({
  baseline: outlineGenerationBaselineSchema.nullable(),
  freshness: z.enum(['fresh', 'stale', 'none']),
  staleReasons: z.array(outlineGenerationBaselineStaleReasonSchema),
}).strict();
export type OutlineGenerationBaselineCurrentResult = z.infer<typeof outlineGenerationBaselineCurrentResultSchema>;

interface BaselineEventEnvelope {
  eventId: string;
  projectId: string;
  sequence: number;
  recordedAt: string;
}

const eventEnvelope = {
  eventId: entityIdSchema,
  projectId: entityIdSchema,
  sequence: z.number().int().positive(),
  recordedAt: z.string().datetime({ offset: true }),
} as const;

export const outlineGenerationBaselineCreateEventSchema = z.object({
  ...eventEnvelope,
  kind: z.literal('create'),
  baseline: outlineGenerationBaselineSchema,
}).strict();

export const outlineGenerationBaselineAttachGeneratedEventSchema = z.object({
  ...eventEnvelope,
  kind: z.literal('attach-generated'),
  baselineId: entityIdSchema,
  candidateId: entityIdSchema,
}).strict();

export const outlineGenerationBaselineFinalizeEventSchema = z.object({
  ...eventEnvelope,
  kind: z.literal('finalize'),
  baselineId: entityIdSchema,
  finalSourceHash: fingerprintSchema,
}).strict();

export const outlineGenerationBaselineSupersedeEventSchema = z.object({
  ...eventEnvelope,
  kind: z.literal('supersede'),
  baselineId: entityIdSchema,
  supersededBy: entityIdSchema,
}).strict();

/** Append-only event union; no update/delete event exists by design. */
export const outlineGenerationBaselineEventSchema = z.discriminatedUnion('kind', [
  outlineGenerationBaselineCreateEventSchema,
  outlineGenerationBaselineAttachGeneratedEventSchema,
  outlineGenerationBaselineFinalizeEventSchema,
  outlineGenerationBaselineSupersedeEventSchema,
]);
export type OutlineGenerationBaselineEvent = z.infer<typeof outlineGenerationBaselineEventSchema> & BaselineEventEnvelope;

export const outlineGenerationBaselineEventKinds = ['create', 'attach-generated', 'finalize', 'supersede'] as const;
