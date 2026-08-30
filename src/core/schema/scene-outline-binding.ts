import { z } from 'zod';
import { entityIdSchema } from './base.js';
import { projectFingerprintSchema } from './text-mutation.js';

/** Maximum owned binding rows returned or persisted by one project document. */
export const SCENE_OUTLINE_BINDING_LIMIT = 10_000;

/** One explicit C5 scene ↔ B5 detail-beat relation persisted by the Host owner. */
export const sceneOutlineManualBindingSchema = z.object({
  sceneId: entityIdSchema,
  detailBeatId: entityIdSchema,
}).strict();

/** Strict, versioned persistence document; computed stable defaults never enter this shape. */
export const sceneOutlineBindingDocumentSchema = z.object({
  version: z.literal(1),
  bindings: z.array(sceneOutlineManualBindingSchema).max(SCENE_OUTLINE_BINDING_LIMIT),
}).strict().superRefine((document, context) => {
  const scenes = new Set<string>();
  const cards = new Set<string>();
  for (const [index, binding] of document.bindings.entries()) {
    if (scenes.has(binding.sceneId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index, 'sceneId'], message: `Duplicate bound scene: ${binding.sceneId}` });
    if (cards.has(binding.detailBeatId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['bindings', index, 'detailBeatId'], message: `Duplicate bound detail beat: ${binding.detailBeatId}` });
    scenes.add(binding.sceneId);
    cards.add(binding.detailBeatId);
  }
});

/** Effective relation exposed to consumers, with its owning chapter and derivation source. */
export const sceneOutlineEffectiveBindingSchema = sceneOutlineManualBindingSchema.extend({
  chapterId: entityIdSchema,
  source: z.enum(['manual', 'default']),
}).strict();

/** Bounded owned projection; no live C5/B5 service objects cross the boundary. */
export const sceneOutlineBindingReadResultSchema = z.object({
  manual: z.array(sceneOutlineManualBindingSchema).max(SCENE_OUTLINE_BINDING_LIMIT),
  effective: z.array(sceneOutlineEffectiveBindingSchema).max(SCENE_OUTLINE_BINDING_LIMIT),
  fingerprint: projectFingerprintSchema,
}).strict();

export const sceneOutlineBindingSaveSchema = sceneOutlineManualBindingSchema.extend({
  expectedFingerprint: projectFingerprintSchema,
}).strict();

export const sceneOutlineBindingRebindSchema = z.object({
  sceneId: entityIdSchema,
  detailBeatId: entityIdSchema,
  nextDetailBeatId: entityIdSchema,
  expectedFingerprint: projectFingerprintSchema,
}).strict();

export const sceneOutlineBindingUnbindSchema = sceneOutlineManualBindingSchema.extend({
  expectedFingerprint: projectFingerprintSchema,
}).strict();

export const sceneOutlineBindingImpactInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scene'), sceneId: entityIdSchema }).strict(),
  z.object({ kind: z.literal('chapter'), chapterId: entityIdSchema }).strict(),
]);

/** Read-only deletion-planning projection for I106; this contract performs no cleanup. */
const sceneOutlineBindingImpactFields = {
  chapterId: entityIdSchema,
  bindings: z.array(sceneOutlineEffectiveBindingSchema).max(SCENE_OUTLINE_BINDING_LIMIT),
  fingerprint: projectFingerprintSchema,
};
export const sceneOutlineBindingImpactResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scene'), sceneId: entityIdSchema, ...sceneOutlineBindingImpactFields }).strict(),
  z.object({ kind: z.literal('chapter'), ...sceneOutlineBindingImpactFields }).strict(),
]);

export type SceneOutlineManualBinding = z.infer<typeof sceneOutlineManualBindingSchema>;
export type SceneOutlineBindingDocument = z.infer<typeof sceneOutlineBindingDocumentSchema>;
export type SceneOutlineEffectiveBinding = z.infer<typeof sceneOutlineEffectiveBindingSchema>;
export type SceneOutlineBindingReadResult = z.infer<typeof sceneOutlineBindingReadResultSchema>;
export type SceneOutlineBindingSave = z.infer<typeof sceneOutlineBindingSaveSchema>;
export type SceneOutlineBindingRebind = z.infer<typeof sceneOutlineBindingRebindSchema>;
export type SceneOutlineBindingUnbind = z.infer<typeof sceneOutlineBindingUnbindSchema>;
export type SceneOutlineBindingImpactInput = z.infer<typeof sceneOutlineBindingImpactInputSchema>;
export type SceneOutlineBindingImpactResult = z.infer<typeof sceneOutlineBindingImpactResultSchema>;
