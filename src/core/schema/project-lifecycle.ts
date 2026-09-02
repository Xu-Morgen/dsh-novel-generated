import { z } from 'zod';
import { projectMetaSchema } from './base.js';
import { worldStateSchema } from './state.js';

/** Operational readiness classification for one project-owned layer. */
export const projectLayerReadinessSchema = z.enum(['ready', 'empty', 'uninitialized', 'corrupt']);
export type ProjectLayerReadiness = z.infer<typeof projectLayerReadinessSchema>;

/** Strict create input crossing the project lifecycle Remote. */
export const createProjectInputSchema = z.object({
  projectId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(200),
}).strict();
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const projectLayersReadinessSchema = z.object({
  characters: projectLayerReadinessSchema,
  worldview: projectLayerReadinessSchema,
  outline: projectLayerReadinessSchema,
  relationship: projectLayerReadinessSchema,
  state: projectLayerReadinessSchema,
  canon: projectLayerReadinessSchema,
}).strict();

export const projectOpenResultSchema = z.object({
  project: projectMetaSchema,
  layers: projectLayersReadinessSchema,
}).strict();
export type ProjectOpenResult = z.infer<typeof projectOpenResultSchema>;

/** Exact deterministic empty C2 snapshot input used for first bootstrap. */
export const INITIAL_STATE = {
  id: 'initial-state', version: 1, storyTime: '',
  scene: { location: '', timeOfDay: '', weather: '', season: '', atmosphere: '' },
  characters: [],
} satisfies Omit<z.input<typeof worldStateSchema>, 'seq'>;

export const projectListResultSchema = z.array(projectMetaSchema);
export const projectCreateResultSchema = projectMetaSchema;
export const projectArchiveListResultSchema = z.array(projectMetaSchema);
export const projectArchiveResultSchema = projectMetaSchema;
export const projectRestoreResultSchema = projectMetaSchema;

export type ProjectListResult = z.infer<typeof projectListResultSchema>;
export type ProjectArchiveListResult = z.infer<typeof projectArchiveListResultSchema>;
