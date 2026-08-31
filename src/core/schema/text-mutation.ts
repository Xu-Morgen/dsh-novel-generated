import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { chapterStatusSchema } from './text.js';

/**
 * I104 C5 mutation command contracts（design §14.14.2 / R18-1）。
 *
 * These schemas are commands, not a new C5 persistence shape. IDs are immutable;
 * patches expose author metadata only, while content/branches remain owned by the
 * existing edit/version workflows.
 */
export const projectFingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);

export const chapterCreateMutationSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  pov: entityIdSchema,
  status: chapterStatusSchema,
  expectedFingerprint: projectFingerprintSchema,
}).strict();

export const chapterMetadataPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  pov: entityIdSchema.optional(),
  status: chapterStatusSchema.optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, 'Chapter metadata patch must not be empty');

export const chapterUpdateMutationSchema = z.object({
  chapterId: entityIdSchema,
  patch: chapterMetadataPatchSchema,
  expectedFingerprint: projectFingerprintSchema,
}).strict();

export const sceneCreateMutationSchema = z.object({
  chapterId: entityIdSchema,
  index: z.number().int().nonnegative(),
  scene: z.object({
    id: entityIdSchema,
    content: z.string(),
    summary: z.string(),
    beats: z.array(z.string()),
    canonEvents: z.array(entityIdSchema),
    notes: z.string(),
  }).strict(),
  expectedFingerprint: projectFingerprintSchema,
}).strict();

export const sceneMetadataPatchSchema = z.object({
  summary: z.string().optional(),
  beats: z.array(z.string()).optional(),
  canonEvents: z.array(entityIdSchema).optional(),
  notes: z.string().optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, 'Scene metadata patch must not be empty');

/** I135 draft adoption command: replace only the chosen C5 scene content. */
export const sceneContentMutationSchema = z.object({
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  content: z.string(),
  expectedFingerprint: projectFingerprintSchema,
}).strict();

export const sceneUpdateMutationSchema = z.object({
  chapterId: entityIdSchema,
  sceneId: entityIdSchema,
  patch: sceneMetadataPatchSchema,
  expectedFingerprint: projectFingerprintSchema,
}).strict();

export const projectReorderMutationSchema = z.object({
  chapters: z.array(z.object({
    chapterId: entityIdSchema,
    sceneIds: z.array(entityIdSchema),
  }).strict()),
  expectedFingerprint: projectFingerprintSchema,
}).strict();

export const chapterMutationViewSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().positive(),
  title: z.string(),
  pov: entityIdSchema,
  status: chapterStatusSchema,
  sceneCount: z.number().int().nonnegative(),
}).strict();

export const sceneMutationViewSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().nonnegative(),
  summary: z.string(),
  contentHash: projectFingerprintSchema,
  branchCount: z.number().int().nonnegative(),
}).strict();

export const chapterMutationResultSchema = z.object({
  chapter: chapterMutationViewSchema,
  fingerprint: projectFingerprintSchema,
}).strict();

export const sceneMutationResultSchema = z.object({
  chapterId: entityIdSchema,
  scene: sceneMutationViewSchema,
  fingerprint: projectFingerprintSchema,
}).strict();

export const projectReorderResultSchema = z.object({
  chapters: z.array(chapterMutationViewSchema),
  fingerprint: projectFingerprintSchema,
}).strict();

export type ChapterCreateMutation = z.infer<typeof chapterCreateMutationSchema>;
export type ChapterMetadataPatch = z.infer<typeof chapterMetadataPatchSchema>;
export type ChapterUpdateMutation = z.infer<typeof chapterUpdateMutationSchema>;
export type SceneCreateMutation = z.infer<typeof sceneCreateMutationSchema>;
export type SceneMetadataPatch = z.infer<typeof sceneMetadataPatchSchema>;
export type SceneContentMutation = z.infer<typeof sceneContentMutationSchema>;
export type SceneUpdateMutation = z.infer<typeof sceneUpdateMutationSchema>;
export type ProjectReorderMutation = z.infer<typeof projectReorderMutationSchema>;
export type ChapterMutationView = z.infer<typeof chapterMutationViewSchema>;
export type SceneMutationView = z.infer<typeof sceneMutationViewSchema>;
export type ChapterMutationResult = z.infer<typeof chapterMutationResultSchema>;
export type SceneMutationResult = z.infer<typeof sceneMutationResultSchema>;
export type ProjectReorderResult = z.infer<typeof projectReorderResultSchema>;
