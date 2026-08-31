import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { projectFingerprintSchema } from './text-mutation.js';

/** I137 bounded pagination and issue budgets (design §14.14.2 / D25). */
export const BOOK_READINESS_PAGE_LIMIT = 64;
export const BOOK_READINESS_MAX_ISSUES = 512;

export const bookReadinessPageInputSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(BOOK_READINESS_PAGE_LIMIT),
}).strict();
export type BookReadinessPageInput = z.infer<typeof bookReadinessPageInputSchema>;

export const bookReadinessIssueKindSchema = z.enum([
  'outline-unavailable',
  'missing-progress',
  'order-integrity',
  'incomplete-card',
  'incomplete-beat',
  'missing-binding',
  'binding-target-missing',
  'missing-prose',
  'pending-finalization',
  'pending-reconciliation',
  'pending-outline-change',
  'pending-candidate',
  'hard-review',
  'review-warning',
]);
export type BookReadinessIssueKind = z.infer<typeof bookReadinessIssueKindSchema>;

export const bookReadinessIssueSchema = z.object({
  id: z.string().trim().min(1).max(128),
  kind: bookReadinessIssueKindSchema,
  severity: z.enum(['hard', 'warning']),
  status: z.enum(['open', 'continued', 'rewrite-requested', 'pending']),
  message: z.string().trim().min(1).max(500),
  chapterId: entityIdSchema.optional(),
  sceneId: entityIdSchema.optional(),
  detailBeatId: entityIdSchema.optional(),
  sourceIssueId: z.string().trim().min(1).max(128).optional(),
}).strict().readonly();
export type BookReadinessIssue = z.infer<typeof bookReadinessIssueSchema>;

export const bookReadinessChapterSnapshotSchema = z.object({
  chapterId: entityIdSchema,
  index: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  sceneCount: z.number().int().nonnegative(),
  proseSceneCount: z.number().int().nonnegative(),
  boundSceneCount: z.number().int().nonnegative(),
  requiredCardCount: z.number().int().nonnegative(),
  completedCardCount: z.number().int().nonnegative(),
}).strict().readonly();
export type BookReadinessChapterSnapshot = z.infer<typeof bookReadinessChapterSnapshotSchema>;

export const bookReadinessPageSchema = z.object({
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(BOOK_READINESS_PAGE_LIMIT),
  total: z.number().int().nonnegative(),
  nextOffset: z.number().int().nonnegative().nullable(),
  chapters: z.array(bookReadinessChapterSnapshotSchema).max(BOOK_READINESS_PAGE_LIMIT).readonly(),
}).strict().readonly();
export type BookReadinessPage = z.infer<typeof bookReadinessPageSchema>;

export const bookReadinessCountsSchema = z.object({
  chapters: z.number().int().nonnegative(),
  scenes: z.number().int().nonnegative(),
  requiredCards: z.number().int().nonnegative(),
  completedCards: z.number().int().nonnegative(),
  boundCards: z.number().int().nonnegative(),
  proseScenes: z.number().int().nonnegative(),
  hardIssues: z.number().int().nonnegative(),
  warningIssues: z.number().int().nonnegative(),
}).strict().readonly();
export type BookReadinessCounts = z.infer<typeof bookReadinessCountsSchema>;

export const bookReadinessReviewSchema = z.object({
  status: z.enum(['not-run', 'completed']),
  total: z.number().int().nonnegative(),
  hard: z.number().int().nonnegative(),
  warning: z.number().int().nonnegative(),
}).strict().readonly();
export type BookReadinessReview = z.infer<typeof bookReadinessReviewSchema>;

export const bookReadinessResultSchema = z.object({
  projectId: entityIdSchema,
  status: z.enum(['ready', 'blocked']),
  gateOpen: z.boolean(),
  computedAt: z.string().datetime(),
  page: bookReadinessPageSchema,
  counts: bookReadinessCountsSchema,
  review: bookReadinessReviewSchema,
  issues: z.array(bookReadinessIssueSchema).max(BOOK_READINESS_MAX_ISSUES).readonly(),
  fingerprints: z.object({
    text: projectFingerprintSchema,
    outline: projectFingerprintSchema.nullable(),
    binding: projectFingerprintSchema,
  }).strict().readonly(),
}).strict().readonly();
export type BookReadinessResult = z.infer<typeof bookReadinessResultSchema>;
