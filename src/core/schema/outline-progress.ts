import { z } from 'zod';
import { entityIdSchema } from './base.js';

/** A recorded structural divergence between the B5 plan and executed story. */
export const outlineDeviationSchema = z.object({
  id: entityIdSchema,
  planned: z.string().trim().min(1),
  actual: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  reconciled: z.boolean(),
}).strict();
export type OutlineDeviation = z.infer<typeof outlineDeviationSchema>;

/** C6 execution state; it records progress without mutating the B5 outline. */
export const outlineProgressSchema = z.object({
  outlineId: entityIdSchema,
  currentAct: entityIdSchema,
  currentBeat: entityIdSchema,
  completedBeats: z.array(entityIdSchema),
  deviations: z.array(outlineDeviationSchema),
  tensionLevel: z.number().finite().min(0).max(100),
}).strict();
export type OutlineProgress = z.infer<typeof outlineProgressSchema>;
export type OutlineProgressInput = OutlineProgress;

/** Compact navigation result used by context consumers and writing tools. */
export interface OutlineNavigation {
  readonly actId: string;
  readonly beatId: string;
  readonly title: string;
  readonly description: string;
  readonly prerequisites: readonly string[];
  readonly prerequisitesMet: boolean;
  readonly instruction: string;
  readonly deviationIds: readonly string[];
}
