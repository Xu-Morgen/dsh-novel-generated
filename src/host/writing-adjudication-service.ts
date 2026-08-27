import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  assertCandidateFresh,
  hashText,
  validateCandidateTarget,
  type CandidateTarget,
  type WritingCandidate,
  type WritingIntent,
} from '../core/candidate/index.js';
import { CandidateAdjudicationLedger } from '../core/candidate/adjudication.js';
import { lifecycleStageSchema, executeLifecycle, LifecycleJournal, type LifecycleStage, type LifecycleWriters } from '../core/lifecycle/index.js';
import { adjudicateViolations, type ConsistencyAdjudication, type ConsistencyViolationView } from '../core/validate/index.js';
import { projectDirectory, validateProjectId } from '../core/io/path.js';
import { TextRepository } from '../core/text/index.js';
import type { Chapter } from '../core/schema/text.js';
import type { StoryLifecycleParserInputs } from './story-lifecycle-service.js';
import { asLlmBackend, type GenerationSettings } from '../llm/port/index.js';
import { parseC2StateFromNarrative, type C2StateParserOutput } from '../llm/parse/state.js';
import { parseC1RelationshipsFromNarrative, type C1RelationshipParserOutput } from '../llm/parse/relationship.js';
import { parseC3KnowledgeFromNarrative, type C3KnowledgeParserOutput } from '../llm/parse/knowledge.js';
import { parseC4CanonFromNarrative, type C4CanonParserOutput } from '../llm/parse/canon.js';
import { parseB2WorldviewFromNarrative, type B2WorldviewParserOutput } from '../llm/parse/worldview.js';
import { applyC2StateOperationsToDraft } from '../llm/parse/state.js';
import { materializeC1RelationshipOperations } from '../llm/parse/relationship.js';
import { materializeC3KnowledgeOperations } from '../llm/parse/knowledge.js';
import type { StateDraft } from '../core/state/index.js';
import { createWritingCandidateService, type WritingCandidateRequest } from './candidate-service.js';
import type { NextSceneContextProvider, NovelAgentContext } from './writing-context.js';
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

/**
 * I63 候选审阅与生成后裁决 Host owner（design §14.9「候选优先」/ R13-4）。
 *
 * 产品语义（退役生成前预先 accept 的 novel_continue 路径）：
 * - 四种写作意图先产生绑定 project/chapter/scene/sourceHash 的候选（I62 合同），
 *   作者在「正文 + diff + 校验结果」可见后才能接受、拒绝或要求重写。
 * - `propose` 只产候选（复用 I62 `createWritingCandidateService`，零写）；
 *   continue/scene-card 的上下文经共享 `NextSceneContextProvider` 装配（复用 I44/I43
 *   prompt builder 与 I19 组装器，不复制）；rewrite 绑定当前场景正文哈希。
 * - `preview` 返回 diff（rewrite=替换 before/after；新场景=new-scene）与校验结果
 *   （I21 规则/正史硬约束 + I22 POV 知情硬约束 + I24 关系/风格软约束，I20 裁决）。
 * - `adjudicate` 是唯一裁决入口：
 *   - accept：先核对绑定新鲜度（sourceHash/目标场景未占用，零写拒绝），再经 I30
 *     标准生命周期（校验门 → 五层解析 fan-out → journal 受控写回 C2→C1→C3→C4→B2），
 *     `written` 后才把 C5 文本落地（rewrite 替换既有场景全文；新场景追加）；
 *     硬违规 / 解析失败 / 写回失败一律零写或补偿，绝不部分成功伪装为完成。
 *   - reject：零写；重复 reject 幂等。
 *   - rewrite：产生后继候选并把旧候选置为 superseded（旧候选不可静默接受）。
 * - 幂等裁决：账本（`CandidateAdjudicationLedger`）按 candidateId 记录状态；重复
 *   accept 返回首次落地结果（不重复写）；重复 reject 返回 rejected。
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

export type CandidateReviewDiff =
  | { readonly kind: 'new-scene' }
  | { readonly kind: 'replace'; readonly before: string; readonly after: string };

/** 作者审阅候选所需的最小 owned JSON：正文 + diff + 校验结果（R13-4 可见后再裁决）。 */
export interface CandidateReview {
  readonly candidateId: string;
  readonly intent: WritingIntent;
  readonly target: CandidateTarget;
  readonly text: string;
  readonly diff: CandidateReviewDiff;
  readonly validation: ConsistencyAdjudication;
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
  /** 候选审阅：正文 + diff + 校验结果（I21/I22/I24 探测器经 I20 裁决）。 */
  preview(candidateId: string, signal?: AbortSignal): Promise<CandidateReview>;
  /** 唯一裁决入口：accept 进入标准生命周期并受控写回；reject 零写；rewrite 后继候选。 */
  adjudicate(candidateId: string, decision: 'accept' | 'reject' | 'rewrite', settings?: unknown, signal?: AbortSignal): Promise<WritingAdjudicationOutcome>;
}

export interface WritingAdjudicationServiceDeps {
  readonly llm: unknown;
  readonly projectsRoot?: string;
  readonly onDispose?: (dispose: () => void) => void;
  /** 下一场景上下文装配（与对话 Agent 共用，见 writing-context）。 */
  readonly context: NextSceneContextProvider;
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

interface CandidateEntry {
  readonly candidate: WritingCandidate;
  readonly request: WritingCandidateRequest;
  readonly context?: NovelAgentContext;
  /** preview 计算并缓存的校验结果（与 accept 同源，I20 复判）。 */
  violations?: readonly ConsistencyViolationView[];
  /** accept 落地结果缓存（重复 accept 幂等返回）。 */
  outcome?: WritingAdjudicationOutcome;
  /** 生命周期尝试次数（journal id 唯一：`w-<candidateId>-<attempt>`）。 */
  attempts: number;
}

function hasLowConfidence(ops: readonly { confidence?: unknown }[]): boolean {
  return ops.some((operation) => operation.confidence === 'low');
}

export function createWritingAdjudicationService(deps: WritingAdjudicationServiceDeps): NovelWritingAdjudicationService {
  const projectsRoot = deps.projectsRoot ?? join(homedir(), '.dsh', 'novel-projects');
  const candidates = createWritingCandidateService({ llm: deps.llm, projectsRoot, onDispose: deps.onDispose });
  const ledger = new CandidateAdjudicationLedger();
  const entries = new Map<string, CandidateEntry>();
  const repositories = new Map<string, TextRepository>();
  let sequence = 0;
  const nextId = (intent: WritingProposeIntent): string => `cand-${intent}-${Date.now()}-${++sequence}`;

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

  const requireEntry = (candidateId: string): CandidateEntry => {
    const entry = entries.get(candidateId);
    if (entry === undefined) throw new Error(`Unknown candidate: ${candidateId}`);
    return entry;
  };

  /** rewrite 候选的 POV：从目标章节元数据解析（无细纲卡上下文时兜底）。 */
  const resolvePovFromChapter = async (candidate: WritingCandidate): Promise<string> => {
    const chapterId = candidate.target.chapterId;
    if (chapterId === undefined) return 'unknown';
    try {
      const repository = await ensureOpen(candidate.target.projectId);
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
    const pov = entry.context?.card.pov ?? requestPov ?? await resolvePovFromChapter(candidate);
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
      const repository = await ensureOpen(target.projectId);
      const chapter = await repository.readChapter(target.chapterId as string);
      const scene = chapter.scenes.find((item) => item.id === target.sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${target.sceneId}`);
      return Object.freeze({ kind: 'replace', before: scene.content, after: candidate.text });
    }
    return Object.freeze({ kind: 'new-scene' });
  };

  /** 解析输入快照：accept 时取当前各层真相（与 I30 生命周期消费同一 parserInputs 合同）。 */
  const buildParserInputs = async (projectId: string): Promise<StoryLifecycleParserInputs> => {
    const [state, relationships, knowledge, canonViews, worldview] = await Promise.all([
      Promise.resolve(deps.state.current(projectId)),
      deps.relationship.read(projectId),
      deps.knowledge.read(projectId),
      Promise.resolve(deps.canon.query(projectId)),
      deps.worldview.list(projectId),
    ]);
    return {
      c2: { state },
      c1: { current: relationships },
      c3: { entries: [...knowledge.entries], states: [...knowledge.states] },
      c4: { canon: [...canonViews] },
      b2: { current: worldview },
    };
  };

  /** 结构化层写回器（顺序 C2→C1→C3→C4→B2，I30 saga；低置信/非 append 一律 Gate）。 */
  const buildWriters = (projectId: string, requestId: string): LifecycleWriters<unknown> => ({
    c2: async (output) => {
      const parsed = output as C2StateParserOutput;
      if (hasLowConfidence(parsed.ops)) throw new Error('Low-confidence C2 operations require ConfirmationGate');
      await deps.state.transaction(projectId, (draft) => applyC2StateOperationsToDraft(draft as StateDraft, parsed.ops));
    },
    c1: async (output) => {
      const parsed = output as C1RelationshipParserOutput;
      if (hasLowConfidence(parsed.ops)) throw new Error('Low-confidence C1 operations require ConfirmationGate');
      const next = materializeC1RelationshipOperations(await deps.relationship.read(projectId), parsed.ops);
      await deps.relationship.saveAll(projectId, next);
    },
    c3: async (output) => {
      const parsed = output as C3KnowledgeParserOutput;
      if (hasLowConfidence(parsed.ops)) throw new Error('Low-confidence C3 operations require ConfirmationGate');
      const next = materializeC3KnowledgeOperations(await deps.knowledge.read(projectId), parsed.ops);
      await deps.knowledge.saveAll(projectId, next.entries, next.states);
    },
    c4: async (output) => {
      const parsed = output as C4CanonParserOutput;
      if (hasLowConfidence(parsed.ops)) throw new Error('Low-confidence or supersede C4 operations require ConfirmationGate');
      for (const operation of parsed.ops) {
        if (operation.op !== 'append') throw new Error('C4 supersede operations require ConfirmationGate');
        await deps.canon.append(projectId, operation.event);
      }
    },
    b2: async (output) => {
      const parsed = output as B2WorldviewParserOutput;
      // B2 改写 confirmation-first：先经 I11 Gate 提出并接受，再经既有改写服务落盘。
      const proposalId = `${requestId}-b2`;
      await deps.confirmation.propose(projectId, {
        id: proposalId,
        kind: 'b2-worldview-parser-supersedes',
        payload: { ops: parsed.ops },
      });
      await deps.confirmation.accept(projectId, proposalId);
      for (const operation of parsed.ops) {
        // B2 解析器契约（b2ReplacementSchema）约定 version/status/supersededBy 归存储层。
        await deps.worldview.rewrite(projectId, operation.targetId, {
          ...operation.replacement,
          status: 'active',
          supersededBy: null,
        });
      }
    },
  });

  /** accept 落地 C5：rewrite 替换既有场景全文（半开区间 [0, len)）；新场景追加。 */
  const landScene = async (candidate: WritingCandidate): Promise<{ chapterId: string; sceneId: string; index: number; content: string }> => {
    const projectId = candidate.target.projectId;
    const repository = await ensureOpen(projectId);
    const target = candidate.target;
    if (target.sourceHash !== undefined) {
      const chapterId = target.chapterId as string;
      const sceneId = target.sceneId as string;
      const chapter = await repository.readChapter(chapterId);
      const existing = chapter.scenes.find((item) => item.id === sceneId);
      if (existing === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      const scene = await repository.replaceRange(chapterId, sceneId, { start: 0, end: existing.content.length }, candidate.text);
      return { chapterId, sceneId, index: scene.index, content: scene.content };
    }
    const chapterId = target.chapterId as string;
    const sceneId = target.sceneId as string;
    const entry = entries.get(candidate.id);
    const card = entry?.context?.card;
    const navigation = entry?.context?.navigation;
    let chapter: Chapter;
    try {
      chapter = await repository.readChapter(chapterId);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('Unknown chapter:')) throw error;
      chapter = await repository.createChapter({ id: chapterId, index: 1, title: '正文', pov: card?.pov ?? 'unknown', status: 'draft' });
    }
    const scene = await repository.appendScene(chapterId, {
      id: sceneId,
      content: candidate.text,
      summary: card?.summary ?? '',
      beats: navigation ? [navigation.beatId] : [],
      canonEvents: [],
      notes: '',
    });
    return { chapterId, sceneId, index: scene.index, content: scene.content };
  };

  /** rewrite 后继候选：继承原请求语义（sources/card/navigation/prompt），换新 id 重新生成。 */
  const repropose = async (entry: CandidateEntry, settings?: unknown, signal?: AbortSignal): Promise<{ readonly candidate: WritingCandidate }> => {
    const request = entry.request;
    const next: WritingCandidateRequest = {
      ...request,
      id: `${request.id}-r${entry.attempts + 1}`,
      settings: (settings as GenerationSettings | undefined) ?? request.settings,
      signal,
    };
    const { candidate } = await candidates.propose(next);
    entries.set(candidate.id, { candidate, request: next, context: entry.context, attempts: entry.attempts + 1 });
    return Object.freeze({ candidate });
  };

  /** accept 主体：绑定/新鲜度零写拒绝 → 校验门 → 五层解析 → I30 journal 写回 → C5 落地。 */
  const accept = async (entry: CandidateEntry, settings?: unknown, signal?: AbortSignal): Promise<WritingAdjudicationOutcome> => {
    const candidate = entry.candidate;
    const projectId = candidate.target.projectId;
    const resolved = (settings as GenerationSettings | undefined) ?? entry.request.settings;
    const repository = await ensureOpen(projectId);
    // 1. 绑定与新鲜度（零写拒绝）：rewrite 命中既有场景且哈希一致；新场景目标未占用。
    if (candidate.target.sourceHash !== undefined) {
      const chapter = await repository.readChapter(candidate.target.chapterId as string);
      const scene = chapter.scenes.find((item) => item.id === candidate.target.sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${candidate.target.sceneId}`);
      assertCandidateFresh(candidate, scene.content);
    } else {
      let chapter: Chapter | undefined;
      try {
        chapter = await repository.readChapter(candidate.target.chapterId as string);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith('Unknown chapter:')) throw error;
      }
      if (chapter?.scenes.some((item) => item.id === candidate.target.sceneId)) {
        throw new Error(`Target scene already exists: ${candidate.target.sceneId}`);
      }
    }
    // 2. 标准校验门（接受才进入；preview 同源 violations 经 I20 复判）→ 硬违规零写。
    const violations = await ensureViolations(entry, signal);
    const afterGeneration = adjudicateViolations(violations);
    if (afterGeneration.status === 'reject') {
      return Object.freeze({ status: 'generation-rejected', candidateId: candidate.id, adjudication: afterGeneration });
    }
    // 3. 解析 fan-out（I25–I29 真实解析器；prose = 候选正文）。
    const backend = asLlmBackend(deps.llm);
    const inputs = await buildParserInputs(projectId);
    const prose = candidate.text;
    const [c2, c1, c3, c4, b2] = await Promise.all([
      parseC2StateFromNarrative(backend, { prose, ...inputs.c2 }, resolved, signal),
      parseC1RelationshipsFromNarrative(backend, { prose, ...inputs.c1 }, resolved, signal),
      parseC3KnowledgeFromNarrative(backend, { prose, ...inputs.c3 }, resolved, signal),
      parseC4CanonFromNarrative(backend, { prose, ...inputs.c4 }, resolved, signal),
      parseB2WorldviewFromNarrative(backend, { prose, ...inputs.b2 }, resolved, signal),
    ]);
    // 4. I30 受控写回：journal 记录 C2→C1→C3→C4→B2 进度，部分失败显式 pending-compensation。
    const journal = await LifecycleJournal.open(projectDirectory(projectsRoot, projectId));
    entry.attempts += 1;
    const result = await executeLifecycle<unknown>({
      id: `w-${candidate.id}-${entry.attempts}`,
      decision: 'accept',
      afterGenerationViolations: violations,
      beforeWritebackViolations: [],
      journal,
      parsers: { c2: async () => c2, c1: async () => c1, c3: async () => c3, c4: async () => c4, b2: async () => b2 },
      writers: buildWriters(projectId, candidate.id),
    });
    if (result.status === 'generation-rejected' || result.status === 'prewrite-rejected') {
      return Object.freeze({
        status: result.status,
        candidateId: candidate.id,
        adjudication: result.status === 'generation-rejected' ? result.afterGeneration : result.beforeWriteback,
      });
    }
    if (result.status === 'pending-compensation') {
      return Object.freeze({ status: 'pending-compensation', candidateId: candidate.id, failedStage: result.failedStage, afterGeneration: result.afterGeneration });
    }
    if (result.status !== 'written') {
      // decision-rejected 理论不可达（decision 恒为 accept）；fail-closed。
      throw new Error(`Unexpected lifecycle outcome: ${result.status}`);
    }
    // 5. C5 落地（仅 written 后）。
    const scene = await landScene(candidate);
    return Object.freeze({
      status: 'written',
      candidateId: candidate.id,
      scene,
      layers: Object.freeze([...lifecycleStageSchema.options]),
    });
  };

  return Object.freeze({
    async open(projectId: string) {
      validateProjectId(projectId);
      await candidates.open(projectId);
      await ensureOpen(projectId);
    },
    async propose(projectId: string, input: WritingProposeInput, settings?: unknown, signal?: AbortSignal) {
      validateProjectId(projectId);
      const resolved = (settings as GenerationSettings | undefined) ?? await deps.resolveSettings();
      if (input.intent === 'rewrite') {
        const chapterId = input.chapterId as string;
        const sceneId = input.sceneId as string;
        const prompt = input.prompt ?? '';
        if (!prompt.trim()) throw new Error('Rewrite candidate requires a non-empty prompt');
        const repository = await ensureOpen(projectId);
        const chapter = await repository.readChapter(chapterId);
        const scene = chapter.scenes.find((item) => item.id === sceneId);
        if (scene === undefined) throw new Error(`Unknown scene: ${sceneId}`);
        const request: WritingCandidateRequest = {
          id: nextId('rewrite'),
          intent: 'rewrite',
          target: { projectId, chapterId, sceneId, sourceHash: hashText(scene.content) },
          prompt,
          settings: resolved,
          signal,
        };
        const { candidate } = await candidates.propose(request);
        entries.set(candidate.id, { candidate, request, attempts: 0 });
        return Object.freeze({ candidate });
      }
      // continue / scene-card：经共享上下文装配（I44/I43 prompt 复用）。
      const built = await deps.context.context(projectId);
      const card = { ...built.card, wordTarget: built.creation.wordTarget };
      const request: WritingCandidateRequest = {
        id: nextId(input.intent),
        intent: input.intent,
        target: { projectId, chapterId: 'chapter-1', sceneId: `scene-${Date.now()}-${++sequence}` },
        sources: built.sources,
        card,
        navigation: built.navigation,
        settings: resolved,
        signal,
      };
      validateCandidateTarget(request.intent, request.target);
      const { candidate } = await candidates.propose(request);
      entries.set(candidate.id, { candidate, request, context: built, attempts: 0 });
      return Object.freeze({ candidate });
    },
    async preview(candidateId: string, signal?: AbortSignal) {
      const entry = requireEntry(candidateId);
      const violations = await ensureViolations(entry, signal);
      const candidate = entry.candidate;
      return Object.freeze({
        candidateId,
        intent: candidate.intent,
        target: candidate.target,
        text: candidate.text,
        diff: await computeDiff(candidate),
        validation: adjudicateViolations(violations),
      });
    },
    async adjudicate(candidateId: string, decision: 'accept' | 'reject' | 'rewrite', settings?: unknown, signal?: AbortSignal) {
      const entry = requireEntry(candidateId);
      const candidate = entry.candidate;
      const projectId = candidate.target.projectId;
      const status = ledger.statusOf(candidateId);
      if (decision === 'reject') {
        if (status === 'rejected') return Object.freeze({ status: 'rejected', candidateId });
        if (status === 'accepted') throw new Error(`Candidate already accepted: ${candidateId}`);
        if (status === 'superseded') throw new Error(`Candidate superseded by a successor: ${candidateId}`);
        ledger.reject(candidateId, projectId);
        return Object.freeze({ status: 'rejected', candidateId });
      }
      if (decision === 'rewrite') {
        if (status === 'superseded') throw new Error(`Candidate already superseded: ${candidateId}`);
        if (status === 'accepted') throw new Error(`Accepted candidate cannot be rewritten: ${candidateId}`);
        const successor = await repropose(entry, settings, signal);
        ledger.supersede(candidateId, successor.candidate.id, projectId);
        return Object.freeze({ status: 'rewritten', candidateId, superseded: candidateId, candidate: successor.candidate });
      }
      // accept
      if (status === 'accepted') {
        if (entry.outcome !== undefined) return entry.outcome;
        throw new Error(`Candidate already accepted: ${candidateId}`);
      }
      if (status === 'superseded') throw new Error(`Candidate superseded: 旧候选不可静默接受，请裁决后继候选（${candidateId}）`);
      if (status === 'rejected') throw new Error(`Candidate already rejected: ${candidateId}`);
      const outcome = await accept(entry, settings, signal);
      if (outcome.status === 'written') {
        ledger.accept(candidateId, projectId);
        entry.outcome = outcome;
      }
      return outcome;
    },
  });
}
