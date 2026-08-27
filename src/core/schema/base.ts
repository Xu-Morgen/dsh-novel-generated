import { z } from 'zod';

/** Portable project/entity identifiers used as directory names. */
export const entityIdSchema = z.string().min(1).max(64).regex(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/);

/** Shared persisted identity contract for the Host-owned file store. */
export const baseEntitySchema = z.object({
  id: entityIdSchema,
  version: z.number().int().positive(),
}).strict();

export type BaseEntity = z.infer<typeof baseEntitySchema>;

/** I3 metadata only; narrative-layer fields are owned by later iterations. */
export const projectMetaSchema = baseEntitySchema.extend({
  name: z.string().trim().min(1).max(200),
}).strict();

export type ProjectMeta = z.infer<typeof projectMetaSchema>;

/**
 * Canonical three-level model confidence shared by every llm parser/validator
 * (I76 convergence; review §9 #2 — previously duplicated 7× across
 * `llm/parse/*` and `core/schema/onboarding.ts`). Defined in this zod-only
 * core leaf so `core/schema/onboarding.ts` can consume it without a core→llm
 * import edge (review §8#4); `src/llm/parse/shared.ts` re-exports it as the
 * llm-side single source. 'low' always implies I11 ConfirmationGate.
 */
export const confidenceSchema = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof confidenceSchema>;
