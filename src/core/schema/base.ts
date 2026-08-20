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
