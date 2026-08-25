import { z } from 'zod';

/**
 * LLM 设置页（额外页面）的 Remote 契约：用户手动输入自定义 API URL、模型名称
 * 与 API Key，Host 负责持久化到本地 DSH（settings.yaml / .credentials.yaml /
 * a2-settings.yaml）。Key 只经 Host 落盘，永不回传浏览器（design §0.1.2 凭据 seam）。
 */

/** 本插件在 DSH `llm-pi-ai.providers` 中拥有的 provider id。 */
export const NOVEL_LLM_PROVIDER_ID = 'novel-custom';
/** Key 写入 `~/.dsh/.credentials.yaml` 时使用的环境引用名。 */
export const NOVEL_LLM_CREDENTIAL_REF = 'NOVEL_CUSTOM_API_KEY';

/** 模型名不得含 `/` 或空白（modelRef 必须为 provider/model 形式）。 */
const modelNameSchema = z.string().trim().min(1).max(256).regex(/^[^/\s]+$/, '模型名称不能包含 / 或空白字符');

/** save 输入：baseUrl + 模型名 + API Key（Key 留空 = 保留已保存的 Key）。 */
export const llmConfigSaveInputSchema = z.object({
  baseUrl: z.string().url('API URL 必须是合法 http(s) 地址').max(512),
  model: modelNameSchema,
  apiKey: z.string().max(4096).refine((value) => value.trim() === '' || value.length >= 8, 'API Key 至少 8 个字符'),
}).strict();
export type LlmConfigSaveInput = z.infer<typeof llmConfigSaveInputSchema>;

/** 设置页回显视图：绝不包含 Key 本体，仅标记是否已配置。 */
export const llmConfigViewSchema = z.object({
  providerId: z.literal(NOVEL_LLM_PROVIDER_ID),
  baseUrl: z.string(),
  model: z.string(),
  hasKey: z.boolean(),
}).strict();
export type LlmConfigView = z.infer<typeof llmConfigViewSchema>;

export const llmConfigSaveResultSchema = z.object({
  ok: z.literal(true),
  modelRef: z.string(),
}).strict();
export type LlmConfigSaveResult = z.infer<typeof llmConfigSaveResultSchema>;
