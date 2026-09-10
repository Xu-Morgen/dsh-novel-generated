import { z } from 'zod';
import { entityIdSchema } from '../schema/base.js';

/** Lifecycle is an operational record, never a C2 death flag or a B3 field. */
export const characterLifecycleStatusSchema = z.enum(['active', 'frozen', 'deleted']);
export const characterLifecycleRecordSchema = z.object({ characterId: entityIdSchema, status: characterLifecycleStatusSchema, revision: z.number().int().nonnegative(), operationId: entityIdSchema.optional() }).strict();
export const characterLifecycleFileSchema = z.object({ version: z.literal(1), records: characterLifecycleRecordSchema.array() }).strict();
export type CharacterLifecycleRecord = z.infer<typeof characterLifecycleRecordSchema>;
