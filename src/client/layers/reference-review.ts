import type { ReferenceAuditNamespace } from '../shared.js';
import type { ReferenceAuditOwner, ReferenceAuditRecord, ReferenceAuditStatus, ReferenceAuditListResult } from '../../core/schema/reference-audit.js';
import type { El } from '../shared.js';

/** I117 Client 审查视图状态；标记只属于本地审查会话，不是叙事层命令。 */
export interface ReferenceReviewLayerState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly records: readonly ReferenceAuditRecord[];
  readonly owner: ReferenceAuditOwner | 'all';
  readonly recordStatus: ReferenceAuditStatus | 'all';
  readonly nextCursor: string | null;
  readonly markedErrors: readonly string[];
  readonly message?: string;
}

export interface ReferenceReviewEditOps {
  refresh(): void;
  loadMore(): void;
  setOwner(owner: ReferenceAuditOwner | 'all'): void;
  setStatus(status: ReferenceAuditStatus | 'all'): void;
  clearFilters(): void;
  toggleError(recordId: string): void;
  dismiss(): void;
}

export const REFERENCE_AUDIT_OWNERS: readonly ReferenceAuditOwner[] = ['c1', 'c3', 'c4'];
export const REFERENCE_AUDIT_STATUSES: readonly ReferenceAuditStatus[] = ['pending', 'applied', 'failed'];

export function freshReferenceReview(): ReferenceReviewLayerState {
  return { status: 'idle', records: [], owner: 'all', recordStatus: 'all', nextCursor: null, markedErrors: [] };
}

const OWNER_LABEL: Record<ReferenceAuditOwner, string> = { c1: '关系（C1）', c3: '知情（C3）', c4: '正史（C4）' };
const STATUS_LABEL: Record<ReferenceAuditStatus, string> = { pending: '待处理', applied: '已应用', failed: '失败' };
function sourceLabel(source: ReferenceAuditRecord['source']): string {
  return source.kind === 'candidate-accept' ? '候选接受' : '重解析接受';
}

function recordMatches(record: ReferenceAuditRecord, state: ReferenceReviewLayerState): boolean {
  return (state.recordStatus === 'all' || record.status === state.recordStatus)
    && (state.owner === 'all' || record.targets.some((target) => target.owner === state.owner));
}

function targetText(target: ReferenceAuditRecord['targets'][number]): string {
  const hashes = [target.beforeHash === undefined ? '' : `前 ${target.beforeHash.slice(0, 8)}`, target.afterHash === undefined ? '' : `后 ${target.afterHash.slice(0, 8)}`]
    .filter((item) => item.length > 0).join(' / ');
  return `${OWNER_LABEL[target.owner]} · ${target.field} · ${target.entityId}（${hashes}）`;
}

/**
 * Read-only audit projection. The only action beside filters is a session-local
 * error flag; it deliberately has no Remote write counterpart (plan I117).
 */
export function referenceReviewPanel(
  h: El,
  projectId: string,
  namespace: ReferenceAuditNamespace | undefined,
  state: ReferenceReviewLayerState,
  ops: ReferenceReviewEditOps,
): unknown {
  if (namespace === undefined) {
    return h('section', { className: 'nv-panel', 'data-novel-reference-review-panel': '', 'data-novel-reference-review-state': 'error', role: 'alert' }, '引用审查服务不可用（novelReferenceAudit Remote 未挂载）。');
  }
  const records = state.records.filter((record) => recordMatches(record, state));
  return h('section', { className: 'nv-panel nv-reference-review', 'data-novel-reference-review-panel': '', 'data-novel-reference-review-state': state.status },
    h('div', { className: 'nv-panel__header' },
      h('div', null,
        h('h2', { className: 'nv-panel__title' }, '引用更新审查'),
        h('p', { className: 'nv-panel__hint' }, '查看自动更新的 C1/C3/C4 证据；标记仅供本次审查，不能直接修改叙事层。'),
      ),
      h('button', { type: 'button', className: 'nv-btn', 'data-novel-reference-audit-refresh': '', onClick: ops.refresh, disabled: state.status === 'loading' }, '刷新审查记录'),
    ),
    h('div', { className: 'nv-reference-review__filters', 'data-novel-reference-audit-filters': '' },
      h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '按层筛选'), h('select', {
        className: 'nv-field__input', value: state.owner, 'aria-label': '按层筛选', 'data-novel-reference-audit-owner-filter': '',
        onChange: (event: { target: { value: string } }) => ops.setOwner(event.target.value as ReferenceAuditOwner | 'all'),
      }, h('option', { value: 'all' }, '全部层'), REFERENCE_AUDIT_OWNERS.map((owner) => h('option', { key: owner, value: owner }, OWNER_LABEL[owner])))),
      h('label', { className: 'nv-field' }, h('span', { className: 'nv-field__label' }, '按状态筛选'), h('select', {
        className: 'nv-field__input', value: state.recordStatus, 'aria-label': '按状态筛选', 'data-novel-reference-audit-status-filter': '',
        onChange: (event: { target: { value: string } }) => ops.setStatus(event.target.value as ReferenceAuditStatus | 'all'),
      }, h('option', { value: 'all' }, '全部状态'), REFERENCE_AUDIT_STATUSES.map((status) => h('option', { key: status, value: status }, STATUS_LABEL[status])))),
      h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-reference-audit-clear-filters': '', onClick: ops.clearFilters }, '清除筛选'),
    ),
    state.status === 'idle' ? h('p', { className: 'nv-outline__nodetail', 'data-novel-reference-audit-empty': '' }, '尚未读取引用审查记录。') : null,
    state.status === 'loading' ? h('p', { className: 'nv-panel__hint', 'data-novel-reference-audit-loading': '', role: 'status' }, '正在读取引用审查记录…') : null,
    state.status === 'error' ? h('p', { className: 'nv-editor__error', 'data-novel-reference-audit-error': '', role: 'alert' }, state.message ?? '引用审查记录读取失败') : null,
    state.status === 'ready' && records.length === 0 ? h('p', { className: 'nv-outline__nodetail', 'data-novel-reference-audit-no-match': '' }, '当前筛选没有记录。') : null,
    h('div', { className: 'nv-reference-review__records', 'data-novel-reference-audit-records': '', role: 'list' }, records.map((record) => {
      const marked = state.markedErrors.includes(record.recordId);
      return h('article', { key: record.recordId, className: `nv-reference-review__record${marked ? ' is-marked' : ''}`, 'data-novel-reference-audit-record': record.recordId, role: 'listitem' },
        h('div', { className: 'nv-reference-review__record-header' },
          h('strong', null, `${sourceLabel(record.source)} · ${STATUS_LABEL[record.status]}`),
          h('span', { className: 'nv-reference-review__record-id' }, record.recordId),
        ),
        h('p', { className: 'nv-reference-review__record-meta' }, `操作 ${record.operationId} · 尝试 ${record.attempt}`),
        record.error === undefined ? null : h('p', { className: 'nv-editor__error', role: 'alert' }, record.error),
        h('ul', { className: 'nv-reference-review__targets' }, record.targets.map((target) => h('li', { key: `${record.recordId}:${target.owner}:${target.entityId}:${target.field}`, 'data-novel-reference-audit-target': `${target.owner}:${target.entityId}:${target.field}` }, targetText(target)))),
        h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-reference-audit-mark-error': record.recordId, 'aria-pressed': marked, onClick: () => ops.toggleError(record.recordId) }, marked ? '取消错误标记' : '标记为需检查'),
      );
    })),
    state.nextCursor === null ? null : h('button', { type: 'button', className: 'nv-btn', 'data-novel-reference-audit-load-more': '', onClick: ops.loadMore, disabled: state.status === 'loading' }, '加载更多'),
    state.status !== 'idle' ? h('button', { type: 'button', className: 'nv-btn nv-btn--ghost', 'data-novel-reference-audit-dismiss': '', onClick: ops.dismiss }, '清空本地审查视图') : null,
    h('small', { className: 'nv-panel__hint', 'data-novel-reference-audit-project': projectId }, '记录来自 Host operational audit；此面板不执行引用修正写回。'),
  );
}

/** Narrow result guard at the Client boundary; Host Remote has already validated the schema. */
export function asReferenceAuditListResult(value: unknown): ReferenceAuditListResult {
  return value as ReferenceAuditListResult;
}
