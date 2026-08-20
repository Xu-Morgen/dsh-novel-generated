import { z } from 'zod';
import { baseEntitySchema } from './base.js';

/**
 * B4 style layer (design §5.6): the project-wide narrative presentation
 * contract. A profile is globally stable in this slice; later chapter-level
 * overrides change consumption precedence, not this persisted source of truth.
 *
 * Contract / invariants:
 * - `person`, `tense`, and `povScope` are closed enums and fail at the storage
 *   boundary when unknown.
 * - All prose and format directives are required, non-blank strings so a
 *   consumer always receives a complete constant style segment.
 * - `forbidden` is an independently queryable list of non-blank expressions;
 *   I10 stores and exposes it but deliberately performs no style detection.
 */
export const narrativePersonSchema = z.enum([
  'first',
  'second',
  'third-limited',
  'third-omniscient',
]);
export type NarrativePerson = z.infer<typeof narrativePersonSchema>;

export const narrativeTenseSchema = z.enum(['past', 'present']);
export type NarrativeTense = z.infer<typeof narrativeTenseSchema>;

export const povScopeSchema = z.enum(['single', 'multi', 'omniscient']);
export type PovScope = z.infer<typeof povScopeSchema>;

/** One complete persisted B4 StyleProfile (design §5.6 / R1-B4). */
export const styleProfileSchema = baseEntitySchema.extend({
  name: z.string().trim().min(1),
  person: narrativePersonSchema,
  tense: narrativeTenseSchema,
  povScope: povScopeSchema,
  tone: z.string().trim().min(1),
  proseStyle: z.string().trim().min(1),
  chapterFormat: z.string().trim().min(1),
  dialogueConventions: z.string().trim().min(1),
  forbidden: z.array(z.string().trim().min(1)),
}).strict();

export type StyleProfile = z.infer<typeof styleProfileSchema>;

/** Caller-supplied global profile; `version` defaults to 1 on save. */
export type StyleProfileInput = Omit<StyleProfile, 'version'> & { version?: number };

/**
 * Deterministic downstream B4 view. I10 deliberately returns structured data,
 * rather than producing a prompt template; I12 owns textual serialization.
 */
export interface ConstantStyleSegment {
  readonly profile: StyleProfile;
  readonly forbidden: readonly string[];
}
