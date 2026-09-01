import { z } from 'zod';
import { canonEventSchema } from './canon.js';
import { entityIdSchema } from './base.js';
import { importSourceRoleSchema } from './import-interpretation.js';
import { knowledgeEntrySchema, knowledgeStateSchema } from './knowledge.js';

/** Source visibility is explicit; only public-at-start may enter C4 here. */
export const narrativeVisibilitySchema = z.enum(['public-at-start', 'backstage', 'future', 'presentation', 'author-instruction']);
export type NarrativeVisibility = z.infer<typeof narrativeVisibilitySchema>;

/** Evidence used by the deterministic C4 public-at-start projector. */
export const publicAtStartEvidenceSchema = z.object({
  paragraphId: z.string().trim().min(1).max(200),
  role: z.enum(['world-truth', 'plot-plan', 'prose', 'author-instruction', 'presentation-note']),
  visibility: narrativeVisibilitySchema,
  text: z.string().trim().min(1).max(20_000),
}).strict();
export type PublicAtStartEvidence = z.infer<typeof publicAtStartEvidenceSchema>;

/** C4 candidate with source evidence; seq/immutable remain Host-owned. */
export const publicAtStartCanonCandidateSchema = canonEventSchema.omit({ seq: true, immutable: true, supersedes: true }).extend({
  evidenceParagraphIds: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
}).strict();
export type PublicAtStartCanonCandidate = z.infer<typeof publicAtStartCanonCandidateSchema>;

export const publicAtStartProjectionInputSchema = z.object({
  sourceRole: importSourceRoleSchema,
  evidence: z.array(publicAtStartEvidenceSchema).min(1).max(200),
  events: z.array(publicAtStartCanonCandidateSchema).max(200),
}).strict();
export type PublicAtStartProjectionInput = z.infer<typeof publicAtStartProjectionInputSchema>;

/** Inputs for a safe POV context consumer fixture. */
export const povContextInputSchema = z.object({
  pov: entityIdSchema,
  b5: z.object({ beatId: entityIdSchema, text: z.string() }).strict(),
  b2Triggers: z.array(z.string()),
  c3Entries: z.array(knowledgeEntrySchema),
  c3States: z.array(knowledgeStateSchema),
  c4Events: z.array(publicAtStartCanonCandidateSchema),
}).strict();
export type PovContextInput = z.infer<typeof povContextInputSchema>;

export const povContextSchema = z.object({
  pov: entityIdSchema,
  b5: z.object({ beatId: entityIdSchema, text: z.string() }).strict(),
  b2Triggers: z.array(z.string()),
  knowledge: z.object({ pov: entityIdSchema, entries: z.array(knowledgeEntrySchema), state: knowledgeStateSchema }).strict(),
  c4Events: z.array(publicAtStartCanonCandidateSchema),
}).strict();
export type PovContext = z.infer<typeof povContextSchema>;

export const povLeakViolationSchema = z.object({
  kind: z.literal('knowledge-leak'),
  severity: z.literal('hard'),
  knowledgeId: entityIdSchema,
  message: z.string().trim().min(1),
}).strict();
export type PovLeakViolation = z.infer<typeof povLeakViolationSchema>;
