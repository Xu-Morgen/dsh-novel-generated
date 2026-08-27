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
 * - 键盘焦点（I59 / R12-6）：`.nv-workbench :focus-visible` 提供 2px 朱砂焦点环
 *   （outline-offset 2px），环色消费 `--nv-cinnabar`，暗色主题下随 token 自动提亮；
 *   唯一允许的 `outline: none` 只出现在 `:focus:not(:focus-visible)`（纯鼠标聚焦，
 *   此时输入框以 border-color 朱砂边作为替代焦点指示），绝不出现裸 `outline: none`。
 * - 响应式（I59 / R12-6）：断点常量 `RESPONSIVE_BREAKPOINT_NAV` / 
 *   `RESPONSIVE_BREAKPOINT_COMPACT` 与 `@media` 查询一一对应；窄屏把左右分栏改为
 *   纵向堆叠、导航退化为横向滚动横条，保证窄屏无不可达内容，且始终由同一
 *   shell.overlay Slot/Fiber 管理（不创建新容器）。
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

/** I59 响应式断点（R12-6）：导航从左右分栏退化为横向滚动横条的宽度上限。 */
export const RESPONSIVE_BREAKPOINT_NAV = 720;

/** I59 紧凑断点（R12-6）：品牌头栏/作品上下文允许换行的宽度上限。 */
export const RESPONSIVE_BREAKPOINT_COMPACT = 440;

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

.nv-workbench__project-open {
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

.nv-workbench__project-open:hover {
  background: var(--nv-hover);
  color: var(--nv-ink);
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

/* I60 C5 章节/场景只读导航（design §5.12 / R13-1）：三栏章节树 → 场景列表 →
   正文。列面板固定宽度、正文弹性；窄屏整体纵向堆叠（见下方断点查询）。 */
.nv-chapters {
  display: grid;
  grid-template-columns: 220px 220px minmax(0, 1fr);
  gap: calc(var(--nv-grid) * 2);
  align-items: start;
  min-height: 0;
}

.nv-chapters__pane {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
  max-height: 62vh;
  overflow-y: auto;
  padding-right: calc(var(--nv-grid) * 0.5);
}

.nv-chapters__pane--body {
  max-height: none;
  overflow-y: visible;
}

.nv-chapters__item-title,
.nv-chapters__item-meta,
.nv-chapters__item-summary {
  display: block;
  overflow-wrap: anywhere;
}

.nv-chapters__item-meta,
.nv-chapters__item-summary {
  font-size: 12px;
  color: var(--nv-ink-faint);
  margin-top: calc(var(--nv-grid) * 0.25);
}

.nv-chapters__empty {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-faint);
  line-height: 1.7;
}

.nv-chapters__prose {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 1.25);
}

.nv-chapters__paragraph {
  margin: 0;
  font-family: var(--nv-serif);
  font-size: 15px;
  line-height: 1.9;
  color: var(--nv-ink);
}

.nv-chapters__state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--nv-grid);
  padding: var(--nv-grid);
  border: 1px solid var(--nv-line);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-chapters__error-text {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-danger);
  line-height: 1.6;
}

/* I61 C5 正文编辑（design §5.12 / §14.9 / R13-2）：编辑模式表单、范围提示、
   保存动作、reparse 提案面板与脏文本离开确认条。 */
.nv-chapters__read,
.nv-chapters__editor {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 1.25);
}

.nv-chapters__editor-input {
  font-family: var(--nv-serif);
  font-size: 15px;
  line-height: 1.9;
  min-height: 240px;
  resize: vertical;
}

.nv-chapters__editor-range {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
  line-height: 1.6;
}

.nv-chapters__reparse {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  line-height: 1.7;
}

.nv-chapters__reparse-status {
  margin: 0 0 calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-dim);
}

.nv-chapters__reparse--proposed,
.nv-chapters__reparse--accepting {
  padding: var(--nv-grid);
  border: 1px solid var(--nv-line);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-chapters__reparse--done,
.nv-chapters__reparse--rejected {
  color: var(--nv-ink-dim);
}

.nv-chapters__reparse--error {
  color: var(--nv-danger);
}

.nv-chapters__reparse-hint {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
  line-height: 1.6;
}

.nv-chapters__leave {
  display: flex;
  flex-direction: column;
  gap: var(--nv-grid);
  padding: var(--nv-grid);
  border: 1px solid var(--nv-cinnabar);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-chapters__leave-hint {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink);
  line-height: 1.6;
}

/* I70 C5 正文版本与分支（design §14.10「正文版本与分支」/ R14-5）：版本列表、
   命名存档、选用与行 diff 视图。Client 只提交受控命令，版本真相始终在 Host。 */
.nv-branch {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
  margin-top: var(--nv-grid);
  padding: var(--nv-grid);
  border: 1px solid var(--nv-line);
  border-radius: var(--nv-grid);
  background: var(--nv-paper-raised);
}

.nv-branch__body {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-branch__hint {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
  line-height: 1.6;
}

.nv-branch__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-branch__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-branch__item {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.25);
  padding: calc(var(--nv-grid) * 0.5);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.5);
}

.nv-branch__item.is-chosen {
  border-color: var(--nv-cinnabar);
}

.nv-branch__item-head {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-branch__label {
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink);
  overflow-wrap: anywhere;
}

.nv-branch__badge {
  font-size: 11px;
  line-height: 1.5;
  color: var(--nv-cinnabar);
  border: 1px solid var(--nv-cinnabar);
  border-radius: 999px;
  padding: 0 calc(var(--nv-grid) * 0.5);
}

.nv-branch__meta {
  font-size: 11px;
  color: var(--nv-ink-faint);
}

.nv-branch__save {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-branch__message {
  color: var(--nv-ok);
}

.nv-branch__diff {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
  padding: calc(var(--nv-grid) * 0.5);
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.5);
  max-height: 40vh;
  overflow-y: auto;
}

.nv-branch__diff-title {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-branch__diff-lines {
  display: flex;
  flex-direction: column;
}

.nv-branch__line {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.nv-branch__line--same {
  color: var(--nv-ink-faint);
}

.nv-branch__line--del {
  color: var(--nv-danger);
}

.nv-branch__line--add {
  color: var(--nv-ok);
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

/* I65 生成队列（design §14.9 / R13-6）：范围勾选 + 配置 + 控制 + 任务列表。 */
.nv-queue__cards {
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
  margin: 0 0 var(--nv-grid);
}

.nv-queue__card {
  display: flex;
  align-items: baseline;
  gap: calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink);
}

.nv-queue__card-title {
  font-weight: 600;
}

.nv-queue__card-meta {
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-queue__options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nv-grid);
  align-items: flex-end;
}

.nv-queue__option {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink);
  padding-bottom: calc(var(--nv-grid) * 0.75);
}

.nv-queue__summary {
  margin: 0 0 var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--nv-ink-dim);
}

.nv-queue__tasks {
  list-style: none;
  margin: var(--nv-grid) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-queue__task {
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
  background: var(--nv-paper);
}

.nv-queue__task--failed {
  border-color: var(--nv-cinnabar);
}

.nv-queue__task--candidate-ready {
  border-color: var(--nv-cinnabar);
}

.nv-queue__task-main {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-queue__task-title {
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 14px;
  color: var(--nv-ink);
}

.nv-queue__badge {
  border-radius: calc(var(--nv-grid) * 0.5);
  padding: 0 calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-sans);
  font-size: 11px;
  line-height: 1.6;
  border: 1px solid var(--nv-line);
  color: var(--nv-ink-dim);
}

.nv-queue__badge--running {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-queue__badge--candidate-ready,
.nv-queue__badge--failed {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-queue__task-meta {
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-queue__task-error {
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-cinnabar);
}

.nv-queue__empty {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-faint);
}

/* I66 知情与揭示管理面（design §14.10 / R14-1）：事实/角色双视图 + 揭示/holder 提案。 */
.nv-knowledge__summary {
  margin: 0 0 var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--nv-ink-dim);
}

.nv-knowledge__view-tabs {
  display: flex;
  gap: calc(var(--nv-grid) * 0.5);
  margin: 0 0 var(--nv-grid);
}

.nv-knowledge__view-tabs .nv-btn.is-active {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-knowledge__facts,
.nv-knowledge__characters {
  list-style: none;
  margin: 0 0 var(--nv-grid);
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.75);
}

.nv-knowledge__fact,
.nv-knowledge__character {
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
  background: var(--nv-paper);
}

.nv-knowledge__fact.is-selected {
  border-color: var(--nv-cinnabar);
}

.nv-knowledge__fact-main,
.nv-knowledge__character-main {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.75);
  flex-wrap: wrap;
}

.nv-knowledge__fact-text {
  margin: 0;
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 14px;
  color: var(--nv-ink);
  flex: 1 1 100%;
}

.nv-knowledge__character-name {
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 14px;
  color: var(--nv-ink);
}

.nv-knowledge__badge {
  border-radius: calc(var(--nv-grid) * 0.5);
  padding: 0 calc(var(--nv-grid) * 0.5);
  font-family: var(--nv-sans);
  font-size: 11px;
  line-height: 1.6;
  border: 1px solid var(--nv-line);
  color: var(--nv-ink-dim);
}

.nv-knowledge__badge--hidden {
  border-color: var(--nv-line);
  color: var(--nv-ink-faint);
}

.nv-knowledge__badge--partially-revealed {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-knowledge__badge--revealed {
  border-color: var(--nv-cinnabar);
  color: var(--nv-cinnabar);
}

.nv-knowledge__fact-meta {
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-knowledge__pov-hint {
  margin: calc(var(--nv-grid) * 0.5) 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-knowledge__character-empty {
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-faint);
}

.nv-knowledge__character-knows {
  list-style: none;
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.25);
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-knowledge__action {
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: var(--nv-grid);
  margin: 0 0 var(--nv-grid);
  background: var(--nv-paper);
}

.nv-knowledge__action-title {
  margin: 0 0 calc(var(--nv-grid) * 0.75);
  font-family: var(--nv-serif);
  font-weight: 600;
  font-size: 13px;
  color: var(--nv-ink);
}

.nv-knowledge__holders {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--nv-grid) * 0.75);
  margin: 0 0 var(--nv-grid);
}

.nv-knowledge__holder {
  display: flex;
  align-items: center;
  gap: calc(var(--nv-grid) * 0.25);
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink);
}

.nv-knowledge__options {
  display: flex;
  flex-wrap: wrap;
  gap: var(--nv-grid);
  align-items: flex-end;
}

.nv-knowledge__pending {
  margin: var(--nv-grid) 0 0;
  border: 1px solid var(--nv-line);
  border-radius: calc(var(--nv-grid) * 0.75);
  padding: calc(var(--nv-grid) * 0.75) var(--nv-grid);
}

.nv-knowledge__pending summary {
  font-family: var(--nv-sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--nv-ink);
  cursor: pointer;
}

.nv-knowledge__pending ul {
  list-style: none;
  margin: calc(var(--nv-grid) * 0.5) 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: calc(var(--nv-grid) * 0.5);
}

.nv-knowledge__pending-text {
  margin: 0 0 calc(var(--nv-grid) * 0.25);
  font-family: var(--nv-sans);
  font-size: 12px;
  color: var(--nv-ink-dim);
}

.nv-knowledge__message {
  margin: var(--nv-grid) 0 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-dim);
}

.nv-knowledge__hint {
  margin: 0 0 var(--nv-grid);
  font-family: var(--nv-sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--nv-ink-faint);
}

.nv-knowledge__empty {
  margin: 0;
  font-family: var(--nv-sans);
  font-size: 13px;
  color: var(--nv-ink-faint);
}

/* I59 响应式断点（design §14.8 / R12-6）：窄屏把左右分栏改为纵向堆叠，导航退化
   为可横向滚动的横条；仍由同一 shell.overlay Slot/Fiber 管理，不创建新容器，
   窄屏无不可达内容（主列纵向滚动 + 导航横向滚动双轴可达）。 */
@media (max-width: ${RESPONSIVE_BREAKPOINT_NAV}px) {
  .nv-workbench__body-row {
    flex-direction: column;
  }

  /* UI 打磨：窄屏导航退化为横向滚动横条，无可拖动侧栏宽度 → 隐藏拖柄。 */
  .nv-workbench__nav-resizer {
    display: none;
  }

  .nv-workbench__nav {
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

  .nv-workbench__nav-group {
    display: inline-block;
    vertical-align: top;
    min-width: max-content;
    margin: 0 calc(var(--nv-grid) * 2) 0 0;
  }

  .nv-workbench__nav-item {
    display: inline-block;
    width: auto;
    white-space: nowrap;
  }

  .nv-editor__columns,
  .nv-outline__columns {
    flex-direction: column;
  }

  /* I60：正文三栏窄屏纵向堆叠（同一 Slot/Fiber，无不可达内容）。 */
  .nv-chapters {
    grid-template-columns: 1fr;
  }

  .nv-chapters__pane {
    max-height: none;
  }

  .nv-editor__list {
    flex: none;
    width: 100%;
    min-width: 0;
  }

  .nv-form__row {
    flex-direction: column;
  }

  .nv-state__diff-row {
    grid-template-columns: 1fr;
  }

  .nv-workbench__main {
    padding: var(--nv-grid);
  }

  .nv-editor__actions {
    flex-wrap: wrap;
  }
}

@media (max-width: ${RESPONSIVE_BREAKPOINT_COMPACT}px) {
  .nv-workbench__brand,
  .nv-workbench__project-context,
  .nv-workbench__leave-confirm {
    flex-wrap: wrap;
  }

  .nv-workbench__title {
    min-width: 0;
  }
}

/* 明暗适配：暗色下朱砂提亮（D12）；中性色已由宿主 --dsw-alias-* 在
   body[data-ds-dark-theme] 下自动切换，无需 novel 自有主题引擎。 */
body[data-ds-dark-theme] .nv-workbench {
  --nv-cinnabar: ${CINNABAR_DARK};
}

body[data-ds-dark-theme] .nv-launch {
  --nv-cinnabar: ${CINNABAR_DARK};
}
`;
