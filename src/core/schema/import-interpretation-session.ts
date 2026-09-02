import { z } from 'zod';
import { entityIdSchema } from './base.js';
import {
  importSourceRoleSchema,
  importTreatmentSchema,
  narrativeIntentSchema,
  type ImportSourceRole,
  type ImportTreatment,
  type NarrativeIntent,
} from './import-interpretation.js';
import { sourceParagraphRoleSchema } from './import-interpretation-analysis.js';
import { sourceHashSchema } from './onboarding-binding.js';

/**
 * I142 operational copy of the author-selected import intent. It intentionally
 * contains no project id or source hash: those identities are owned by the
 * surrounding session and are checked on every command.
 */
export const importInterpretationIntentSchema = z.object({
  sourceRole: importSourceRoleSchema,
  treatment: importTreatmentSchema,
  narrativeIntent: narrativeIntentSchema.optional(),
}).strict().superRefine((intent, context) => {
  if (intent.treatment === 'adapt-pov' && intent.narrativeIntent === undefined) {
    context.addIssue({ code: 'custom', path: ['narrativeIntent'], message: 'adapt-pov requires narrativeIntent' });
  }
  if (intent.treatment === 'expand-outline' && intent.narrativeIntent !== undefined) {
    context.addIssue({ code: 'custom', path: ['narrativeIntent'], message: 'narrativeIntent is only valid for adapt-pov' });
  }
});
export type ImportInterpretationIntent = z.infer<typeof importInterpretationIntentSchema>;

/** A compact, author-visible decision summary; paragraph contents stay source-owned. */
export const importParagraphDecisionSummarySchema = z.object({
  paragraphId: z.string().trim().min(1).max(200),
  decision: z.enum(['pending', 'accepted', 'rejected', 'edited']),
  /** I162 optional for compatibility: new reviews persist the author's final classification. */
  role: sourceParagraphRoleSchema.optional(),
  summary: z.string().trim().min(1).max(2000),
}).strict();
export type ImportParagraphDecisionSummary = z.infer<typeof importParagraphDecisionSummarySchema>;

export const importInterpretationSessionStatusSchema = z.enum(['draft', 'confirmed', 'discarded', 'stale']);
export type ImportInterpretationSessionStatus = z.infer<typeof importInterpretationSessionStatusSchema>;

/** Durable Host checkpoint for one source file and one project. */
export const importInterpretationSessionSchema = z.object({
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
  intent: importInterpretationIntentSchema,
  paragraphDecisions: z.array(importParagraphDecisionSummarySchema),
  status: importInterpretationSessionStatusSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((session, context) => {
  const ids = session.paragraphDecisions.map((item) => item.paragraphId);
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate !== undefined) {
    context.addIssue({ code: 'custom', path: ['paragraphDecisions'], message: `Duplicate paragraph id: ${duplicate}` });
  }
});
export type ImportInterpretationSession = z.infer<typeof importInterpretationSessionSchema>;

export const importInterpretationSessionFileSchema = z.object({
  sessions: z.array(importInterpretationSessionSchema),
}).strict();
export type ImportInterpretationSessionFile = z.infer<typeof importInterpretationSessionFileSchema>;

const sessionIdentitySchema = z.object({
  projectId: entityIdSchema,
  importSessionId: entityIdSchema,
  sourceHash: sourceHashSchema,
}).strict();

export const importInterpretationSessionCreateInputSchema = z.object({
  projectId: entityIdSchema,
  sourceHash: sourceHashSchema,
  intent: importInterpretationIntentSchema,
  paragraphDecisions: z.array(importParagraphDecisionSummarySchema),
}).strict();
export type ImportInterpretationSessionCreateInput = z.infer<typeof importInterpretationSessionCreateInputSchema>;

export const importInterpretationSessionReadInputSchema = sessionIdentitySchema;
export type ImportInterpretationSessionReadInput = z.infer<typeof importInterpretationSessionReadInputSchema>;

export const importInterpretationSessionConfirmInputSchema = sessionIdentitySchema.extend({
  intent: importInterpretationIntentSchema,
  paragraphDecisions: z.array(importParagraphDecisionSummarySchema),
}).strict();
export type ImportInterpretationSessionConfirmInput = z.infer<typeof importInterpretationSessionConfirmInputSchema>;

export const importInterpretationSessionDiscardInputSchema = sessionIdentitySchema;
export type ImportInterpretationSessionDiscardInput = z.infer<typeof importInterpretationSessionDiscardInputSchema>;

// These aliases make the stage contract discoverable without creating a second schema owner.
export const importInterpretationCreateSchema = importInterpretationSessionCreateInputSchema;
export const importInterpretationReadSchema = importInterpretationSessionReadInputSchema;
export const importInterpretationConfirmSchema = importInterpretationSessionConfirmInputSchema;
export const importInterpretationDiscardSchema = importInterpretationSessionDiscardInputSchema;

export type ImportInterpretationIntentFields = {
  readonly sourceRole: ImportSourceRole;
  readonly treatment: ImportTreatment;
  readonly narrativeIntent?: NarrativeIntent;
};
