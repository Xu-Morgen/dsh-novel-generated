import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { detailBeatSchema } from './outline.js';
import {
  textChangeEvidenceSchema,
  textChangeImpactReportSchema,
  TEXT_CHANGE_IMPACT_MAX_EVIDENCE,
} from './text-change-impact.js';

/** I113 hard bounds for an in-memory, zero-write reconciliation plan. */
export const OUTLINE_RECONCILIATION_MAX_ITEMS = 32;
export const OUTLINE_RECONCILIATION_MAX_POINTS = 32;
export const OUTLINE_RECONCILIATION_MAX_POINT_LENGTH = 200;

export const outlineReconciliationChoiceSchema = z.enum(['keep', 'ai', 'manual', 'pending']);
export type OutlineReconciliationChoice = z.infer<typeof outlineReconciliationChoiceSchema>;

const editableFields = ['title', 'summary', 'pov', 'wordTarget', 'points'] as const;
export const outlineReconciliationEditableFieldSchema = z.enum(editableFields);
export type OutlineReconciliationEditableField = z.infer<typeof outlineReconciliationEditableFieldSchema>;

/** AI may propose only the five mutable fields of a future planned detail beat. */
export const outlineReconciliationSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1000),
  pov: z.string().trim().min(1).max(200),
  wordTarget: z.number().int().positive().max(1_000_000),
  points: z.string().trim().min(1).max(OUTLINE_RECONCILIATION_MAX_POINT_LENGTH)
    .array().max(OUTLINE_RECONCILIATION_MAX_POINTS),
}).strict();
export type OutlineReconciliationSuggestion = z.infer<typeof outlineReconciliationSuggestionSchema>;

/** Pure B5 diff: identity/status never appear as mutable fields. */
export const outlineReconciliationDiffSchema = z.object({
  changedFields: outlineReconciliationEditableFieldSchema.array().max(editableFields.length),
  before: outlineReconciliationSuggestionSchema,
  after: outlineReconciliationSuggestionSchema,
}).strict().superRefine((diff, context) => {
  const expected = editableFields.filter((field) => JSON.stringify(diff.before[field]) !== JSON.stringify(diff.after[field]));
  if (JSON.stringify(diff.changedFields) !== JSON.stringify(expected)) {
    context.addIssue({ code: 'custom', path: ['changedFields'], message: 'changedFields must be the canonical ordered pure diff' });
  }
});
export type OutlineReconciliationDiff = z.infer<typeof outlineReconciliationDiffSchema>;

const allChoices = ['keep', 'ai', 'manual', 'pending'] as const;

/** One future planned card with immutable identity and an explicit four-state decision. */
export const outlineReconciliationItemSchema = z.object({
  detailBeatId: entityIdSchema,
  actId: entityIdSchema,
  beatId: entityIdSchema,
  position: z.number().int().nonnegative(),
  before: detailBeatSchema,
  after: detailBeatSchema,
  diff: outlineReconciliationDiffSchema,
  evidence: textChangeEvidenceSchema.array().min(1).max(TEXT_CHANGE_IMPACT_MAX_EVIDENCE),
  allowedChoices: z.tuple([
    z.literal(allChoices[0]), z.literal(allChoices[1]), z.literal(allChoices[2]), z.literal(allChoices[3]),
  ]),
  choice: outlineReconciliationChoiceSchema,
  manualValue: detailBeatSchema.optional(),
  rationale: z.string().max(1000),
}).strict().superRefine((item, context) => {
  if (item.before.id !== item.detailBeatId || item.after.id !== item.detailBeatId) {
    context.addIssue({ code: 'custom', path: ['detailBeatId'], message: 'Reconciliation item identity must match both card values' });
  }
  if (item.before.status !== 'planned' || item.after.status !== 'planned') {
    context.addIssue({ code: 'custom', path: ['after', 'status'], message: 'Only planned future detail beats may be reconciled' });
  }
  if (item.manualValue !== undefined && (item.manualValue.id !== item.detailBeatId || item.manualValue.status !== 'planned')) {
    context.addIssue({ code: 'custom', path: ['manualValue'], message: 'Manual replacement must preserve planned card identity/status' });
  }
  if (item.choice === 'manual' && item.manualValue === undefined) {
    context.addIssue({ code: 'custom', path: ['manualValue'], message: 'Manual choice requires a canonical editedValue' });
  }
  if (item.choice !== 'manual' && item.manualValue !== undefined) {
    context.addIssue({ code: 'custom', path: ['manualValue'], message: 'editedValue is only allowed for manual choice' });
  }
  const diffBefore = suggestionOf(item.before);
  const diffAfter = suggestionOf(item.after);
  if (JSON.stringify(item.diff.before) !== JSON.stringify(diffBefore) || JSON.stringify(item.diff.after) !== JSON.stringify(diffAfter)) {
    context.addIssue({ code: 'custom', path: ['diff'], message: 'Pure diff must project the canonical before/after detail beat fields' });
  }
});
export type OutlineReconciliationItem = z.infer<typeof outlineReconciliationItemSchema>;

/** Canonical bounded plan consumed by I114; it has no apply/write command. */
export const outlineReconciliationPlanSchema = z.object({
  planId: entityIdSchema,
  projectId: entityIdSchema,
  reportId: entityIdSchema,
  baselineId: entityIdSchema,
  baselineSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  finalSourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  b5ContentFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  bindingFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  reportClassification: z.enum(['wording-only', 'story-fact', 'plot-direction']),
  items: outlineReconciliationItemSchema.array().max(OUTLINE_RECONCILIATION_MAX_ITEMS),
  revision: z.number().int().positive(),
  status: z.literal('ready'),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((plan, context) => {
  const ids = new Set<string>();
  let previousPosition = -1;
  for (const [index, item] of plan.items.entries()) {
    if (ids.has(item.detailBeatId)) context.addIssue({ code: 'custom', path: ['items', index, 'detailBeatId'], message: 'Duplicate reconciliation detail beat' });
    ids.add(item.detailBeatId);
    if (item.position <= previousPosition) context.addIssue({ code: 'custom', path: ['items', index, 'position'], message: 'Reconciliation items must be B5 order' });
    previousPosition = item.position;
  }
});
export type OutlineReconciliationPlan = z.infer<typeof outlineReconciliationPlanSchema>;

/** I113 input is a previously validated I112 report; no free-form commands cross the seam. */
export const outlineReconciliationPrepareInputSchema = z.object({
  report: textChangeImpactReportSchema,
}).strict();
export type OutlineReconciliationPrepareInput = z.infer<typeof outlineReconciliationPrepareInputSchema>;

export const outlineReconciliationRegenerateOneInputSchema = z.object({
  planId: entityIdSchema,
  detailBeatId: entityIdSchema,
}).strict();
export type OutlineReconciliationRegenerateOneInput = z.infer<typeof outlineReconciliationRegenerateOneInputSchema>;

export const outlineReconciliationPrepareResultSchema = outlineReconciliationPlanSchema;
export const outlineReconciliationReadResultSchema = outlineReconciliationPlanSchema;
export const outlineReconciliationRegenerateOneResultSchema = outlineReconciliationPlanSchema;
export const outlineReconciliationCancelResultSchema = z.object({
  planId: entityIdSchema,
  status: z.literal('cancelled'),
}).strict();
export type OutlineReconciliationCancelResult = z.infer<typeof outlineReconciliationCancelResultSchema>;

export function suggestionOf(detailBeat: Pick<z.infer<typeof detailBeatSchema>, 'title' | 'summary' | 'pov' | 'wordTarget' | 'points'>): OutlineReconciliationSuggestion {
  return outlineReconciliationSuggestionSchema.parse({
    title: detailBeat.title,
    summary: detailBeat.summary,
    pov: detailBeat.pov,
    wordTarget: detailBeat.wordTarget,
    points: detailBeat.points,
  });
}

export { editableFields };
