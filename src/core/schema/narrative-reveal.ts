import { z } from 'zod';
import { confidenceSchema, entityIdSchema } from './base.js';
import {
  narrativeAdaptationSourceRoleSchema,
  type NarrativeAdaptationSourceRole,
} from './narrative-adaptation.js';
import { narrativeIntentSchema, type NarrativeIntent } from './import-interpretation.js';
import { knowledgeKindSchema, knowledgeStateSchema } from './knowledge.js';
import { sourceHashSchema } from './onboarding-binding.js';

/** A B5 beat anchor is the only legal reveal timing reference in I146. */
export const narrativeRevealB5AnchorSchema = z.object({
  id: entityIdSchema,
  actId: entityIdSchema,
  beatId: entityIdSchema,
  label: z.string().trim().min(1).max(200),
}).strict();
export type NarrativeRevealB5Anchor = z.infer<typeof narrativeRevealB5AnchorSchema>;

/** Evidence remains operational source material and never becomes a C4 event. */
export const narrativeRevealEvidenceSchema = z.object({
  paragraphId: z.string().trim().min(1).max(200),
  role: z.enum(['world-truth', 'plot-plan', 'prose', 'author-instruction', 'presentation-note']),
  text: z.string().trim().min(1).max(20_000),
}).strict();
export type NarrativeRevealEvidence = z.infer<typeof narrativeRevealEvidenceSchema>;

/**
 * I146 consumes an already confirmed I145 B5 candidate. It accepts only
 * character ids and explicit beat anchors, never arbitrary B5/C4 references.
 */
export const narrativeRevealInputSchema = z.object({
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
  sourceRole: narrativeAdaptationSourceRoleSchema,
  treatment: z.literal('adapt-pov'),
  narrativeIntent: narrativeIntentSchema,
  b5CandidateId: entityIdSchema,
  b5Anchors: z.array(narrativeRevealB5AnchorSchema).min(1).max(200),
  characterIds: z.array(entityIdSchema).min(1).max(200),
  evidence: z.array(narrativeRevealEvidenceSchema).min(1).max(200),
}).strict().superRefine((input, context) => {
  const anchors = input.b5Anchors.map((anchor) => anchor.id);
  if (new Set(anchors).size !== anchors.length) context.addIssue({ code: 'custom', path: ['b5Anchors'], message: 'B5 reveal anchor ids must be unique' });
  if (new Set(input.characterIds).size !== input.characterIds.length) context.addIssue({ code: 'custom', path: ['characterIds'], message: 'Character ids must be unique' });
  const evidence = input.evidence.map((item) => item.paragraphId);
  if (new Set(evidence).size !== evidence.length) context.addIssue({ code: 'custom', path: ['evidence'], message: 'Narrative reveal evidence ids must be unique' });
  const protagonistId = input.narrativeIntent.protagonistId ?? input.narrativeIntent.protagonistCandidateId;
  if (protagonistId !== undefined && !input.characterIds.includes(protagonistId)) context.addIssue({ code: 'custom', path: ['characterIds'], message: 'POV protagonist must be an allowed character id' });
});
export type NarrativeRevealInput = z.infer<typeof narrativeRevealInputSchema>;

/** C3 candidate entry: version is Host-owned and therefore omitted here. */
export const narrativeRevealEntrySchema = z.object({
  id: entityIdSchema,
  fact: z.string().trim().min(1).max(4_000),
  kind: knowledgeKindSchema,
  holders: z.array(entityIdSchema),
  revealPlan: z.object({
    revealTo: z.array(entityIdSchema),
    revealAt: entityIdSchema,
  }).strict(),
  status: z.literal('hidden'),
  evidenceParagraphIds: z.array(z.string().trim().min(1).max(200)).min(1).max(200),
}).strict();
export type NarrativeRevealEntry = z.infer<typeof narrativeRevealEntrySchema>;

/** Model output is a proposal only; I148 owns any later application. */
export const narrativeRevealOutputSchema = z.object({
  confidence: confidenceSchema,
  entries: z.array(narrativeRevealEntrySchema).max(200),
  states: z.array(knowledgeStateSchema).max(200),
  rationale: z.string().trim().min(1).max(4_000),
}).strict();
export type NarrativeRevealOutput = z.infer<typeof narrativeRevealOutputSchema>;

/** Identity and source binding carried by the candidate across regeneration. */
export const narrativeRevealCandidateSchema = z.object({
  candidateId: entityIdSchema,
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
  sourceRole: narrativeAdaptationSourceRoleSchema,
  treatment: z.literal('adapt-pov'),
  narrativeIntent: narrativeIntentSchema,
  b5CandidateId: entityIdSchema,
  confidence: confidenceSchema,
  entries: z.array(narrativeRevealEntrySchema).max(200),
  states: z.array(knowledgeStateSchema).max(200),
  rationale: z.string().trim().min(1).max(4_000),
}).strict();
export type NarrativeRevealCandidate = z.infer<typeof narrativeRevealCandidateSchema>;

export const narrativeRevealBeginResultSchema = z.object({
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
  revealId: entityIdSchema,
}).strict();
export type NarrativeRevealBeginResult = z.infer<typeof narrativeRevealBeginResultSchema>;
export const narrativeRevealIdentitySchema = narrativeRevealBeginResultSchema;
export type NarrativeRevealIdentity = z.infer<typeof narrativeRevealIdentitySchema>;

export const narrativeRevealStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type NarrativeRevealStatus = z.infer<typeof narrativeRevealStatusSchema>;
export const narrativeRevealStatusResultSchema = narrativeRevealBeginResultSchema.extend({ status: narrativeRevealStatusSchema }).strict();
export type NarrativeRevealStatusResult = z.infer<typeof narrativeRevealStatusResultSchema>;
export const narrativeRevealResultSchema = narrativeRevealBeginResultSchema.extend({ candidate: narrativeRevealCandidateSchema }).strict();
export type NarrativeRevealResult = z.infer<typeof narrativeRevealResultSchema>;

export type { NarrativeAdaptationSourceRole, NarrativeIntent };
