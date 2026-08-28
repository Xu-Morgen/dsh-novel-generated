import { z } from 'zod';

/** Canonical A2 identifier contract shared by routes, templates, presets and active refs. */
export const a2IdSchema = z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, 'ID must be lowercase kebab-case');

/** A prompt shell whose named sections have a deterministic declared order. */
export const PromptTemplateSchema = z.object({
  id: a2IdSchema,
  backendRef: a2IdSchema,
  roleHeaders: z.object({ system: z.string().min(1), user: z.string().min(1), assistant: z.string().min(1) }).strict(),
  sectionOrder: z.array(z.string().min(1)).min(1),
  stopSequences: z.array(z.string().min(1)),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.sectionOrder).size !== value.sectionOrder.length) {
    ctx.addIssue({ code: 'custom', message: 'Prompt template sectionOrder must not contain duplicates', path: ['sectionOrder'] });
  }
});
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

/** Optional Instruct/Jailbreak framing bound to exactly one configured backend. */
export const InstructPresetSchema = z.object({
  id: a2IdSchema,
  backendRef: a2IdSchema,
  systemPrompt: z.string(),
  jailbreak: z.string().optional(),
  activationRegex: z.string().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.activationRegex !== undefined) {
    try { new RegExp(value.activationRegex); } catch {
      ctx.addIssue({ code: 'custom', message: 'Instruct preset activationRegex is invalid', path: ['activationRegex'] });
    }
  }
});
export type InstructPreset = z.infer<typeof InstructPresetSchema>;
