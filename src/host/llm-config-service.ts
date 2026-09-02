import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { credentialRef, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { dump, load } from 'js-yaml';

import {
  A2_SETTINGS_FILE,
  SettingsIndex,
  type A2Settings,
  type SamplingConfig,
} from '../core/settings-index/index.js';
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
} from '../core/schema/llm-config.js';
import { readYaml } from '../core/io/yaml.js';

/**
 * LLM 设置持久化 owner（设计 §0.1.2 / §14.19 凭据与设置 seam）：
 *
 * - `ctx.credentials`：API Key 按环境引用名交给 DSH canonical owner（永不进项目）；
 * - `~/.dsh/settings.yaml`：在 `llm-pi-ai.providers.novel-custom` 注册
 *   OpenAI 兼容 provider（baseURL + apiKeyEnv + models），供 DSH `ctx.llm` 路由；
 * - `~/.dsh/novel-settings/a2-settings.yaml`：把活动 backend 切到该自定义路由。
 *
 * settings 合并为读-改-写；凭据文件 schema、权限、锁和热重载完全归 DSH
 * `CredentialProvider`。Key 永不从 load 返回。
 */

export interface NovelLlmConfigService {
  load(): Promise<LlmConfigView>;
  save(input: LlmConfigSaveInput): Promise<LlmConfigSaveResult>;
}

/** I152：配置面只消费凭据公开 seam，不读取值，也不拥有 provider 的落盘格式。 */
export type NovelLlmCredentialService = Pick<CredentialProvider, 'describe' | 'set'>;

/** 读取一个可能缺失/损坏的 YAML 文件为对象，失败按空对象处理。 */
async function readYamlObject(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readYaml<unknown>(filePath);
    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

async function ensureWritable(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

/** 合并写单个 YAML 文档：读原对象 → 赋键 → 整体回写（保留其它键）。 */
async function mergeYaml(filePath: string, assign: (doc: Record<string, unknown>) => void): Promise<void> {
  const doc = await readYamlObject(filePath);
  assign(doc);
  await ensureWritable(filePath);
  await writeFile(filePath, dump(doc, { noRefs: true, lineWidth: 120 }), 'utf8');
}

/** 把 provider 合并进 DSH settings.yaml 的 `llm-pi-ai.providers.<id>`。 */
function mergeProvider(settingsDoc: Record<string, unknown>, providerId: string, provider: Record<string, unknown>): void {
  const llmPiAi = (settingsDoc['llm-pi-ai'] ??= {}) as Record<string, unknown>;
  const providers = (llmPiAi['providers'] ??= {}) as Record<string, unknown>;
  providers[providerId] = provider;
}

export function createLlmConfigService(
  credentials: NovelLlmCredentialService | undefined,
  dshHome: string = process.env.DSH_HOME ?? join(homedir(), '.dsh'),
  settingsRoot?: string,
): NovelLlmConfigService {
  const settingsFile = join(dshHome, 'settings.yaml');
  const index = new SettingsIndex(settingsRoot);
  const credential = credentialRef(NOVEL_LLM_CREDENTIAL_REF);

  const requireCredentials = (): NovelLlmCredentialService => {
    if (!credentials) throw new Error('DSH credentials service is unavailable');
    return credentials;
  };

  const readProvider = async (): Promise<{ baseUrl: string; model: string }> => {
    const doc = await readYamlObject(settingsFile);
    const provider = (doc['llm-pi-ai'] as Record<string, unknown> | undefined)?.['providers'] as Record<string, unknown> | undefined;
    const own = provider?.[NOVEL_LLM_PROVIDER_ID] as Record<string, unknown> | undefined;
    if (!own) return { baseUrl: '', model: '' };
    const baseUrl = typeof own['baseURL'] === 'string' ? own['baseURL'] : '';
    const models = Array.isArray(own['models']) ? own['models'] as Array<Record<string, unknown>> : [];
    const model = typeof models[0]?.['id'] === 'string' ? models[0]['id'] as string : '';
    return { baseUrl, model };
  };

  const readHasKey = async (): Promise<boolean> => {
    const info = await requireCredentials().describe(credential);
    return info.configured;
  };

  /**
   * 从 A2 活动 backend 的 sampling 回显生成参数；未配置时返回官方推荐默认值
   * （maxTokens 32768 / 思维链启用 / effort high）。`reasoning:'off'` → 禁用。
   */
  const readGenerationParams = async (): Promise<{
    maxTokens: LlmMaxTokens;
    thinking: LlmThinkingMode;
    reasoningEffort: LlmReasoningEffort;
  }> => {
    let sampling: { maxTokens?: unknown; reasoning?: unknown } = {};
    try {
      const a2 = await index.load();
      sampling = a2.backends.find((backend) => backend.id === NOVEL_LLM_PROVIDER_ID)?.sampling ?? {};
    } catch {
      // 未配置 A2：返回默认值，由用户保存后落盘。
    }
    const maxTokens = typeof sampling.maxTokens === 'number' && (LLM_MAX_TOKENS_OPTIONS as readonly number[]).includes(sampling.maxTokens)
      ? sampling.maxTokens as LlmMaxTokens
      : LLM_MAX_TOKENS_DEFAULT;
    const reasoning = sampling.reasoning;
    if (reasoning === 'off') return { maxTokens, thinking: 'disabled', reasoningEffort: LLM_REASONING_EFFORT_DEFAULT };
    if (reasoning === 'low' || reasoning === 'high' || reasoning === 'max') {
      return { maxTokens, thinking: 'enabled', reasoningEffort: reasoning };
    }
    return { maxTokens, thinking: LLM_THINKING_DEFAULT, reasoningEffort: LLM_REASONING_EFFORT_DEFAULT };
  };

  return {
    async load() {
      const { baseUrl, model } = await readProvider();
      const hasKey = await readHasKey();
      const params = await readGenerationParams();
      return Object.freeze({ providerId: NOVEL_LLM_PROVIDER_ID, baseUrl, model, hasKey, ...params });
    },

    async save(input) {
      // 显式声明输出类型：zod 泛型推断会把字段枚举宽化为 string。
      const parsed = llmConfigSaveInputSchema.parse(input) as LlmConfigSaveInput;
      // 1. API Key → DSH credentials seam。必须先提交凭据；失败时 settings/A2 零写。
      // Key 留空表示保留任一有效来源（file/env/.env），配置面只询问 describe，绝不读值。
      const apiKey = parsed.apiKey.trim();
      const credentialService = requireCredentials();
      if (apiKey === '') {
        const existing = await credentialService.describe(credential);
        if (!existing.configured) {
          throw new Error('请先填写 API Key（当前未保存任何 Key，留空无法保留）');
        }
      } else {
        await credentialService.set(credential, apiKey);
      }
      // 2. provider 路由 → settings.yaml（OpenAI 兼容 completions 端点）。
      await mergeYaml(settingsFile, (doc) => mergeProvider(doc, NOVEL_LLM_PROVIDER_ID, {
        apiKeyEnv: NOVEL_LLM_CREDENTIAL_REF,
        api: 'openai-completions',
        baseURL: parsed.baseUrl,
        models: [{ id: parsed.model }],
      }));
      // 3. A2 活动 backend → 该自定义路由；sampling 落生成参数（maxTokens 固定档位
      //    + 思维链/强度），并保留既有 sampling 字段（如 temperature）。
      const modelRef = `${NOVEL_LLM_PROVIDER_ID}/${parsed.model}`;
      const defaultTemplate = {
        id: 'novel-custom-default',
        backendRef: NOVEL_LLM_PROVIDER_ID,
        roleHeaders: { system: '系统', user: '用户', assistant: '助手' },
        sectionOrder: ['system', 'user'],
        stopSequences: [],
      };
      let a2: A2Settings;
      try {
        a2 = await index.load();
      } catch {
        a2 = {
          version: 1,
          backends: [{ id: NOVEL_LLM_PROVIDER_ID, modelRef, secretRef: NOVEL_LLM_CREDENTIAL_REF, sampling: {} }],
          templates: [defaultTemplate],
          presets: [],
          active: { backendId: NOVEL_LLM_PROVIDER_ID, templateId: 'novel-custom-default' },
        };
      }
      const reasoning = parsed.thinking === 'disabled' ? 'off' : parsed.reasoningEffort;
      const existingSampling = a2.backends.find((backend) => backend.id === NOVEL_LLM_PROVIDER_ID)?.sampling ?? {};
      // 显式标注：对象字面量的联合类型推断会被放宽，需按 SamplingConfig 契约落盘。
      const sampling: SamplingConfig = { ...existingSampling, maxTokens: parsed.maxTokens, reasoning };
      const backends = a2.backends.filter((backend) => backend.id !== NOVEL_LLM_PROVIDER_ID)
        .concat({ id: NOVEL_LLM_PROVIDER_ID, modelRef, secretRef: NOVEL_LLM_CREDENTIAL_REF, sampling });
      // A2 契约要求活动 template 绑定活动 backend（A2SettingsSchema superRefine）。
      const boundTemplate = a2.templates.find((template) => template.backendRef === NOVEL_LLM_PROVIDER_ID);
      const templates = boundTemplate
        ? a2.templates
        : a2.templates.concat({ ...defaultTemplate, id: `novel-custom-default-${a2.templates.length + 1}` });
      const activeTemplate = templates.find((template) => template.backendRef === NOVEL_LLM_PROVIDER_ID)!;
      await index.save({ ...a2, backends, templates, active: { backendId: NOVEL_LLM_PROVIDER_ID, templateId: activeTemplate.id } });
      return Object.freeze({ ok: true as const, modelRef });
    },
  };
}
