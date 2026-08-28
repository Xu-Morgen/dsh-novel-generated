import type { InvocationParameterDescriptor, TypertCodec } from '@deepseek-ai/dsh-typert-protocol';
import { z } from 'zod';
import { strictCodec, stringCodec } from './common.js';
import { param, remoteContribution, remoteInvocation } from './shared.js';
// I77：wire schema 从 core schema 派生（架构审查 §6.3/§9#3，沿用 timeline/editor
// 直接复用先例）—— 不再在 wire 层手写第四份投影声明。以下 core 模块都是纯
// zod/纯函数（Client bundle 经 shared.ts 解析本文件完整导入图可安全入图；
// core/review/ledger 依赖 node:fs 不得入图，其决策/审计记录合同已迁到 issue.ts）。
import {
  reviewAuditRecordSchema,
  reviewDecisionSchema,
  reviewIssueCategorySchema,
  reviewIssueSchema,
  reviewIssueStatusSchema,
  reviewProjectionSchema,
  reviewSummarySchema,
} from '../../core/review/issue.js';
import { violationSeveritySchema } from '../../core/validate/index.js';

/**
 * I64 一致性审校中心 Remote（design §14.9 / R13-5）。
 *
 * `novelReview` 是 Client 审校中心的唯一读写面：
 * - `scan`：全项目五类问题投影（规则/正史/知情/关系/风格 × 严重度 × 引用 ×
 *   正文定位 × 状态；零写，状态经审计账本 join）；
 * - `adjudicate`：唯一软警告裁决入口（continue 显式继续 / rewrite-requested
 *   显式请求重写，必须记录；硬冲突阻止 continue/accept）；
 * - `records`：审计记录只读列表（服务返回裸数组，wire 契约即裸数组，组合根
 *   不再整形 —— I77 修复审查 §8#1 的补丁，契约漂移在类型层暴露）。
 *
 * 不变式：所有参数/结果都是最小 owned JSON；Client 不持有任何领域真相与文件
 * 路径。wire 形状以 core/review/issue 的 schema 为单一来源（strict），由 Host
 * 服务端再经 core 合同严格复验。
 */
export const reviewIssueCategoryWireSchema = reviewIssueCategorySchema;
export const reviewIssueSeverityWireSchema = violationSeveritySchema;
export const reviewIssueStatusWireSchema = reviewIssueStatusSchema;

export const reviewIssueWireSchema = reviewIssueSchema;
export const reviewSummaryWireSchema = reviewSummarySchema;
export const reviewProjectionWireSchema = reviewProjectionSchema;
export const reviewAuditRecordWireSchema = reviewAuditRecordSchema;

const reviewDecisionWireSchema = reviewDecisionSchema;

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

// I75：`param`/`reviewInvocation` 统一到 shared 接线层（见架构审查 §6.3/§9#1）。
// I91：helper 泛型透传（不标注 `: InvocationDescriptor` 返回类型），否则幻影类型被扩宽抹掉。
const reviewInvocation = <const M extends string, const P extends readonly InvocationParameterDescriptor[], const R extends TypertCodec>(
  method: M,
  parameters: P,
  resultSchema: R,
) => remoteInvocation('novelReview', method, parameters, resultSchema);

export const reviewScanInvocation = reviewInvocation('scan', [
  param('projectId', stringCodec),
  param('settings', undefined, true),
], strictCodec('novel-creation-tool#novelReview:scan', reviewProjectionWireSchema));
export const reviewAdjudicateInvocation = reviewInvocation('adjudicate', [
  param('projectId', stringCodec),
  param('input', strictCodec('novel-creation-tool#novelReview:adjudicateInput', reviewAdjudicateInputSchema)),
], strictCodec('novel-creation-tool#novelReview:adjudicate', reviewAdjudicateOutcomeSchema));
// I77：wire 契约与领域服务返回语义一致 —— records 返回裸数组（服务层
// `records()` 的既有消费者夹具契约），组合根不再包 envelope（审查 §8#1）。
export const reviewRecordsInvocation = reviewInvocation('records', [
  param('projectId', stringCodec),
], strictCodec('novel-creation-tool#novelReview:records', z.array(reviewAuditRecordWireSchema)));

export const reviewInvocations = [reviewScanInvocation, reviewAdjudicateInvocation, reviewRecordsInvocation] as const;
// 每个 Client 挂载贡献必须携带唯一 `package`（见 editor.ts 注释）。
// I91：不标注 `: TypertRemoteContribution` —— 保留 descriptor 元素类型供 Client 派生 namespace。
export const reviewRemoteContribution = remoteContribution('novel-creation-tool-review', reviewInvocations);
