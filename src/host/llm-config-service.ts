import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { dump, load } from 'js-yaml';

import {
  A2_SETTINGS_FILE,
  SettingsIndex,
  type A2Settings,
} from '../core/settings-index/index.js';
import {
  llmConfigSaveInputSchema,
  NOVEL_LLM_CREDENTIAL_REF,
  NOVEL_LLM_PROVIDER_ID,
  type LlmConfigSaveInput,
  type LlmConfigSaveResult,
  type LlmConfigView,
} from '../core/schema/llm-config.js';
import { readYaml } from '../core/io/yaml.js';

/**
 * LLM 设置持久化 owner（本地 DSH 三处文件，设计 §0.1.2 凭据/设置 seam）：
 *
 * - `~/.dsh/.credentials.yaml`：API Key 按环境引用名写入（凭据 seam，永不进项目）；
 * - `~/.dsh/settings.yaml`：在 `llm-pi-ai.providers.novel-custom` 注册
 *   OpenAI 兼容 provider（baseURL + apiKeyEnv + models），供 DSH `ctx.llm` 路由；
 * - `~/.dsh/novel-settings/a2-settings.yaml`：把活动 backend 切到该自定义路由。
 *
 * 合并均为读-改-写，保留 DSH 已存在的其它 providers/凭据；Key 永不从 load 返回。
 */

export interface NovelLlmConfigService {
  load(): Promise<LlmConfigView>;
  save(input: LlmConfigSaveInput): Promise<LlmConfigSaveResult>;
}

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
  dshHome: string = process.env.DSH_HOME ?? join(homedir(), '.dsh'),
  settingsRoot?: string,
): NovelLlmConfigService {
  const settingsFile = join(dshHome, 'settings.yaml');
  const credentialsFile = join(dshHome, '.credentials.yaml');
  const index = new SettingsIndex(settingsRoot);

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
    const creds = await readYamlObject(credentialsFile);
    const value = creds[NOVEL_LLM_CREDENTIAL_REF];
    return typeof value === 'string' && value.length > 0;
  };

  return {
    async load() {
      const { baseUrl, model } = await readProvider();
      const hasKey = await readHasKey();
      return Object.freeze({ providerId: NOVEL_LLM_PROVIDER_ID, baseUrl, model, hasKey });
    },

    async save(input) {
      const parsed = llmConfigSaveInputSchema.parse(input);
      // 1. API Key → 本地 DSH 凭据 seam。
      await mergeYaml(credentialsFile, (doc) => { doc[NOVEL_LLM_CREDENTIAL_REF] = parsed.apiKey; });
      // 2. provider 路由 → settings.yaml（OpenAI 兼容 completions 端点）。
      await mergeYaml(settingsFile, (doc) => mergeProvider(doc, NOVEL_LLM_PROVIDER_ID, {
        apiKeyEnv: NOVEL_LLM_CREDENTIAL_REF,
        api: 'openai-completions',
        baseURL: parsed.baseUrl,
        models: [{ id: parsed.model }],
      }));
      // 3. A2 活动 backend → 该自定义路由。
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
      const backends = a2.backends.filter((backend) => backend.id !== NOVEL_LLM_PROVIDER_ID)
        .concat({ id: NOVEL_LLM_PROVIDER_ID, modelRef, secretRef: NOVEL_LLM_CREDENTIAL_REF, sampling: {} });
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
