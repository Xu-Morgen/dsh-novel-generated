import { adjudicateViolations, type ConsistencyViolationView } from '../../core/validate/index.js';
import type { WritingCandidate } from '../../core/candidate/index.js';
import type { TextRepository } from '../../core/text/index.js';
import type { NovelCanonService } from '../canon-service.js';
import type { NovelConsistencyDetectionService } from '../consistency-detection-service.js';
import type { NovelKnowledgeLeakDetectionService } from '../knowledge-leak-detection-service.js';
import type { NovelKnowledgeService } from '../knowledge-service.js';
import type { NovelRelationshipStyleDetectionService } from '../relationship-style-detection-service.js';
import type { NovelRelationshipService } from '../relationship-service.js';
import type { NovelRuleService } from '../rule-service.js';
import type { NovelStyleService } from '../style-service.js';
import type { NovelSceneOutlineBindingService } from '../scene-outline-binding-service.js';
import type { CandidateEntry } from './candidate-production.js';
import type { CandidateReview, CandidateReviewDiff } from '../writing-adjudication-service.js';

/**
 * I63「校验投影」段（架构审查 §4.1 拆分 —— propose / preview / accept-saga /
 * reject / rewrite / 恢复注册 7 类职责的三段拆分之一，design §14.9 R13-4）。
 *
 * 职责与不变式：
 * - `preview` 是候选审阅的唯一投影：正文 + diff（rewrite=替换 before/after；
 *   新场景=new-scene）+ 校验结果 + 注入解释（trace）。只读、零写。
 * - 校验结果（I21 规则/正史硬约束 + I22 POV 知情硬约束 + I24 关系/风格软约束，
 *   I20 裁决）由 `ensureViolations` 计算并缓存在条目上，accept 复用同源 violations
 *   （I20 复判，接受才进入落地）—— 因此该函数也暴露给「落地 saga」段消费。
 * - POV：continue/scene-card 取细纲卡 pov；rewrite 取目标章节 pov（I22 探测器输入）。
 */
export interface ValidationProjection {
  preview(candidateId: string, signal?: AbortSignal): Promise<CandidateReview>;
  /** 计算并缓存候选校验结果（accept 与 preview 同源，I20 复判）。 */
  ensureViolations(entry: CandidateEntry, signal?: AbortSignal): Promise<readonly ConsistencyViolationView[]>;
}

export interface ValidationProjectionDeps {
  /** 校验（I21/I22/I24 探测器输入装配）。 */
  readonly rules: NovelRuleService;
  readonly canon: NovelCanonService;
  readonly relationship: NovelRelationshipService;
  readonly style: NovelStyleService;
  readonly knowledge: NovelKnowledgeService;
  readonly consistency: NovelConsistencyDetectionService;
  readonly knowledgeLeak: NovelKnowledgeLeakDetectionService;
  readonly relationshipStyle: NovelRelationshipStyleDetectionService;
  readonly entries: Map<string, CandidateEntry>;
  readonly sceneOutlineBinding: NovelSceneOutlineBindingService;
  /** 只读 C5 仓库访问（rewrite 的 before 正文与章节 POV；由组合根注入共享池）。 */
  readonly ensureOpen: (projectId: string) => Promise<TextRepository>;
}

export function createValidationProjection(deps: ValidationProjectionDeps): ValidationProjection {
  const requireEntry = (candidateId: string): CandidateEntry => {
    const entry = deps.entries.get(candidateId);
    if (entry === undefined) throw new Error(`Unknown candidate: ${candidateId}`);
    return entry;
  };

  /** rewrite 候选的 POV：从目标章节元数据解析（无细纲卡上下文时兜底）。 */
  const resolvePovFromChapter = async (candidate: WritingCandidate): Promise<string> => {
    const chapterId = candidate.target.chapterId;
    if (chapterId === undefined) return 'unknown';
    try {
      const repository = await deps.ensureOpen(candidate.target.projectId);
      const chapter = await repository.readChapter(chapterId);
      return chapter.pov || 'unknown';
    } catch {
      return 'unknown';
    }
  };

  /** 校验结果：preview 计算并缓存，accept 复用（同源 violations 经 I20 复判，接受才进入）。 */
  const ensureViolations = async (entry: CandidateEntry, signal?: AbortSignal): Promise<readonly ConsistencyViolationView[]> => {
    if (entry.violations !== undefined) return entry.violations;
    const candidate = entry.candidate;
    const projectId = candidate.target.projectId;
    const settings = entry.request.settings;
    const [rules, canonViews, relationships, styleSegment, knowledge] = await Promise.all([
      deps.rules.listActive(projectId),
      Promise.resolve(deps.canon.query(projectId)),
      deps.relationship.read(projectId),
      deps.style.constantSegment(projectId),
      deps.knowledge.read(projectId),
    ]);
    // POV：continue/scene-card 取细纲卡 pov；rewrite 取目标章节 pov（I22 探测器输入）。
    const requestPov = (entry.request as { card?: { pov?: string } }).card?.pov;
    const pov = entry.context?.card.pov ?? entry.recovery?.card.pov ?? requestPov ?? await resolvePovFromChapter(candidate);
    const [hard, leak, soft] = await Promise.all([
      deps.consistency.detectRuleAndCanon({
        prose: candidate.text,
        rules: rules.map((view) => ({ id: view.rule.id, statement: view.rule.statement, immutable: view.rule.immutable, active: view.rule.active })),
        canon: canonViews.map((event) => ({ id: event.id, summary: event.summary, detail: event.detail ?? '' })),
      }, settings, signal),
      deps.knowledgeLeak.detectKnowledgeLeak({
        prose: candidate.text,
        pov,
        entries: knowledge.entries,
        states: knowledge.states,
      }, settings, signal),
      deps.relationshipStyle.detectRelationshipAndStyle({
        prose: candidate.text,
        relationships,
        style: styleSegment.profile,
      }, settings, signal),
    ]);
    const violations = [...hard.violations, ...leak.violations, ...soft.violations];
    entry.violations = Object.freeze(violations);
    return entry.violations;
  };

  const computeDiff = async (candidate: WritingCandidate): Promise<CandidateReviewDiff> => {
    const target = candidate.target;
    if (target.sourceHash !== undefined) {
      const repository = await deps.ensureOpen(target.projectId);
      const chapter = await repository.readChapter(target.chapterId as string);
      const scene = chapter.scenes.find((item) => item.id === target.sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${target.sceneId}`);
      return Object.freeze({ kind: 'replace', before: scene.content, after: candidate.text });
    }
    return Object.freeze({ kind: 'new-scene' });
  };

  return Object.freeze({
    ensureViolations,
    async preview(candidateId: string, signal?: AbortSignal) {
      const entry = requireEntry(candidateId);
      if (entry.targetSnapshot !== undefined) {
        await deps.sceneOutlineBinding.assertCandidateTargetFresh(entry.candidate.target.projectId, entry.targetSnapshot);
      }
      const violations = await ensureViolations(entry, signal);
      const candidate = entry.candidate;
      return Object.freeze({
        candidateId,
        intent: candidate.intent,
        target: candidate.target,
        text: candidate.text,
        diff: await computeDiff(candidate),
        validation: adjudicateViolations(violations),
        trace: entry.trace,
      });
    },
  });
}
