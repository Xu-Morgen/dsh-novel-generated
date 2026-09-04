import { z } from 'zod';

import { entityIdSchema, projectMetaSchema } from './base.js';
import { detailBeatSchema } from './outline.js';
import { projectLayersReadinessSchema, projectOpenResultSchema } from './project-lifecycle.js';
import { inspirationResultSchema } from './inspiration.js';

/** Canonical I181 method ids shared by Main, Renderer, and the IPC contract lock. */
export const DESKTOP_ASSISTANT_METHOD_IDS = Object.freeze({
  open: 'novel-creation-tool/novelAssistant/open',
  status: 'novel-creation-tool/novelAssistant/status',
  context: 'novel-creation-tool/novelAssistant/context',
  continue: 'novel-creation-tool/novelAssistant/continue',
  adjudicate: 'novel-creation-tool/novelAssistant/adjudicate',
  inspire: 'novel-creation-tool/novelAssistant/inspire',
} as const);

/**
 * I181 strict wire contracts for the Main-owned desktop assistant.
 *
 * These are projections, not a second domain model: the Main command registry
 * maps the existing Agent service results into these bounded shapes before the
 * IPC registry validates them. Prompts, file paths, secrets, and full context
 * sources never cross this boundary (design §14.32.3 / requirements R34-10).
 */
export const desktopAssistantProjectListSchema = z.array(projectMetaSchema.omit({ version: true }));

export const desktopAssistantOpenResultSchema = projectOpenResultSchema;

export const desktopAssistantStatusResultSchema = z.object({
  projectId: entityIdSchema,
  layers: projectLayersReadinessSchema,
  characters: z.number().int().nonnegative(),
  worldview: z.number().int().nonnegative(),
  relationships: z.number().int().nonnegative(),
  canonEvents: z.number().int().nonnegative(),
  scenes: z.number().int().nonnegative(),
  outlineReady: z.boolean(),
  creation: z.object({
    wordTarget: z.number().int().positive(),
    askWhenThin: z.boolean(),
  }).strict(),
}).strict();

export const desktopAssistantStatusResponseSchema = z.union([
  z.object({ projects: desktopAssistantProjectListSchema }).strict(),
  desktopAssistantStatusResultSchema,
]);

const assistantNavigationSchema = z.object({
  actId: entityIdSchema,
  beatId: entityIdSchema,
  title: z.string(),
  description: z.string(),
  prerequisites: z.array(entityIdSchema),
  prerequisitesMet: z.boolean(),
  instruction: z.string(),
  deviationIds: z.array(entityIdSchema),
}).strict();

const assistantCandidateTargetSchema = z.object({
  projectId: entityIdSchema,
  chapterId: entityIdSchema.optional(),
  sceneId: entityIdSchema.optional(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export const desktopAssistantContextResultSchema = z.object({
  projectId: entityIdSchema,
  navigation: assistantNavigationSchema,
  currentCard: detailBeatSchema,
  recentScenes: z.number().int().nonnegative(),
  characters: z.number().int().nonnegative(),
  worldview: z.number().int().nonnegative(),
  canon: z.number().int().nonnegative(),
  creation: z.object({
    wordTarget: z.number().int().positive(),
    askWhenThin: z.boolean(),
  }).strict(),
}).strict();

export const desktopAssistantCandidateSchema = z.object({
  candidateId: z.string().min(1).max(128),
  intent: z.literal('continue'),
  text: z.string().min(1),
  target: assistantCandidateTargetSchema,
}).strict();

export const desktopAssistantAdjudicationResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('rejected'), candidateId: z.string().min(1).max(128) }).strict(),
  z.object({
    status: z.literal('rewritten'),
    candidateId: z.string().min(1).max(128),
    superseded: z.string().min(1).max(128),
    candidate: desktopAssistantCandidateSchema,
  }).strict(),
  z.object({ status: z.literal('generation-rejected'), candidateId: z.string().min(1).max(128) }).strict(),
  z.object({ status: z.literal('prewrite-rejected'), candidateId: z.string().min(1).max(128) }).strict(),
  z.object({
    status: z.literal('pending-compensation'),
    candidateId: z.string().min(1).max(128),
    failedStage: z.enum(['c2', 'c1', 'c3', 'c4', 'b2']),
  }).strict(),
  z.object({
    status: z.literal('written'),
    candidateId: z.string().min(1).max(128),
    scene: z.object({
      chapterId: entityIdSchema,
      sceneId: entityIdSchema,
      index: z.number().int().nonnegative(),
      content: z.string(),
    }).strict(),
    layers: z.array(z.enum(['c2', 'c1', 'c3', 'c4', 'b2'])),
  }).strict(),
]);

export const desktopAssistantInspireResultSchema = inspirationResultSchema;

export type DesktopAssistantOpenResult = z.infer<typeof desktopAssistantOpenResultSchema>;
export type DesktopAssistantStatusResult = z.infer<typeof desktopAssistantStatusResultSchema>;
export type DesktopAssistantStatusResponse = z.infer<typeof desktopAssistantStatusResponseSchema>;
export type DesktopAssistantContextResult = z.infer<typeof desktopAssistantContextResultSchema>;
export type DesktopAssistantCandidate = z.infer<typeof desktopAssistantCandidateSchema>;
export type DesktopAssistantAdjudicationResult = z.infer<typeof desktopAssistantAdjudicationResultSchema>;
export type DesktopAssistantInspireResult = z.infer<typeof desktopAssistantInspireResultSchema>;
