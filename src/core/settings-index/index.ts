import { homedir } from 'node:os';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';

import { readYaml, writeYaml } from '../io/yaml.js';
import { GenerationSettingsSchema, type GenerationSettings } from '../../llm/port/index.js';

/** The Host-only persistence filename for A2 mechanism configuration (design §5.2). */
export const A2_SETTINGS_FILE = 'a2-settings.yaml';

/** Default Host location when no `settingsRoot` is configured (mirrors settings-service). */
export const DEFAULT_SETTINGS_ROOT = join(homedir(), '.dsh', 'novel-settings');

const id = z.string().min(1).regex(/^[a-z][a-z0-9-]*$/, 'ID must be lowercase kebab-case');
const modelRef = z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'modelRef must use provider/model format');

/** Controlled sampling settings accepted by the DSH Host LLM adapter. */
export const SamplingConfigSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  /** 思维链控制：off = 禁用；low/high/max = 启用并设思考强度（DeepSeek thinking mode）。 */
  reasoning: z.enum(['off', 'low', 'high', 'max']).optional(),
}).strict();
export type SamplingConfig = z.infer<typeof SamplingConfigSchema>;

/**
 * A2 backend route. `secretRef` is deliberately Host-only: it names a DSH
 * credential/settings reference, never a raw secret or endpoint (design §0.1.2).
 */
export const BackendRouteSchema = z.object({
  id,
  modelRef,
  secretRef: z.string().regex(/^[A-Z_][A-Z0-9_]*$/, 'secretRef must be a DSH credential environment reference'),
  sampling: SamplingConfigSchema.default({}),
}).strict();
export type BackendRoute = z.infer<typeof BackendRouteSchema>;

/** A prompt shell whose named sections have a deterministic declared order. */
export const PromptTemplateSchema = z.object({
  id,
  backendRef: id,
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
  id,
  backendRef: id,
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

export const A2SettingsSchema = z.object({
  version: z.literal(1),
  backends: z.array(BackendRouteSchema).min(1),
  templates: z.array(PromptTemplateSchema).min(1),
  presets: z.array(InstructPresetSchema),
  active: z.object({ backendId: id, templateId: id, presetId: id.optional() }).strict(),
}).strict().superRefine((value, ctx) => {
  assertUnique(value.backends, 'backend', ctx);
  assertUnique(value.templates, 'template', ctx);
  assertUnique(value.presets, 'preset', ctx);
  const backendIds = new Set(value.backends.map((item) => item.id));
  for (const template of value.templates) {
    if (!backendIds.has(template.backendRef)) ctx.addIssue({ code: 'custom', message: `Prompt template references unknown backend: ${template.id}`, path: ['templates'] });
  }
  for (const preset of value.presets) {
    if (!backendIds.has(preset.backendRef)) ctx.addIssue({ code: 'custom', message: `Instruct preset references unknown backend: ${preset.id}`, path: ['presets'] });
  }
  const template = value.templates.find((item) => item.id === value.active.templateId);
  const preset = value.active.presetId === undefined ? undefined : value.presets.find((item) => item.id === value.active.presetId);
  if (!backendIds.has(value.active.backendId)) ctx.addIssue({ code: 'custom', message: 'Active backend is unknown', path: ['active', 'backendId'] });
  if (!template) ctx.addIssue({ code: 'custom', message: 'Active template is unknown', path: ['active', 'templateId'] });
  if (value.active.presetId !== undefined && !preset) ctx.addIssue({ code: 'custom', message: 'Active preset is unknown', path: ['active', 'presetId'] });
  if (template && template.backendRef !== value.active.backendId) ctx.addIssue({ code: 'custom', message: 'Active template backend must match active backend', path: ['active'] });
  if (preset && preset.backendRef !== value.active.backendId) ctx.addIssue({ code: 'custom', message: 'Active preset backend must match active backend', path: ['active'] });
});
export type A2Settings = z.infer<typeof A2SettingsSchema>;

/** Safe projection suitable for a future Client view: it contains no SecretRef. */
export interface A2SettingsView {
  readonly version: 1;
  readonly backends: readonly { readonly id: string; readonly modelRef: string; readonly sampling: SamplingConfig }[];
  readonly templates: readonly PromptTemplate[];
  readonly presets: readonly Omit<InstructPreset, 'jailbreak'>[];
  readonly active: A2Settings['active'];
}

/** Resolved Host-only generation configuration; no raw credential leaves this seam. */
export interface ResolvedA2GenerationConfig {
  readonly settings: GenerationSettings;
  readonly template: PromptTemplate;
  readonly preset?: InstructPreset;
}

/**
 * Host-owned repository for persisted A2 configuration. It is outside a work's
 * project tree because A2 is a mechanism layer, not exportable story data.
 */
export class SettingsIndex {
  readonly root: string;
  constructor(root: string = DEFAULT_SETTINGS_ROOT) { this.root = resolve(root); }

  async load(): Promise<A2Settings> {
    return A2SettingsSchema.parse(await readYaml<unknown>(join(this.root, A2_SETTINGS_FILE)));
  }

  async save(input: unknown): Promise<A2Settings> {
    const settings = A2SettingsSchema.parse(input);
    await mkdir(this.root, { recursive: true });
    await writeYaml(join(this.root, A2_SETTINGS_FILE), settings);
    return settings;
  }
}

/** Resolve the selected route without changing any upper-layer generation call shape. */
export function resolveA2GenerationConfig(input: unknown): ResolvedA2GenerationConfig {
  const settings = A2SettingsSchema.parse(input);
  const backend = settings.backends.find((item) => item.id === settings.active.backendId)!;
  const template = settings.templates.find((item) => item.id === settings.active.templateId)!;
  const preset = settings.active.presetId === undefined ? undefined : settings.presets.find((item) => item.id === settings.active.presetId)!;
  return Object.freeze({
    settings: GenerationSettingsSchema.parse({ modelRef: backend.modelRef, credentialRef: backend.secretRef, ...backend.sampling, stopSequences: template.stopSequences }),
    template,
    ...(preset === undefined ? {} : { preset }),
  });
}

/** Remove Host-only SecretRefs and jailbreak text from a serializable settings view. */
export function toA2SettingsView(input: unknown): A2SettingsView {
  const settings = A2SettingsSchema.parse(input);
  return Object.freeze({
    version: settings.version,
    backends: Object.freeze(settings.backends.map(({ id: backendId, modelRef: route, sampling }) => Object.freeze({ id: backendId, modelRef: route, sampling }))),
    templates: Object.freeze(settings.templates.map((template) => Object.freeze({ ...template }))),
    presets: Object.freeze(settings.presets.map(({ jailbreak: _jailbreak, ...preset }) => Object.freeze(preset))),
    active: Object.freeze({ ...settings.active }),
  });
}

function assertUnique(items: readonly { id: string }[], kind: string, ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) ctx.addIssue({ code: 'custom', message: `Duplicate ${kind} ID: ${item.id}` });
    seen.add(item.id);
  }
}
