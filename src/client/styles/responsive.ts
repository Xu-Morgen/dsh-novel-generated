/** I193 / 设计 §14.34：桌面响应式几何的唯一 owner，窄窗保持正文与导航可达。 */
import { RESPONSIVE_BREAKPOINT_COMPACT, RESPONSIVE_BREAKPOINT_NAV } from './tokens.js';
export const RESPONSIVE_STYLES = `
/* 窄窗改为上下布局；导航在有限高度内纵向滚动，可手动收起。 */
@media (max-width: ${RESPONSIVE_BREAKPOINT_NAV}px) {
  .nv-workbench__body-row {
    flex-direction: column;
  }

  /* UI 打磨：窄屏不使用侧栏宽度拖柄。 */
  .nv-workbench__nav-resizer {
    display: none;
  }

  .nv-workbench__nav {
    width: auto;
    max-width: 100%;
    max-height: 28vh;
    flex: none;
    border-right: none;
    border-bottom: 1px solid var(--nv-line);
    overflow-x: hidden;
    overflow-y: auto;
    white-space: normal;
    padding: var(--nv-grid);
  }

  .nv-workbench__nav-group {
    display: block;
    min-width: 0;
    margin: 0 0 12px;
  }

  .nv-workbench__nav-item {
    display: inline-flex;
    width: 50%;
    white-space: normal;
  }

  .nv-editor__columns,
  .nv-outline__columns {
    flex-direction: column;
    align-items: stretch;
  }

  /* I191：单树导航在窄屏占有限高度，正文继续获得空间。 */
  .nv-chapters {
    grid-template-columns: 1fr;
  }

  .nv-chapters__pane { max-height: 28vh; }
  .nv-chapters__pane--body { max-height: none; }

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

`;
