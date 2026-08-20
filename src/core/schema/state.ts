import { z } from 'zod';
import { baseEntitySchema, entityIdSchema } from './base.js';

const stateValueSchema = z.unknown();

/** Mutable scene snapshot owned by C2. */
export const sceneStateSchema = z.object({
  location: z.string(),
  timeOfDay: z.string(),
  weather: z.string(),
  season: z.string(),
  atmosphere: z.string(),
}).strict();

/** Per-character mutable state; flags are intentionally opaque to C2. */
export const characterStateSchema = z.object({
  characterId: entityIdSchema,
  location: z.string(),
  alive: z.boolean(),
  health: z.string(),
  mood: z.string(),
  inventory: z.array(z.string()),
  condition: z.string(),
  currentGoal: z.string(),
  flags: z.record(z.string(), stateValueSchema),
}).strict();

/** I4 scope of WorldState: scene and characters only. */
export const worldStateSchema = baseEntitySchema.extend({
  seq: z.number().int().nonnegative(),
  storyTime: z.string(),
  scene: sceneStateSchema,
  characters: z.array(characterStateSchema),
}).strict();

export type SceneState = z.infer<typeof sceneStateSchema>;
export type CharacterState = z.infer<typeof characterStateSchema>;
export type WorldState = z.infer<typeof worldStateSchema>;

export const stateSnapshotFileSchema = z.object({
  snapshots: z.array(worldStateSchema).min(1),
}).strict();

export type StateSnapshotFile = z.infer<typeof stateSnapshotFileSchema>;
