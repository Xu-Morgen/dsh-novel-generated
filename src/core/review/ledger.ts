import { access, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { readYaml, writeYaml } from '../io/yaml.js';

export const reviewDecisionSchema = z.enum(['continue', 'rewrite-requested']);
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

export const reviewAuditRecordSchema = z.object({
  projectId: z.string().trim().min(1),
  issueId: z.string().trim().min(1),
  decision: reviewDecisionSchema,
  decidedAt: z.string().datetime(),
}).strict();
export type ReviewAuditRecord = z.infer<typeof reviewAuditRecordSchema>;

const reviewAuditFileSchema = z.object({ records: z.array(reviewAuditRecordSchema) }).strict();

export type ReviewRecordApplication =
  | { readonly kind: 'applied' }
  | { readonly kind: 'duplicate' };

/**
 * I64 软警告显式裁决审计账本（design §14.9「一致性审校中心」/ R13-5）。
 *
 * 「软警告必须显式继续或重写并记录」的持久化记录：每个 project 一个
 * `review-audit.yaml`（与 lifecycle-journal 同模式）。
 *
 * 契约与不变式：
 * - 每个 issueId 至多一条记录：同裁决重复提交返回 `duplicate`（双击幂等，
 *   消费方不重复写）；换裁决则更新为该 issue 的最新裁决（decidedAt 刷新）。
 * - 账本只记录裁决（projectId → issueId → decision + 时间），不持有正文/层对象
 *   —— 无完整 live object 序列化；issueId 由 core/review/issue 的确定性投影
 *   生成，跨 scan 稳定锚定。
 * - 硬/软策略不在本账本判定：硬冲突不得 `continue` 由审校服务按投影严重度
 *   fail-closed 拦截（§14.9 硬冲突阻止 accept），账本只忠实记录合法裁决。
 */
export class ReviewAuditJournal {
  private constructor(private readonly path: string, private records: ReviewAuditRecord[]) {}

  static async open(projectDirectory: string): Promise<ReviewAuditJournal> {
    const path = join(projectDirectory, 'review-audit.yaml');
    try {
      await access(path);
      return new ReviewAuditJournal(path, reviewAuditFileSchema.parse(await readYaml<unknown>(path)).records);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return new ReviewAuditJournal(path, []);
    }
  }

  /** 项目内全部审计记录（只读副本；顺序即记录顺序）。 */
  list(projectId: string): readonly ReviewAuditRecord[] {
    return this.records
      .filter((record) => record.projectId === projectId)
      .map((record) => Object.freeze({ ...record }));
  }

  /** 某 issue 的最新裁决（无记录返回 undefined）。 */
  decisionOf(projectId: string, issueId: string): ReviewDecision | undefined {
    return this.records.find((record) => record.projectId === projectId && record.issueId === issueId)?.decision;
  }

  /**
   * 记录一次显式裁决。同裁决重复 → duplicate（幂等）；换裁决 → 更新为该 issue
   * 最新裁决。写入走 tmp+rename 原子替换（与 lifecycle-journal 同模式）。
   */
  async record(projectId: string, issueId: string, decision: ReviewDecision, now: () => string = () => new Date().toISOString()): Promise<ReviewRecordApplication> {
    const existing = this.records.find((record) => record.projectId === projectId && record.issueId === issueId);
    if (existing !== undefined && existing.decision === decision) return { kind: 'duplicate' };
    const next: ReviewAuditRecord = { projectId, issueId, decision, decidedAt: now() };
    await this.replace(existing === undefined
      ? [...this.records, next]
      : this.records.map((record) => record === existing ? next : record));
    return { kind: 'applied' };
  }

  private async replace(records: ReviewAuditRecord[]): Promise<void> {
    const next = reviewAuditFileSchema.parse({ records });
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.tmp`;
    await writeYaml(temporary, next);
    await rename(temporary, this.path);
    this.records = next.records;
  }
}
