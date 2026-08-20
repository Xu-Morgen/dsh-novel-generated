import { z } from 'zod';
import { baseEntitySchema, entityIdSchema } from './base.js';

/** B5 story structures accepted by the outline storage boundary. */
export const outlineStructureSchema = z.enum(['three-act', 'hero-journey', 'serial', 'free']);
export type OutlineStructure = z.infer<typeof outlineStructureSchema>;

export const conflictTypeSchema = z.enum(['internal', 'external', 'relational', 'world']);
export type ConflictType = z.infer<typeof conflictTypeSchema>;

export const detailBeatStatusSchema = z.enum(['planned', 'writing', 'done']);
export type DetailBeatStatus = z.infer<typeof detailBeatStatusSchema>;

export const foreshadowingStatusSchema = z.enum(['unplanted', 'planted', 'payed']);
export type ForeshadowingStatus = z.infer<typeof foreshadowingStatusSchema>;

/** Scene card nested below a B5 beat; this is the I14 detail-beat contract. */
export const detailBeatSchema = z.object({
  id: entityIdSchema,
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  pov: z.string().trim().min(1),
  wordTarget: z.number().int().positive(),
  points: z.array(z.string().trim().min(1)),
  status: detailBeatStatusSchema,
}).strict();
export type DetailBeat = z.infer<typeof detailBeatSchema>;

/** A planned plot beat and its nested scene cards. */
export const beatSchema = z.object({
  id: entityIdSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  charactersInvolved: z.array(entityIdSchema),
  conflictType: conflictTypeSchema,
  prerequisites: z.array(entityIdSchema),
  optional: z.boolean(),
  detailBeats: z.array(detailBeatSchema),
}).strict();
export type Beat = z.infer<typeof beatSchema>;

export const actSchema = z.object({
  id: entityIdSchema,
  index: z.number().int().nonnegative(),
  title: z.string().trim().min(1),
  goal: z.string().trim().min(1),
  beats: z.array(beatSchema),
}).strict();
export type Act = z.infer<typeof actSchema>;

export const foreshadowingSchema = z.object({
  id: entityIdSchema,
  hint: z.string().trim().min(1),
  payoff: z.string().trim().min(1),
  status: foreshadowingStatusSchema,
  knownBy: z.array(entityIdSchema),
}).strict();
export type Foreshadowing = z.infer<typeof foreshadowingSchema>;

export const endingSchema = z.object({
  id: entityIdSchema,
  title: z.string().trim().min(1),
  conditions: z.array(z.string().trim().min(1)),
  description: z.string().trim().min(1),
}).strict();
export type Ending = z.infer<typeof endingSchema>;

/** B5 canonical outline; C6 progress is intentionally a separate later layer. */
export const outlineSchema = baseEntitySchema.extend({
  structure: outlineStructureSchema,
  logline: z.string().trim().min(1),
  themes: z.array(z.string().trim().min(1)),
  acts: z.array(actSchema),
  foreshadowing: z.array(foreshadowingSchema),
  endings: z.array(endingSchema),
}).strict();
export type Outline = z.infer<typeof outlineSchema>;
export type OutlineInput = Omit<Outline, 'version'> & { version?: number };

/** Stable downstream view used by I14's beat/scene-card consumer fixture. */
export interface OutlineBeatCard {
  readonly actId: string;
  readonly beatId: string;
  readonly beatTitle: string;
  readonly detailBeat: DetailBeat;
}
