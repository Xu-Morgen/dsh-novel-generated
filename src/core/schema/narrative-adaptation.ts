import { z } from 'zod';
import { confidenceSchema, entityIdSchema } from './base.js';
import {
  narrativeIntentSchema,
} from './import-interpretation.js';
import { sourceHashSchema } from './onboarding-binding.js';
import { outlineSchema } from './outline.js';

/** I145 only adapts confirmed background/hybrid evidence into a B5 candidate. */
export const narrativeAdaptationSourceRoleSchema = z.enum(['background-material', 'hybrid']);
export type NarrativeAdaptationSourceRole = z.infer<typeof narrativeAdaptationSourceRoleSchema>;

export const narrativeAdaptationEvidenceSchema = z.object({
  paragraphId: z.string().trim().min(1).max(200),
  role: z.enum(['world-truth', 'plot-plan', 'prose', 'author-instruction', 'presentation-note']),
  text: z.string().trim().min(1).max(20_000),
}).strict();
export type NarrativeAdaptationEvidence = z.infer<typeof narrativeAdaptationEvidenceSchema>;

/** Input is already author-confirmed; no source-order or model-owned range is accepted here. */
export const narrativeAdaptationInputSchema = z.object({
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
  sourceRole: narrativeAdaptationSourceRoleSchema,
  treatment: z.literal('adapt-pov'),
  narrativeIntent: narrativeIntentSchema,
  evidence: z.array(narrativeAdaptationEvidenceSchema).min(1).max(200),
}).strict().superRefine((input, context) => {
  const ids = input.evidence.map((item) => item.paragraphId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['evidence'], message: 'Narrative adaptation evidence ids must be unique' });
});
export type NarrativeAdaptationInput = z.infer<typeof narrativeAdaptationInputSchema>;

/** A stable candidate for a new limited-POV protagonist, never a B3 write. */
export const protagonistCandidateSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(200),
  premise: z.string().trim().min(1).max(2_000),
}).strict();
export type ProtagonistCandidate = z.infer<typeof protagonistCandidateSchema>;

/** Model payload: B5 and evidence only; C3/C4/C5 fields cannot cross this parser. */
export const narrativeAdaptationOutputSchema = z.object({
  confidence: confidenceSchema,
  evidenceParagraphIds: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
  outline: outlineSchema.omit({ version: true }),
  protagonistCandidate: protagonistCandidateSchema.optional(),
  rationale: z.string().trim().min(1).max(4_000),
}).strict();
export type NarrativeAdaptationOutput = z.infer<typeof narrativeAdaptationOutputSchema>;

export const narrativeAdaptationCandidateSchema = z.object({
  candidateId: entityIdSchema,
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
  sourceRole: narrativeAdaptationSourceRoleSchema,
  treatment: z.literal('adapt-pov'),
  narrativeIntent: narrativeIntentSchema,
  confidence: confidenceSchema,
  evidenceParagraphIds: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
  outline: outlineSchema.omit({ version: true }),
  protagonistCandidate: protagonistCandidateSchema.optional(),
  rationale: z.string().trim().min(1).max(4_000),
}).strict();
export type NarrativeAdaptationCandidate = z.infer<typeof narrativeAdaptationCandidateSchema>;

export const narrativeAdaptationBeginResultSchema = z.object({
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
  adaptationId: entityIdSchema,
}).strict();
export type NarrativeAdaptationBeginResult = z.infer<typeof narrativeAdaptationBeginResultSchema>;

export const narrativeAdaptationIdentitySchema = narrativeAdaptationBeginResultSchema;
export type NarrativeAdaptationIdentity = z.infer<typeof narrativeAdaptationIdentitySchema>;

export const narrativeAdaptationStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type NarrativeAdaptationStatus = z.infer<typeof narrativeAdaptationStatusSchema>;
export const narrativeAdaptationStatusResultSchema = narrativeAdaptationBeginResultSchema.extend({ status: narrativeAdaptationStatusSchema }).strict();
export type NarrativeAdaptationStatusResult = z.infer<typeof narrativeAdaptationStatusResultSchema>;
export const narrativeAdaptationResultSchema = narrativeAdaptationBeginResultSchema.extend({ candidate: narrativeAdaptationCandidateSchema }).strict();
export type NarrativeAdaptationResult = z.infer<typeof narrativeAdaptationResultSchema>;
