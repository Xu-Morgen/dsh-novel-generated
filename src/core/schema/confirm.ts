import { z } from 'zod';
import { entityIdSchema } from './base.js';

/** The three durable outcomes of an I11 user-confirmation proposal. */
export const confirmationStatusSchema = z.enum(['pending', 'accepted', 'rejected']);
export type ConfirmationStatus = z.infer<typeof confirmationStatusSchema>;

/**
 * Opaque, JSON-only proposal data. I11 deliberately does not interpret a
 * proposal's business meaning; later owners define the allowed `kind` values.
 */
export const confirmationProposalSchema = z.object({
  id: entityIdSchema,
  kind: z.string().trim().min(1).max(100),
  payload: z.json(),
}).strict();
export type ConfirmationProposal = z.infer<typeof confirmationProposalSchema>;

/** Caller input for a new proposal; resolution and storage version are Gate-owned. */
export const confirmationProposalInputSchema = confirmationProposalSchema;
export type ConfirmationProposalInput = z.infer<typeof confirmationProposalInputSchema>;

/**
 * Versioned durable I11 record. The state transition is the generic apply or
 * discard operation: `accepted` is final application, `rejected` is final discard.
 */
export const confirmationRecordSchema = confirmationProposalSchema.extend({
  version: z.literal(1),
  status: confirmationStatusSchema,
}).strict();
export type ConfirmationRecord = z.infer<typeof confirmationRecordSchema>;

/** Root document for the Host-owned project confirmation store. */
export const confirmationFileSchema = z.object({
  confirmations: z.array(confirmationRecordSchema),
}).strict();
export type ConfirmationFile = z.infer<typeof confirmationFileSchema>;
