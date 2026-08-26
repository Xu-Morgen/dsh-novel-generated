import type { El } from './shared.js';

/**
 * 创作台通用设置页（额外页面）：每次续写的目标字数，以及当用户提供的内容不足以
 * 支撑目标字数时是否先询问用户补充。Host 侧持久化（workbench-settings.yaml）。
 */
export { workbenchSettingsRemoteContribution } from '../remote.js';

export interface WorkbenchSettingsViewShape {
  readonly wordTarget: number;
  readonly askWhenThin: boolean;
}

export interface WorkbenchSettingsDraftShape {
  wordTarget: number;
  askWhenThin: boolean;
  saving: boolean;
  message: string;
  error: string;
}

/** Mounted `remote.novelWorkbenchSettings` namespace surface. */
export interface WorkbenchSettingsNamespace {
  load(): Promise<unknown>;
  save(input: { wordTarget: number; askWhenThin: boolean }): Promise<unknown>;
  openProjectFolder(projectId: string): Promise<unknown>;
}

export const WORKBENCH_WORD_TARGET_MIN = 100;
export const WORKBENCH_WORD_TARGET_MAX = 100_000;

export function freshWorkbenchSettingsDraft(): WorkbenchSettingsDraftShape {
  return { wordTarget: 500, askWhenThin: true, saving: false, message: '', error: '' };
}

/** 渲染创作设置表单：目标字数 + 内容不足时询问开关 + 打开落地文件夹 + 保存 + 状态行。 */
export function workbenchSettingsPanel(
  h: El,
  namespace: WorkbenchSettingsNamespace | undefined,
  draft: WorkbenchSettingsDraftShape,
  mutate: (patch: Partial<WorkbenchSettingsDraftShape>) => void,
  save: () => void,
  projectId?: string,
  openFolder?: () => void,
): unknown {
  return h('section', { className: 'nv-panel nv-settings', 'data-novel-workbench-settings': '', 'data-novel-layer-state': 'ready' },
    h('h3', { className: 'nv-editor__title' }, '创作设置'),
    h('p', { className: 'nv-settings__hint' },
      '通用创作参数，保存在本地 DSH（~/.dsh/novel-settings/workbench-settings.yaml），跨会话生效；' +
      '对话续写（novel_continue）与后续生成入口共用。'),
    h('div', { className: 'nv-form' },
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '每次输出目标字数（wordTarget）'),
        h('input', { type: 'number', className: 'nv-field__input', 'data-novel-workbench-word-target': '', min: WORKBENCH_WORD_TARGET_MIN, max: WORKBENCH_WORD_TARGET_MAX, step: 100, value: draft.wordTarget, onChange: (event: { target: { value: string } }) => mutate({ wordTarget: Number(event.target.value) }) }),
        h('span', { className: 'nv-settings__hint' }, '续写时以此为目标字数；单次建议 500–2000，长章节可上调。'),
      ),
      h('label', { className: 'nv-field' },
        h('span', { className: 'nv-field__label' }, '内容不足时先询问是否补充'),
        h('input', { type: 'checkbox', className: 'nv-field__check', 'data-novel-workbench-ask-thin': '', checked: draft.askWhenThin, onChange: (event: { target: { checked: boolean } }) => mutate({ askWhenThin: event.target.checked }) }),
        h('span', { className: 'nv-settings__hint' }, '开启时：用户提供的素材不足以达到目标字数，创作助手先询问是否补充情节/细节，避免直接注水。'),
      ),
    ),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-open-project-folder': '', disabled: namespace === undefined || projectId === undefined, onClick: () => openFolder?.() },
        projectId === undefined ? '打开落地文件夹（请先选择作品）' : `打开落地文件夹（${projectId}）`),
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-workbench-save': '', disabled: namespace === undefined || draft.saving, onClick: () => save() }, draft.saving ? '保存中…' : '保存设置'),
    ),
    draft.message ? h('p', { className: 'nv-settings__ok', 'data-novel-workbench-message': '' }, draft.message) : null,
    draft.error ? h('p', { className: 'nv-settings__error', 'data-novel-workbench-error': '', role: 'alert' }, draft.error) : null,
  );
}
