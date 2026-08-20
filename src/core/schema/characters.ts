import { z } from 'zod';
import { baseEntitySchema, entityIdSchema } from './base.js';

/**
 * B3 character-core layer (design §5.5): a character's immutable kernel —
 * personality, background, motivation, abilities and voice.
 *
 * Contract / invariants:
 * - `kind` is a closed enum; unknown values are rejected at the storage
 *   boundary (I9) and later surface as structural violations (I20/I21).
 * - `name` is required and non-empty (trimmed): an unnamed character is invalid.
 * - `arc` groups the character arc with `startingPoint`, `desiredEnd` and
 *   `keyBeats`; all three replicate exactly on YAML round-trip.
 * - `relationships` and `knowledgeIds` are forward references to the C1
 *   relationship layer and C3 knowledge layer respectively (design §5.5).
 *   I9 stores them verbatim and only validates id shape — existence is NOT
 *   checked here because C1/C3 are not built yet; injection/validation of
 *   those cross-layer references belongs to later iterations (I13/I16/I18).
 *
 * CRITICAL (R1-B3): this layer MUST NOT alias any C2 mutable field. C2 owns
 * the per-turn mutable state (`location`, `alive`, `health`, `mood`,
 * `inventory`, `condition`, `currentGoal`, `flags` — see
 * {@link ../state.js|characterStateSchema}). The two shapes share no fields by
 * design; the schema here is `.strict()`, so any accidental C2 field added to
 * an input is rejected, and the I9 snapshot test asserts the key sets are
 * disjoint. I9 stores character cores only; the C2 separation is enforced at
 * the schema boundary.
 */

export const characterKindSchema = z.enum([
  'protagonist',
  'antagonist',
  'supporting',
  'extra',
  'pov',
]);
export type CharacterKind = z.infer<typeof characterKindSchema>;

/** A character's arc, connecting the B3 kernel to the B5 outline layer. */
export const characterArcSchema = z.object({
  startingPoint: z.string(),
  desiredEnd: z.string(),
  keyBeats: z.array(z.string()),
}).strict();

export type CharacterArc = z.infer<typeof characterArcSchema>;

/**
 * One B3 CharacterCore. `id`/`version` come from the shared persisted identity
 * contract; `version` is caller-owned on create and incremented on update.
 */
export const characterCoreSchema = baseEntitySchema.extend({
  name: z.string().trim().min(1),
  aliases: z.array(z.string()),
  kind: characterKindSchema,
  personality: z.string(),
  background: z.string(),
  motivation: z.string(),
  goals: z.array(z.string()),
  flaws: z.array(z.string()),
  abilities: z.array(z.string()),
  speechStyle: z.string(),
  staticTraits: z.array(z.string()),
  arc: characterArcSchema,
  relationships: z.array(entityIdSchema),
  knowledgeIds: z.array(entityIdSchema),
}).strict();

export type CharacterCore = z.infer<typeof characterCoreSchema>;

/** Caller-supplied payload for `create`; `id` is required, `version` defaults to 1. */
export type CharacterCoreInput = Omit<CharacterCore, 'version'> & { version?: number };

/** Caller-supplied payload for `update`; `id` must match the target id. */
export type CharacterCorePatch = Omit<CharacterCore, 'id' | 'version'>;

/**
 * Deterministic consumer view (I9; full serializer in I13): a character core
 * as supplied to a scene's set of characters. `role` is the character's kind,
 * kept simple so downstream injectors order per scene without re-reading.
 */
export interface SceneCharacterView {
  readonly character: CharacterCore;
  readonly name: string;
  readonly kind: CharacterKind;
  /** Whether the core is marked a POV character. */
  readonly pov: boolean;
}

/** Reference used by injectors/detectors without re-reading storage. */
export type CharacterReference = Pick<
  CharacterCore,
  'id' | 'name' | 'kind' | 'speechStyle' | 'staticTraits'
>;
