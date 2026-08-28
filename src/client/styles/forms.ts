/**
 * I83 styles 分区 · forms：六层真表单 B3/B2（列表 + 详情双栏、字段、字段集）。
 * I83 由 scripts/.split-styles.mjs 从单一 WORKBENCH_STYLES 模板字符串按键切出；
 * 内容与 I46 起各迭代的样式语义逐字一致（重构纪律 §16-2 行为等价），
 * 由 styles.ts 组合器按原顺序拼接。
 */
export const FORMS_STYLES = `
/* I47 B3/B2 真表单：列表 + 详情双栏。 */
.nv-editor {
  display: flex;
  flex-direction: column;
  gap: var(--nv-grid);
}

.nv-editor__columns {
  display: flex;
  gap: calc(var(--nv-grid) * 2);
  align-items: flex-start;
}

.nv-editor__list {
  flex: 0 0 220px;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-editor__toolbar {
  display: flex;
}

.nv-editor__item {
  display: block;
  width: 100%;
  text-align: left;
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  background: var(--nv-paper-raised);
  color: var(--nv-ink-dim);
  font-family: var(--nv-sans);
  font-size: 13px;
  cursor: pointer;
}

.nv-editor__item:hover {
  background: var(--nv-hover);
  color: var(--nv-ink);
}

.nv-editor__item.is-active {
  border-color: var(--nv-line-strong);
  color: var(--nv-cinnabar);
  background: var(--nv-hover);
}

.nv-editor__detail {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--nv-grid);
}

.nv-editor__title {
  margin: 0;
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 16px;
  letter-spacing: 0.02em;
  color: var(--nv-ink);
}

.nv-form {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 1.25);
}

.nv-field {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.4);
}

.nv-field__label {
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-field__input {
  width: 100%;
  box-sizing: border-box;
  padding: calc(var(--nv-grid) * 0.6) var(--nv-grid);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.6);
  background: var(--nv-paper);
  color: var(--nv-ink);
  font-family: var(--nv-sans);
  font-size: 13px;
  resize: vertical;
}

.nv-field__input:focus {
  border-color: var(--nv-cinnabar);
}

.nv-field__check {
  width: 16px;
  height: 16px;
  accent-color: var(--nv-cinnabar);
}

.nv-fieldset {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
  border: 1px solid var(--nv-line);
  border-radius: var(--nv-grid);
  padding: var(--nv-grid);
}

.nv-fieldset__legend {
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
  padding: 0 var(--nv-grid);
}
`;
