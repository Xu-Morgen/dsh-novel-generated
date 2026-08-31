import type { El } from './shared.js';

/**
 * I132 作者表现层词典与错误映射（R18-7）。
 *
 * 作者面板只接受本模块输出的可行动文案；Host 的原始错误仍在调用边界
 * 被消费，但不会把 Remote、fingerprint、schema 等实现细节泄漏到普通路径。
 * 纯中文业务错误保留原文，避免丢失既有领域提示；命中工程模式时统一降级
 * 为下一步明确的作者动作。技术详情若由高级诊断面展示，仍应使用 rawError。
 */

/** I132 机器扫描使用的作者可见工程术语；合同字段与 data 锚点不在扫描范围。 */
export const AUTHOR_VISIBLE_TERM_DENYLIST = Object.freeze([
  'Remote', 'Host', 'Client', 'LLM', 'API', 'JSON', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6',
  'I11', 'I113', 'I131', 'sourceHash', 'baseHash', 'fingerprint', 'proposalId', 'candidateId', 'chapterId', 'sceneId', 'projectId',
  'maxTokens', 'Thinking Mode', 'Effort', 'operationId', 'outline-only', 'checkpoint',
]);

/** 返回原始错误，供高级诊断视图使用；普通作者面板不得直接展示它。 */
export function rawError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  try { return JSON.stringify(cause); } catch { return String(cause); }
}

/**
 * 将 Host/Remote 的错误映射为作者可行动语言。
 * 已经是作者语言的业务提示原样保留，未知空错误使用稳定兜底，避免出现
 * `[object Object]` 或空 alert。
 */
export function toUserMessage(cause: unknown, fallback = '操作未完成，请重试。'): string {
  const message = rawError(cause).trim();
  if (message === '') return fallback;
  if (/stale|sourceHash|baseHash|fingerprint|expectedFingerprint/i.test(message)) return '内容已发生变化，请刷新后再试。';
  if (/unknown (project|chapter|scene|branch)|not open|not found|cross[- ]project|不存在当前作品/i.test(message)) return '找不到对应内容，请刷新后再试。';
  if (/remote|host|schema|codec|invalid .*result|invalid input|expected .*received|rejected .*result|malformed json|gateway|六层候选契约/i.test(message)) return '创作服务返回了无法使用的内容，请重试。';
  if (/network|timeout|timed out|fetch|provider|backend|connection/i.test(message)) return '暂时无法连接创作服务，请稍后重试。';
  if (/^[\[{]/.test(message) || /[A-Za-z]{4,}/.test(message)) return fallback;
  return message;
}

/**
 * 在作者主路径显示可行动文案，同时把原始技术信息放入显式高级视图。
 * 该结构不改变任何 `data-novel-*` 锚点，普通作者不必理解内部标识即可继续操作。
 */
export function advancedError(h: El, cause: unknown, fallback?: string, alertProps?: Record<string, unknown>): unknown {
  const raw = rawError(cause).trim();
  return h('div', { className: 'nv-advanced-error', 'data-novel-advanced-error': '' },
    h('p', { className: 'nv-editor__error', role: 'alert', ...alertProps }, toUserMessage(cause, fallback)),
    raw === '' ? null : h('details', { className: 'nv-advanced-details', 'data-novel-advanced-view': '' },
      h('summary', null, '查看技术详情'),
      h('pre', { className: 'nv-advanced-details__content' }, raw),
    ),
  );
}

/** 将内部标识留给高级视图，避免正文面板把工程编号当成作者语言。 */
export function advancedReference(h: El, label: string, value: string): unknown {
  return h('details', { className: 'nv-advanced-details', 'data-novel-advanced-view': '' },
    h('summary', null, label),
    h('code', null, value),
  );
}

/** 表单/加载/完成等稳定状态的公共作者词汇，供面板复用。 */
export const AUTHOR_STATUS_TEXT = Object.freeze({
  loading: '正在处理…',
  retry: '重试',
  unavailable: '此功能暂时不可用。',
  empty: '这里还没有内容。',
  saved: '已保存',
});
