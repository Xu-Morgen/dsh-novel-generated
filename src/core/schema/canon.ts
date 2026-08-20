import { z } from 'zod';
import { entityIdSchema } from './base.js';

/** C4 event kind (§5.11) extended by the §6.2 correction channel. */
export const canonKindSchema = z.enum([
  'event',
  'decision',
  'revelation',
  'statechange',
  'dialogue',
  'correction',
]);
export type CanonKind = z.infer<typeof canonKindSchema>;

/**
 * C4 CanonEvent (design §5.11): an immutable, append-only canonical fact.
 *
 * Invariants enforced by the ledger, not just this schema:
 * - `seq` is globally monotonic and assigned by the ledger on append.
 * - `immutable` is always `true`; the ledger never rewrites a stored line.
 * - `supersedes` appears only on `kind: 'correction'` events (§6.2) and points
 *   at the id of the event being corrected; the corrected line is retained.
 */
export const canonEventSchema = z.object({
  id: entityIdSchema,
  seq: z.number().int().nonnegative(),
  storyTime: z.string(),
  kind: canonKindSchema,
  summary: z.string().min(1),
  detail: z.string(),
  participants: z.array(entityIdSchema),
  location: z.string(),
  consequences: z.array(entityIdSchema),
  affectedLayers: z.array(z.string()),
  immutable: z.literal(true),
  supersedes: entityIdSchema.optional(),
}).strict();

export type CanonEvent = z.infer<typeof canonEventSchema>;

/** Caller-supplied payload for `append`; `seq`, `immutable`, and `supersedes` are ledger-owned. */
export type CanonEventInput = Omit<CanonEvent, 'seq' | 'immutable' | 'supersedes'>;

/** Caller-supplied payload for `supersede`; the ledger forces `kind: 'correction'`. */
export type CanonCorrectionInput = Omit<CanonEventInput, 'kind'>;
