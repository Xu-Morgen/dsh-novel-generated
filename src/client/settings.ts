import type { El } from './shared.js';
import { saveButtonLabel } from './save-status.js';
import type { NamespaceOf } from './remote-namespace.js';
import type { llmConfigRemoteContribution } from '../remote.js';

/**
 * LLM 设置页（额外页面）：手动输入 API URL / 模型名称 / API Key 并交给桌面 Main 保存。
 * Client 只提交 Key，load 视图永不包含 Key；Main 按 design §14.35 把它写入
 * 本机应用数据目录中的明文文本文件。
 * 生成参数选项服从既有 canonical schema；不同 provider 的支持能力由服务决定。
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
      '设置用于创作的 AI 服务。访问密钥会以不加密的明文保存到应用数据目录 settings/ai-token.txt，可在文本编辑器中直接修改；同一系统账户下的其他程序也可能读取，请自行承担风险。读取设置时仅返回是否已保存，外部修改后下次 AI 请求即生效。'),
    h('div', { className: 'nv-form' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '服务地址'),
        h('input', { type: 'text', className: 'nv-field__input', 'data-novel-llm-url': '', placeholder: '例如：https://服务.example/v1', value: draft.baseUrl, onChange: (event: { target: { value: string } }) => mutate({ baseUrl: event.target.value }) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '模型名称'),
        h('input', { type: 'text', className: 'nv-field__input', 'data-novel-llm-model': '', placeholder: '填写服务提供的模型名称', value: draft.model, onChange: (event: { target: { value: string } }) => mutate({ model: event.target.value }) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '访问密钥'),
        h('input', { type: 'password', autoComplete: 'off', spellCheck: false, className: 'nv-field__input', 'data-novel-llm-key': '', placeholder: view?.hasKey ? '已保存（留空保持不变）' : '请输入访问密钥', value: draft.apiKey, onChange: (event: { target: { value: string } }) => mutate({ apiKey: event.target.value }) }),
      ),
      h('details', { className: 'nv-fieldset', 'data-novel-llm-generation-settings': '' },
      h('summary', { className: 'nv-fieldset__legend' }, '生成参数'),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '单次输出长度'),
        h('select', { className: 'nv-field__input', 'data-novel-llm-max-tokens': '', value: draft.maxTokens, onChange: (event: { target: { value: string } }) => mutate({ maxTokens: Number(event.target.value) }) },
          LLM_MAX_TOKENS_OPTION_LABELS.map((option) => h('option', { key: option.value, value: option.value }, option.label)),
        ),
        h('span', { className: 'nv-settings__hint' }, '选择服务支持的单次输出上限；较长输出可能增加等待时间。'),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '深度思考'),
        h('select', { className: 'nv-field__input', 'data-novel-llm-thinking': '', value: draft.thinking, onChange: (event: { target: { value: string } }) => mutate({ thinking: event.target.value === 'enabled' ? 'enabled' : 'disabled' }) },
          h('option', { value: 'enabled' }, '启用'),
          h('option', { value: 'disabled' }, '禁用'),
        ),
        h('span', { className: 'nv-settings__hint' }, '是否支持深度思考及其强度，取决于所选服务与模型。'),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '思考强度（仅启用深度思考时有效）'),
        h('select', { className: 'nv-field__input', 'data-novel-llm-effort': '', value: draft.reasoningEffort, disabled: draft.thinking === 'disabled', onChange: (event: { target: { value: string } }) => mutate({ reasoningEffort: event.target.value === 'max' ? 'max' : event.target.value === 'low' ? 'low' : 'high' }) },
          h('option', { value: 'low' }, '低（最快）'),
          h('option', { value: 'high' }, '高'),
          h('option', { value: 'max' }, '最高'),
        ),
      ),
      ),
    ),
    h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-llm-save': '', disabled: namespace === undefined || draft.saving, onClick: () => save() }, saveButtonLabel(draft.saving, '保存设置')),
    // I59 保存状态（R12-6）：保存中/已保存/失败三态可播报；saved/failed 行保留既有
    // data-novel-llm-message / data-novel-llm-error 锚点，新增 data-novel-save-state。
    draft.saving ? h('p', { className: 'nv-save-status nv-save-status--saving', 'data-novel-save-status': 'llm', 'data-novel-save-state': 'saving', role: 'status', 'aria-live': 'polite' }, '正在保存…') : null,
    draft.message ? h('p', { className: 'nv-settings__ok', 'data-novel-llm-message': '', 'data-novel-save-status': 'llm', 'data-novel-save-state': 'saved', role: 'status', 'aria-live': 'polite' }, draft.message) : null,
    draft.error ? h('p', { className: 'nv-settings__error', 'data-novel-llm-error': '', 'data-novel-save-status': 'llm', 'data-novel-save-state': 'failed', role: 'alert', 'aria-live': 'assertive' }, draft.error) : null,
  );
}
