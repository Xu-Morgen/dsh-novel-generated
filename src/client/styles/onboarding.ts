/**
 * I83 styles 分区 · onboarding：六层初始化审阅与分析生命周期（I52/I53/I56/I57）。
 * I83 由 scripts/.split-styles.mjs 从单一 WORKBENCH_STYLES 模板字符串按键切出；
 * 内容与 I46 起各迭代的样式语义逐字一致（重构纪律 §16-2 行为等价），
 * 由 styles.ts 组合器按原顺序拼接。
 */
export const ONBOARDING_STYLES = `
/* I52/I53 六层初始化审阅：逐层卡片展示候选内容 + 裁决按钮（设计 §14.7.4）。 */
.nv-onboarding__title {
  margin: 0;
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 16px;
  letter-spacing: 0.02em;
  color: var(--nv-ink);
}

.nv-onboarding__hint {
  margin: 0 0 var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 12px;
  line-height: 1.5;
  color: var(--nv-ink-faint);
}

.nv-onboarding__layers {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--nv-grid);
}

.nv-onboarding__layer {
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
  background: var(--nv-paper);
}

.nv-onboarding__layer-label {
  display: block;
  margin-bottom: calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 14px;
  color: var(--nv-ink);
}

.nv-onboarding__verdicts {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-onboarding__verdict {
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.6);
  background: var(--nv-paper-raised);
  color: var(--nv-ink-dim);
  padding: calc(var(--nv-grid) * 0.375) calc(var(--nv-grid) * 0.75);
  font-family: var(--nv-sans);
  font-size: 12px;
  cursor: pointer;
}

.nv-onboarding__verdict:hover:not(:disabled) {
  background: var(--nv-hover);
  color: var(--nv-ink);
}

.nv-onboarding__verdict.is-active {
  color: var(--nv-cinnabar);
  border-color: var(--nv-cinnabar);
}

.nv-onboarding__verdict:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* I56 逐层终态状态徽标（空候选 / 待裁决 / 已接受 / 已修改并接受 / 已跳过 / 已重生成）。 */
.nv-onboarding__status {
  display: inline-block;
  margin-left: calc(var(--nv-grid) * 0.5);
  padding: 0 calc(var(--nv-grid) * 0.375);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.375);
  font-family: var(--nv-sans);
  font-size: 11px;
  color: var(--nv-ink-faint);
}

/* I56 逐层裁决面板：编辑候选 JSON / 重生成反馈。 */
.nv-onboarding__panel {
  margin-top: calc(var(--nv-grid) * 0.75);
  padding: calc(var(--nv-grid) * 0.6) calc(var(--nv-grid) * 0.75);
  border: 1px dashed var(--nv-cinnabar);
  border-radius: calc(var(--nv-grid) * 0.6);
  background: var(--nv-paper-raised);
}

.nv-onboarding__panel .nv-field__input {
  font-family: ui-monospace, 'Cascadia Code', Consolas, 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--nv-ink);
  resize: vertical;
}

.nv-onboarding__panel-actions {
  display: flex;
  gap: calc(var(--nv-grid) * 0.5);
  margin-top: calc(var(--nv-grid) * 0.5);
}

.nv-onboarding__panel-confirm,
.nv-onboarding__panel-cancel {
  border-radius: calc(var(--nv-grid) * 0.6);
  padding: calc(var(--nv-grid) * 0.375) calc(var(--nv-grid) * 0.75);
  font-family: var(--nv-sans);
  font-size: 12px;
  cursor: pointer;
}

.nv-onboarding__panel-confirm {
  border: 1px solid var(--nv-cinnabar);
  background: var(--nv-cinnabar);
  color: #fff;
}

.nv-onboarding__panel-cancel {
  border: 1px solid var(--nv-line);
  background: var(--nv-paper);
  color: var(--nv-ink-dim);
}

/* I56 六层终态门：apply 前置资格说明。 */
.nv-onboarding__eligibility {
  margin: var(--nv-grid) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-onboarding__candidates {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.6);
  margin-top: calc(var(--nv-grid) * 0.75);
}

.nv-onboarding__candidate {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.375);
  padding: calc(var(--nv-grid) * 0.6) calc(var(--nv-grid) * 0.75);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.6);
  background: var(--nv-paper-raised);
}

.nv-onboarding__candidate-field {
  display: flex;
  gap: var(--nv-grid);
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.nv-onboarding__candidate-key {
  flex: none;
  min-width: 4.5em;
  color: var(--nv-ink-faint);
}

.nv-onboarding__candidate-value {
  color: var(--nv-ink);
}

.nv-onboarding__no-candidates {
  margin: calc(var(--nv-grid) * 0.75) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
}

/* 独立「六层初始化审阅」页签：原文入口 + 审阅面板纵向堆叠。 */
.nv-onboarding-stack {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 2);
  min-width: 0;
}

.nv-onboarding__apply {
  margin-top: var(--nv-grid);
  border: 1px solid var(--nv-cinnabar);
  border-radius: calc(var(--nv-grid) * 0.75);
  background: var(--nv-cinnabar);
  color: #fff;
  padding: calc(var(--nv-grid) * 0.625) var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 13px;
  cursor: pointer;
}

.nv-onboarding__apply:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nv-onboarding__error {
  margin: var(--nv-grid) 0 0;
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
  border: 1px solid var(--nv-danger);
  border-radius: calc(var(--nv-grid) * 0.6);
  color: var(--nv-danger);
  background: var(--nv-paper-raised);
  font-family: var(--nv-sans);
  font-size: 12px;
}

.nv-onboarding__result {
  margin: var(--nv-grid) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

/* I57 分析生命周期面板：busy/progress 行 + 取消/重试（R12-4）。 */
.nv-analysis {
  margin: var(--nv-grid) 0 0;
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
  border: 1px solid var(--nv-border);
  border-radius: calc(var(--nv-grid) * 0.6);
  background: var(--nv-paper-raised);
  display: flex;
  align-items: center;
  gap: var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-analysis__status {
  margin: 0;
  flex: 1;
}

.nv-analysis__cancel,
.nv-analysis__retry {
  border: 1px solid var(--nv-cinnabar);
  border-radius: calc(var(--nv-grid) * 0.6);
  background: transparent;
  color: var(--nv-cinnabar);
  padding: calc(var(--nv-grid) * 0.375) var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 12px;
  cursor: pointer;
}

.nv-analysis__retry {
  border-color: var(--nv-cinnabar);
  background: var(--nv-cinnabar);
  color: #fff;
}

.nv-analysis--terminal .nv-analysis__error {
  margin: 0;
  flex: 1;
  border: none;
  background: none;
  padding: 0;
}

.nv-onboarding__apply-retry {
  margin-top: var(--nv-grid);
  border: 1px solid var(--nv-cinnabar);
  border-radius: calc(var(--nv-grid) * 0.75);
  background: var(--nv-cinnabar);
  color: #fff;
  padding: calc(var(--nv-grid) * 0.625) var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 13px;
  cursor: pointer;
}

.nv-onboarding__apply-retry:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`;
