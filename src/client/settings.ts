import type { El } from './shared.js';

/**
 * LLM 设置页（额外页面）：手动输入 API URL / 模型名称 / API Key 并保存到本地
 * DSH。Client 只提交 Key 一次，load 视图永不包含 Key（design §0.1.2 凭据 seam）。
 */
export { llmConfigRemoteContribution } from '../remote.js';

export interface LlmConfigViewShape { readonly providerId: string; readonly baseUrl: string; readonly model: string; readonly hasKey: boolean; }

export interface LlmConfigDraftShape { baseUrl: string; model: string; apiKey: string; saving: boolean; message: string; error: string; }

/** Mounted `remote.novelLlmConfig` namespace surface. */
export interface LlmConfigNamespace {
  load(): Promise<unknown>;
  save(input: { baseUrl: string; model: string; apiKey: string }): Promise<unknown>;
}

export function freshLlmConfigDraft(): LlmConfigDraftShape {
  return { baseUrl: '', model: '', apiKey: '', saving: false, message: '', error: '' };
}

/** 渲染 LLM 设置表单：URL / 模型 / Key（password）+ 保存 + 状态行。 */
export function llmSettingsPanel(
  h: El,
  namespace: LlmConfigNamespace | undefined,
  view: LlmConfigViewShape | undefined,
  draft: LlmConfigDraftShape,
  mutate: (patch: Partial<LlmConfigDraftShape>) => void,
  save: () => void,
): unknown {
  return h('section', { className: 'nv-panel nv-settings', 'data-novel-llm-settings': '', 'data-novel-layer-state': 'ready' },
    h('h3', { className: 'nv-editor__title' }, 'LLM 设置'),
    h('p', { className: 'nv-settings__hint' },
      '配置自定义 OpenAI 兼容端点。API Key 仅保存在本地 DSH（~/.dsh/.credentials.yaml），不回传浏览器；保存后需重启 DSH 服务使路由生效。'),
    h('div', { className: 'nv-form' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, 'API URL'),
        h('input', { type: 'text', className: 'nv-field__input', 'data-novel-llm-url': '', placeholder: 'https://api.example.com/v1', value: draft.baseUrl, onChange: (event: { target: { value: string } }) => mutate({ baseUrl: event.target.value }) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '模型名称'),
        h('input', { type: 'text', className: 'nv-field__input', 'data-novel-llm-model': '', placeholder: 'gpt-4o', value: draft.model, onChange: (event: { target: { value: string } }) => mutate({ model: event.target.value }) }),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, 'API Key'),
        h('input', { type: 'password', className: 'nv-field__input', 'data-novel-llm-key': '', placeholder: view?.hasKey ? '已保存（留空保持不变）' : '请输入 API Key', value: draft.apiKey, onChange: (event: { target: { value: string } }) => mutate({ apiKey: event.target.value }) }),
      ),
    ),
    h('button', { type: 'button', className: 'nv-btn', 'data-novel-llm-save': '', disabled: namespace === undefined || draft.saving, onClick: () => save() }, draft.saving ? '保存中…' : '保存设置'),
    draft.message ? h('p', { className: 'nv-settings__ok', 'data-novel-llm-message': '' }, draft.message) : null,
    draft.error ? h('p', { className: 'nv-settings__error', 'data-novel-llm-error': '', role: 'alert' }, draft.error) : null,
  );
}
