import type { El } from './shared.js';
import { saveButtonLabel } from './save-status.js';
import type { NamespaceOf } from './remote-namespace.js';
import { llmConfigRemoteContribution } from '../remote.js';
export { llmConfigRemoteContribution };

/**
 * LLM 设置页（额外页面）：手动输入 API URL / 模型名称 / API Key 并保存到本地
 * DSH。Client 只提交 Key 一次，load 视图永不包含 Key（design §0.1.2 凭据 seam）。
 *
 * 生成参数（maxTokens / 思维链 / 思考强度）均按 DeepSeek 官方文档提供用户友好
 * 控件与推荐默认值：maxTokens 固定档位（32768 推荐 / 65536 / 128k），思维链官方
 * 默认启用，思考强度官方默认 high（见 `src/core/schema/llm-config.ts`）。
 */

export interface LlmConfigViewShape {
  readonly providerId: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly hasKey: boolean;
  readonly maxTokens: number;
  readonly thinking: 'enabled' | 'disabled';
  readonly reasoningEffort: 'low' | 'high' | 'max';
}

export interface LlmConfigDraftShape {
  baseUrl: string;
  model: string;
  apiKey: string;
  maxTokens: number;
  thinking: 'enabled' | 'disabled';
  reasoningEffort: 'low' | 'high' | 'max';
  saving: boolean;
  message: string;
  error: string;
}

/**
 * I91：namespace 类型从 host contribution 派生（见 remote-namespace.ts）——
 * 参数/返回类型随 descriptor 流动，方法签名变更在 Client 消费处即报编译错
 * （review v2.0 §3.1 / 计划 §18 I91）。
 */
export type LlmConfigNamespace = NamespaceOf<typeof llmConfigRemoteContribution>;

/** maxTokens 固定档位（与 `LLM_MAX_TOKENS_OPTIONS` 一致）。 */
export const LLM_MAX_TOKENS_OPTION_LABELS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 32768, label: '32768（推荐）' },
  { value: 65536, label: '65536' },
  { value: 131072, label: '131072（128k）' },
];

export function freshLlmConfigDraft(): LlmConfigDraftShape {
  return { baseUrl: '', model: '', apiKey: '', maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high', saving: false, message: '', error: '' };
}

/** 渲染 LLM 设置表单：URL / 模型 / Key（password）+ 生成参数 + 保存 + 状态行。 */
export function llmSettingsPanel(
  h: El,
  namespace: LlmConfigNamespace | undefined,
  view: LlmConfigViewShape | undefined,
  draft: LlmConfigDraftShape,
  mutate: (patch: Partial<LlmConfigDraftShape>) => void,
  save: () => void,
): unknown {
  return h('section', { className: 'nv-panel nv-settings', 'data-novel-llm-settings': '', 'data-novel-layer-state': 'ready' },
    h('h3', { className: 'nv-editor__title' }, 'AI 设置'),
    h('p', { className: 'nv-settings__hint' },
      '配置自定义 AI 服务。访问密钥仅保存在本地，不回传浏览器；服务路由保存后需重启 DSH 生效，生成参数保存后立即生效。'),
    h('div', { className: 'nv-form' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '服务地址'),
        h('input', { type: 'text', className: 'nv-field__input', 'data-novel-llm-url': '', placeholder: '例如：https://服务.example/v1', value: draft.baseUrl, onChange: (event: { target: { value: string } }) => mutate({ baseUrl: event.target.value }) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '模型名称'),
        h('input', { type: 'text', className: 'nv-field__input', 'data-novel-llm-model': '', placeholder: 'gpt-4o', value: draft.model, onChange: (event: { target: { value: string } }) => mutate({ model: event.target.value }) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '访问密钥'),
        h('input', { type: 'password', className: 'nv-field__input', 'data-novel-llm-key': '', placeholder: view?.hasKey ? '已保存（留空保持不变）' : '请输入访问密钥', value: draft.apiKey, onChange: (event: { target: { value: string } }) => mutate({ apiKey: event.target.value }) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '单次输出长度'),
        h('select', { className: 'nv-field__input', 'data-novel-llm-max-tokens': '', value: draft.maxTokens, onChange: (event: { target: { value: string } }) => mutate({ maxTokens: Number(event.target.value) }) },
          LLM_MAX_TOKENS_OPTION_LABELS.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
        ),
        h('span', { className: 'nv-settings__hint' }, '该长度同时覆盖思考与正文；六层分析建议 32768，超长文本可上调至 128k。'),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '深度思考'),
        h('select', { className: 'nv-field__input', 'data-novel-llm-thinking': '', value: draft.thinking, onChange: (event: { target: { value: string } }) => mutate({ thinking: event.target.value === 'enabled' ? 'enabled' : 'disabled' }) },
          h('option', { value: 'enabled' }, '启用（官方默认，更准）'),
          h('option', { value: 'disabled' }, '禁用（更快）'),
        ),
        h('span', { className: 'nv-settings__hint' }, '官方：启用时 temperature/top_p 等采样参数不生效；禁用后输出更快、token 更省。'),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '思考强度（仅启用深度思考时有效）'),
        h('select', { className: 'nv-field__input', 'data-novel-llm-effort': '', value: draft.reasoningEffort, disabled: draft.thinking === 'disabled', onChange: (event: { target: { value: string } }) => mutate({ reasoningEffort: event.target.value === 'max' ? 'max' : event.target.value === 'low' ? 'low' : 'high' }) },
          h('option', { value: 'low' }, '低（最快）'),
          h('option', { value: 'high' }, '高（官方默认）'),
          h('option', { value: 'max' }, '最高（最准，最慢）'),
        ),
      ),
    ),
    h('button', { type: 'button', className: 'nv-btn', 'data-novel-llm-save': '', disabled: namespace === undefined || draft.saving, onClick: () => save() }, saveButtonLabel(draft.saving, '保存设置')),
    // I59 保存状态（R12-6）：保存中/已保存/失败三态可播报；saved/failed 行保留既有
    // data-novel-llm-message / data-novel-llm-error 锚点，新增 data-novel-save-state。
    draft.saving ? h('p', { className: 'nv-save-status nv-save-status--saving', 'data-novel-save-status': 'llm', 'data-novel-save-state': 'saving', role: 'status', 'aria-live': 'polite' }, '正在保存…') : null,
    draft.message ? h('p', { className: 'nv-settings__ok', 'data-novel-llm-message': '', 'data-novel-save-status': 'llm', 'data-novel-save-state': 'saved', role: 'status', 'aria-live': 'polite' }, draft.message) : null,
    draft.error ? h('p', { className: 'nv-settings__error', 'data-novel-llm-error': '', 'data-novel-save-status': 'llm', 'data-novel-save-state': 'failed', role: 'alert', 'aria-live': 'assertive' }, draft.error) : null,
  );
}
