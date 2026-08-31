import type { ReviewIssue } from '../../core/review/issue.js';
import type { TextAnchor } from '../../core/schema/link.js';

export interface ReviewRepairPromptInput {
  readonly issue: ReviewIssue;
  readonly prose: string;
  readonly anchor?: TextAnchor;
  readonly instruction?: string;
}

/**
 * I128 审校修复提示词（设计 §14.14.2 / R18-3a）。
 *
 * 只把 Host 已验证的 issue 证据和当前 C5 正文交给既有候选生产器；输出
 * 被明确限定为完整场景正文，便于复用 `writing` 的 rewrite candidate 合同。
 */
export function buildReviewRepairPrompt(input: ReviewRepairPromptInput): string {
  if (input.prose.trim().length === 0) throw new Error('审校修复正文不能为空');
  if (input.instruction !== undefined && input.instruction.trim().length === 0) throw new Error('审校修复指令不能为空');
  const anchor = input.anchor === undefined
    ? '正文范围：仅能确认到当前场景，不能伪造字符范围。'
    : `精确范围（UTF-16 半开区间）：[${input.anchor.start}, ${input.anchor.end})\n原文引文：${input.anchor.quote}`;
  return [
    '你是小说审校修复器。只输出修复后的完整场景正文，不要标题、解释、Markdown、JSON、文件操作或确认结果。',
    `问题指纹：${input.issue.provenance?.issueFingerprint ?? input.issue.id}`,
    `问题类别：${input.issue.category}；严重度：${input.issue.severity}；检测器：${input.issue.kind}`,
    `问题说明：${input.issue.message}`,
    `证据引用：${input.issue.references.length === 0 ? '无' : input.issue.references.join('、')}`,
    anchor,
    input.instruction === undefined ? '作者补充要求：无。' : `作者补充要求：${input.instruction}`,
    '当前完整场景正文：',
    input.prose,
    '请修复问题并保留未涉及的叙事信息。',
  ].join('\n');
}
