import type { El, ReviewNamespace } from '../shared.js';
import { advancedReference, toUserMessage } from '../presentation.js';
import { filterReviewIssues } from '../../core/review/issue.js';
import { contextLinkButton, textContextLink, type ContextLinkSink } from '../link-adapters.js';
import { freshReviewRepairSession, type ReviewRepairSessionState } from '../review-repair-session.js';
import type { BookReadinessResult } from '../../core/schema/book-readiness.js';

/**
 * I64 一致性审校中心面板（design §14.9 / R13-5）。
 *
 * 统一展示规则 / 正史 / 知情 / 关系 / 风格五类问题：每项携带严重度（硬/软）、
 * 来源 kind、引用、正文定位（章节/场景）与裁决状态（open/continued/
 * rewrite-requested），形成可执行审校流程：
 * - 「刷新审校」`data-novel-review-refresh`：经 Host `novelReview.scan` 重新
 *   跑既有探测器（I21/I22/I24 + I20 确定性检查），只读零写；
 * - 过滤：分类（规则/正史/知情/关系/风格）、严重度（硬/软）、状态
 *   （未处理/已继续/已请求重写）三组 chips，多选组合过滤
 *   （`data-novel-review-filter-*`）；「清除过滤」一键复位；
 * - 裁决：勾选 open 软警告后显式「继续（记录软警告）」或「请求重写」——
 *   必须记录到 Host 审计账本（R13-5）；硬冲突阻止继续（Host fail-closed 拒绝，
 *   UI 同步禁用），硬问题只能请求重写；
 * - 审计记录 `data-novel-review-record`：展示已记录的显式裁决（issueId +
 *   decision + decidedAt），作为「软警告已显式裁决」的可查证据。
 *
 * 契约与不变式：
 * - 所有读写只经 Host `novelReview` Remote；Client 只持有最小投影（issue 列表
 *   与汇总），不持有正文/层对象（无完整 live object 序列化）。
 * - 过滤是纯派生（core/review/issue.filterReviewIssues），不修改投影本身。
 * - 面板状态机：idle → scanning → ready / error；ready 前不渲染裁决按钮。
 * - I128/I129 修复候选只经 writing-adjudication 接受；I129 的 resolved 仅为当前
 *   Client 会话证据，不进入 Host review ledger。
 */

export interface ReviewIssueShape {
  readonly id: string;
  readonly category: 'rule' | 'canon' | 'knowledge' | 'relationship' | 'style';
  readonly severity: 'hard' | 'soft';
  readonly kind: string;
  readonly message: string;
  readonly references: readonly string[];
  readonly location?: { readonly chapterId: string; readonly sceneId: string; readonly anchor?: { readonly start: number; readonly end: number; readonly quote: string; readonly sourceHash: string } };
  readonly status: 'open' | 'continued' | 'rewrite-requested';
}
export interface ReviewProjectionShape {
  readonly projectId: string;
  readonly scannedAt: string;
  readonly issues: readonly ReviewIssueShape[];
  readonly summary: { readonly total: number; readonly hard: number; readonly soft: number; readonly byCategory: Readonly<Record<string, number>> };
}
export interface ReviewAuditRecordShape {
  readonly projectId: string;
  readonly issueId: string;
  readonly decision: 'continue' | 'rewrite-requested';
  readonly decidedAt: string;
}

/** I64 裁决结果投影：已记录/重复计数 + 刷新状态后的投影 + 审计记录（R13-5）。 */
export interface ReviewAdjudicationOutcomeShape {
  readonly projectId: string;
  readonly decision: 'continue' | 'rewrite-requested';
  readonly applied: readonly string[];
  readonly duplicate: readonly string[];
  readonly records: readonly ReviewAuditRecordShape[];
  readonly projection: ReviewProjectionShape;
}

/** 三组过滤条件的选中集合（空数组 = 不过滤该维度）。 */
export interface ReviewFilterShape {
  readonly categories: readonly string[];
  readonly severities: readonly ('hard' | 'soft')[];
  readonly statuses: readonly string[];
}

export type ReviewUiStatus = 'idle' | 'scanning' | 'ready' | 'error';
export type BookReadinessUiStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface BookReadinessUiState {
  readonly status: BookReadinessUiStatus;
  readonly result?: BookReadinessResult;
  readonly message?: string;
}

export interface ReviewLayerState {
  readonly status: ReviewUiStatus;
  readonly projection?: ReviewProjectionShape;
  readonly message?: string;
  readonly filter: ReviewFilterShape;
  readonly selected: readonly string[];
  readonly acting: boolean;
  /** 审计记录（scan/adjudicate 后随投影刷新，展示显式裁决证据）。 */
  readonly records: readonly ReviewAuditRecordShape[];
  /** I128/I129 transient candidate + acceptance/rescan correlation; never a Host ledger. */
  readonly repairSession: ReviewRepairSessionState;
  /** I137 bounded, recomputed full-book release projection. */
  readonly bookReadiness: BookReadinessUiState;
}

export interface ReviewEditOps {
  scan(): void;
  toggleFilter(kind: 'categories' | 'severities' | 'statuses', value: string): void;
  clearFilters(): void;
  selectIssue(issueId: string): void;
  adjudicate(decision: 'continue' | 'rewrite-requested'): void;
  repair(issueId: string): void;
  acceptRepair(): void;
  rejectRepair(): void;
  retryRepairScan(): void;
  cancelRepair(): void;
  bookReadiness(): void;
  bookScan(): void;
  dismiss(): void;
}

export function freshReview(): ReviewLayerState {
  return { status: 'idle', filter: { categories: [], severities: [], statuses: [] }, selected: [], acting: false, records: [], repairSession: freshReviewRepairSession(), bookReadiness: { status: 'idle' } };
}

const CATEGORY_LABELS: Readonly<Record<string, string>> = {
  rule: '规则', canon: '正史', knowledge: '知情', relationship: '关系', style: '风格',
};
const KIND_LABELS: Readonly<Record<string, string>> = {
  'immutable-rule': '不可违反的规则',
  'canon-conflict': '正史冲突',
  'knowledge-leak': '知情边界问题',
  'relationship-drift': '关系变化偏离',
  'style-deviation': '文风偏离',
};
const SEVERITY_LABELS: Readonly<Record<string, string>> = { hard: '硬', soft: '软' };
const STATUS_LABELS: Readonly<Record<string, string>> = {
  open: '未处理', continued: '已继续', 'rewrite-requested': '已请求重写',
};

function toggle<T>(list: readonly T[], value: T): readonly T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** 过滤 chip 行（分类/严重度/状态三组；data-novel-review-filter-* 锚点）。 */
function filterRow(h: El, label: string, kind: 'categories' | 'severities' | 'statuses', options: readonly { value: string; label: string }[], selected: readonly string[], ops: ReviewEditOps): unknown {
  return h('div', { className: 'nv-review__filter-row', 'data-novel-review-filter-row': kind },
    h('span', { className: 'nv-review__filter-label' }, label),
    options.map((option) => {
      const active = selected.includes(option.value);
      return h('button', {
        key: option.value,
        type: 'button',
        className: 'nv-review__chip' + (active ? ' is-active' : ''),
        'data-novel-review-filter': `${kind}:${option.value}`,
        'aria-pressed': String(active),
        onClick: () => ops.toggleFilter(kind, option.value),
      }, option.label);
    }),
  );
}

/** 单条问题卡：严重度徽标 + 分类 + kind + 消息 + 引用 + 正文定位 + 状态 + 勾选。 */
function issueCard(h: El, projectId: string, issue: ReviewIssueShape, selected: boolean, selectIssue: (issueId: string) => void, repair: (issueId: string) => void, repairBusy: boolean, links?: ContextLinkSink): unknown {
  return h('li', { className: 'nv-review__issue nv-review__issue--' + issue.severity, 'data-novel-review-issue': issue.id, 'data-novel-review-issue-severity': issue.severity },
    h('label', { className: 'nv-review__issue-select' },
      h('input', { type: 'checkbox', 'data-novel-review-select': issue.id, checked: selected, onChange: () => selectIssue(issue.id) }),
      h('span', { className: 'nv-review__issue-title' },
        h('span', { className: 'nv-review__badge nv-review__badge--' + issue.severity, 'data-novel-review-issue-badge': issue.severity }, SEVERITY_LABELS[issue.severity] ?? issue.severity),
        h('span', { className: 'nv-review__badge', 'data-novel-review-issue-category': issue.category }, CATEGORY_LABELS[issue.category] ?? issue.category),
        h('span', { className: 'nv-review__issue-kind', 'data-novel-review-issue-kind': '' }, KIND_LABELS[issue.kind] ?? '待处理问题'),
      ),
      h('p', { className: 'nv-review__issue-message', 'data-novel-review-issue-message': '' }, issue.message),
      h('p', { className: 'nv-review__issue-meta', 'data-novel-review-issue-meta': '' },
        issue.location === undefined ? '无正文定位'
          : '可定位到相关章节与场景',
        issue.references.length === 0 ? null : ` · 关联内容 ${issue.references.length} 项`,
        ` · 状态：${STATUS_LABELS[issue.status] ?? issue.status}`,
      ),
      issue.location === undefined ? null : h('div', { className: 'nv-review__issue-actions' },
        contextLinkButton(h, '定位正文', 'review', textContextLink(projectId, issue.location.chapterId, issue.location.sceneId, issue.location.anchor), links),
        h('button', { type: 'button', className: 'nv-btn nv-btn--link', 'data-novel-review-repair': issue.id, disabled: repairBusy, onClick: () => repair(issue.id) }, repairBusy ? '正在生成…' : '生成修复候选'),
      ),
    ),
  );
}

/** I129 候选接受/复扫会话视图；不存在 accept 旁路，所有正文写入仍由 writing owner 执行。 */
function repairSessionPanel(h: El, session: ReviewRepairSessionState, ops: ReviewEditOps): unknown {
  if (session.status === 'generating') {
    return h('div', { className: 'nv-review__repair-session', 'data-novel-review-repair-session': 'generating' },
      h('p', { className: 'nv-review__repair-status', role: 'status', 'aria-live': 'polite' }, '正在生成修复候选…'),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-review-repair-cancel': '', onClick: () => ops.cancelRepair() }, '取消生成'),
    );
  }
  if (session.candidate === undefined) {
    return session.status === 'error'
      ? h('p', { className: 'nv-review__repair-error', 'data-novel-review-repair-error': '', role: 'alert' }, session.message ?? '修复候选生成失败')
      : null;
  }
  const candidate = session.candidate;
  const canAccept = session.status === 'ready' || session.status === 'error';
  const canRetryScan = session.status === 'uncertain' || session.status === 'unresolved';
  return h('section', { className: 'nv-review__repair-candidate', 'data-novel-review-repair-candidate': candidate.candidate.id },
    h('h4', null, session.status === 'resolved' ? '修复已确认（当前会话）' : '修复候选（待作者审阅）'),
    h('p', { className: 'nv-review__issue-meta' }, '已锁定需要修复的正文位置', advancedReference(h, '查看问题定位', `${candidate.target.chapterId}/${candidate.target.sceneId}`), advancedReference(h, '查看问题标识', candidate.issueFingerprint)),
    candidate.anchor === undefined ? null : h('p', { className: 'nv-review__issue-meta' }, `精确引文：${candidate.anchor.quote}`),
    h('pre', { className: 'nv-review__repair-text' }, candidate.candidate.text),
    session.status === 'accepting'
      ? h('p', { className: 'nv-review__repair-status', 'data-novel-review-repair-accepting': '', role: 'status', 'aria-live': 'polite' }, '正在接受候选，随后自动复扫…')
      : session.status === 'rescanning'
        ? h('p', { className: 'nv-review__repair-status', role: 'status', 'aria-live': 'polite' }, '候选已接受，正在复扫…')
        : session.status === 'resolved'
          ? h('div', { className: 'nv-review__repair-resolved', 'data-novel-review-repair-resolved': candidate.issueId },
            h('p', null, toUserMessage(session.message ?? '复扫未发现同一问题。')),
            h('p', { className: 'nv-review__issue-meta' }, '已记录本次修复并确认原问题消失。', advancedReference(h, '查看复扫证据', `${session.resolved?.candidateId ?? candidate.candidate.id} · ${session.resolved?.rescannedAt ?? '未知时间'}`)),
          )
          : session.status === 'unresolved'
            ? h('p', { className: 'nv-review__repair-warning', 'data-novel-review-repair-unresolved': '', role: 'alert' }, session.message ?? '同一问题仍存在，未标记为已解决。')
            : session.status === 'uncertain'
              ? h('p', { className: 'nv-review__repair-warning', 'data-novel-review-repair-uncertain': '', role: 'alert' }, session.message ?? '修复已接受，但复扫失败，解决状态不确定。')
              : session.status === 'rejected'
                ? h('p', { className: 'nv-review__issue-meta', 'data-novel-review-repair-rejected': '', role: 'status' }, session.message ?? '已拒绝修复候选，未修改正文。')
                : session.message === undefined ? null : h('p', { className: 'nv-review__repair-error', 'data-novel-review-repair-error': '', role: 'alert' }, session.message),
    canAccept
      ? h('div', { className: 'nv-review__issue-actions' },
        h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-review-repair-accept': '', onClick: () => ops.acceptRepair() }, '接受并复扫'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-review-repair-reject': '', onClick: () => ops.rejectRepair() }, '拒绝候选'),
      )
      : canRetryScan
        ? h('div', { className: 'nv-review__issue-actions' },
          h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-review-repair-retry': '', onClick: () => ops.retryRepairScan() }, '重试复扫'),
        )
        : null,
    session.status === 'error' && session.message === undefined
      ? h('p', { className: 'nv-review__repair-error', role: 'alert' }, '修复候选未完成，请重新生成。')
      : null,
  );
}

/** I137 release gate: only the bounded Host projection can open/close export readiness. */
function bookReadinessPanel(h: El, state: BookReadinessUiState, ops: ReviewEditOps, busy: boolean): unknown {
  const result = state.result;
  const controls = h('div', { className: 'nv-review__book-actions' },
    h('button', { type: 'button', className: 'nv-btn', 'data-novel-book-readiness-refresh': '', disabled: busy, onClick: () => ops.bookReadiness() }, state.status === 'loading' ? '正在检查…' : '检查全书完成度'),
    h('button', { type: 'button', className: 'nv-btn', 'data-novel-book-scan': '', disabled: busy, onClick: () => ops.bookScan() }, '检查全书并审校'),
  );
  if (state.status === 'idle') return h('section', { className: 'nv-review__book', 'data-novel-book-readiness-panel': '' }, h('h4', null, '全书发布就绪'), controls, h('p', { className: 'nv-review__hint', 'data-novel-book-readiness-state': 'idle' }, '完成全书检查后才会建立发布门。'));
  if (state.status === 'loading') return h('section', { className: 'nv-review__book', 'data-novel-book-readiness-panel': '' }, h('h4', null, '全书发布就绪'), controls, h('p', { className: 'nv-review__hint', 'data-novel-book-readiness-state': 'loading', role: 'status', 'aria-live': 'polite' }, '正在从作品真相重算全书发布门…'));
  if (state.status === 'error' || result === undefined) return h('section', { className: 'nv-review__book', 'data-novel-book-readiness-panel': '' }, h('h4', null, '全书发布就绪'), controls, h('p', { className: 'nv-review__repair-error', 'data-novel-book-readiness-state': 'error', role: 'alert' }, state.message ?? '全书检查失败，请重试。'));
  return h('section', { className: 'nv-review__book', 'data-novel-book-readiness-panel': '', 'data-novel-book-release-gate': result.gateOpen ? 'open' : 'closed' },
    h('h4', null, '全书发布就绪'),
    controls,
    h('p', { className: result.gateOpen ? 'nv-review__book-gate nv-review__book-gate--open' : 'nv-review__book-gate nv-review__book-gate--closed', 'data-novel-book-readiness-state': result.status, role: 'status', 'aria-live': 'polite' }, result.gateOpen ? '发布门已开启：全书可进入导出流程。' : '发布门已关闭：请处理下方硬阻断或待裁决事项。'),
    h('p', { className: 'nv-review__summary', 'data-novel-book-readiness-summary': '' }, `章节 ${result.counts.chapters} · 场景 ${result.counts.scenes} · 必需细纲卡 ${result.counts.completedCards}/${result.counts.requiredCards} · 正文场景 ${result.counts.proseScenes} · 硬阻断 ${result.counts.hardIssues} · 警告 ${result.counts.warningIssues}`),
    result.issues.length === 0
      ? h('p', { className: 'nv-review__empty', 'data-novel-book-readiness-issues': 'empty' }, '没有发布阻断问题。')
      : h('ul', { className: 'nv-review__book-issues', 'data-novel-book-readiness-issues': '' }, result.issues.map((issue) => h('li', { key: issue.id, 'data-novel-book-readiness-issue': issue.id, 'data-novel-book-readiness-severity': issue.severity }, `${issue.severity === 'hard' ? '硬阻断' : '警告'} · ${issue.message}`))),
    h('p', { className: 'nv-review__issue-meta' }, `本页章节 ${result.page.offset + 1}-${Math.min(result.page.offset + result.page.chapters.length, result.page.total)} / ${result.page.total}；审校 ${result.review.status === 'completed' ? `已完成（${result.review.total} 项）` : '未运行'}`),
  );
}

/**
 * 审校中心面板。状态机：idle（未扫描）→ scanning → ready（问题列表 + 过滤 +
 * 裁决）/ error。ready 前不渲染裁决按钮；硬冲突存在时「继续」按钮禁用。
 */
export function reviewPanel(h: El, projectId: string, review: ReviewNamespace | undefined, state: ReviewLayerState, ops: ReviewEditOps, links?: ContextLinkSink): unknown {
  const available = review !== undefined && projectId !== undefined;
  const repairBusy = state.repairSession.status === 'generating' || state.repairSession.status === 'accepting' || state.repairSession.status === 'rescanning';
  const busy = state.status === 'scanning' || state.acting || repairBusy;
  let body: unknown;
  if (!available) {
    body = h('p', { className: 'nv-review__hint', 'data-novel-review-unavailable': '' }, '审校功能暂时不可用，请稍后重试。');
  } else if (state.status === 'idle') {
    body = h('p', { className: 'nv-review__hint', 'data-novel-review-idle': '' }, '尚未审校。点击「刷新审校」对全部正文运行规则/正史/知情/关系/风格检查。');
  } else if (state.status === 'scanning') {
    body = state.repairSession.status === 'rescanning'
      ? h('div', { className: 'nv-review__hint', 'data-novel-review-scanning': '', 'data-novel-review-repair-rescanning': '' },
        h('p', { role: 'status', 'aria-live': 'polite' }, '正在复扫全部场景，确认原问题是否消失…'),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-review-repair-cancel': '', onClick: () => ops.cancelRepair() }, '取消复扫'),
      )
      : h('p', { className: 'nv-review__hint', 'data-novel-review-scanning': '', role: 'status', 'aria-live': 'polite' }, '正在审校全部场景…');
  } else if (state.status === 'error') {
    body = h('div', { className: 'nv-review__error', 'data-novel-review-error': '', role: 'alert', 'aria-live': 'assertive' },
      h('p', null, toUserMessage(state.message ?? '审校失败')),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-review-retry': '', onClick: () => ops.scan() }, '重试'),
    );
  } else {
    const projection = state.projection;
    const summary = projection?.summary;
    const issues = projection === undefined ? [] : filterReviewIssues(projection.issues, {
      categories: state.filter.categories as never,
      severities: state.filter.severities as never,
      statuses: state.filter.statuses as never,
    });
    const openHard = (projection?.issues ?? []).some((issue) => issue.severity === 'hard' && issue.status === 'open');
    const selectedHard = (projection?.issues ?? []).some((issue) => state.selected.includes(issue.id) && issue.severity === 'hard');
    const canAdjudicate = state.selected.length > 0 && !busy;
    const continueDisabled = !canAdjudicate || selectedHard;
    body = h('div', { className: 'nv-review__ready', 'data-novel-review-ready': '' },
      h('p', { className: 'nv-review__summary', 'data-novel-review-summary': '', role: 'status', 'aria-live': 'polite' },
        `共 ${summary?.total ?? 0} 项问题（硬 ${summary?.hard ?? 0} / 软 ${summary?.soft ?? 0}）：规则 ${summary?.byCategory.rule ?? 0} · 正史 ${summary?.byCategory.canon ?? 0} · 知情 ${summary?.byCategory.knowledge ?? 0} · 关系 ${summary?.byCategory.relationship ?? 0} · 风格 ${summary?.byCategory.style ?? 0}`),
      openHard
        ? h('p', { className: 'nv-review__hard-block', 'data-novel-review-hard-block': '', role: 'alert' },
          '存在未处理的硬冲突：接受将被阻止，必须重写相关正文；软警告才可显式继续。')
        : null,
      h('div', { className: 'nv-review__filters', 'data-novel-review-filters': '' },
        filterRow(h, '分类', 'categories', ['rule', 'canon', 'knowledge', 'relationship', 'style'].map((value) => ({ value, label: CATEGORY_LABELS[value] ?? value })), state.filter.categories, ops),
        filterRow(h, '严重度', 'severities', ['hard', 'soft'].map((value) => ({ value, label: SEVERITY_LABELS[value] ?? value })), state.filter.severities as readonly string[], ops),
        filterRow(h, '状态', 'statuses', ['open', 'continued', 'rewrite-requested'].map((value) => ({ value, label: STATUS_LABELS[value] ?? value })), state.filter.statuses, ops),
        h('button', { type: 'button', className: 'nv-btn', 'data-novel-review-filter-clear': '', onClick: () => ops.clearFilters() }, '清除过滤'),
      ),
      issues.length === 0
        ? h('p', { className: 'nv-review__empty', 'data-novel-review-empty': '' }, '当前过滤下没有问题。')
        : h('ul', { className: 'nv-review__issues', 'data-novel-review-issues': '' },
          issues.map((issue) => issueCard(h, projectId, issue, state.selected.includes(issue.id), ops.selectIssue, ops.repair, repairBusy, links))),
      repairSessionPanel(h, state.repairSession, ops),
      bookReadinessPanel(h, state.bookReadiness, ops, busy || state.bookReadiness.status === 'loading'),
      h('div', { className: 'nv-editor__actions' },
        h('button', {
          type: 'button',
          className: 'nv-btn nv-btn--primary',
          'data-novel-review-continue': '',
          disabled: continueDisabled,
          onClick: () => ops.adjudicate('continue'),
        }, state.acting ? '正在记录…' : '继续（记录软警告）'),
        h('button', {
          type: 'button',
          className: 'nv-btn',
          'data-novel-review-rewrite': '',
          disabled: !canAdjudicate,
          onClick: () => ops.adjudicate('rewrite-requested'),
        }, state.acting ? '正在记录…' : '请求重写'),
      ),
      state.message === undefined ? null
        : h('p', { className: 'nv-review__message', 'data-novel-review-message': '', role: 'status', 'aria-live': 'polite' }, state.message),
      state.records.length === 0 ? null
        : h('details', { className: 'nv-review__records', 'data-novel-review-records': '' },
          h('summary', { 'data-novel-review-records-summary': '' }, `审计记录（${state.records.length} 条）`),
          h('ul', null, state.records.map((record) => h('li', { key: record.issueId, 'data-novel-review-record': record.issueId },
            `${record.decision === 'continue' ? '已显式继续' : '已请求重写'} · ${record.issueId} · ${record.decidedAt}`))),
        ),
    );
  }
  return h('section', { className: 'nv-review', 'data-novel-review-panel': '', 'data-novel-review-state': state.status },
    h('h3', { className: 'nv-editor__title' }, '一致性审校中心'),
    h('p', { className: 'nv-review__hint', 'data-novel-review-desc': '' }, '集中审校规则 / 正史 / 知情 / 关系 / 风格五类问题：硬冲突阻止接受，软警告须显式继续或请求重写并记录。'),
    h('div', { className: 'nv-editor__actions' },
      h('button', { type: 'button', className: 'nv-btn nv-btn--primary', 'data-novel-review-refresh': '', disabled: busy || !available, onClick: () => ops.scan() }, busy ? '正在审校…' : '刷新审校'),
    ),
    body,
  );
}
