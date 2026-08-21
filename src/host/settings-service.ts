import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  SettingsIndex,
  resolveA2GenerationConfig,
  toA2SettingsView,
  type A2SettingsView,
} from '../core/settings-index/index.js';
import { isInstructPresetActive, renderPromptTemplate, type PromptSection } from '../llm/template/index.js';
import { createGenerationService, type NovelGenerationService } from './generation-service.js';

/** Host command accepted by the persisted A2 configuration facade. */
export interface ConfiguredGenerationRequest {
  readonly sections: readonly PromptSection[];
  readonly userPrompt: string;
  readonly signal?: AbortSignal;
}

/** Narrow projection of DSH's Host-only credential seam; resolved values never leave it. */
export interface CredentialResolver {
  resolve(ref: string): Promise<unknown>;
}

/**
 * Host-only A2 configuration facade. It persists only controlled configuration,
 * resolves SecretRefs per operation through DSH's Host seam, and delegates every generation to I17's sole
 * `ctx.llm` adapter (design §§0.1.2, 5.2).
 */
export interface NovelSettingsService {
  load(): Promise<A2SettingsView>;
  save(input: unknown): Promise<A2SettingsView>;
  generate(request: ConfiguredGenerationRequest): Promise<{ readonly prompt: string; readonly text: string; readonly chunks: number }>;
}

export function createSettingsService(
  llm: unknown,
  settingsRoot = join(homedir(), '.dsh', 'novel-settings'),
  credentials?: CredentialResolver,
  onDispose?: (dispose: () => void) => void,
): NovelSettingsService {
  const index = new SettingsIndex(settingsRoot);
  const generation: NovelGenerationService = createGenerationService(llm, onDispose);
  return {
    async load() { return toA2SettingsView(await index.load()); },
    async save(input: unknown) { return toA2SettingsView(await index.save(input)); },
    async generate(request) {
      const config = resolveA2GenerationConfig(await index.load());
      if (!credentials) throw new Error('Host credential resolver is unavailable');
      // Resolve every operation so changed DSH credentials take effect without restart;
      // the value deliberately remains inside the DSH seam (design §0.1.2).
      if (await credentials.resolve(config.settings.credentialRef) === undefined) {
        throw new Error(`Configured credential is unavailable: ${config.settings.credentialRef}`);
      }
      const preset = isInstructPresetActive(config.preset, request.userPrompt) ? config.preset : undefined;
      const prompt = renderPromptTemplate(config.template, preset, request.sections, request.userPrompt);
      const candidate = await generation.generate(prompt, config.settings, request.signal);
      return Object.freeze({ prompt, ...candidate });
    },
  };
}
