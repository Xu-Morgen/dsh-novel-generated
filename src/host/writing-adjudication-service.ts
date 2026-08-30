import { homedir } from 'node:os';
import { join } from 'node:path';
import { CandidateAdjudicationLedger } from '../core/candidate/adjudication.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository } from '../core/text/index.js';
import type { CandidateTarget, WritingCandidate, WritingIntent } from '../core/candidate/index.js';
import type { ConsistencyAdjudication } from '../core/validate/index.js';
import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import type { LifecycleStage } from '../core/lifecycle/index.js';
import type { ContextTrace } from '../core/trace/index.js';
import type { GenerationSettings } from '../llm/port/index.js';
import type { CandidateTargetSelection, CandidateTargetSnapshot } from '../core/schema/candidate-target.js';
import type { NextSceneContextProvider } from './writing-context.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelTextMutationService } from './text-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import type { NovelConfirmationService } from './confirmation-service.js';
import type { NovelRuleService } from './rule-service.js';
import type { NovelStyleService } from './style-service.js';
import type { NovelConsistencyDetectionService } from './consistency-detection-service.js';
import type { NovelKnowledgeLeakDetectionService } from './knowledge-leak-detection-service.js';
import type { NovelRelationshipStyleDetectionService } from './relationship-style-detection-service.js';
import { createCandidateProduction } from './writing-adjudication/candidate-production.js';
import { createValidationProjection } from './writing-adjudication/validation-projection.js';
import { createLandingSaga } from './writing-adjudication/landing-saga.js';

/**
 * I63 候选审阅与生成后裁决 Host owner（design §14.9「候选优先」/ R13-4）。
 *
 * 本文件是组合根（架构审查 §4.1 拆分后）：候选生产 / 校验投影 / 落地 saga 三段
 * 分别落在 `writing-adjudication/{candidate-production,validation-projection,
 * landing-saga}.ts`，五层写回器为共享 `five-layer-writeback.ts`（与 I61 text-edit
 * 同一份实现）；本根只做编排：共享 C5 仓库池、候选账本（`CandidateAdjudicationLedger`）
 * 与裁决分发（reject/rewrite/accept 三态），不直接持有解析器/写回器/探测器。
 *
 * 产品语义（退役生成前预先 accept 的 novel_continue 路径）：
 * - 四种写作意图先产生绑定 project/chapter/scene/sourceHash 的候选（I62 合同），
 *   作者在「正文 + diff + 校验结果」可见后才能接受、拒绝或要求重写。
 * - `adjudicate` 是唯一裁决入口：accept 先核对绑定新鲜度（sourceHash/目标场景未
 *   占用，零写拒绝），再经 I30 标准生命周期（校验门 → 五层解析 fan-out → journal
 *   受控写回 C2→C1→C3→C4→B2），`written` 后才把 C5 文本落地；硬违规 / 解析失败 /
 *   写回失败一律零写或补偿，绝不部分成功伪装为完成。reject 零写且幂等；rewrite
 *   产生后继候选并把旧候选置为 superseded（旧候选不可静默接受）。
 * - 幂等裁决：账本按 candidateId 记录状态；重复 accept 返回首次落地结果
 *   （entry.outcome 缓存，不重复写）；重复 reject 返回 rejected。
 * - 候选与裁决状态只存在于进程内（候选不持久化，I62 合同）；I65 队列 owner 负责
 *   持久化与批量恢复。本服务所有副作用（LLM 调用、Gate 提案）归属当前 Fiber。
 */

export type WritingProposeIntent = 'continue' | 'scene-card' | 'rewrite';

export interface WritingProposeInput {
  readonly intent: WritingProposeIntent;
  /** rewrite 必填：目标场景章节/场景 id。 */
  readonly chapterId?: string;
  readonly sceneId?: string;
  /** rewrite 必填：重写指令（同 I42 调用方 prompt 语义）。 */
  readonly prompt?: string;
}

export interface WritingProposeAtInput extends CandidateTargetSelection {
  readonly intent: 'continue' | 'scene-card';
}

export type CandidateReviewDiff =
  | { readonly kind: 'new-scene' }
  | { readonly kind: 'replace'; readonly before: string; readonly after: string };

/** 作者审阅候选所需的最小 owned JSON：正文 + diff + 校验结果 + 注入解释（R13-4 可见后再裁决）。 */
export interface CandidateReview {
  readonly candidateId: string;
  readonly intent: WritingIntent;
  readonly target: CandidateTarget;
  readonly text: string;
  readonly diff: CandidateReviewDiff;
  readonly validation: ConsistencyAdjudication;
  /** I71 生成注入解释（层/触发原因/裁剪预算；不泄露 secret/完整对象）。 */
  readonly trace: ContextTrace;
}

export type WritingAdjudicationOutcome =
  | { readonly status: 'rejected'; readonly candidateId: string }
  | { readonly status: 'rewritten'; readonly candidateId: string; readonly superseded: string; readonly candidate: WritingCandidate }
  | { readonly status: 'generation-rejected'; readonly candidateId: string; readonly adjudication: ConsistencyAdjudication }
  | { readonly status: 'prewrite-rejected'; readonly candidateId: string; readonly adjudication: ConsistencyAdjudication }
  | { readonly status: 'pending-compensation'; readonly candidateId: string; readonly failedStage: LifecycleStage; readonly afterGeneration: ConsistencyAdjudication }
  | { readonly status: 'written'; readonly candidateId: string; readonly scene: { chapterId: string; sceneId: string; index: number; content: string }; readonly layers: readonly LifecycleStage[] };

export interface NovelWritingAdjudicationService {
  open(projectId: string): Promise<void>;
  /** 产生一个可审阅候选（continue/scene-card/rewrite；零写，绑定 target 与 sourceHash）。 */
  propose(projectId: string, input: WritingProposeInput, settings?: unknown, signal?: AbortSignal): Promise<{ readonly candidate: WritingCandidate }>;
  /** Strict additive explicit target for non-rewrite candidates. */
  proposeAt(projectId: string, input: WritingProposeAtInput, settings?: unknown, signal?: AbortSignal): Promise<{ readonly candidate: WritingCandidate }>;
  /** 候选审阅：正文 + diff + 校验结果（I21/I22/I24 探测器经 I20 裁决）。 */
  preview(candidateId: string, signal?: AbortSignal): Promise<CandidateReview>;
  /** 唯一裁决入口：accept 进入标准生命周期并受控写回；reject 零写；rewrite 后继候选。 */
  adjudicate(candidateId: string, decision: 'accept' | 'reject' | 'rewrite', settings?: unknown, signal?: AbortSignal): Promise<WritingAdjudicationOutcome>;
  /**
   * I65 队列恢复注册（design §14.9 / R13-6）：把一个由队列持久化的候选登记为
   * 可审阅/可裁决。候选必须已通过 `parseWritingCandidate` 严格复验；同 candidateId
   * 重复注册幂等（恢复路径与正常 propose 路径可能并存）。
   *
   * 恢复上下文（recovery）只含场景卡 + 大纲导航 + 生成 settings —— 与 I62/I63
   * 正常路径同构：pov 判定 / accept 落盘 summary+beats / rewrite 后继候选重建全部
   * 可复用，不引入第二套候选持有。
   */
  registerRecoveredCandidate(candidate: WritingCandidate, recovery: { card: DetailBeat; navigation: OutlineNavigation; settings: GenerationSettings; targetSnapshot: CandidateTargetSnapshot }): Promise<void>;
}

export interface WritingAdjudicationServiceDeps {
  readonly llm: unknown;
  readonly projectsRoot?: string;
  readonly onDispose?: (dispose: () => void) => void;
  /** 下一场景上下文装配（与对话 Agent 共用，见 writing-context）。 */
  readonly context: NextSceneContextProvider;
  /** Task1 canonical binding resolver owns target capture/freshness. */
  readonly sceneOutlineBinding: NovelSceneOutlineBindingService;
  /** I104 CAS mutation seam used for the final C5 append. */
  readonly textMutation: Pick<NovelTextMutationService, 'createSceneMutation'>;
  /** 结构化层写回 owner（既有 Domain Service；低置信 fail-closed）。 */
  readonly state: NovelStateService;
  readonly relationship: NovelRelationshipService;
  readonly knowledge: NovelKnowledgeService;
  readonly canon: NovelCanonService;
  readonly worldview: NovelWorldviewService;
  readonly confirmation: NovelConfirmationService;
  /** 校验（I21/I22/I24 探测器输入装配）。 */
  readonly rules: NovelRuleService;
  readonly style: NovelStyleService;
  readonly consistency: NovelConsistencyDetectionService;
  readonly knowledgeLeak: NovelKnowledgeLeakDetectionService;
  readonly relationshipStyle: NovelRelationshipStyleDetectionService;
  /** A2 生成设置解析（Client/Agent 不传 settings 时惰性解析）。 */
  readonly resolveSettings: () => Promise<GenerationSettings>;
}

export function createWritingAdjudicationService(deps: WritingAdjudicationServiceDeps): NovelWritingAdjudicationService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  // 共享 C5 仓库池：候选生产（rewrite 绑定）、校验投影（diff/章节 POV）、落地 saga
  // （新鲜度核对与场景落地）复用同一池，避免每段各自持有仓库实例。
  const repositories = new Map<string, TextRepository>();
  const ensureOpen = async (projectId: string): Promise<TextRepository> => {
    validateProjectId(projectId);
    let repository = repositories.get(projectId);
    if (repository === undefined) {
      repository = new TextRepository(projectDirectory(projectsRoot, projectId));
      await repository.open();
      repositories.set(projectId, repository);
    }
    return repository;
  };

  const production = createCandidateProduction({ llm: deps.llm, projectsRoot, onDispose: deps.onDispose, context: deps.context, sceneOutlineBinding: deps.sceneOutlineBinding, resolveSettings: deps.resolveSettings, ensureOpen });
  const projection = createValidationProjection({
    rules: deps.rules, canon: deps.canon, relationship: deps.relationship, style: deps.style, knowledge: deps.knowledge,
    consistency: deps.consistency, knowledgeLeak: deps.knowledgeLeak, relationshipStyle: deps.relationshipStyle,
    entries: production.entries, sceneOutlineBinding: deps.sceneOutlineBinding, ensureOpen,
  });
  const saga = createLandingSaga({
    llm: deps.llm, projectsRoot,
    state: deps.state, relationship: deps.relationship, knowledge: deps.knowledge, canon: deps.canon,
    worldview: deps.worldview, confirmation: deps.confirmation,
    ensureViolations: projection.ensureViolations, sceneOutlineBinding: deps.sceneOutlineBinding, textMutation: deps.textMutation, ensureOpen,
  });
  const ledger = new CandidateAdjudicationLedger();
  // lifecycle-journal.yaml and all five structured owners are project-scoped.
  // Serialize adjudication side effects per project; proposal/preview remain
  // parallel and different projects do not share a global lane.
  const adjudicationLanes = new Map<string, Promise<void>>();
  const inProjectLane = <T>(projectId: string, operation: () => Promise<T>): Promise<T> => {
    const previous = adjudicationLanes.get(projectId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);
    const tail = run.then(() => undefined, () => undefined);
    adjudicationLanes.set(projectId, tail);
    void tail.then(() => {
      if (adjudicationLanes.get(projectId) === tail) adjudicationLanes.delete(projectId);
    });
    return run;
  };

  return Object.freeze({
    async open(projectId: string) {
      validateProjectId(projectId);
      await production.candidates.open(projectId);
      await ensureOpen(projectId);
    },
    async registerRecoveredCandidate(candidate: WritingCandidate, recovery: { card: DetailBeat; navigation: OutlineNavigation; settings: GenerationSettings; targetSnapshot: CandidateTargetSnapshot }): Promise<void> {
      await production.registerRecoveredCandidate(candidate, recovery);
    },
    async propose(projectId: string, input: WritingProposeInput, settings?: unknown, signal?: AbortSignal) {
      return production.propose(projectId, input, settings, signal);
    },
    async proposeAt(projectId: string, input: WritingProposeAtInput, settings?: unknown, signal?: AbortSignal) {
      return production.proposeAt(projectId, input, settings, signal);
    },
    async preview(candidateId: string, signal?: AbortSignal) {
      return projection.preview(candidateId, signal);
    },
    async adjudicate(candidateId: string, decision: 'accept' | 'reject' | 'rewrite', settings?: unknown, signal?: AbortSignal) {
      const observedEntry = production.requireEntry(candidateId);
      const observedProjectId = observedEntry.candidate.target.projectId;
      return inProjectLane(observedProjectId, async () => {
        // Re-resolve inside the project lane so no status/entry decision relies
        // on the pre-lane observation used only to choose the lane owner.
        const entry = production.requireEntry(candidateId);
        const candidate = entry.candidate;
        const projectId = candidate.target.projectId;
        if (projectId !== observedProjectId) throw new Error(`Candidate project changed concurrently: ${candidateId}`);
        const status = ledger.statusOf(candidateId);
        if (decision === 'reject') {
          if (entry.pendingC5 !== undefined) throw new Error(`Candidate ${candidateId} requires C5 compensation; retry accept to resume C5 landing`);
          if (status === 'rejected') return Object.freeze({ status: 'rejected' as const, candidateId });
          if (status === 'accepted') throw new Error(`Candidate already accepted: ${candidateId}`);
          if (status === 'superseded') throw new Error(`Candidate superseded by a successor: ${candidateId}`);
          ledger.reject(candidateId, projectId);
          return Object.freeze({ status: 'rejected' as const, candidateId });
        }
        if (decision === 'rewrite') {
          if (entry.pendingC5 !== undefined) throw new Error(`Candidate ${candidateId} requires C5 compensation; retry accept to resume C5 landing`);
          if (status === 'superseded') throw new Error(`Candidate already superseded: ${candidateId}`);
          if (status === 'accepted') throw new Error(`Accepted candidate cannot be rewritten: ${candidateId}`);
          const successor = await production.repropose(entry, settings, signal);
          ledger.supersede(candidateId, successor.candidate.id, projectId);
          return Object.freeze({ status: 'rewritten' as const, candidateId, superseded: candidateId, candidate: successor.candidate });
        }
        // accept
        if (status === 'accepted') {
          if (entry.outcome !== undefined) return entry.outcome;
          throw new Error(`Candidate already accepted: ${candidateId}`);
        }
        if (status === 'superseded') throw new Error(`Candidate superseded: 旧候选不可静默接受，请裁决后继候选（${candidateId}）`);
        if (status === 'rejected') throw new Error(`Candidate already rejected: ${candidateId}`);
        const outcome = await saga.accept(entry, settings, signal);
        if (outcome.status === 'written') {
          ledger.accept(candidateId, projectId);
          entry.outcome = outcome;
        }
        return outcome;
      });
    },
  });
}
