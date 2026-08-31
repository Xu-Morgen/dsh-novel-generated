import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { projectFingerprintSchema } from './text-mutation.js';

/** I138 formats supported by the single-manuscript compiler (design §14.14.2). */
export const manuscriptFormatSchema = z.enum(['txt', 'md']);
export type ManuscriptFormat = z.infer<typeof manuscriptFormatSchema>;

/**
 * The source receipt captured by the Host immediately before compilation.
 * `computedAt` is informational; source fingerprints and review counts are the
 * freshness boundary, so a receipt remains comparable across repeated scans.
 */
export const manuscriptReadinessReceiptSchema = z.object({
  gateOpen: z.literal(true),
  computedAt: z.string().datetime(),
  textFingerprint: projectFingerprintSchema,
  outlineFingerprint: projectFingerprintSchema.nullable(),
  bindingFingerprint: projectFingerprintSchema,
  review: z.object({
    status: z.literal('completed'),
    total: z.number().int().nonnegative(),
    hard: z.number().int().nonnegative(),
    warning: z.number().int().nonnegative(),
  }).strict(),
}).strict().readonly();
export type ManuscriptReadinessReceipt = z.infer<typeof manuscriptReadinessReceiptSchema>;

/**
 * Compile options are deliberately small. The optional receipt lets a caller
 * prove it already displayed the I137 gate; the Host still rescans and compares
 * it, so Client state can never authorize stale or forged publication.
 */
export const compileManuscriptInputSchema = z.object({
  format: manuscriptFormatSchema,
  readinessReceipt: manuscriptReadinessReceiptSchema.optional(),
}).strict();
export type CompileManuscriptInput = z.infer<typeof compileManuscriptInputSchema>;

/** One deterministic downloaded manuscript, never a file map or a sidecar. */
export const compileManuscriptResultSchema = z.object({
  projectId: entityIdSchema,
  format: manuscriptFormatSchema,
  fileName: z.string().regex(/^manuscript\.(txt|md)$/),
  content: z.string().min(1),
  contentHash: projectFingerprintSchema,
  chapterCount: z.number().int().positive(),
  sceneCount: z.number().int().positive(),
  readinessReceipt: manuscriptReadinessReceiptSchema,
}).strict().readonly();
export type CompileManuscriptResult = z.infer<typeof compileManuscriptResultSchema>;
