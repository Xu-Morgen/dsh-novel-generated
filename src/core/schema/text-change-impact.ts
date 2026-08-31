import { z } from 'zod';
import { entityIdSchema } from './base.js';

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const TEXT_CHANGE_IMPACT_MAX_TEXT = 200_000;
export const TEXT_CHANGE_IMPACT_MAX_EVIDENCE = 8;
export const TEXT_CHANGE_IMPACT_MAX_AFFECTED_CARDS = 32;
export const TEXT_CHANGE_IMPACT_MAX_FUTURE_CARDS = 128;

/** UTF-16 half-open range used by the Host-owned text impact evidence. */
export const textChangeRangeSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
}).strict().superRefine((range, context) => {
  if (range.end < range.start) context.addIssue({ code: 'custom', path: ['end'], message: 'Range end must not precede start' });
});
export type TextChangeRange = z.infer<typeof textChangeRangeSchema>;

export const textChangeClassificationSchema = z.enum(['wording-only', 'story-fact', 'plot-direction']);
export type TextChangeClassification = z.infer<typeof textChangeClassificationSchema>;

/** Deterministic baseline→final delta; no model judgment is stored here. */
export const textChangeDeltaSchema = z.object({
  beforeHash: fingerprintSchema,
  afterHash: fingerprintSchema,
  beforeLength: z.number().int().nonnegative(),
  afterLength: z.number().int().nonnegative(),
  beforeRange: textChangeRangeSchema,
  afterRange: textChangeRangeSchema,
  beforeQuote: z.string().max(400),
  afterQuote: z.string().max(400),
  pureFormatting: z.boolean(),
}).strict();
export type TextChangeDelta = z.infer<typeof textChangeDeltaSchema>;

/** Evidence must point into the exact baseline/final strings supplied to the model. */
export const textChangeEvidenceSchema = z.object({
  sourceHash: fingerprintSchema,
  beforeRange: textChangeRangeSchema,
  afterRange: textChangeRangeSchema,
  beforeQuote: z.string().max(400),
  afterQuote: z.string().max(400),
}).strict();
export type TextChangeEvidence = z.infer<typeof textChangeEvidenceSchema>;

/** A bounded future B5 card descriptor exposed to the classifier only. */
export const textChangeFutureCardSchema = z.object({
  detailBeatId: entityIdSchema,
  position: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1000),
  pov: z.string().trim().min(1).max(200),
}).strict();
export type TextChangeFutureCard = z.infer<typeof textChangeFutureCardSchema>;

/** Canonical zero-write report consumed by later I113 reconciliation. */
export const textChangeImpactReportSchema = z.object({
  impactId: entityIdSchema,
  projectId: entityIdSchema,
  baselineId: entityIdSchema,
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  baselineSourceHash: fingerprintSchema,
  finalSourceHash: fingerprintSchema,
  delta: textChangeDeltaSchema,
  classification: textChangeClassificationSchema,
  confidence: z.enum(['low', 'medium', 'high']),
  evidence: textChangeEvidenceSchema.array().min(1).max(TEXT_CHANGE_IMPACT_MAX_EVIDENCE),
  eligibleFutureDetailBeatIds: entityIdSchema.array().max(TEXT_CHANGE_IMPACT_MAX_FUTURE_CARDS),
  affectedDetailBeatIds: entityIdSchema.array().max(TEXT_CHANGE_IMPACT_MAX_AFFECTED_CARDS),
  rationale: z.string().max(2000),
  analyzedAt: z.string().datetime({ offset: true }),
}).strict();
export type TextChangeImpactReport = z.infer<typeof textChangeImpactReportSchema>;

/** Additive Host command: analyze one I108 baseline against the current C5 scene. */
export const textChangeImpactPrepareInputSchema = z.object({
  baselineId: entityIdSchema,
  finalSourceHash: fingerprintSchema,
}).strict();
export type TextChangeImpactPrepareInput = z.infer<typeof textChangeImpactPrepareInputSchema>;

export const textChangeImpactPrepareResultSchema = z.object({
  impactId: entityIdSchema,
  status: z.literal('ready'),
}).strict();
export type TextChangeImpactPrepareResult = z.infer<typeof textChangeImpactPrepareResultSchema>;

export const textChangeImpactCancelResultSchema = z.object({
  impactId: entityIdSchema,
  status: z.literal('cancelled'),
}).strict();
export type TextChangeImpactCancelResult = z.infer<typeof textChangeImpactCancelResultSchema>;
