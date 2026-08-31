import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { detailBeatSchema } from './outline.js';
import { outlineGenerationScopeInputSchema } from './outline-generation-scope.js';

/** I134 bounded model output and session limits; generation is never a whole-outline replace. */
export const OUTLINE_DETAIL_GENERATION_MAX_CARDS_PER_BEAT = 8;
export const OUTLINE_DETAIL_GENERATION_MAX_ITEMS = 4_096;
export const OUTLINE_DETAIL_GENERATION_MAX_RATIONALE = 2_000;

const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const detailBeatFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(1_000),
  pov: z.string().trim().min(1).max(200),
  wordTarget: z.number().int().positive().max(1_000_000),
  points: z.string().trim().min(1).max(200).array().max(32),
}).strict();
export type OutlineDetailBeatFields = z.infer<typeof detailBeatFieldsSchema>;

/** Only the beat facts needed by the model; Host supplies identity/status/order. */
export const outlineDetailGenerationParserInputSchema = z.object({
  mode: z.enum(['fill-missing', 'regenerate-existing']),
  actId: entityIdSchema,
  beatId: entityIdSchema,
  beatTitle: z.string().trim().min(1).max(200),
  beatDescription: z.string().trim().min(1).max(1_000),
  existing: detailBeatFieldsSchema.optional(),
}).strict().superRefine((input, context) => {
  if (input.mode === 'regenerate-existing' && input.existing === undefined) {
    context.addIssue({ code: 'custom', path: ['existing'], message: 'Regeneration requires an existing detail beat' });
  }
  if (input.mode === 'fill-missing' && input.existing !== undefined) {
    context.addIssue({ code: 'custom', path: ['existing'], message: 'Fill mode cannot carry an existing detail beat' });
  }
});
export type OutlineDetailGenerationParserInput = z.infer<typeof outlineDetailGenerationParserInputSchema>;

/** Strict JSON-only LLM output. It cannot mint IDs, statuses, parents, or order. */
export const outlineDetailGenerationParserOutputSchema = z.object({
  detailBeats: detailBeatFieldsSchema.array().min(1).max(OUTLINE_DETAIL_GENERATION_MAX_CARDS_PER_BEAT),
  rationale: z.string().trim().max(OUTLINE_DETAIL_GENERATION_MAX_RATIONALE),
}).strict();
export type OutlineDetailGenerationParserOutput = z.infer<typeof outlineDetailGenerationParserOutputSchema>;

export const outlineDetailGenerationChoiceSchema = z.enum(['keep', 'edit', 'regenerate', 'skip']);
export type OutlineDetailGenerationChoice = z.infer<typeof outlineDetailGenerationChoiceSchema>;

/** A session item carries the immutable before value and one editable after value. */
export const outlineDetailGenerationItemSchema = z.object({
  actId: entityIdSchema,
  beatId: entityIdSchema,
  detailBeatId: entityIdSchema,
  position: z.number().int().nonnegative(),
  origin: z.enum(['existing', 'generated']),
  before: detailBeatSchema.optional(),
  after: detailBeatSchema,
  choice: outlineDetailGenerationChoiceSchema,
  rationale: z.string().trim().max(OUTLINE_DETAIL_GENERATION_MAX_RATIONALE),
}).strict().superRefine((item, context) => {
  if (item.origin === 'existing' && (item.before === undefined || item.before.id !== item.detailBeatId || item.after.id !== item.detailBeatId)) {
    context.addIssue({ code: 'custom', path: ['detailBeatId'], message: 'Existing candidate item must preserve detail beat identity' });
  }
  if (item.origin === 'generated' && item.before !== undefined) {
    context.addIssue({ code: 'custom', path: ['before'], message: 'Generated candidate item cannot carry a before value' });
  }
  if (item.origin === 'generated' && item.choice === 'regenerate') {
    context.addIssue({ code: 'custom', path: ['choice'], message: 'Generated candidate item cannot be regenerated' });
  }
  if (item.after.status !== 'planned') {
    context.addIssue({ code: 'custom', path: ['after', 'status'], message: 'Scope detail generation only applies planned cards' });
  }
});
export type OutlineDetailGenerationItem = z.infer<typeof outlineDetailGenerationItemSchema>;

/** Ephemeral, restart-safe-through-Gate candidate projection; no B5 write command is embedded. */
export const outlineDetailGenerationCandidateSchema = z.object({
  candidateId: entityIdSchema,
  projectId: entityIdSchema,
  scope: outlineGenerationScopeInputSchema,
  scopeFingerprint: fingerprintSchema,
  b5ContentFingerprint: fingerprintSchema,
  items: outlineDetailGenerationItemSchema.array().max(OUTLINE_DETAIL_GENERATION_MAX_ITEMS),
  generatedDetailBeatCount: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  status: z.literal('ready'),
  rationale: z.string().trim().max(OUTLINE_DETAIL_GENERATION_MAX_RATIONALE),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((candidate, context) => {
  const ids = new Set<string>();
  let generated = 0;
  for (const [index, item] of candidate.items.entries()) {
    if (ids.has(item.detailBeatId)) context.addIssue({ code: 'custom', path: ['items', index, 'detailBeatId'], message: 'Candidate detail beat ids must be unique' });
    ids.add(item.detailBeatId);
    if (item.origin === 'generated') generated += 1;
  }
  if (generated !== candidate.generatedDetailBeatCount) context.addIssue({ code: 'custom', path: ['generatedDetailBeatCount'], message: 'Generated detail beat count must match items' });
});
export type OutlineDetailGenerationCandidate = z.infer<typeof outlineDetailGenerationCandidateSchema>;

export const outlineDetailGenerationGenerateInputSchema = z.object({ scope: outlineGenerationScopeInputSchema }).strict();
export type OutlineDetailGenerationGenerateInput = z.infer<typeof outlineDetailGenerationGenerateInputSchema>;

const candidateItemInput = z.object({ candidateId: entityIdSchema, detailBeatId: entityIdSchema }).strict();
export const outlineDetailGenerationEditInputSchema = candidateItemInput.extend({ value: detailBeatSchema }).strict();
export type OutlineDetailGenerationEditInput = z.infer<typeof outlineDetailGenerationEditInputSchema>;
export const outlineDetailGenerationRegenerateInputSchema = candidateItemInput;
export type OutlineDetailGenerationRegenerateInput = z.infer<typeof outlineDetailGenerationRegenerateInputSchema>;
export const outlineDetailGenerationSkipInputSchema = candidateItemInput;
export type OutlineDetailGenerationSkipInput = z.infer<typeof outlineDetailGenerationSkipInputSchema>;

export const outlineDetailGenerationCandidateInputSchema = z.object({ candidateId: entityIdSchema }).strict();
export type OutlineDetailGenerationCandidateInput = z.infer<typeof outlineDetailGenerationCandidateInputSchema>;

/** Gate payload stores the reviewed choices, while the candidate remains the source for values. */
export const outlineDetailGenerationGatePayloadSchema = z.object({
  projectId: entityIdSchema,
  candidateId: entityIdSchema,
  proposalId: entityIdSchema,
  candidateFingerprint: fingerprintSchema,
  b5ContentFingerprint: fingerprintSchema,
  expectedB5ContentFingerprint: fingerprintSchema,
  candidate: outlineDetailGenerationCandidateSchema,
  decisions: z.object({ detailBeatId: entityIdSchema, choice: outlineDetailGenerationChoiceSchema }).strict().array().max(OUTLINE_DETAIL_GENERATION_MAX_ITEMS),
}).strict();
export type OutlineDetailGenerationGatePayload = z.infer<typeof outlineDetailGenerationGatePayloadSchema>;

export const outlineDetailGenerationProposeResultSchema = z.object({
  projectId: entityIdSchema, candidateId: entityIdSchema, proposalId: entityIdSchema, status: z.literal('pending'),
}).strict();
export type OutlineDetailGenerationProposeResult = z.infer<typeof outlineDetailGenerationProposeResultSchema>;

export const outlineDetailGenerationAcceptResultSchema = z.object({
  projectId: entityIdSchema, candidateId: entityIdSchema, proposalId: entityIdSchema,
  status: z.enum(['accepted', 'already-accepted']),
  appliedDetailBeatIds: entityIdSchema.array().max(OUTLINE_DETAIL_GENERATION_MAX_ITEMS),
  skippedDetailBeatIds: entityIdSchema.array().max(OUTLINE_DETAIL_GENERATION_MAX_ITEMS),
  b5ContentFingerprint: fingerprintSchema,
}).strict();
export type OutlineDetailGenerationAcceptResult = z.infer<typeof outlineDetailGenerationAcceptResultSchema>;

export const outlineDetailGenerationRejectResultSchema = z.object({
  projectId: entityIdSchema, candidateId: entityIdSchema, proposalId: entityIdSchema, status: z.enum(['rejected', 'already-rejected']),
}).strict();
export type OutlineDetailGenerationRejectResult = z.infer<typeof outlineDetailGenerationRejectResultSchema>;

export const outlineDetailGenerationCancelResultSchema = z.object({
  projectId: entityIdSchema, candidateId: entityIdSchema, status: z.literal('cancelled'),
}).strict();
export type OutlineDetailGenerationCancelResult = z.infer<typeof outlineDetailGenerationCancelResultSchema>;

export const outlineDetailGenerationReadResultSchema = outlineDetailGenerationCandidateSchema;
