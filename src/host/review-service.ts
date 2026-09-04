import { homedir } from 'node:os';
import { join } from 'node:path';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { detectForbiddenExpressions } from '../core/validate/index.js';
import { createTextAnchor } from '../core/schema/link.js';
import { findTextOccurrences } from '../core/link/index.js';
import { textContentHash } from '../core/text/index.js';
import {
  projectSceneIssues,
  summarizeReviewIssues,
  withStatus,
  type ReviewIssue,
  type ReviewProjection,
  type SceneViolation,
} from '../core/review/issue.js';
import {
  ReviewAuditJournal,
  reviewDecisionSchema,
  type ReviewAuditRecord,
  type ReviewDecision,
} from '../core/review/ledger.js';
import type { NovelTextService } from './text-service.js';
import type { NovelRuleService } from './rule-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelStyleService } from './style-service.js';
import type { NovelConsistencyDetectionService } from './consistency-detection-service.js';
import type { NovelKnowledgeLeakDetectionService } from './knowledge-leak-detection-service.js';
import type { NovelRelationshipStyleDetectionService } from './relationship-style-detection-service.js';
import type { GenerationSettings } from '../llm/port/index.js';

/**
 * I64 一致性审校中心 Host owner（design §14.9「一致性审校中心」/ R13-5）。
 *
 * 统一呈现规则 / 正史 / 知情 / 关系 / 风格五类问题及其正文定位，形成可执行
 * 审校流程。产品语义：
 * - `scan`：对项目全部 C5 场景跑既有探测器（I21 规则/正史硬约束 + I22 POV
 *   知情硬约束 + I24 关系/风格软约束 + I20 确定性 forbidden-expression），
 *   把原始违规投影为带严重度/来源(kind)/引用/正文定位的 ReviewIssue
 *   （core/review/issue，状态经审计账本 join）。只返回最小 owned JSON，
 *   绝不序列化完整 live object。空场景零正文零检测（不发无效 LLM 调用）。
 * - `adjudicate`：唯一软警告裁决入口 —— `continue`（显式继续）或
 *   `rewrite-requested`（显式请求重写）都必须记录到持久审计账本
 *   （review-audit.yaml）。硬冲突**阻止** continue/accept：所选 issue 含任何
 *   硬项时 fail-closed 抛错（零写）；硬问题只能请求重写。重复同裁决幂等
 *   （duplicate 不重写）。裁决前必须已有 scan（lastScans 缓存；刷新丢失即
 *   fail-closed，避免 Client 携带的陈旧/伪造 issue 获得裁决权）。
 * - `records`：审计记录只读列表（展示「已记录」证据）。
 * - 本服务复用既有探测器与 I20 判定（探测器输出 severity 即唯一严重度来源，
 *   不新增第二裁决器）；所有 LLM 副作用归属当前 Fiber（onDispose 中止在飞
 *   请求）。
 */

export interface ReviewServiceDeps {
  readonly llm: unknown;
  readonly projectsRoot?: string;
  readonly onDispose?: (dispose: () => void) => void;
  readonly text: NovelTextService;
  readonly rules: NovelRuleService;
  readonly canon: NovelCanonService;
  readonly knowledge: NovelKnowledgeService;
  readonly relationship: NovelRelationshipService;
  readonly style: NovelStyleService;
  readonly consistency: NovelConsistencyDetectionService;
  readonly knowledgeLeak: NovelKnowledgeLeakDetectionService;
  readonly relationshipStyle: NovelRelationshipStyleDetectionService;
  /** A2 生成设置解析（Client 不传 settings 时惰性解析，与 I63 同 owner）。 */
  readonly resolveSettings: () => Promise<GenerationSettings>;
}

export interface NovelReviewService {
  /** 全项目五类问题投影（复用 I21/I22/I24 + I20；状态 join 审计账本；只读零写）。 */
  scan(projectId: string, settings?: unknown, signal?: AbortSignal): Promise<ReviewProjection>;
  /** 唯一软警告裁决入口：continue / rewrite-requested 必须记录；硬冲突阻止 continue。 */
  adjudicate(
    projectId: string,
    decision: ReviewDecision,
    issueIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<ReviewAdjudicationOutcome>;
  /** 审计记录只读列表。 */
  records(projectId: string): Promise<readonly ReviewAuditRecord[]>;
  /** Host-only latest-scan lookup; client payloads never define the repair target. */
  current(projectId: string, issueId: string): ReviewIssue;
}

export interface ReviewAdjudicationOutcome {
  readonly projectId: string;
  readonly decision: ReviewDecision;
  readonly applied: readonly string[];
  readonly duplicate: readonly string[];
  readonly records: readonly ReviewAuditRecord[];
  /** 裁决后刷新状态的投影（无需重跑探测器）。 */
  readonly projection: ReviewProjection;
}

export function createReviewService(deps: ReviewServiceDeps): NovelReviewService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const journals = new Map<string, ReviewAuditJournal>();
  const lastScans = new Map<string, ReviewProjection>();
  const active = new Set<AbortController>();
  const dispose = () => {
    for (const controller of active) controller.abort();
    active.clear();
  };
  deps.onDispose?.(dispose);

  const journalOf = async (projectId: string): Promise<ReviewAuditJournal> => {
    validateProjectId(projectId);
    let journal = journals.get(projectId);
    if (journal === undefined) {
      journal = await ReviewAuditJournal.open(projectDirectory(projectsRoot, projectId));
      journals.set(projectId, journal);
    }
    return journal;
  };

  /** 审计账本最新裁决 join 到投影状态（纯派生）。 */
  const joinStatuses = (issues: readonly ReviewIssue[], records: readonly ReviewAuditRecord[]): readonly ReviewIssue[] =>
    Object.freeze(issues.map((issue) => withStatus(issue, records.find((record) => record.issueId === issue.id)?.decision)));

  /** 全项目场景检测：逐章逐场景跑既有探测器（复用 I21/I22/I24 + I20 确定性检查）。 */
  const detectProject = async (
    projectId: string,
    settings: unknown,
    signal?: AbortSignal,
  ): Promise<readonly ReviewIssue[]> => {
    await deps.text.open(projectId);
    const chapters = await deps.text.listChapters(projectId);
    if (!chapters.some((chapter) => chapter.scenes.some((scene) => scene.content.trim().length > 0))) return Object.freeze([]);
    const resolved = settings ?? await deps.resolveSettings();
    const [rules, canonViews, relationships, styleSegment, styleForbidden, knowledge] = await Promise.all([
      deps.rules.listActive(projectId),
      Promise.resolve(deps.canon.query(projectId)),
      deps.relationship.read(projectId),
      deps.style.constantSegment(projectId),
      deps.style.forbiddenExpressions(projectId),
      deps.knowledge.read(projectId),
    ]);
    // 探测器最小视图（与 I63 preview 装配同构，不复制 detector 内部）。
    const ruleInput = rules.map((view) => ({ id: view.rule.id, statement: view.rule.statement, immutable: view.rule.immutable, active: view.rule.active }));
    const canonInput = canonViews.map((event) => ({ id: event.id, summary: event.summary, detail: event.detail ?? '' }));
    const controller = new AbortController();
    active.add(controller);
    const forwardAbort = () => controller.abort();
    signal?.addEventListener('abort', forwardAbort, { once: true });
    try {
      const issues: ReviewIssue[] = [];
      for (const chapter of chapters) {
        const pov = chapter.pov || 'unknown';
        for (const scene of chapter.scenes) {
          const prose = scene.content.trim();
          if (prose.length === 0) continue;
          const sourceHash = textContentHash(scene.content);
          const anchorFor = (violation: SceneViolation) => {
            const matches = violation.references
              .filter((reference) => reference.length > 0)
              .flatMap((reference) => findTextOccurrences(scene.content, reference).map((start) => ({ reference, start })));
            // A detector may emit ids as references. Only a single exact textual
            // reference is safe to expose as a range; ambiguity stays scene-level.
            if (matches.length !== 1) return undefined;
            const match = matches[0];
            return createTextAnchor(scene.content, match.start, match.start + match.reference.length, sourceHash);
          };
          const violations: SceneViolation[] = [];
          // 确定性风格检查（I20 forbidden-expression，无 LLM）。
          for (const violation of detectForbiddenExpressions(prose, styleForbidden)) violations.push(violation);
          const [hard, leak, soft] = await Promise.all([
            deps.consistency.detectRuleAndCanon({ prose, rules: ruleInput, canon: canonInput }, resolved, controller.signal),
            deps.knowledgeLeak.detectKnowledgeLeak({
              prose,
              pov,
              entries: knowledge.entries,
              states: knowledge.states,
            }, resolved, controller.signal),
            deps.relationshipStyle.detectRelationshipAndStyle({
              prose,
              relationships,
              style: styleSegment.profile,
            }, resolved, controller.signal),
          ]);
          for (const violation of [...hard.violations, ...leak.violations, ...soft.violations]) violations.push(violation);
          issues.push(...projectSceneIssues(chapter.id, scene.id, violations, { sourceHash, anchorFor }));
        }
      }
      return Object.freeze(issues);
    } finally {
      signal?.removeEventListener('abort', forwardAbort);
      active.delete(controller);
    }
  };

  const service: NovelReviewService = Object.freeze({
    async scan(projectId: string, settings?: unknown, signal?: AbortSignal) {
      validateProjectId(projectId);
      const journal = await journalOf(projectId);
      const issues = await detectProject(projectId, settings, signal);
      const projection: ReviewProjection = Object.freeze({
        projectId,
        scannedAt: new Date().toISOString(),
        issues: joinStatuses(issues, journal.list(projectId)),
        summary: summarizeReviewIssues(issues),
      });
      lastScans.set(projectId, projection);
      return projection;
    },
    async adjudicate(projectId: string, decision: ReviewDecision, issueIds: readonly string[], signal?: AbortSignal) {
      validateProjectId(projectId);
      void signal;
      const parsedDecision = reviewDecisionSchema.parse(decision);
      const projection = lastScans.get(projectId);
      if (projection === undefined) {
        throw new Error('审校结果已失效：请先刷新审校（scan）后再裁决');
      }
      const byId = new Map(projection.issues.map((issue) => [issue.id, issue]));
      const unknown = issueIds.filter((issueId) => !byId.has(issueId));
      if (unknown.length > 0) {
        throw new Error(`未知审校问题：${unknown.join(', ')}（请刷新审校结果）`);
      }
      // 硬冲突阻止 continue/accept：所选 issue 含任何硬项即整体拒绝（零写）。
      if (parsedDecision === 'continue') {
        const hardIds = issueIds.filter((issueId) => byId.get(issueId)?.severity === 'hard');
        if (hardIds.length > 0) {
          throw new Error(`硬冲突阻止继续/接受：${hardIds.join(', ')}（硬约束必须重写正文，软警告才可显式继续）`);
        }
      }
      const journal = await journalOf(projectId);
      const applied: string[] = [];
      const duplicate: string[] = [];
      for (const issueId of issueIds) {
        const application = await journal.record(projectId, issueId, parsedDecision);
        (application.kind === 'applied' ? applied : duplicate).push(issueId);
      }
      const records = journal.list(projectId);
      const refreshed: ReviewProjection = Object.freeze({
        ...projection,
        issues: joinStatuses(projection.issues, records),
      });
      lastScans.set(projectId, refreshed);
      return Object.freeze({
        projectId,
        decision: parsedDecision,
        applied: Object.freeze(applied),
        duplicate: Object.freeze(duplicate),
        records,
        projection: refreshed,
      });
    },
    async records(projectId: string) {
      const journal = await journalOf(projectId);
      return journal.list(projectId);
    },
    current(projectId: string, issueId: string) {
      validateProjectId(projectId);
      const projection = lastScans.get(projectId);
      if (projection === undefined) throw new Error('审校结果已失效：请先刷新审校（scan）后再修复');
      const issue = projection.issues.find((candidate) => candidate.id === issueId);
      if (issue === undefined) throw new Error(`未知审校问题：${issueId}（请刷新审校结果）`);
      return issue;
    },
  });
  return service;
}
