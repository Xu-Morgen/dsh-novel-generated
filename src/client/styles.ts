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
 * - I83：样式体按键分区迁至 src/client/styles/（架构审查 §4.2），本文件只负责
 *   组合与 token re-export，不操作 DOM；`<style>` 注入与 Fiber 回收仍由
 *   `client.ts` 经 `ctx.effect` 完成（R10-3）。分区边界位于空行 + 区块注释处，
 *   拼接结果与原单一模板字符串逐字等价（scripts/.split-styles.mjs 校验）。
 */
import { BASE_STYLES } from './styles/base.js';
import { NAVIGATION_STYLES } from './styles/navigation.js';
import { FORMS_STYLES } from './styles/forms.js';
import { CHAPTERS_STYLES } from './styles/chapters.js';
import { LAYERS_STYLES } from './styles/layers.js';
import { ONBOARDING_STYLES } from './styles/onboarding.js';
import { PANELS_STYLES } from './styles/panels.js';
import { RESPONSIVE_STYLES } from './styles/responsive.js';

export {
  CINNABAR, CINNABAR_DARK, GRID, RESPONSIVE_BREAKPOINT_COMPACT, RESPONSIVE_BREAKPOINT_NAV, SANS_STACK, SERIF_STACK,
} from './styles/tokens.js';

/**
 * 创作台包内样式。命名空间前缀 `.nv-`（novel）避免与宿主样式冲突；包内品牌层
 * 通过 CSS 自定义属性 `--nv-*` 挂在 `.nv-workbench` 作用域内，只影响本面板。
 */
export const WORKBENCH_STYLES = `${BASE_STYLES}${NAVIGATION_STYLES}${FORMS_STYLES}${CHAPTERS_STYLES}${LAYERS_STYLES}${ONBOARDING_STYLES}${PANELS_STYLES}${RESPONSIVE_STYLES}`;
