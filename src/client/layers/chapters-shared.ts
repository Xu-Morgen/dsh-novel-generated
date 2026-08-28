import type { El } from '../shared.js';

/**
 * I95 章节面板共享渲染辅助（计划 §18 I95 拆分：chapters/scene-editor/candidate/
 * branch 四片共用的最小 DOM helper），不承载任何状态。
 */

export function errorBlock(h: El, message: string, retry: () => void, retryLabel: string): unknown {
  return h('div', { className: 'nv-chapters__state', 'data-novel-chapters-error': '', role: 'alert' },
    h('p', { className: 'nv-chapters__error-text' }, message),
    h('button', { type: 'button', className: 'nv-btn', 'data-novel-chapters-retry': '', onClick: retry }, retryLabel),
  );
}

/** 场景正文按空行拆段（与 docs/ 派生镜像同分节习惯），空段忽略。 */
export function proseParagraphs(h: El, content: string): unknown {
  const paragraphs = content.split(/\r?\n+/).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph.length > 0);
  return h('div', { className: 'nv-chapters__prose', 'data-novel-scene-prose': '' },
    paragraphs.length === 0
      ? h('p', { className: 'nv-chapters__empty', 'data-novel-chapters-empty': '' }, '（本场景暂无正文）')
      : paragraphs.map((paragraph, index) => h('p', { key: index, className: 'nv-chapters__paragraph' }, paragraph)),
  );
}
