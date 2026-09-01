import { createHash } from 'node:crypto';
import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { sourceHashSchema, onboardingProjectIdSchema } from './onboarding-binding.js';

/**
 * I141 来源语义合同（design §14.15.1 / D26）。来源角色描述作者交给
 * Host 的材料是什么；它不暗示材料应当按原顺序成为读者看到的故事。
 */
export const importSourceRoleSchema = z.enum([
  'idea',
  'synopsis',
  'background-material',
  'existing-prose',
  'hybrid',
]);
export type ImportSourceRole = z.infer<typeof importSourceRoleSchema>;

/** Stage 19 只开放的两种处理目标；preserve-prose 属于 Stage 21。 */
export const importTreatmentSchema = z.enum(['expand-outline', 'adapt-pov']);
export type ImportTreatment = z.infer<typeof importTreatmentSchema>;
/** Short canonical alias used by import consumers. */
export const treatmentSchema = importTreatmentSchema;

export const narrativePovSchema = z.enum(['limited', 'omniscient']);
export type NarrativePov = z.infer<typeof narrativePovSchema>;

export const revealPacingSchema = z.enum(['slow', 'balanced', 'fast']);
export type RevealPacing = z.infer<typeof revealPacingSchema>;

/**
 * POV intent is present only for `adapt-pov`. `protagonistId` points at an
 * existing B3 character while `protagonistCandidateId` is a stable id for a
 * character that the subsequent candidate package may create. The schema
 * deliberately does not consult project files; `validateImportIntent` does
 * that pure, caller-supplied resolution step.
 */
export const narrativeIntentSchema = z.object({
  pov: narrativePovSchema,
  protagonistId: entityIdSchema.optional(),
  protagonistCandidateId: entityIdSchema.optional(),
  initialKnown: z.array(entityIdSchema),
  revealPacing: revealPacingSchema,
}).strict().superRefine((intent, context) => {
  if (intent.protagonistId !== undefined && intent.protagonistCandidateId !== undefined) {
    context.addIssue({ code: 'custom', path: ['protagonistCandidateId'], message: 'Use either protagonistId or protagonistCandidateId, not both' });
  }
  if (intent.pov === 'limited' && intent.protagonistId === undefined && intent.protagonistCandidateId === undefined) {
    context.addIssue({ code: 'custom', path: ['pov'], message: 'limited POV requires an existing protagonist or stable candidate id' });
  }
  const duplicate = intent.initialKnown.find((id, index) => intent.initialKnown.indexOf(id) !== index);
  if (duplicate !== undefined) {
    context.addIssue({ code: 'custom', path: ['initialKnown'], message: `Duplicate initial knowledge id: ${duplicate}` });
  }
});
export type NarrativeIntent = z.infer<typeof narrativeIntentSchema>;

/**
 * The pure I141 binding. I142 adds its operational session id around this
 * value; no session/checkpoint is persisted by this module.
 */
export const importSourceBindingSchema = z.object({
  projectId: onboardingProjectIdSchema,
  sourceHash: sourceHashSchema,
  sourceRole: importSourceRoleSchema,
  treatment: importTreatmentSchema,
  narrativeIntent: narrativeIntentSchema.optional(),
}).strict().superRefine((binding, context) => {
  if (binding.treatment === 'adapt-pov' && binding.narrativeIntent === undefined) {
    context.addIssue({ code: 'custom', path: ['narrativeIntent'], message: 'adapt-pov requires narrativeIntent' });
  }
  if (binding.treatment === 'expand-outline' && binding.narrativeIntent !== undefined) {
    context.addIssue({ code: 'custom', path: ['narrativeIntent'], message: 'narrativeIntent is only valid for adapt-pov' });
  }
});
export type ImportSourceBinding = z.infer<typeof importSourceBindingSchema>;

/** Stable candidate ids use the same portable alphabet as persisted entities. */
export const protagonistCandidateIdSchema = entityIdSchema;

export interface ImportIntentValidationOptions {
  /** Existing B3 ids in the target project. */
  readonly existingCharacterIds?: readonly string[];
  /** Stable ids already reserved by the current candidate package. */
  readonly candidateCharacterIds?: readonly string[];
}

/**
 * Parse and resolve the pure intent contract without reading or writing a
 * project. Unknown focal characters are accepted only when a matching stable
 * candidate id is supplied; this is the fail-closed boundary for `limited`.
 */
export function validateImportIntent(
  input: unknown,
  options: ImportIntentValidationOptions = {},
): ImportSourceBinding {
  const binding = importSourceBindingSchema.parse(input);
  const existing = new Set(options.existingCharacterIds ?? []);
  const candidates = new Set(options.candidateCharacterIds ?? []);
  const intent = binding.narrativeIntent;
  if (intent === undefined) return binding;

  if (intent.protagonistId !== undefined && !existing.has(intent.protagonistId)) {
    if (intent.protagonistCandidateId === undefined || !candidates.has(intent.protagonistCandidateId)) {
      throw new Error(`Unknown protagonist id without a stable candidate id: ${intent.protagonistId}`);
    }
  }
  if (intent.protagonistCandidateId !== undefined && !candidates.has(intent.protagonistCandidateId)) {
    throw new Error(`Unknown protagonist candidate id: ${intent.protagonistCandidateId}`);
  }
  for (const id of intent.initialKnown) {
    if (!existing.has(id) && !candidates.has(id)) {
      throw new Error(`Unknown initial knowledge id: ${id}`);
    }
  }
  return binding;
}

function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalValue(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Byte-stable canonical JSON; array order remains author/source order. */
export function serializeImportSourceBinding(input: ImportSourceBinding): string {
  return canonicalValue(importSourceBindingSchema.parse(input));
}

/** Stable SHA-256 fingerprint of the canonical binding serialization. */
export function fingerprintImportSourceBinding(input: ImportSourceBinding): string {
  return createHash('sha256').update(serializeImportSourceBinding(input), 'utf8').digest('hex');
}

/** Compatibility-friendly names for consumers that call this an import intent. */
export const serializeImportIntent = serializeImportSourceBinding;
export const fingerprintImportIntent = fingerprintImportSourceBinding;

