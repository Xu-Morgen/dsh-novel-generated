import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { detailBeatSchema } from './outline.js';
import { projectFingerprintSchema } from './text-mutation.js';

/** I133 bounds for one scope response; generation never receives an unbounded B5 projection. */
export const OUTLINE_GENERATION_SCOPE_MAX_TARGET_BEATS = 512;
export const OUTLINE_GENERATION_SCOPE_MAX_DETAIL_BEATS = 2_048;
export const OUTLINE_GENERATION_SCOPE_MAX_NEW_DETAIL_BEATS = 1_024;
export const OUTLINE_GENERATION_SCOPE_PAGE_MAX_TARGET_BEATS = 128;

/** Offset pagination keeps an all-book projection bounded without inventing a second B5 owner. */
export const outlineGenerationScopePageSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(OUTLINE_GENERATION_SCOPE_PAGE_MAX_TARGET_BEATS),
}).strict();
export type OutlineGenerationScopePage = z.infer<typeof outlineGenerationScopePageSchema>;

const scopePageInput = { page: outlineGenerationScopePageSchema.optional() };

/** Author selection is resolved by the Host against canonical B5/C5 owners. */
export const outlineGenerationScopeInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('act'), actId: entityIdSchema, ...scopePageInput }).strict(),
  z.object({ kind: z.literal('outline-beat'), beatId: entityIdSchema, ...scopePageInput }).strict(),
  z.object({ kind: z.literal('bound-chapter'), chapterId: entityIdSchema, ...scopePageInput }).strict(),
  z.object({ kind: z.literal('all'), ...scopePageInput }).strict(),
]);
export type OutlineGenerationScopeInput = z.infer<typeof outlineGenerationScopeInputSchema>;

/** One existing B5 detail card in a resolved target beat. */
export const outlineGenerationScopeCardSchema = z.object({
  detailBeatId: entityIdSchema,
  detailBeatIndex: z.number().int().nonnegative(),
  fingerprint: projectFingerprintSchema,
  detailBeat: detailBeatSchema,
}).strict();
export type OutlineGenerationScopeCard = z.infer<typeof outlineGenerationScopeCardSchema>;

/** Stable act/beat target; an empty `cards` array is the missing-detail case. */
export const outlineGenerationScopeTargetSchema = z.object({
  actId: entityIdSchema,
  actIndex: z.number().int().nonnegative(),
  beatId: entityIdSchema,
  beatIndex: z.number().int().nonnegative(),
  cards: z.array(outlineGenerationScopeCardSchema).max(OUTLINE_GENERATION_SCOPE_MAX_DETAIL_BEATS),
}).strict();
export type OutlineGenerationScopeTarget = z.infer<typeof outlineGenerationScopeTargetSchema>;

export const outlineGenerationScopeReadinessSchema = z.enum([
  'can-generate',
  'fill-missing-only',
  'requires-explicit-regeneration',
  'cannot-generate',
]);
export type OutlineGenerationScopeReadiness = z.infer<typeof outlineGenerationScopeReadinessSchema>;

/** Why a scope cannot be sent to a future generator; no LLM call is made for these states. */
export const outlineGenerationScopeBlockReasonSchema = z.enum([
  'outline-unavailable',
  'empty-scope',
  'chapter-unbound',
  'cross-project-binding',
  'stale-b5',
]);
export type OutlineGenerationScopeBlockReason = z.infer<typeof outlineGenerationScopeBlockReasonSchema>;

/** Explicit protected owners and the only mutation budget that I134 may consume. */
export const outlineGenerationScopeProtectionSchema = z.object({
  actIds: z.array(entityIdSchema).max(OUTLINE_GENERATION_SCOPE_MAX_TARGET_BEATS),
  beatIds: z.array(entityIdSchema).max(OUTLINE_GENERATION_SCOPE_MAX_TARGET_BEATS),
  detailBeatIds: z.array(entityIdSchema).max(OUTLINE_GENERATION_SCOPE_MAX_DETAIL_BEATS),
  preserveStableIds: z.literal(true),
  preserveOrder: z.literal(true),
  outsideScopeWritable: z.literal(false),
}).strict();
export type OutlineGenerationScopeProtection = z.infer<typeof outlineGenerationScopeProtectionSchema>;

export const outlineGenerationMutationBudgetSchema = z.object({
  maxNewDetailBeats: z.number().int().nonnegative().max(OUTLINE_GENERATION_SCOPE_MAX_NEW_DETAIL_BEATS),
  allowExistingReplacement: z.literal(false),
  allowReorder: z.literal(false),
  allowScopeExpansion: z.literal(false),
}).strict();
export type OutlineGenerationMutationBudget = z.infer<typeof outlineGenerationMutationBudgetSchema>;

/** Canonical readiness projection consumed before any scope generation is attempted. */
export const outlineGenerationScopeResultSchema = z.object({
  projectId: entityIdSchema,
  scope: outlineGenerationScopeInputSchema,
  b5ContentFingerprint: projectFingerprintSchema,
  readiness: outlineGenerationScopeReadinessSchema,
  targets: z.array(outlineGenerationScopeTargetSchema).max(OUTLINE_GENERATION_SCOPE_MAX_TARGET_BEATS),
  targetBeatCount: z.number().int().nonnegative(),
  targetDetailBeatCount: z.number().int().nonnegative(),
  protectedSet: outlineGenerationScopeProtectionSchema,
  mutationBudget: outlineGenerationMutationBudgetSchema,
  page: z.object({
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive().max(OUTLINE_GENERATION_SCOPE_PAGE_MAX_TARGET_BEATS),
    nextOffset: z.number().int().nonnegative().nullable(),
    totalTargetBeatCount: z.number().int().nonnegative(),
    totalTargetDetailBeatCount: z.number().int().nonnegative(),
  }).strict(),
  blockReason: outlineGenerationScopeBlockReasonSchema.optional(),
}).strict().superRefine((result, context) => {
  if (result.targetBeatCount !== result.targets.length) context.addIssue({ code: 'custom', path: ['targetBeatCount'], message: 'Target beat count must match targets' });
  const detailCount = result.targets.reduce((sum, target) => sum + target.cards.length, 0);
  if (result.targetDetailBeatCount !== detailCount) context.addIssue({ code: 'custom', path: ['targetDetailBeatCount'], message: 'Target detail beat count must match targets' });
  if (result.readiness === 'cannot-generate' && result.blockReason === undefined) context.addIssue({ code: 'custom', path: ['blockReason'], message: 'Blocked scope requires a reason' });
  if (result.readiness !== 'cannot-generate' && result.blockReason !== undefined) context.addIssue({ code: 'custom', path: ['blockReason'], message: 'Ready scope cannot have a block reason' });
});
export type OutlineGenerationScopeResult = z.infer<typeof outlineGenerationScopeResultSchema>;
