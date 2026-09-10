import { z } from 'zod';
import { ruleKindSchema } from '../core/schema/rules.js';

/** I218 bounded failure projection: never copy rejected model values into diagnostics; checkpoint error is capped at 4000. */
export function ruleStyleFailureMessage(cause: unknown): string {
  if (cause instanceof z.ZodError) {
    const invalidKinds = cause.issues.filter(issue => issue.path[0] === 'rules' && issue.path[2] === 'kind');
    if (invalidKinds.length > 0) {
      const positions = invalidKinds.slice(0, 12).map(issue => `第 ${Number(issue.path[1]) + 1} 条`).join('、');
      return `规则与文风返回格式校验失败：${positions}规则的 kind 分类不合法${invalidKinds.length > 12 ? '（另有更多同类错误）' : ''}。kind 只允许 ${ruleKindSchema.options.join('、')}。未写入规则与文风，请点击“重试同一初始化任务”。`;
    }
    return `规则与文风返回格式校验失败，共 ${cause.issues.length} 项结构错误。未写入规则与文风，请点击“重试同一初始化任务”；具体模型返回可在 AI 过程与错误窗口查看。`;
  }
  const message = cause instanceof Error ? cause.message : '规则与文风生成失败，请重试。';
  return message.length > 3900 ? `${message.slice(0, 3900)}…（错误详情过长，已截断）` : message || '规则与文风生成失败，请重试。';
}
