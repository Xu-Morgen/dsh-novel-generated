import type { El, BranchNamespace } from '../shared.js';
import type { ChaptersEditOps } from './chapters.js';

/**
 * I95 版本/分支片（计划 §18 I95 拆分：chapters 五职中的「分支」）：I70 版本与
 * 分支面板的类型、状态工厂与渲染（design §14.10「正文版本与分支」/ R14-5）。
 */

/** I70 分支版本元数据投影（Host `novelBranches.list` 的最小 owned JSON，无正文）。 */
export interface BranchSummaryShape {
  readonly id: string;
  readonly label: string;
  readonly chosen: boolean;
  readonly charCount: number;
  readonly hash: string;
  [key: string]: unknown;
}

export interface BranchDiffLineShape {
  readonly kind: 'add' | 'del' | 'same';
  readonly text: string;
}

/** I70 分支 diff 状态机（I71 引入行级 diff，R14-5）。 */
export type BranchDiffState =
  | { readonly status: 'idle'; readonly lines: [] }
  | { readonly status: 'loading'; readonly lines: [] }
  | { readonly status: 'error'; readonly lines: []; readonly message?: string }
  | { readonly status: 'ready'; readonly fromLabel?: string; readonly toLabel?: string; readonly lines: BranchDiffLineShape[] };

/** I70 分支面板状态（列表/装载/存档/选用/对比 + 命名草稿）。 */
export interface BranchPanelState {
  readonly status: 'idle' | 'loading' | 'error' | 'ready';
  readonly list: BranchSummaryShape[];
  readonly labelDraft: string;
  readonly acting: boolean;
  readonly message: string | undefined;
  readonly diff: BranchDiffState;
}

export function freshBranchPanel(): BranchPanelState {
  return { status: 'idle', list: [], labelDraft: '', acting: false, message: undefined, diff: { status: 'idle', lines: [] } };
}

/**
 * I70 版本与分支面板（design §14.10「正文版本与分支」/ R14-5）：展示当前场景的
 * 全部版本（chosen 唯一），支持给当前正文打命名版本、选用历史版本（可逆切换，
 * 只写 C5）与分支行 diff 对比。所有读写只经 Host `novelBranches` Remote；Client
 * 不持有版本真相（列表始终由 Host 投影刷新）。
 */
export function branchPanel(h: El, projectId: string, branches: BranchNamespace | undefined, state: BranchPanelState, ops: ChaptersEditOps): unknown {
  const unavailable = branches === undefined || projectId === undefined;
  let body: unknown;
  if (unavailable) {
    body = h('p', { className: 'nv-branch__hint', 'data-novel-branch-unavailable': '' }, '版本服务不可用（novelBranches Remote 未挂载）。');
  } else if (state.status === 'loading') {
    body = h('p', { className: 'nv-branch__hint', 'data-novel-branch-loading': '' }, '正在读取版本…');
  } else if (state.status === 'error') {
    body = h('div', { className: 'nv-branch__error', 'data-novel-branch-error': '', role: 'alert' },
      h('p', { className: 'nv-chapters__error-text' }, state.message ?? '版本读取失败'),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-branch-retry': '', onClick: () => ops.branchesLoad() }, '重试'),
    );
  } else {
    const list = state.list;
    const rows = list.length === 0
      ? h('p', { className: 'nv-branch__hint', 'data-novel-branch-empty': '' }, '尚无保留的版本（隐含单版本）。接受重写候选后旧正文会自动保留为分支，也可先「存档当前版本」。')
      : h('ul', { className: 'nv-branch__list', 'data-novel-branch-list': '' }, list.map((branch) => h('li', {
        key: branch.id,
        className: 'nv-branch__item' + (branch.chosen ? ' is-chosen' : ''),
        'data-novel-branch-item': branch.id,
      },
        h('div', { className: 'nv-branch__item-head' },
          h('span', { className: 'nv-branch__label', 'data-novel-branch-label': '' }, branch.label || '未命名版本'),
          branch.chosen ? h('span', { className: 'nv-branch__badge', 'data-novel-branch-chosen': '' }, '当前') : null,
        ),
        h('span', { className: 'nv-branch__meta' }, `${branch.charCount} 字 · ${branch.hash.slice(0, 8)}`),
        h('div', { className: 'nv-editor__actions' },
          h('button', { type: 'button', className: 'nv-btn', 'data-novel-branch-choose': '', disabled: branch.chosen || state.acting, onClick: () => ops.branchChoose(branch.id) }, branch.chosen ? '当前版本' : '选用此版本'),
          h('button', { type: 'button', className: 'nv-btn', 'data-novel-branch-diff': '', disabled: state.acting, onClick: () => ops.branchDiff(branch.id) }, '对比当前'),
        ),
      )));
    let diffBlock: unknown;
    const diff = state.diff;
    if (diff.status === 'loading') {
      diffBlock = h('p', { className: 'nv-branch__hint', 'data-novel-branch-diff-loading': '' }, '正在对比…');
    } else if (diff.status === 'error') {
      diffBlock = h('p', { className: 'nv-chapters__error-text', 'data-novel-branch-diff-error': '', role: 'alert' }, diff.message ?? '对比失败');
    } else if (diff.status === 'ready') {
      diffBlock = h('div', { className: 'nv-branch__diff', 'data-novel-branch-diff-view': '' },
        h('p', { className: 'nv-branch__diff-title', 'data-novel-branch-diff-title': '' }, `对比：${diff.fromLabel ?? '—'} → ${diff.toLabel ?? '当前'}`),
        h('div', { className: 'nv-branch__diff-lines' }, diff.lines.length === 0
          ? h('p', { className: 'nv-branch__hint' }, '两个版本内容相同。')
          : diff.lines.map((line, index) => h('p', { key: index, className: `nv-branch__line nv-branch__line--${line.kind}`, 'data-novel-branch-line': line.kind }, `${line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '} ${line.text}`))),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-branch-diff-close': '', onClick: () => ops.branchCloseDiff() }, '关闭对比'),
      );
    }
    body = h('div', { className: 'nv-branch__body' },
      rows,
      h('label', { className: 'nv-field nv-branch__save' },
        h('span', { className: 'nv-field__label' }, '给当前版本命名存档'),
        h('div', { className: 'nv-editor__actions' },
          h('input', {
            type: 'text',
            className: 'nv-field__input',
            'data-novel-branch-label': '',
            value: state.labelDraft,
            placeholder: '如：初稿、伏笔加强版',
            disabled: state.acting,
            onChange: (event: { target: { value: string } }) => ops.branchLabelChange(event.target.value),
          }),
          h('button', {
            type: 'button',
            className: 'nv-btn nv-btn--primary',
            'data-novel-branch-save': '',
            disabled: state.acting || state.labelDraft.trim() === '',
            onClick: () => ops.branchSave(),
          }, state.acting ? '处理中…' : '存档'),
        ),
      ),
      state.message === undefined ? null : h('p', { className: 'nv-branch__hint nv-branch__message', 'data-novel-branch-message': '', role: 'status', 'aria-live': 'polite' }, state.message),
      diffBlock,
    );
  }
  return h('section', { className: 'nv-branch', 'data-novel-branch-panel': '', 'data-novel-branch-state': state.status },
    h('h3', { className: 'nv-editor__title' }, '版本与分支'),
    body,
  );
}
