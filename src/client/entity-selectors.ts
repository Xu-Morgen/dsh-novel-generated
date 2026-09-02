import type { El } from './shared.js';

/**
 * Client 侧实体选择器的最小显示投影。
 *
 * 领域文档仍只保存稳定 canonical id；label 仅用于人类操作。当前值若已
 * 不在最新列表中，会被保留为显式「未知/已删除」选项，避免渲染期静默
 * 丢弃持久化引用（design §14.14.2）。
 */
export interface EntityOption {
  readonly id: string;
  readonly label: string;
}

function disambiguate(options: readonly EntityOption[]): EntityOption[] {
  const totals = new Map<string, number>();
  options.forEach((option) => totals.set(option.label, (totals.get(option.label) ?? 0) + 1));
  const seen = new Map<string, number>();
  return options.map((option) => {
    if ((totals.get(option.label) ?? 0) < 2) return option;
    const position = (seen.get(option.label) ?? 0) + 1;
    seen.set(option.label, position);
    return { ...option, label: `${option.label}（同名第 ${position} 项）` };
  });
}

function withMissing(options: readonly EntityOption[], values: readonly string[]): EntityOption[] {
  const known = new Set(options.map((option) => option.id));
  const missing = values
    .filter((id, index, list) => id.length > 0 && list.indexOf(id) === index && !known.has(id))
    .map((id) => ({ id, label: '引用已缺失（保留原值）' }));
  return disambiguate([...options, ...missing]);
}

/** Render a single canonical-id selector with a safe unknown/deleted option. */
export function entitySelect(
  h: El,
  label: string,
  value: string,
  options: readonly EntityOption[],
  onChange: (value: string) => void,
  anchor: string,
): unknown {
  const rendered = withMissing(options, [value]);
  return h('label', { className: 'nv-field', 'data-novel-entity-selector': anchor },
    h('span', { className: 'nv-field__label' }, label),
    h('select', {
      className: 'nv-field__input',
      value,
      'aria-label': label,
      'data-novel-entity-select': anchor,
      onChange: (event: { target: { value: string } }) => onChange(event.target.value),
    },
      h('option', { value: '', 'data-novel-entity-option-id': '' }, '请选择'),
      rendered.map((option) => h('option', {
        key: option.id,
        value: option.id,
        'data-novel-entity-option-id': option.id,
        'data-novel-entity-unknown': option.label.startsWith('引用已缺失') ? '' : undefined,
      }, option.label)),
    ),
  );
}

/** Render a named multi-value selector without reintroducing a free-text ID path. */
export function entityMultiSelect(
  h: El,
  label: string,
  values: readonly string[],
  options: readonly EntityOption[],
  onChange: (values: string[]) => void,
  anchor: string,
): unknown {
  const rendered = withMissing(options, values);
  const selected = new Set(values);
  const toggle = (id: string, checked: boolean): void => {
    const next = checked ? [...values.filter((value) => value !== id), id] : values.filter((value) => value !== id);
    onChange(next);
  };
  return h('fieldset', {
    className: 'nv-field nv-entity-multi-select',
    'data-novel-entity-selector': anchor,
    'data-novel-entity-multiselect': anchor,
    role: 'group',
    'aria-label': label,
  },
    h('legend', { className: 'nv-field__label' }, label),
    rendered.length === 0
      ? h('span', { className: 'nv-field__hint' }, '暂无可选实体')
      : rendered.map((option) => h('label', {
        key: option.id,
        className: 'nv-entity-option',
        'data-novel-entity-option': option.id,
        'data-novel-entity-unknown': option.label.startsWith('引用已缺失') ? '' : undefined,
      },
        h('input', {
          type: 'checkbox',
          checked: selected.has(option.id),
          'aria-label': option.label,
          'data-novel-entity-option-id': option.id,
          onChange: (event: { target: { checked: boolean } }) => toggle(option.id, event.target.checked),
        }),
        h('span', null, option.label),
      )),
  );
}
