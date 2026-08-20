import { z } from 'zod';
import { baseEntitySchema, entityIdSchema } from './base.js';

/**
 * B2 worldview layer (design §5.4): geography, history, factions, cultures,
 * races, concepts, artefacts and similar setting facts.
 *
 * Contract / invariants:
 * - `kind` and `status`/`triggerMode` are closed enums; unknown values are
 *   rejected at the storage boundary (I8).
 * - `triggerMode` is `'keyword' | 'regex' | 'constant'` here; `'vector'`
 *   triggering is postponed per the backlog (N-2), so it is NOT an accepted
 *   value yet — injecting it must fail loudly rather than silently store a
 *   trigger no consumer can service.
 * - `parent` and `supersededBy` reference other WorldEntry ids. Neither may
 *   self-reference, and cycles are rejected at write time (the repository
 *   enforces this across the collection, not the schema alone).
 * - Rewriting never mutates an existing entry in place: the old entry is
 *   marked `status: 'rewritten'` with `supersededBy` pointing at the new id,
 *   and a fresh versioned entry becomes the source of truth. This matches the
 *   C4 append-only spirit (design §5.6) applied to B2 (R1-B2, I29).
 * - `title`, `content` and `keywords` replicate exactly on YAML round-trip.
 */

export const worldKindSchema = z.enum([
  'geography',
  'history',
  'faction',
  'culture',
  'race',
  'concept',
  'artifact',
]);
export type WorldKind = z.infer<typeof worldKindSchema>;

/** I8 trigger modes; `vector` is intentionally absent (N-2 backlog). */
export const triggerModeSchema = z.enum(['keyword', 'regex', 'constant']);
export type TriggerMode = z.infer<typeof triggerModeSchema>;

export const worldStatusSchema = z.enum(['active', 'obsolete', 'rewritten']);
export type WorldStatus = z.infer<typeof worldStatusSchema>;

/**
 * One B2 WorldEntry. `id`/`version` come from the shared persisted identity
 * contract; `version` is caller-owned on create and incremented on rewrite.
 */
export const worldEntrySchema = baseEntitySchema.extend({
  kind: worldKindSchema,
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  keywords: z.array(z.string()),
  triggerMode: triggerModeSchema,
  weight: z.number().int(),
  parent: entityIdSchema.nullable(),
  mutable: z.boolean(),
  status: worldStatusSchema,
  supersededBy: entityIdSchema.nullable(),
}).strict();

export type WorldEntry = z.infer<typeof worldEntrySchema>;

/** Caller payload for `create`; `id` required, `version` defaults to 1. */
export type WorldEntryInput = Omit<WorldEntry, 'version'> & { version?: number };

/**
 * Deterministic consumer view for trigger queries (I8; full serializer in I13):
 * `matched` groups the entries whose id appears in `triggerKeywords`/`triggerRegex`,
 * `ancestors` the ordered chain from each matched entry's `parent` up to the root.
 */
export interface WorldEntryHit {
  readonly entry: WorldEntry;
  readonly entryId: string;
  /** Ordered parent chain (root first) from the matched entry, excluding itself. */
  readonly ancestors: string[];
  readonly level: number;
}
