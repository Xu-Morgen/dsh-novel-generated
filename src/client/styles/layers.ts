/**
 * I83 styles 分区 · layers：B5 大纲 / C1 关系 / C2 状态 / C4 正史（I48/I49）。
 * I83 由 scripts/.split-styles.mjs 从单一 WORKBENCH_STYLES 模板字符串按键切出；
 * 内容与 I46 起各迭代的样式语义逐字一致（重构纪律 §16-2 行为等价），
 * 由 styles.ts 组合器按原顺序拼接。
 */
export const LAYERS_STYLES = `
/* I48 B5 大纲层级编辑器 + C1 关系编辑器（R10-5）。 */
.nv-outline__toolbar {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 1.25);
  padding: var(--nv-grid);
  margin-bottom: var(--nv-grid);
  border: 1px solid var(--nv-line);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-outline__columns {
  display: flex;
  gap: calc(var(--nv-grid) * 2);
  align-items: flex-start;
  min-height: 0;
}

.nv-outline__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--nv-grid);
}

.nv-outline__act {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--nv-grid) * 0.5);
  align-items: center;
}

.nv-outline__beats {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
  padding-left: calc(var(--nv-grid) * 1.5);
  border-left: 2px solid var(--nv-line);
}

.nv-outline__beat {
  font-size: 12px;
}

.nv-outline__detail {
  display: flex;
  flex-direction: column;
  gap: var(--nv-grid);
  min-width: 0;
}

.nv-outline__subtitle {
  margin: 0;
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.02em;
  color: var(--nv-ink);
}

.nv-outline__cards {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-outline__card {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.4);
  text-align: left;
  padding: var(--nv-grid);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  background: var(--nv-paper-raised);
  color: var(--nv-ink);
  font-family: var(--nv-sans);
  font-size: 13px;
  cursor: pointer;
}

.nv-outline__card:hover {
  background: var(--nv-hover);
}

.nv-outline__card.is-active {
  border-color: var(--nv-cinnabar);
}

.nv-outline__card-title {
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 14px;
}

.nv-outline__card-meta {
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-outline__card-summary {
  color: var(--nv-ink-dim);
  line-height: 1.5;
}

.nv-outline__nodetail {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-faint);
}

.nv-form__row {
  display: flex;
  gap: var(--nv-grid);
}

.nv-form__row > .nv-field {
  flex: 1;
  min-width: 0;
}

.nv-btn--ghost {
  border-color: transparent;
  background: transparent;
  color: var(--nv-ink-faint);
  padding: calc(var(--nv-grid) * 0.2) calc(var(--nv-grid) * 0.5);
}

.nv-btn--ghost:hover:not(:disabled) {
  color: var(--nv-danger);
  background: var(--nv-hover);
}

.nv-field__range {
  width: 100%;
  accent-color: var(--nv-cinnabar);
}

/* I49 C2 状态快照时间线/回滚/diff + C4 正史账本（R10-6）。 */
.nv-state__hint {
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-state__diff {
  display: flex;
  flex-direction: column;
  gap: var(--nv-grid);
  padding: var(--nv-grid);
  border: 1px solid var(--nv-line-strong);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-state__diff-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.4);
}

.nv-state__diff-row {
  display: grid;
  grid-template-columns: minmax(120px, 1.2fr) 1fr 16px 1fr;
  gap: calc(var(--nv-grid) * 0.6);
  align-items: baseline;
  font-family: var(--nv-sans);
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.nv-state__diff-path {
  font-family: var(--nv-sans);
  color: var(--nv-ink-faint);
  font-size: 11px;
}

.nv-state__diff-before {
  color: var(--nv-danger);
}

.nv-state__diff-after {
  color: var(--nv-ok);
}

.nv-state__diff-arrow {
  color: var(--nv-ink-faint);
}

.nv-canon__readonly {
  padding: calc(var(--nv-grid) * 0.5) var(--nv-grid);
  border: 1px solid var(--nv-warn);
  border-radius: calc(var(--nv-grid) * 0.6);
  color: var(--nv-warn);
  font-family: var(--nv-sans);
  font-size: 12px;
}

.nv-canon__detail {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  line-height: 1.6;
  color: var(--nv-ink-dim);
}
`;
