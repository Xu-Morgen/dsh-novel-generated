import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { importInterpretationIntentSchema } from './import-interpretation-session.js';
import { sourceHashSchema } from './onboarding-binding.js';
import { ruleSchema } from './rules.js';
import { styleProfileSchema } from './style.js';

const fingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);

/** I151 model-owned B1 draft. Persisted versions remain Host-owned. */
export const importedRuleDraftSchema = ruleSchema.omit({ version: true, immutable: true }).extend({
  immutable: z.literal(false),
}).strict();
export type ImportedRuleDraft = z.infer<typeof importedRuleDraftSchema>;

/** I151 model-owned B4 draft. Persisted versions remain Host-owned. */
export const importedStyleDraftSchema = styleProfileSchema.omit({ version: true }).strict();
export type ImportedStyleDraft = z.infer<typeof importedStyleDraftSchema>;

/** Strict B1+B4 envelope; no path, command, B/C layer, or alternate owner is accepted. */
export const ruleStyleImportCandidateSchema = z.object({
  rules: z.array(importedRuleDraftSchema).max(50),
  style: importedStyleDraftSchema,
}).strict().superRefine((candidate, context) => {
  const ids = candidate.rules.map((rule) => rule.id);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) context.addIssue({ code: 'custom', path: ['rules'], message: `Duplicate imported rule id: ${duplicate}` });
});
export type RuleStyleImportCandidate = z.infer<typeof ruleStyleImportCandidateSchema>;

export const ruleStyleImportIdentitySchema = z.object({
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
}).strict();
export type RuleStyleImportIdentity = z.infer<typeof ruleStyleImportIdentitySchema>;

export const ruleStyleImportStatusSchema = z.enum([
  'queued', 'running', 'succeeded', 'proposed', 'applying', 'applied', 'rejected', 'cancelled', 'failed', 'stale',
]);
export type RuleStyleImportStatus = z.infer<typeof ruleStyleImportStatusSchema>;

/** Durable operational one-shot checkpoint. It is not a narrative truth layer. */
export const ruleStyleImportCheckpointSchema = ruleStyleImportIdentitySchema.extend({
  status: ruleStyleImportStatusSchema,
  sourceText: z.string().min(1).max(2 * 1024 * 1024),
  intent: importInterpretationIntentSchema,
  candidate: ruleStyleImportCandidateSchema.optional(),
  candidateFingerprint: fingerprintSchema.optional(),
  confirmationId: entityIdSchema.optional(),
  error: z.string().min(1).max(4_000).optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((checkpoint, context) => {
  if (checkpoint.candidate !== undefined !== (checkpoint.candidateFingerprint !== undefined)) {
    context.addIssue({ code: 'custom', path: ['candidateFingerprint'], message: 'Candidate and fingerprint must appear together' });
  }
  if ((checkpoint.status === 'succeeded' || checkpoint.status === 'proposed' || checkpoint.status === 'applied') && checkpoint.candidate === undefined) {
    context.addIssue({ code: 'custom', path: ['candidate'], message: `${checkpoint.status} checkpoint requires candidate` });
  }
  if ((checkpoint.status === 'proposed' || checkpoint.status === 'applying' || checkpoint.status === 'applied' || checkpoint.status === 'rejected') && checkpoint.confirmationId === undefined) {
    context.addIssue({ code: 'custom', path: ['confirmationId'], message: `${checkpoint.status} checkpoint requires ConfirmationGate lineage` });
  }
});
export type RuleStyleImportCheckpoint = z.infer<typeof ruleStyleImportCheckpointSchema>;

export const ruleStyleImportCheckpointFileSchema = z.object({ checkpoint: ruleStyleImportCheckpointSchema }).strict();

/** Remote projection deliberately omits the retained normalized source text. */
export const ruleStyleImportProjectionSchema = ruleStyleImportIdentitySchema.extend({
  status: ruleStyleImportStatusSchema,
  candidate: ruleStyleImportCandidateSchema.optional(),
  candidateFingerprint: fingerprintSchema.optional(),
  confirmationId: entityIdSchema.optional(),
  error: z.string().min(1).max(4_000).optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict();
export type RuleStyleImportProjection = z.infer<typeof ruleStyleImportProjectionSchema>;

export const ruleStyleImportProposeInputSchema = ruleStyleImportIdentitySchema.extend({
  expectedFingerprint: fingerprintSchema,
  candidate: ruleStyleImportCandidateSchema,
}).strict();
export type RuleStyleImportProposeInput = z.infer<typeof ruleStyleImportProposeInputSchema>;

export const ruleStyleImportDecisionInputSchema = ruleStyleImportIdentitySchema.extend({
  expectedFingerprint: fingerprintSchema,
}).strict();
export type RuleStyleImportDecisionInput = z.infer<typeof ruleStyleImportDecisionInputSchema>;
