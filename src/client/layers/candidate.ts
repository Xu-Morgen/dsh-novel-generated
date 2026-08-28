import type { El, WritingNamespace } from '../shared.js';
import { proseParagraphs } from './chapters-shared.js';
import type { ChaptersEditOps } from './chapters.js';

/**
 * I95 候选审阅片（计划 §18 I95 拆分：chapters 五职中的「候选裁决」）：
 * I63 候选审阅面板的类型、状态工厂与渲染（design §14.9 / R13-4）。
 */

/** I63 候选审阅（R13-4）：正文 + diff + 校验结果的最小 owned JSON（Host preview 投影）。 */
export interface CandidateValidationShape {
  readonly status: 'pass' | 'warn' | 'reject';
  readonly violations: readonly { readonly severity: 'hard' | 'soft'; readonly message: string; readonly references: readonly string[] }[];
}
/** I71 生成注入解释投影（design §14.10 / R14-6）：只含层/触发/预算摘要，无 secret 内容。 */
export interface CandidateTraceSectionShape {
  readonly id: string;
  readonly characterCount: number;
  readonly budget: number;
  readonly truncated: boolean;
}
export interface CandidateTraceShape {
  readonly intent: 'generate' | 'continue' | 'scene-card' | 'rewrite';
  readonly pov: string;
  readonly navigation?: { readonly actId: string; readonly beatId: string; readonly title: string };
  readonly sections: readonly CandidateTraceSectionShape[];
  readonly triggers: readonly { readonly entryId: string; readonly title: string; readonly matchedKeywords: readonly string[] }[];
  readonly totals: { readonly characterCount: number; readonly budget: number; readonly truncatedSectionCount: number };
  readonly rewritePromptCharacters: number;
  readonly knowledgeVisibleCount: number;
  readonly sceneCard?: { readonly title: string; readonly pov: string; readonly wordTarget: number };
}
export interface CandidateReviewShape {
  readonly candidateId: string;
  readonly intent: string;
  readonly text: string;
  readonly diff: { readonly kind: 'new-scene' } | { readonly kind: 'replace'; readonly before: string; readonly after: string };
  readonly validation: CandidateValidationShape;
  readonly trace?: CandidateTraceShape;
}

/** I63 审阅面板 UI 状态机：只有正文/diff/校验结果可见（ready）后才允许裁决。 */
export type CandidateUiState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'proposing'; readonly intent: string }
  | { readonly kind: 'ready'; readonly review: CandidateReviewShape }
  | { readonly kind: 'acting'; readonly review: CandidateReviewShape; readonly action: 'accept' | 'reject' | 'rewrite' }
  | { readonly kind: 'done'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

/** I63 候选审阅面板状态（局部重写指令草稿 + 面板状态机）。 */
export interface CandidatePanelState {
  readonly ui: CandidateUiState;
  readonly rewritePrompt: string;
}

export function freshCandidatePanel(): CandidatePanelState {
  return { ui: { kind: 'idle' }, rewritePrompt: '' };
}

/**
 * I63 候选审阅面板（design §14.9 / R13-4）：作者在正文 + diff + 校验结果可见后，
 * 才允许接受 / 拒绝 / 重写（R13-4 验收「可见后才允许裁决」）。
 *
 * 状态机：idle（发起入口）→ proposing → ready（审阅）→ acting（裁决中）→
 * done / error。ready 前不渲染任何裁决按钮；双击由 store 侧 inflight 去重。
 */
export function candidatePanel(h: El, projectId: string, writing: WritingNamespace | undefined, state: CandidatePanelState, ops: ChaptersEditOps): unknown {
  const available = writing !== undefined && projectId !== undefined;
  const disabled = !available || state.ui.kind === 'proposing' || state.ui.kind === 'acting';
  const proposeEntry = h('div', { className: 'nv-candidate__entry', 'data-novel-candidate-entry': '' },
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-candidate-propose-continue': '', disabled, onClick: () => ops.proposeWriting('continue') }, '续写下一场景'),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-candidate-propose-scene-card': '', disabled, onClick: () => ops.proposeWriting('scene-card') }, '按场景卡写作'),
    ),
    h('label', { className: 'nv-field nv-candidate__rewrite' },
      h('span', { className: 'nv-field__label' }, '局部重写当前场景'),
      h('textarea', {
        className: 'nv-field__input',
        'data-novel-candidate-rewrite-prompt': '',
        value: state.rewritePrompt,
        rows: 2,
        disabled,
        placeholder: '描述希望改写的方向（如：更有悬念、缩短、切换人称）',
        onChange: (event: { target: { value: string } }) => ops.rewritePromptChange(event.target.value),
      }),
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-candidate-propose-rewrite': '', disabled: disabled || state.rewritePrompt.trim() === '', onClick: () => ops.proposeRewrite() }, '发起重写候选'),
    ),
  );
  if (!available) {
    return h('section', { className: 'nv-candidate', 'data-novel-candidate-panel': '', 'data-novel-candidate-state': 'unavailable' },
      h('h3', { className: 'nv-editor__title' }, '写作候选'),
      h('p', { className: 'nv-candidate__hint', 'data-novel-candidate-unavailable': '' }, '候选审阅服务不可用（novelWriting Remote 未挂载）。'),
    );
  }
  let body: unknown;
  const ui = state.ui;
  if (ui.kind === 'idle') {
    body = h('p', { className: 'nv-candidate__hint', 'data-novel-candidate-hint': '' }, '生成后先审阅候选正文、改动与校验结果，再接受、拒绝或重写。');
  } else if (ui.kind === 'proposing') {
    body = h('p', { className: 'nv-candidate__hint', 'data-novel-candidate-proposing': '', role: 'status', 'aria-live': 'polite' }, `正在生成${ui.intent === 'continue' ? '续写' : '场景卡写作'}候选…`);
  } else if (ui.kind === 'ready' || ui.kind === 'acting') {
    const review = ui.review;
    const acting = ui.kind === 'acting' ? ui.action : undefined;
    const diffBlock = review.diff.kind === 'new-scene'
      ? h('p', { className: 'nv-candidate__diff', 'data-novel-candidate-diff': 'new-scene' }, '新场景：将追加到「chapter-1」。')
      : h('details', { className: 'nv-candidate__diff', 'data-novel-candidate-diff': 'replace' },
        h('summary', { 'data-novel-candidate-diff-summary': '' }, '局部重写：将替换当前场景正文'),
        h('p', { className: 'nv-candidate__diff-before', 'data-novel-candidate-diff-before': '' }, review.diff.before),
        h('p', { className: 'nv-candidate__diff-after', 'data-novel-candidate-diff-after': '' }, review.diff.after),
      );
    const validation = review.validation;
    const validationBlock = h('div', { className: `nv-candidate__validation nv-candidate__validation--${validation.status}`, 'data-novel-candidate-validation': validation.status, role: 'status', 'aria-live': 'polite' },
      h('p', null, validation.status === 'pass' ? '校验通过：未发现硬约束或软警告。'
        : validation.status === 'warn' ? '校验警告：存在软警告，可继续或重写。'
          : '校验未通过：存在硬冲突，接受将被拒绝（请重写）。'),
      validation.violations.length === 0 ? null
        : h('ul', { className: 'nv-candidate__violations' }, validation.violations.map((violation, index) => h('li', { key: index, 'data-novel-candidate-violation': violation.severity }, `${violation.severity === 'hard' ? '硬' : '软'}冲突：${violation.message}`))),
    );
    const trace = review.trace;
    const traceBlock = trace === undefined
      ? null
      : h('details', { className: 'nv-candidate__trace', 'data-novel-candidate-trace': '' },
        h('summary', { 'data-novel-candidate-trace-summary': '' }, `本次生成注入解释（${trace.sections.length} 层 / ${trace.totals.characterCount} 字 / 预算 ${trace.totals.budget}）`),
        h('p', { className: 'nv-candidate__trace-intent', 'data-novel-candidate-trace-intent': '' },
          trace.intent === 'rewrite'
            ? '局部重写：未注入结构层，只注入作者重写指令。'
            : trace.intent === 'scene-card'
              ? `按场景卡写作：未注入结构层，只注入场景卡「${trace.sceneCard?.title ?? ''}」（POV ${trace.pov}，目标 ${trace.sceneCard?.wordTarget ?? 0} 字）。`
              : `上下文组装：POV ${trace.pov}，注入 ${trace.sections.length} 个层（含 ${trace.knowledgeVisibleCount} 条该 POV 可见的知情）。`),
        trace.sections.length === 0 ? null
          : h('ul', { className: 'nv-candidate__trace-sections', 'data-novel-candidate-trace-sections': '' },
            trace.sections.map((section) => h('li', { key: section.id, 'data-novel-candidate-trace-section': section.id },
              `${section.id}：${section.characterCount}/${section.budget} 字${section.truncated ? '（已裁剪）' : ''}`))),
        trace.triggers.length === 0 ? null
          : h('ul', { className: 'nv-candidate__trace-triggers', 'data-novel-candidate-trace-triggers': '' },
            trace.triggers.map((trigger) => h('li', { key: trigger.entryId, 'data-novel-candidate-trace-trigger': trigger.entryId },
              `世界观触发：${trigger.title}（关键词：${trigger.matchedKeywords.join('、') || '—'}）`))),
        trace.totals.truncatedSectionCount > 0
          ? h('p', { className: 'nv-candidate__trace-truncated', 'data-novel-candidate-trace-truncated': String(trace.totals.truncatedSectionCount) }, `其中 ${trace.totals.truncatedSectionCount} 层因预算被确定性裁剪。`)
          : null,
      );
    body = h('div', { className: 'nv-candidate__review', 'data-novel-candidate-review': '' },
      h('div', { className: 'nv-candidate__meta' },
        h('span', { className: 'nv-candidate__intent', 'data-novel-candidate-intent': '' }, { continue: '续写', 'scene-card': '场景卡写作', rewrite: '局部重写', generate: '生成' }[review.intent] ?? review.intent),
        h('span', { className: 'nv-candidate__id' }, review.candidateId),
      ),
      proseParagraphs(h, review.text),
      diffBlock,
      validationBlock,
      traceBlock,
      h('div', { className: 'nv-editor__actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-candidate-accept': '', disabled: acting !== undefined, onClick: () => ops.adjudicateCandidate('accept') }, acting === 'accept' ? '正在接受…' : '接受'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-candidate-reject': '', disabled: acting !== undefined, onClick: () => ops.adjudicateCandidate('reject') }, acting === 'reject' ? '正在拒绝…' : '拒绝'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-candidate-rewrite': '', disabled: acting !== undefined, onClick: () => ops.adjudicateCandidate('rewrite') }, acting === 'rewrite' ? '正在重写…' : '重写'),
      ),
    );
  } else if (ui.kind === 'done') {
    body = h('p', { className: 'nv-candidate__done', 'data-novel-candidate-done': '', role: 'status', 'aria-live': 'polite' }, ui.message);
  } else {
    body = h('div', { className: 'nv-candidate__error', 'data-novel-candidate-error': '', role: 'alert', 'aria-live': 'assertive' },
      h('p', null, ui.message),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-candidate-dismiss': '', onClick: () => ops.dismissCandidate() }, '关闭'),
    );
  }
  return h('section', { className: 'nv-candidate', 'data-novel-candidate-panel': '', 'data-novel-candidate-state': ui.kind },
    h('h3', { className: 'nv-editor__title' }, '写作候选'),
    proposeEntry,
    body,
  );
}
