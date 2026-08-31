import type { LongDraftNamespace } from './shared.js';
import type { El } from './shared.js';

/**
 * I120 onboarding guidance for the outline-only long-draft path.
 *
 * This is intentionally a passive guide: the candidate and confirmation
 * actions remain Host-owned Remote calls, while I121 adds the reactive author
 * workflow state. Keeping the guide visible here prevents the Client from
 * implying that a pasted manuscript becomes C5 text or bypasses I11.
 */
export function longDraftGuidePanel(h: El, projectId: string, namespace: LongDraftNamespace | undefined): unknown {
  return h('section', {
    className: 'nv-onboarding-long-draft-guide',
    'data-novel-long-draft-guide': '',
    'data-novel-long-draft-state': namespace === undefined ? 'unavailable' : 'host-ready',
  },
  h('h3', { className: 'nv-panel__title' }, '长稿拆纲（仅生成大纲）'),
  h('p', { className: 'nv-panel__hint' }, '长稿会先生成可审阅的大纲候选；只有空作品可继续，确认后才写入大纲，不会把原文写入正文。'),
  h('ol', { className: 'nv-onboarding-long-draft-guide__steps' },
    h('li', null, '粘贴或上传原文，生成大纲候选。'),
    h('li', null, '检查候选与来源标记，确认或拒绝。'),
    h('li', null, '应用后可从中断处继续，重复确认不会重复写入。'),
  ),
  namespace === undefined
    ? h('p', { className: 'nv-editor__error', 'data-novel-long-draft-error': '', role: 'alert' }, '长稿拆纲功能暂时不可用，请稍后重试。')
    : h('small', { className: 'nv-panel__hint', 'data-novel-long-draft-project': projectId }, '当前路径会检查作品是否为空。'),
  );
}
