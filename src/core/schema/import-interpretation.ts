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
  return sha256Hex(serializeImportSourceBinding(input));
}

/** Compatibility-friendly names for consumers that call this an import intent. */
export const serializeImportIntent = serializeImportSourceBinding;
export const fingerprintImportIntent = fingerprintImportSourceBinding;

/**
 * Portable SHA-256 used by the canonical contract. This module is imported by
 * the browser Client bundle through type-derived Remote metadata, so the
 * fingerprint cannot depend on `node:crypto` or any Host-only builtin.
 */
function sha256Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = ((bytes.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  padded[paddedLength - 4] = bitLength >>> 24;
  padded[paddedLength - 3] = bitLength >>> 16;
  padded[paddedLength - 2] = bitLength >>> 8;
  padded[paddedLength - 1] = bitLength;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const words = new Int32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index++) {
      const position = offset + index * 4;
      words[index] = (padded[position] << 24) | (padded[position + 1] << 16) | (padded[position + 2] << 8) | padded[position + 3];
    }
    for (let index = 16; index < 64; index++) {
      const value0 = rotr(words[index - 15], 7) ^ rotr(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const value1 = rotr(words[index - 2], 17) ^ rotr(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + value0 + words[index - 7] + value1) | 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;
    for (let index = 0; index < 64; index++) {
      const sigma1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + choose + k[index] + words[index]) | 0;
      const sigma0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + majority) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('');
}

function rotr(value: number, shift: number): number { return (value >>> shift) | (value << (32 - shift)); }
