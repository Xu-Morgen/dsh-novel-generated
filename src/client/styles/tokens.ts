/**
 * I83 styles 键分区（架构审查 §4.2「styles.ts 可按键分区」）：品牌 token 与
 * 断点常量从 styles.ts 迁入本文件，分区样式模块与 styles.ts 组合器共用；
 * styles.ts 仍 re-export 全部 token（client.ts / client.test.ts 导入面不变）。
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
