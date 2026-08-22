import { z } from 'zod';
import { entityIdSchema } from './base.js';

/** I41 durable classification projection; source files remain authoritative. */
export const settingEntrySchema = z.object({
  id: entityIdSchema,
  sourceLayer: z.enum(['B1', 'B2']),
  sourceId: entityIdSchema,
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
  tags: z.array(z.string().trim().min(1)).max(30),
  immutable: z.literal(true),
  supersededBy: entityIdSchema.optional(),
  version: z.number().int().positive(),
}).strict();

export const classifierCandidateSchema = z.object({
  entry: settingEntrySchema,
  sourceIds: z.array(entityIdSchema).min(1),
  sourceEvidence: z.array(z.object({ sourceId: entityIdSchema, quote: z.string().trim().min(1) }).strict()).min(1),
}).strict();
export const classifierOutputSchema = z.object({ candidates: classifierCandidateSchema.array() }).strict();
export const classifierInputSchema = z.object({
  sources: z.array(z.object({ sourceLayer: z.enum(['B1', 'B2']), sourceId: entityIdSchema, title: z.string().trim().min(1), content: z.string().trim().min(1), tags: z.array(z.string().trim().min(1)) }).strict()).min(1),
}).strict();
export type SettingEntry = z.infer<typeof settingEntrySchema>;
export type ClassifierCandidate = z.infer<typeof classifierCandidateSchema>;
export type ClassifierOutput = z.infer<typeof classifierOutputSchema>;
export type ClassifierInput = z.infer<typeof classifierInputSchema>;

export function parseClassifierOutput(text: unknown): ClassifierOutput {
  const raw = z.string().trim().min(1).parse(text);
  let json: unknown;
  try { json = JSON.parse(raw); } catch (cause) { throw new Error('Classifier output must be valid JSON', { cause }); }
  return classifierOutputSchema.parse(json);
}

/** Deterministically merge duplicate semantic candidates without losing provenance. */
export function mergeClassifierCandidates(candidates: readonly ClassifierCandidate[]): ClassifierCandidate[] {
  const merged = new Map<string, ClassifierCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.entry.sourceLayer}|${candidate.entry.title.trim().toLocaleLowerCase()}|${candidate.entry.content.trim()}`;
    const prior = merged.get(key);
    if (!prior) { merged.set(key, structuredClone(candidate)); continue; }
    const sourceIds = [...new Set([...prior.sourceIds, ...candidate.sourceIds])].sort();
    const sourceEvidence = [...prior.sourceEvidence, ...candidate.sourceEvidence]
      .filter((item, index, all) => all.findIndex((other) => other.sourceId === item.sourceId && other.quote === item.quote) === index)
      .sort((a, b) => `${a.sourceId}|${a.quote}`.localeCompare(`${b.sourceId}|${b.quote}`));
    merged.set(key, { entry: prior.entry, sourceIds, sourceEvidence });
  }
  return [...merged.values()].sort((a, b) => a.entry.id.localeCompare(b.entry.id));
}

export const classifiedSettingsFileSchema = z.object({ candidates: classifierCandidateSchema.array() }).strict();
