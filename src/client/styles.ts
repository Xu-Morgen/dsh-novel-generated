/**
 * I46 创作台视觉体系（编辑台/书斋，design §14.6 / D11–D14 / R10-2）。
 *
 * 契约与不变式：
 * - 中性色/边框/hover/状态色只消费宿主 `--dsw-alias-*` token，明暗经
 *   `body[data-ds-dark-theme]` 由宿主主题自动切换；novel 不建立自有主题引擎
 *   （A-7 保持后置，见设计 §14.6「视觉体系」与 N-6）。
 * - 品牌三色为包内常量：纸（暖白底，消费宿主 bg token 以随明暗）、墨（近黑暖灰
 *   字，消费宿主 label token）、朱砂（印泥红强调，包内固定 + 暗色下提亮）。
 * - 标题/品牌用系统衬线栈（零外部字体），正文用系统无衬线 UI 栈。
 * - 8px 网格 + 宽松留白 + 1px 细边 + 分层卡片 + 软阴影。
 * - 零外部字体/网络资产：本常量不得出现 `@import`、`@font-face`、`url(http...)`
 *   或任何网络字体域名。
 * - 本文件只导出样式常量与品牌 token，不操作 DOM；`<style>` 注入与 Fiber 回收
 *   由 `client.ts` 经 `ctx.effect` 完成（R10-3）。
 */

/** 朱砂（印泥红）品牌强调色：亮色主题下的固定值。 */
export const CINNABAR = '#b0342a';

/** 暗色主题下提亮的朱砂，保持与暗底的对比（D12）。 */
export const CINNABAR_DARK = '#d95c47';

/** 标题/品牌系统衬线栈（零外部字体）。 */
export const SERIF_STACK = "Georgia, 'Songti SC', 'SimSun', serif";

/** 表单/正文系统无衬线 UI 栈。 */
export const SANS_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif";

/** 8px 基础网格。 */
export const GRID = '8px';

/**
 * 创作台包内样式。命名空间前缀 `.nv-`（novel）避免与宿主样式冲突；包内品牌层
 * 通过 CSS 自定义属性 `--nv-*` 挂在 `.nv-workbench` 作用域内，只影响本面板。
 */
export const WORKBENCH_STYLES = `
.nv-workbench {
  /* 包内品牌层：纸/墨/朱砂（D12）；中性色一律转发宿主 --dsw-alias-* token */
  --nv-paper: var(--dsw-alias-bg-base);
  --nv-paper-raised: var(--dsw-alias-bg-layer-1);
  --nv-ink: var(--dsw-alias-label-primary);
  --nv-ink-dim: var(--dsw-alias-label-secondary);
  --nv-ink-faint: var(--dsw-alias-label-tertiary);
  --nv-line: var(--dsw-alias-border-l1);
  --nv-line-strong: var(--dsw-alias-border-l2);
  --nv-hover: var(--dsw-alias-interactive-bg-hover);
  --nv-danger: var(--dsw-alias-state-error-primary);
  --nv-warn: var(--dsw-alias-state-warn-primary);
  --nv-ok: var(--dsw-alias-state-success-primary);
  --nv-cinnabar: ${CINNABAR};
  --nv-serif: ${SERIF_STACK};
  --nv-sans: ${SANS_STACK};
  --nv-grid: ${GRID};

  display: flex;
  flex-direction: column;
  min-width: 520px;
  max-width: 860px;
  min-height: 360px;
  max-height: 80vh;
  overflow: hidden;
  color: var(--nv-ink);
  background: var(--nv-paper);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 1.5);
  font-family: var(--nv-sans);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.22);
  pointer-events: auto;
}

.nv-workbench__brand {
  display: flex;
  align-items: center;
  gap: var(--nv-grid);
  padding: calc(var(--nv-grid) * 1.5) calc(var(--nv-grid) * 2);
  border-bottom: 1px solid var(--nv-line);
  background: var(--nv-paper-raised);
}

.nv-workbench__mark {
  font-family: var(--nv-serif);
  font-weight: 700;
  font-size: 20px;
  line-height: 1;
  color: var(--nv-cinnabar);
}

.nv-workbench__title {
  flex: 1;
  margin: 0;
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 17px;
  letter-spacing: 0.02em;
  color: var(--nv-ink);
}

.nv-workbench__subtitle {
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-workbench__toggle,
.nv-workbench__close {
  border: 1px solid var(--nv-line);
  background: transparent;
  color: var(--nv-ink-dim);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: calc(var(--nv-grid) * 0.5) var(--nv-grid);
  font-size: 12px;
  cursor: pointer;
}

.nv-workbench__toggle:hover,
.nv-workbench__close:hover {
  background: var(--nv-hover);
  color: var(--nv-ink);
}

.nv-workbench__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 唯一纵向滚动区：根节点 overflow:hidden + 80vh 上限，导航固定，主列内部滚动
   （此前 main 无滚动规则，审阅面板超高即被裁剪且无滚动条）。 */
.nv-workbench__main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 2);
  overflow-y: auto;
  padding: calc(var(--nv-grid) * 2);
}

.nv-workbench__nav {
  width: 160px;
  flex: none;
  padding: var(--nv-grid);
  border-right: 1px solid var(--nv-line);
  background: var(--nv-paper-raised);
  overflow-y: auto;
}

.nv-workbench__nav-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: calc(var(--nv-grid) * 0.875) var(--nv-grid);
  margin-bottom: calc(var(--nv-grid) * 0.25);
  border: 1px solid transparent;
  border-radius: calc(var(--nv-grid) * 0.75);
  background: transparent;
  color: var(--nv-ink-dim);
  font-family: var(--nv-sans);
  font-size: 13px;
  cursor: pointer;
}

.nv-workbench__nav-item:hover {
  background: var(--nv-hover);
  color: var(--nv-ink);
}

.nv-workbench__nav-item.is-active {
  color: var(--nv-cinnabar);
  border-color: var(--nv-line-strong);
  background: var(--nv-hover);
}

.nv-workbench__content {
  flex: none;
  min-width: 0;
}

.nv-workbench__empty {
  display: flex;
  flex-direction: column;
  gap: var(--nv-grid);
  min-height: 240px;
  padding: calc(var(--nv-grid) * 3);
  border: 1px dashed var(--nv-line-strong);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-workbench__empty-title {
  margin: 0;
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 18px;
  letter-spacing: 0.02em;
  color: var(--nv-ink);
}

.nv-workbench__empty-hint {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  line-height: 1.6;
  color: var(--nv-ink-dim);
}

.nv-workbench__state {
  padding: calc(var(--nv-grid) * 3);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-dim);
}

.nv-workbench__state--error {
  color: var(--nv-danger);
}

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
  outline: none;
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

.nv-editor__actions {
  display: flex;
  gap: var(--nv-grid);
}

.nv-btn {
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  background: var(--nv-paper-raised);
  color: var(--nv-ink-dim);
  padding: calc(var(--nv-grid) * 0.5) var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 13px;
  cursor: pointer;
}

.nv-btn:hover:not(:disabled) {
  background: var(--nv-hover);
  color: var(--nv-ink);
}

.nv-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nv-btn--primary {
  background: var(--nv-cinnabar);
  border-color: var(--nv-cinnabar);
  color: #fff;
}

.nv-btn--primary:hover:not(:disabled) {
  color: #fff;
  background: var(--nv-cinnabar);
  filter: brightness(1.05);
}

.nv-editor__error {
  margin: 0;
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
  border: 1px solid var(--nv-danger);
  border-radius: calc(var(--nv-grid) * 0.6);
  color: var(--nv-danger);
  background: var(--nv-paper-raised);
  font-family: var(--nv-sans);
  font-size: 12px;
}

.nv-editor__badge {
  margin: 0;
  padding: calc(var(--nv-grid) * 0.5) var(--nv-grid);
  border: 1px solid var(--nv-warn);
  border-radius: calc(var(--nv-grid) * 0.6);
  color: var(--nv-warn);
  font-family: var(--nv-sans);
  font-size: 12px;
}

.nv-panel {
  padding: calc(var(--nv-grid) * 2);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-dim);
}

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

/* 明暗适配：暗色下朱砂提亮（D12）；中性色已由宿主 --dsw-alias-* 在
   body[data-ds-dark-theme] 下自动切换，无需 novel 自有主题引擎。 */
body[data-ds-dark-theme] .nv-workbench {
  --nv-cinnabar: ${CINNABAR_DARK};
}
`;
