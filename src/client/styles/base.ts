/**
 * I83 styles 分区 · base：工作台外壳（根节点品牌层 / I54 停靠侧板 / 焦点环 /
拖柄 / 保存状态 / 品牌头栏）。
 * I83 由 scripts/.split-styles.mjs 从单一 WORKBENCH_STYLES 模板字符串按键切出；
 * 内容与 I46 起各迭代的样式语义逐字一致（重构纪律 §16-2 行为等价），
 * 由 styles.ts 组合器按原顺序拼接。
 */
import { CINNABAR, GRID, SANS_STACK, SERIF_STACK } from './tokens.js';
export const BASE_STYLES = `
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

  /* I54（D20/§14.8）：居中浮窗退役为 shell.overlay 内贴右、全高、非模态停靠侧板。
     position:fixed + top/right/bottom:0 贴右全高；width:min(var(--nv-panel-width,860px),100vw)
     让窄屏占满主视区但仍由同一 Slot/Fiber 管理；无遮罩即非模态；不再有窗口圆角与四向投影。
     UI 打磨：面板整体宽度经 --nv-panel-width 下发（左边缘拖柄调整，见 client.ts panel-resizer）。 */
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(var(--nv-panel-width, 860px), 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--nv-ink);
  background: var(--nv-paper);
  border-left: 1px solid var(--nv-line);
  font-family: var(--nv-sans);
  box-shadow: -12px 0 32px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
}

/* I59 键盘焦点可见性（R12-6）：:focus-visible 提供 2px 朱砂焦点环，环色消费
   --nv-cinnabar（暗色主题随 token 提亮）；纯鼠标聚焦（:focus:not(:focus-visible)）
   才移除 outline，此时输入框以朱砂 border 作替代焦点指示 —— 绝不出现无替代焦点的
   裸 outline 移除规则。 */
.nv-workbench :focus-visible {
  outline: 2px solid var(--nv-cinnabar);
  outline-offset: 2px;
}

/* UI 打磨：面板左边缘拖柄 —— 调整创作台整体宽度（贴右停靠，左边缘即宽度边界）。
   绝对定位于面板左缘、全高；拖拽经 client.ts panel-resizer pointer 会话更新
   --nv-panel-width。 */
.nv-workbench__panel-resizer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: calc(var(--nv-grid) * 0.75);
  cursor: ew-resize;
  touch-action: none;
  z-index: 5;
  background: transparent;
  border-right: 1px solid transparent;
}

.nv-workbench__panel-resizer:hover,
.nv-workbench__panel-resizer.is-active {
  background: var(--nv-hover);
  border-right-color: var(--nv-line-strong);
}

/* UI 打磨：悬浮圆形入口在面板关闭时独立于 .nv-workbench 渲染，需自带焦点环。 */
.nv-launch:focus-visible {
  outline: 2px solid var(--nv-cinnabar);
  outline-offset: 2px;
}

.nv-workbench :focus:not(:focus-visible) {
  outline: none;
}

/* I59 保存状态行（R12-6）：saving/saved 可播报（role=status + aria-live=polite），
   failed 由 role=alert 播报；文案色消费宿主 token（明暗自动适配）。 */
.nv-save-status {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  line-height: 1.5;
}

.nv-save-status--saving {
  color: var(--nv-ink-dim);
}

.nv-save-status--saved {
  color: var(--nv-ok);
}

.nv-save-status--failed {
  color: var(--nv-danger);
}

.nv-workbench__brand {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 1.5);
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
  padding: calc(var(--nv-grid) * 0.625) calc(var(--nv-grid) * 1.25);
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
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
`;
