import { z } from 'zod';
import { confidenceSchema, entityIdSchema } from './base.js';
import { outlineSchema } from './outline.js';
import { sourceHashSchema } from './onboarding-binding.js';

/** I119 Host-controlled long-draft source limits (design §14.14 / R18-6). */
export const LONG_DRAFT_MAX_BYTES = 2 * 1024 * 1024;
export const LONG_DRAFT_CHUNK_SIZE = 4_000;
export const LONG_DRAFT_MAX_CHUNKS = 1_024;

/** Caller supplies normalized-source identity; the Host owns the actual text. */
export const longDraftOutlineInputSchema = z.object({
  sourceHash: sourceHashSchema,
  text: z.string().trim().min(1).max(LONG_DRAFT_MAX_BYTES),
}).strict();
export type LongDraftOutlineInput = z.infer<typeof longDraftOutlineInputSchema>;

/** Parser input is a bounded, ordered projection of Host-controlled source text. */
export const longDraftOutlineParserInputSchema = z.object({
  sourceHash: sourceHashSchema,
  chunks: z.array(z.object({
    index: z.number().int().nonnegative(),
    text: z.string().trim().min(1),
  }).strict()).min(1).max(LONG_DRAFT_MAX_CHUNKS),
}).strict();
export type LongDraftOutlineParserInput = z.infer<typeof longDraftOutlineParserInputSchema>;

/** B5-only value reused by I38 conceptually without changing the I38 contract. */
export const longDraftOutlineValueSchema = outlineSchema.omit({ version: true });
export type LongDraftOutlineValue = z.infer<typeof longDraftOutlineValueSchema>;

/** Strict model envelope; worldview/detail-beat split candidates are not admitted here. */
export const longDraftOutlineAgentOutputSchema = z.object({
  confidence: confidenceSchema,
  sourceChunkIndices: z.number().int().nonnegative().array().min(1).max(LONG_DRAFT_MAX_CHUNKS),
  outline: longDraftOutlineValueSchema,
  rationale: z.string().trim().max(2_000),
}).strict();
export type LongDraftOutlineAgentOutput = z.infer<typeof longDraftOutlineAgentOutputSchema>;

/** Durable evidence that binds a candidate to one normalized, ordered source. */
export const longDraftOutlineProvenanceSchema = z.object({
  sourceHash: sourceHashSchema,
  byteLength: z.number().int().positive().max(LONG_DRAFT_MAX_BYTES),
  chunkSize: z.number().int().positive().max(LONG_DRAFT_MAX_BYTES),
  chunkCount: z.number().int().positive().max(LONG_DRAFT_MAX_CHUNKS),
  chunkIndices: z.number().int().nonnegative().array().min(1).max(LONG_DRAFT_MAX_CHUNKS),
}).strict().superRefine((value, context) => {
  if (value.chunkIndices.length !== value.chunkCount) {
    context.addIssue({ code: 'custom', path: ['chunkIndices'], message: 'chunkIndices must cover chunkCount' });
  }
  value.chunkIndices.forEach((index, position) => {
    if (index !== position) context.addIssue({ code: 'custom', path: ['chunkIndices', position], message: 'chunkIndices must be contiguous and ordered' });
  });
});
export type LongDraftOutlineProvenance = z.infer<typeof longDraftOutlineProvenanceSchema>;

/** Candidate-only result; I120 is the first iteration allowed to add Gate/apply. */
export const longDraftOutlineCandidateSchema = z.object({
  candidateId: entityIdSchema,
  projectId: entityIdSchema,
  sourceHash: sourceHashSchema,
  provenance: longDraftOutlineProvenanceSchema,
  confidence: confidenceSchema,
  outline: longDraftOutlineValueSchema,
  rationale: z.string().trim().max(2_000),
}).strict().superRefine((value, context) => {
  if (value.sourceHash !== value.provenance.sourceHash) {
    context.addIssue({ code: 'custom', path: ['provenance', 'sourceHash'], message: 'provenance sourceHash must match candidate sourceHash' });
  }
});
export type LongDraftOutlineCandidate = z.infer<typeof longDraftOutlineCandidateSchema>;

/** Explicit readiness projection; no caller-side emptiness inference is allowed. */
export const longDraftReadinessLayerSchema = z.enum(['empty', 'ready', 'uninitialized', 'corrupt']);
export type LongDraftReadinessLayer = z.infer<typeof longDraftReadinessLayerSchema>;

export const longDraftReadinessSchema = z.object({
  projectId: entityIdSchema,
  status: z.enum(['ready', 'blocked']),
  reason: z.enum(['non-empty-project', 'invalid-project-state']).optional(),
  blockers: z.enum(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon', 'text']).array(),
  layers: z.object({
    characters: longDraftReadinessLayerSchema,
    worldview: longDraftReadinessLayerSchema,
    outline: longDraftReadinessLayerSchema,
    relationship: longDraftReadinessLayerSchema,
    state: longDraftReadinessLayerSchema,
    canon: longDraftReadinessLayerSchema,
    text: longDraftReadinessLayerSchema,
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.status === 'ready' && (value.blockers.length > 0 || value.reason !== undefined)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'ready readiness cannot have blockers or reason' });
  }
  if (value.status === 'blocked' && (value.blockers.length === 0 || value.reason === undefined)) {
    context.addIssue({ code: 'custom', path: ['status'], message: 'blocked readiness requires blockers and reason' });
  }
});
export type LongDraftReadiness = z.infer<typeof longDraftReadinessSchema>;

export const longDraftWorkflowStatusSchema = z.discriminatedUnion('status', [
  z.object({ workflowId: entityIdSchema, projectId: entityIdSchema, sourceHash: sourceHashSchema, status: z.enum(['queued', 'running', 'succeeded']) }).strict(),
  z.object({ workflowId: entityIdSchema, projectId: entityIdSchema, sourceHash: sourceHashSchema, status: z.literal('failed'), error: z.string().trim().min(1).max(500) }).strict(),
  z.object({ workflowId: entityIdSchema, projectId: entityIdSchema, sourceHash: sourceHashSchema, status: z.literal('cancelled') }).strict(),
]);
export type LongDraftWorkflowStatus = z.infer<typeof longDraftWorkflowStatusSchema>;

export const longDraftWorkflowBeginResultSchema = z.object({ workflowId: entityIdSchema }).strict();
export type LongDraftWorkflowBeginResult = z.infer<typeof longDraftWorkflowBeginResultSchema>;

export const longDraftWorkflowCancelResultSchema = z.object({
  workflowId: entityIdSchema,
  status: z.literal('cancelled'),
}).strict();
export type LongDraftWorkflowCancelResult = z.infer<typeof longDraftWorkflowCancelResultSchema>;

export const longDraftWorkflowResultSchema = z.object({
  workflowId: entityIdSchema,
  candidate: longDraftOutlineCandidateSchema,
}).strict();
export type LongDraftWorkflowResult = z.infer<typeof longDraftWorkflowResultSchema>;
