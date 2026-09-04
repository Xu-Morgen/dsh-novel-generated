import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { dump } from 'js-yaml';

import type { CredentialStore } from '../../app/credentials.js';
import {
  A2_SETTINGS_FILE,
  SettingsIndex,
  type A2Settings,
  type SamplingConfig,
} from '../../core/settings-index/index.js';
import {
  llmConfigSaveInputSchema,
  LLM_MAX_TOKENS_DEFAULT,
  LLM_MAX_TOKENS_OPTIONS,
  LLM_REASONING_EFFORT_DEFAULT,
  LLM_THINKING_DEFAULT,
  NOVEL_LLM_CREDENTIAL_REF,
  NOVEL_LLM_PROVIDER_ID,
  type LlmConfigSaveInput,
  type LlmConfigSaveResult,
  type LlmConfigView,
  type LlmMaxTokens,
  type LlmReasoningEffort,
  type LlmThinkingMode,
} from '../../core/schema/llm-config.js';
import { readYaml } from '../../core/io/yaml.js';

/**
 * Main-owned LLM settings persistence for the desktop runtime (design §0.1.2).
 * The provider document and A2 sampling live below the Electron settings root;
 * the only secret operation is the injected CredentialStore. No provider
 * framework, host composition, or secret value crosses this service boundary.
 */
export interface DesktopLlmConfigService {
  load(): Promise<LlmConfigView>;
  save(input: LlmConfigSaveInput): Promise<LlmConfigSaveResult>;
}

interface ProviderDocument {
  readonly version: 1;
  readonly providerId: typeof NOVEL_LLM_PROVIDER_ID;
  readonly baseUrl: string;
  readonly model: string;
}

const PROVIDER_FILE = 'llm-config.yaml';
const REASONING_EFFORTS = Object.freeze({ off: null, low: 'low', high: 'high', max: 'max' } as const);

async function readYamlObject(filePath: string): Promise<Record<string, unknown>> {
  try {
    const value = await readYaml<unknown>(filePath);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // Missing or damaged settings fail closed to the empty view.
  }
  return {};
}

async function writeYaml(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, dump(value, { noRefs: true, lineWidth: 120 }), 'utf8');
}

function readProvider(document: Record<string, unknown>): { baseUrl: string; model: string } {
  if (document.version !== 1 || document.providerId !== NOVEL_LLM_PROVIDER_ID) return { baseUrl: '', model: '' };
  return {
    baseUrl: typeof document.baseUrl === 'string' ? document.baseUrl : '',
    model: typeof document.model === 'string' ? document.model : '',
  };
}

function defaultTemplate(id = 'novel-custom-default') {
  return {
    id,
    backendRef: NOVEL_LLM_PROVIDER_ID,
    roleHeaders: { system: '系统', user: '用户', assistant: '助手' },
    sectionOrder: ['system', 'user'],
    stopSequences: [],
  };
}

export function createLlmConfigService(
  credentials: CredentialStore | undefined,
  settingsRoot: string,
): DesktopLlmConfigService {
  if (typeof settingsRoot !== 'string' || settingsRoot.length === 0) throw new TypeError('Desktop settings root is required');
  const providerFile = join(settingsRoot, PROVIDER_FILE);
  const settingsIndex = new SettingsIndex(settingsRoot);

  const requireCredentials = (): CredentialStore => {
    if (credentials === undefined) throw new Error('Desktop credential store is unavailable');
    return credentials;
  };

  const readGenerationParams = async (): Promise<{
    maxTokens: LlmMaxTokens;
    thinking: LlmThinkingMode;
    reasoningEffort: LlmReasoningEffort;
  }> => {
    let sampling: { maxTokens?: unknown; reasoning?: unknown } = {};
    try {
      const a2 = await settingsIndex.load();
      sampling = a2.backends.find((backend) => backend.id === NOVEL_LLM_PROVIDER_ID)?.sampling ?? {};
    } catch {
      // Unconfigured A2 settings use the product defaults.
    }
    const maxTokens = typeof sampling.maxTokens === 'number' && (LLM_MAX_TOKENS_OPTIONS as readonly number[]).includes(sampling.maxTokens)
      ? sampling.maxTokens as LlmMaxTokens
      : LLM_MAX_TOKENS_DEFAULT;
    if (sampling.reasoning === 'off') return { maxTokens, thinking: 'disabled', reasoningEffort: LLM_REASONING_EFFORT_DEFAULT };
    if (sampling.reasoning === 'low' || sampling.reasoning === 'high' || sampling.reasoning === 'max') {
      return { maxTokens, thinking: 'enabled', reasoningEffort: sampling.reasoning };
    }
    return { maxTokens, thinking: LLM_THINKING_DEFAULT, reasoningEffort: LLM_REASONING_EFFORT_DEFAULT };
  };

  return {
    async load() {
      const provider = readProvider(await readYamlObject(providerFile));
      const hasKey = (await requireCredentials().describe(NOVEL_LLM_CREDENTIAL_REF)).configured;
      return Object.freeze({ providerId: NOVEL_LLM_PROVIDER_ID, ...provider, hasKey, ...(await readGenerationParams()) });
    },

    async save(input) {
      const parsed = llmConfigSaveInputSchema.parse(input) as LlmConfigSaveInput;
      const credentialStore = requireCredentials();
      const apiKey = parsed.apiKey.trim();
      if (apiKey === '') {
        if (!(await credentialStore.describe(NOVEL_LLM_CREDENTIAL_REF)).configured) {
          throw new Error('请先填写 API Key（当前未保存任何 Key，留空无法保留）');
        }
      } else {
        await credentialStore.set(NOVEL_LLM_CREDENTIAL_REF, apiKey);
      }

      await writeYaml(providerFile, {
        version: 1,
        providerId: NOVEL_LLM_PROVIDER_ID,
        baseUrl: parsed.baseUrl,
        model: parsed.model,
      } satisfies ProviderDocument);

      const modelRef = `${NOVEL_LLM_PROVIDER_ID}/${parsed.model}`;
      let a2: A2Settings;
      try {
        a2 = await settingsIndex.load();
      } catch {
        a2 = {
          version: 1,
          backends: [],
          templates: [],
          presets: [],
          active: { backendId: NOVEL_LLM_PROVIDER_ID, templateId: 'novel-custom-default' },
        };
      }
      const reasoning = parsed.thinking === 'disabled' ? 'off' : parsed.reasoningEffort;
      const existingSampling = a2.backends.find((backend) => backend.id === NOVEL_LLM_PROVIDER_ID)?.sampling ?? {};
      const sampling: SamplingConfig = { ...existingSampling, maxTokens: parsed.maxTokens, reasoning };
      const backends = a2.backends.filter((backend) => backend.id !== NOVEL_LLM_PROVIDER_ID)
        .concat({ id: NOVEL_LLM_PROVIDER_ID, modelRef, secretRef: NOVEL_LLM_CREDENTIAL_REF, sampling });
      const boundTemplate = a2.templates.find((template) => template.backendRef === NOVEL_LLM_PROVIDER_ID);
      const templates = boundTemplate ? a2.templates : a2.templates.concat(defaultTemplate(`${NOVEL_LLM_PROVIDER_ID}-${a2.templates.length + 1}`));
      const activeTemplate = templates.find((template) => template.backendRef === NOVEL_LLM_PROVIDER_ID)!;
      await settingsIndex.save({ ...a2, backends, templates, active: { backendId: NOVEL_LLM_PROVIDER_ID, templateId: activeTemplate.id } });
      return Object.freeze({ ok: true as const, modelRef });
    },
  };
}

/** The settings filename is exposed only for Main-owned smoke assertions. */
export const DESKTOP_LLM_PROVIDER_FILE = PROVIDER_FILE;
export const DESKTOP_LLM_A2_FILE = A2_SETTINGS_FILE;
