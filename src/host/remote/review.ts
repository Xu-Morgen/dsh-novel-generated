import type { InvocationDescriptor, InvocationParameterDescriptor, TypertCodec, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';

/**
 * I64 一致性审校中心 Remote（design §14.9 / R13-5）。
 *
 * `novelReview` 是 Client 审校中心的唯一读写面：
 * - `scan`：全项目五类问题投影（规则/正史/知情/关系/风格 × 严重度 × 引用 ×
 *   正文定位 × 状态；零写，状态经审计账本 join）；
 * - `adjudicate`：唯一软警告裁决入口（continue 显式继续 / rewrite-requested
 *   显式请求重写，必须记录；硬冲突阻止 continue/accept）；
 * - `records`：审计记录只读列表。
 *
 * 不变式：所有参数/结果都是最小 owned JSON；Client 不持有任何领域真相与文件
 * 路径。本模块只依赖 zod 与纯 schema（Client bundle 会经 shared.ts 解析本文件
 * 完整导入图；core/review/ledger 依赖 node:fs，不得入图）。wire 形状与
 * core/review/issue 投影对齐（strict），由 Host 服务端再经 core 合同严格复验。
 */
export const reviewIssueCategoryWireSchema = z.enum(['rule', 'canon', 'knowledge', 'relationship', 'style']);
export const reviewIssueSeverityWireSchema = z.enum(['hard', 'soft']);
export const reviewIssueStatusWireSchema = z.enum(['open', 'continued', 'rewrite-requested']);

export const reviewIssueWireSchema = z.object({
  id: z.string().min(1),
  category: reviewIssueCategoryWireSchema,
  severity: reviewIssueSeverityWireSchema,
  kind: z.string().min(1),
  message: z.string().min(1),
  references: z.array(z.string().min(1)),
  location: z.object({ chapterId: z.string().min(1), sceneId: z.string().min(1) }).strict().optional(),
  status: reviewIssueStatusWireSchema,
}).strict();

export const reviewSummaryWireSchema = z.object({
  total: z.number().int().nonnegative(),
  hard: z.number().int().nonnegative(),
  soft: z.number().int().nonnegative(),
  byCategory: z.object({
    rule: z.number().int().nonnegative(),
    canon: z.number().int().nonnegative(),
    knowledge: z.number().int().nonnegative(),
    relationship: z.number().int().nonnegative(),
    style: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const reviewProjectionWireSchema = z.object({
  projectId: z.string().min(1),
  scannedAt: z.string().datetime(),
  issues: z.array(reviewIssueWireSchema),
  summary: reviewSummaryWireSchema,
}).strict();

export const reviewAuditRecordWireSchema = z.object({
  projectId: z.string().min(1),
  issueId: z.string().min(1),
  decision: z.enum(['continue', 'rewrite-requested']),
  decidedAt: z.string().datetime(),
}).strict();

const reviewDecisionWireSchema = z.enum(['continue', 'rewrite-requested']);

const reviewAdjudicateInputSchema = z.object({
  decision: reviewDecisionWireSchema,
  issueIds: z.array(z.string().min(1)).min(1),
}).strict();
export type ReviewAdjudicateInputShape = z.infer<typeof reviewAdjudicateInputSchema>;

const reviewAdjudicateOutcomeSchema = z.object({
  projectId: z.string().min(1),
  decision: reviewDecisionWireSchema,
  applied: z.array(z.string().min(1)),
  duplicate: z.array(z.string().min(1)),
  records: z.array(reviewAuditRecordWireSchema),
  projection: reviewProjectionWireSchema,
}).strict();

const param = (name: string, codec: TypertCodec = strictCodec('novel-creation-tool#json', z.unknown()), optional = false): InvocationParameterDescriptor =>
  ({ name, wire: name, source: 'json', codec, ...(optional ? { acceptsUndefined: true } : {}) });

function reviewInvocation(method: string, parameters: readonly InvocationParameterDescriptor[], resultSchema: TypertCodec): InvocationDescriptor {
  return { id: `novel-creation-tool/novelReview/${method}`, service: 'novelReview', namespace: 'novelReview', method, invocation: { kind: 'direct' }, parameters, result: resultSchema };
}

export const reviewScanInvocation = reviewInvocation('scan', [
  param('projectId', stringCodec),
  param('settings', undefined, true),
], strictCodec('novel-creation-tool#novelReview:scan', reviewProjectionWireSchema));
export const reviewAdjudicateInvocation = reviewInvocation('adjudicate', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelReview:adjudicateInput', reviewAdjudicateInputSchema)),
], strictCodec('novel-creation-tool#novelReview:adjudicate', reviewAdjudicateOutcomeSchema));
export const reviewRecordsInvocation = reviewInvocation('records', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelReview:records', z.object({ records: z.array(reviewAuditRecordWireSchema) }).strict()));

export const reviewInvocations = [reviewScanInvocation, reviewAdjudicateInvocation, reviewRecordsInvocation] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
export const reviewRemoteContribution: TypertRemoteContribution = { package: 'novel-creation-tool-review', descriptors: [...reviewInvocations] };
