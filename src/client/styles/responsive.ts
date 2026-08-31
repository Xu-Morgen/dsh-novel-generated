/**
 * I83 styles 分区 · responsive：响应式断点与明暗适配（I59 / D12）。
 * I83 由 scripts/.split-styles.mjs 从单一 WORKBENCH_STYLES 模板字符串按键切出；
 * 内容与 I46 起各迭代的样式语义逐字一致（重构纪律 §16-2 行为等价），
 * 由 styles.ts 组合器按原顺序拼接。
 */
import { CINNABAR_DARK, RESPONSIVE_BREAKPOINT_COMPACT, RESPONSIVE_BREAKPOINT_NAV } from './tokens.js';
export const RESPONSIVE_STYLES = `
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

  /* I107：模式 tab 保持单行可横向访问，不把操作模式挤成不可达的多行。 */
  .nv-chapters__modes {
    max-width: 100%;
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
