/**
 * I83 styles 分区 · navigation：导航与项目目录层（项目上下文栏 / 脏表单
离开裁决 / 分组导航 / 悬浮入口 / 项目选择器）。
 * I83 由 scripts/.split-styles.mjs 从单一 WORKBENCH_STYLES 模板字符串按键切出；
 * 内容与 I46 起各迭代的样式语义逐字一致（重构纪律 §16-2 行为等价），
 * 由 styles.ts 组合器按原顺序拼接。
 */
import { CINNABAR, GRID, SERIF_STACK } from './tokens.js';
export const NAVIGATION_STYLES = `
/* 作品上下文栏之上的导航/主列横向布局（I55：上下文栏占满整行，其下再左右分栏）。 */
.nv-workbench__body-row {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* I55 作品上下文栏（§14.8 / R12-2）：当前作品持续可见 + 返回/切换入口。 */
.nv-workbench__project-context {
  display: flex;
  align-items: center;
  gap: var(--nv-grid);
  padding: calc(var(--nv-grid) * 0.75) calc(var(--nv-grid) * 2);
  border-bottom: 1px solid var(--nv-line);
  background: var(--nv-paper);
}

.nv-workbench__project-context-name {
  flex: 1;
  min-width: 0;
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.02em;
  color: var(--nv-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nv-workbench__project-context-back {
  flex: none;
  border: 1px solid var(--nv-line);
  background: transparent;
  color: var(--nv-ink-dim);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: calc(var(--nv-grid) * 0.4) var(--nv-grid);
  font-size: 12px;
  cursor: pointer;
}

.nv-workbench__project-context-back:hover {
  background: var(--nv-hover);
  color: var(--nv-ink);
}

/* I55 脏表单离开裁决（§14.8 / R12-2）：非模态确认条，离开将丢弃未保存 Client draft。 */
.nv-workbench__leave-confirm {
  display: flex;
  align-items: center;
  gap: var(--nv-grid);
  padding: var(--nv-grid) calc(var(--nv-grid) * 2);
  border-bottom: 1px solid var(--nv-warn);
  background: var(--nv-paper-raised);
}

.nv-workbench__leave-confirm-hint {
  flex: 1;
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-warn);
}

.nv-workbench__leave-confirm-btn {
  border: 1px solid var(--nv-line);
  background: transparent;
  color: var(--nv-ink-dim);
  border-radius: calc(var(--nv-grid) * 0.6);
  padding: calc(var(--nv-grid) * 0.35) var(--nv-grid);
  font-size: 12px;
  cursor: pointer;
}

.nv-workbench__leave-confirm-btn:hover {
  background: var(--nv-hover);
  color: var(--nv-ink);
}

.nv-workbench__leave-confirm-btn--discard {
  border-color: var(--nv-danger);
  color: var(--nv-danger);
}

/* I55 可恢复的 open/切换失败错误（保持当前视图，不 brick 成整屏错误）。 */
.nv-workbench__project-error {
  margin: var(--nv-grid) 0 0;
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
  border: 1px solid var(--nv-danger);
  border-radius: calc(var(--nv-grid) * 0.6);
  color: var(--nv-danger);
  background: var(--nv-paper-raised);
  font-family: var(--nv-sans);
  font-size: 12px;
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
  width: var(--nv-nav-width, 160px);
  flex: none;
  padding: var(--nv-grid);
  border-right: 1px solid var(--nv-line);
  background: var(--nv-paper-raised);
  overflow-y: auto;
}

/* UI 打磨：导航与主列之间的竖向拖柄（pointer 拖动改 --nv-nav-width，见 client.ts resizer）。 */
.nv-workbench__nav-resizer {
  flex: none;
  width: calc(var(--nv-grid) * 0.75);
  cursor: col-resize;
  touch-action: none;
  background: transparent;
  border-right: 1px solid transparent;
}

.nv-workbench__nav-resizer:hover,
.nv-workbench__nav-resizer.is-active {
  background: var(--nv-hover);
  border-right-color: var(--nv-line-strong);
}

/* UI 打磨：面板过窄（--nv-panel-width < PANEL_NAV_AUTO_COLLAPSE，见 client.ts
   data-novel-nav-collapsed）时侧边路由栏自动折叠：左右分栏退化为纵向堆叠，导航变为
   可横向滚动的横条（与窄屏响应式同形态，避免内容被挤压出界）。 */
.nv-workbench[data-novel-nav-collapsed] .nv-workbench__body-row {
  flex-direction: column;
}

.nv-workbench[data-novel-nav-collapsed] .nv-workbench__nav-resizer {
  display: none;
}

.nv-workbench[data-novel-nav-collapsed] .nv-workbench__nav {
  width: auto;
  max-width: 100%;
  max-height: 40%;
  flex: none;
  border-right: none;
  border-bottom: 1px solid var(--nv-line);
  overflow-x: auto;
  overflow-y: auto;
  white-space: nowrap;
  padding: var(--nv-grid);
}

.nv-workbench[data-novel-nav-collapsed] .nv-workbench__nav-group {
  display: inline-block;
  vertical-align: top;
  min-width: max-content;
  margin: 0 calc(var(--nv-grid) * 2) 0 0;
}

.nv-workbench[data-novel-nav-collapsed] .nv-workbench__nav-item {
  display: inline-block;
  width: auto;
  white-space: nowrap;
}

/* UI 打磨：主页面右上角悬浮圆形入口。面板关闭时由 shell.overlay 渲染；点击打开
   创作台并隐藏自己。品牌色为包内常量（暗色随 body[data-ds-dark-theme] 提亮），
   中性色/边框消费宿主 --dsw-alias-* token（D12 契约）。 */
.nv-launch {
  --nv-cinnabar: ${CINNABAR};
  --nv-serif: ${SERIF_STACK};
  --nv-grid: ${GRID};
  --nv-paper-raised: var(--dsw-alias-bg-layer-1);
  --nv-line-strong: var(--dsw-alias-border-l2);
  --nv-hover: var(--dsw-alias-interactive-bg-hover);
  position: fixed;
  top: calc(var(--nv-grid) * 2);
  right: calc(var(--nv-grid) * 2);
  z-index: 30;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--nv-line-strong);
  background: var(--nv-paper-raised);
  color: var(--nv-cinnabar);
  font-family: var(--nv-serif);
  font-weight: 700;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
}

.nv-launch:hover {
  background: var(--nv-hover);
}

.nv-workbench__nav-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: calc(var(--nv-grid) * 1) calc(var(--nv-grid) * 1.25);
  margin-bottom: calc(var(--nv-grid) * 0.375);
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

/* I58 任务分组导航（design §14.8 / R12-5）：组标签 + 技术层辅助徽标。 */
.nv-workbench__nav-group {
  margin-bottom: calc(var(--nv-grid) * 0.5);
}

.nv-workbench__nav-group-label {
  margin: calc(var(--nv-grid) * 0.75) 0 calc(var(--nv-grid) * 0.375);
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--nv-ink-faint);
}

.nv-workbench__nav-item-label {
  display: inline-block;
}

/* 技术层编号只作辅助徽标（I58）：小号弱对比，不作为首要导航语言。 */
.nv-workbench__nav-item-badge {
  display: inline-block;
  margin-left: calc(var(--nv-grid) * 0.75);
  padding: 0 calc(var(--nv-grid) * 0.375);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.375);
  font-family: var(--nv-sans);
  font-size: 10px;
  line-height: 1.4;
  color: var(--nv-ink-faint);
}

.nv-workbench__nav-item.is-active .nv-workbench__nav-item-badge {
  color: var(--nv-cinnabar);
  border-color: var(--nv-cinnabar);
}

/* I132：工程层编号只在用户主动展开的高级信息中可见，普通导航保持作者语言。 */
.nv-advanced-only {
  display: none !important;
}

.nv-workbench__advanced,
.nv-advanced-details {
  color: var(--nv-ink-dim);
  font-size: 12px;
}

.nv-workbench__advanced summary,
.nv-advanced-details summary {
  cursor: pointer;
  color: var(--nv-ink-faint);
}

.nv-workbench__advanced ul {
  margin: var(--nv-grid) 0 0;
  padding-left: calc(var(--nv-grid) * 2);
}

.nv-advanced-error {
  display: grid;
  gap: var(--nv-grid);
}

.nv-advanced-error > .nv-editor__error {
  margin: 0;
}

.nv-advanced-details__content {
  max-width: 100%;
  overflow: auto;
  white-space: pre-wrap;
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

/* 项目目录层（作品选择/浏览）：新建小说作品（空白创建 + 文档导入）+ 既有列表
   + 六层初始化审阅（审阅部分提到项目目录）。目录层内容纵向滚动，不挤占侧板高度。 */
.nv-workbench__state--chooser {
  overflow-y: auto;
  min-height: 0;
}

.nv-workbench__chooser {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 2);
  min-width: 0;
}

.nv-workbench__new-project {
  padding: calc(var(--nv-grid) * 1.5);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  background: var(--nv-paper-raised);
  display: flex;
  flex-direction: column;
  gap: var(--nv-grid);
}

.nv-workbench__new-project-title {
  margin: 0;
  font-family: var(--nv-serif);
  font-size: 15px;
  color: var(--nv-ink);
}

.nv-workbench__new-project-hint {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-workbench__new-project-blank {
  display: flex;
  gap: var(--nv-grid);
  align-items: center;
}

.nv-workbench__new-project-blank .nv-field__input {
  flex: 1;
  min-width: 0;
}

.nv-workbench__new-project-create {
  flex: none;
  border: 1px solid var(--nv-cinnabar);
  border-radius: calc(var(--nv-grid) * 0.75);
  background: var(--nv-cinnabar);
  color: #fff;
  padding: calc(var(--nv-grid) * 0.625) var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 13px;
  cursor: pointer;
}

.nv-workbench__new-project-create:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nv-workbench__project-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-workbench__project-row,
.nv-workbench__archive-row {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-workbench__project-open {
  display: block;
  flex: 1;
  min-width: 0;
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

.nv-workbench__project-open:hover {
  background: var(--nv-hover);
  color: var(--nv-ink);
}

.nv-workbench__project-archive,
.nv-workbench__project-restore {
  flex: none;
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  background: transparent;
  color: var(--nv-ink-dim);
  padding: calc(var(--nv-grid) * 0.625) var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 12px;
  cursor: pointer;
}

.nv-workbench__project-archive:hover,
.nv-workbench__project-restore:hover {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-workbench__project-archive:disabled,
.nv-workbench__project-restore:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nv-workbench__archive {
  border-top: 1px solid var(--nv-line);
  padding-top: var(--nv-grid);
}

.nv-workbench__archive-summary {
  color: var(--nv-ink-dim);
  font: 13px var(--nv-sans);
  cursor: pointer;
}

.nv-workbench__archive-hint {
  color: var(--nv-ink-faint);
  font: 12px/1.6 var(--nv-sans);
}

.nv-workbench__archive-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-workbench__archive-row > span {
  flex: 1;
  min-width: 0;
  color: var(--nv-ink-dim);
  font: 13px var(--nv-sans);
}
`;
