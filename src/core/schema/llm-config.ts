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

/**
 * maxTokens 固定档位（128k = 131072）。
 *
 * 官方文档：`max_tokens` 同时覆盖思维链（reasoning）与最终正文，因此预算不足时
 * 正文会被截断；模型元数据 maxTokens 为 384000，32768/65536/131072 均在能力内。
 * 32768 为推荐默认：六层分析包通常 3–8k 输出，32768 在关闭/低强度思维链下足够。
 */
export const LLM_MAX_TOKENS_OPTIONS = [32768, 65536, 131072] as const;
export type LlmMaxTokens = (typeof LLM_MAX_TOKENS_OPTIONS)[number];
export const LLM_MAX_TOKENS_DEFAULT: LlmMaxTokens = 32768;

const llmMaxTokensSchema = z.union([
  z.literal(32768),
  z.literal(65536),
  z.literal(131072),
]);

/** 思维链开关（DeepSeek Thinking Mode 官方参数 `thinking.type`；官方默认启用）。 */
export const llmThinkingModeSchema = z.enum(['enabled', 'disabled']);
export type LlmThinkingMode = z.infer<typeof llmThinkingModeSchema>;
export const LLM_THINKING_DEFAULT: LlmThinkingMode = 'enabled';

/**
 * 思考强度（官方 `reasoning_effort: low|high|max`；官方默认 high）。
 * low 是唯一低于默认的档位（medium 会映射到 high），max 最强但最慢。
 */
export const llmReasoningEffortSchema = z.enum(['low', 'high', 'max']);
export type LlmReasoningEffort = z.infer<typeof llmReasoningEffortSchema>;
export const LLM_REASONING_EFFORT_DEFAULT: LlmReasoningEffort = 'high';

/** save 输入：baseUrl + 模型名 + API Key（Key 留空 = 保留已保存的 Key）+ 生成参数。 */
export const llmConfigSaveInputSchema = z.object({
  baseUrl: z.string().url('API URL 必须是合法 http(s) 地址').max(512),
  model: modelNameSchema,
  apiKey: z.string().max(4096).refine((value) => value.trim() === '' || value.length >= 8, 'API Key 至少 8 个字符'),
  maxTokens: llmMaxTokensSchema,
  thinking: llmThinkingModeSchema,
  reasoningEffort: llmReasoningEffortSchema,
}).strict();
export type LlmConfigSaveInput = z.infer<typeof llmConfigSaveInputSchema>;

/** 设置页回显视图：绝不包含 Key 本体，仅标记是否已配置；含官方推荐默认的生成参数。 */
export const llmConfigViewSchema = z.object({
  providerId: z.literal(NOVEL_LLM_PROVIDER_ID),
  baseUrl: z.string(),
  model: z.string(),
  hasKey: z.boolean(),
  maxTokens: llmMaxTokensSchema,
  thinking: llmThinkingModeSchema,
  reasoningEffort: llmReasoningEffortSchema,
}).strict();
export type LlmConfigView = z.infer<typeof llmConfigViewSchema>;

export const llmConfigSaveResultSchema = z.object({
  ok: z.literal(true),
  modelRef: z.string(),
}).strict();
export type LlmConfigSaveResult = z.infer<typeof llmConfigSaveResultSchema>;
