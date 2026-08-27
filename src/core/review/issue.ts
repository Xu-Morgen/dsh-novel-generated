import { z } from 'zod';
import { violationSeveritySchema, type ViolationSeverity } from '../validate/index.js';

/**
 * I64 一致性审校中心 —— 统一 issue 投影（design §14.9 / R13-5）。
 *
 * 五类问题（规则 rule / 正史 canon / 知情 knowledge / 关系 relationship /
 * 风格 style）统一投影为带「严重度 / 来源(kind) / 引用(references) / 正文定位
 * (location) / 裁决状态(status)」的 ReviewIssue，供 Host 审校服务与 Client
 * 审校中心消费。
 *
 * 契约与不变式：
 * - `categoryOf(kind)` 是 I21（immutable-rule / canon-conflict）、I22
 *   （knowledge-leak）、I24（relationship-drift / style-deviation）与 I20
 *   确定性 forbidden-expression 探测器 kind → 五类的唯一映射；未知 kind
 *   fail-closed（抛错，绝不静默归类）。
 * - `issueIdOf` 是依赖无关的确定性 id（双种子 djb2 64bit，无 node:crypto），
 *   同一 (category, kind, location, message, references) 恒等 —— 跨 scan 稳定
 *   锚定审计记录（core/review/ledger）与状态 join。本模块必须保持纯 zod/纯函数，
 *   不引入 node 内置模块（Client bundle 经 shared.ts 解析本文件导入图）。
 * - `projectSceneIssues` 把场景级原始违规（各探测器输出）投影为带定位的 issue，
 *   同一场景内按 id 去重；投影只含最小 owned JSON（id/分类/严重度/kind/消息/
 *   引用/定位/状态），绝不携带完整 live object。
 * - `withStatus` / `filterReviewIssues` / `summarizeReviewIssues` 是纯派生：
 *   状态 join 只读审计账本；过滤与汇总不修改投影本身。
 */

export const reviewIssueCategorySchema = z.enum(['rule', 'canon', 'knowledge', 'relationship', 'style']);
export type ReviewIssueCategory = z.infer<typeof reviewIssueCategorySchema>;

export const reviewIssueStatusSchema = z.enum(['open', 'continued', 'rewrite-requested']);
export type ReviewIssueStatus = z.infer<typeof reviewIssueStatusSchema>;

export const reviewIssueLocationSchema = z.object({
  chapterId: z.string().trim().min(1),
  sceneId: z.string().trim().min(1),
}).strict();
export type ReviewIssueLocation = z.infer<typeof reviewIssueLocationSchema>;

/** 统一投影后的单条问题（五类 × 硬/软 × 定位 × 状态）。 */
export const reviewIssueSchema = z.object({
  id: z.string().trim().min(1),
  category: reviewIssueCategorySchema,
  severity: violationSeveritySchema,
  /** 探测器 kind（来源），见 categoryOf。 */
  kind: z.string().trim().min(1),
  message: z.string().trim().min(1),
  references: z.array(z.string().trim().min(1)),
  /** 正文定位：章节/场景 id（空场景/全局问题可缺省）。 */
  location: reviewIssueLocationSchema.optional(),
  status: reviewIssueStatusSchema,
}).strict();

/** 投影后的不可变问题（引用/定位只读；投影即只读 owned JSON）。 */
export type ReviewIssue = {
  readonly id: string;
  readonly category: ReviewIssueCategory;
  readonly severity: ViolationSeverity;
  readonly kind: string;
  readonly message: string;
  readonly references: readonly string[];
  readonly location?: ReviewIssueLocation;
  readonly status: ReviewIssueStatus;
};

/** I21/I22/I24 + I20 确定性探测器的 kind → 五类问题映射（未知 kind fail-closed）。 */
export function categoryOf(kind: string): ReviewIssueCategory {
  switch (kind) {
    case 'immutable-rule': return 'rule';
    case 'canon-conflict': return 'canon';
    case 'knowledge-leak': return 'knowledge';
    case 'relationship-drift': return 'relationship';
    case 'style-deviation': return 'style';
    case 'forbidden-expression': return 'style';
    default: throw new Error(`Unknown review issue kind: ${kind}`);
  }
}

/** 32bit djb2 变体（纯函数，避免在 Client 共享导入图中引入 node:crypto）。 */
function hash32(input: string, seed: number): number {
  let hash = seed;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

/**
 * 确定性 issue id：双种子 64bit hex（`iss-` 前缀）。
 * 同一 (category, kind, location, message, references) 恒等，跨 scan 稳定，
 * 供审计账本（core/review/ledger）与状态 join 锚定。
 */
export function issueIdOf(
  category: ReviewIssueCategory,
  kind: string,
  location: ReviewIssueLocation | undefined,
  message: string,
  references: readonly string[],
): string {
  const key = [category, kind, location?.chapterId ?? '-', location?.sceneId ?? '-', message, references.join(',')].join('|');
  const a = hash32(key, 5381).toString(16).padStart(8, '0');
  const b = hash32(key, 52711).toString(16).padStart(8, '0');
  return `iss-${a}${b}`;
}

/** 探测器原始违规的通用投影输入（kind/severity/message/references）。 */
export interface SceneViolation {
  readonly kind: string;
  readonly severity: ViolationSeverity;
  readonly message: string;
  readonly references: readonly string[];
}

/**
 * 把场景级原始违规投影为带正文定位的 ReviewIssue（status 恒为 open，
 * 状态 join 由 `withStatus` 依据审计账本完成）。同一场景内同 id 去重。
 */
export function projectSceneIssues(
  chapterId: string,
  sceneId: string,
  violations: readonly SceneViolation[],
): readonly ReviewIssue[] {
  const location: ReviewIssueLocation = Object.freeze({ chapterId, sceneId });
  const seen = new Set<string>();
  const issues: ReviewIssue[] = [];
  for (const violation of violations) {
    const category = categoryOf(violation.kind);
    const id = issueIdOf(category, violation.kind, location, violation.message, violation.references);
    if (seen.has(id)) continue;
    seen.add(id);
    issues.push(Object.freeze({
      id,
      category,
      severity: violation.severity,
      kind: violation.kind,
      message: violation.message,
      references: Object.freeze([...violation.references]),
      location,
      status: 'open',
    }));
  }
  return Object.freeze(issues);
}

/** 汇总：总数 / 硬 / 软 / 五类计数（纯派生，不含 live object）。 */
export interface ReviewSummary {
  readonly total: number;
  readonly hard: number;
  readonly soft: number;
  readonly byCategory: Readonly<Record<ReviewIssueCategory, number>>;
}

export function summarizeReviewIssues(issues: readonly ReviewIssue[]): ReviewSummary {
  const byCategory: Record<ReviewIssueCategory, number> = { rule: 0, canon: 0, knowledge: 0, relationship: 0, style: 0 };
  let hard = 0;
  let soft = 0;
  for (const issue of issues) {
    byCategory[issue.category] += 1;
    if (issue.severity === 'hard') hard += 1;
    else soft += 1;
  }
  return Object.freeze({
    total: issues.length,
    hard,
    soft,
    byCategory: Object.freeze(byCategory),
  });
}

/** 状态 join：审计账本中的最新裁决映射为 issue.status（无记录 → open）。 */
export function withStatus(
  issue: ReviewIssue,
  decision: 'continue' | 'rewrite-requested' | undefined,
): ReviewIssue {
  const status: ReviewIssueStatus = decision === 'continue'
    ? 'continued'
    : decision === 'rewrite-requested'
      ? 'rewrite-requested'
      : 'open';
  return Object.freeze({ ...issue, status });
}

/** 一次全项目审校扫描的投影：问题列表 + 汇总（最小 owned JSON，无 live object）。 */
export interface ReviewProjection {
  readonly projectId: string;
  readonly scannedAt: string;
  readonly issues: readonly ReviewIssue[];
  readonly summary: ReviewSummary;
}

/** 审校中心过滤条件：任一维度为空数组表示不过滤该维度；全空 = 返回全部。 */
export interface ReviewIssueFilter {
  readonly categories?: readonly ReviewIssueCategory[];
  readonly severities?: readonly ViolationSeverity[];
  readonly statuses?: readonly ReviewIssueStatus[];
}

/** 纯过滤（Client 审校中心与 Host 共用；只读投影，不修改原数组）。 */
export function filterReviewIssues(issues: readonly ReviewIssue[], filter: ReviewIssueFilter): readonly ReviewIssue[] {
  const categories = new Set(filter.categories ?? []);
  const severities = new Set(filter.severities ?? []);
  const statuses = new Set(filter.statuses ?? []);
  if (categories.size === 0 && severities.size === 0 && statuses.size === 0) return issues;
  return Object.freeze(issues.filter((issue) =>
    (categories.size === 0 || categories.has(issue.category)) &&
    (severities.size === 0 || severities.has(issue.severity)) &&
    (statuses.size === 0 || statuses.has(issue.status))));
}
