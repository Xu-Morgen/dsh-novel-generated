import {
  hashText,
  parseWritingCandidate,
  validateCandidateTarget,
  type WritingCandidate,
} from '../../core/candidate/index.js';
import { validateProjectId } from '../../core/io/path.js';
import { buildContextTrace, type ContextTrace } from '../../core/trace/index.js';
import type { DetailBeat } from '../../core/schema/outline.js';
import type { OutlineNavigation } from '../../core/schema/outline-progress.js';
import type { TextRepository } from '../../core/text/index.js';
import type { ConsistencyViolationView } from '../../core/validate/index.js';
import type { GenerationSettings } from '../../llm/port/index.js';
import { createWritingCandidateService, type WritingCandidateRequest } from '../candidate-service.js';
import type { NextSceneContextProvider, NovelAgentContext } from '../writing-context.js';
import type { WritingAdjudicationOutcome, WritingProposeInput, WritingProposeIntent } from '../writing-adjudication-service.js';

/** 进程内候选条目（I62 合同；候选不持久化，I65 队列 owner 负责持久化与恢复）。 */
export interface CandidateEntry {
  readonly candidate: WritingCandidate;
  readonly request: WritingCandidateRequest;
  readonly context?: NovelAgentContext;
  /** I65 队列恢复上下文：card/navigation 供 pov/summary/beats 重建（正常路径为 undefined）。 */
  readonly recovery?: { card: DetailBeat; navigation: OutlineNavigation };
  /** I71 生成注入解释（continue/scene-card/rewrite 各自构建；preview 返回）。 */
  readonly trace: ContextTrace;
  /** preview 计算并缓存的校验结果（与 accept 同源，I20 复判）。 */
  violations?: readonly ConsistencyViolationView[];
  /** accept 落地结果缓存（重复 accept 幂等返回）。 */
  outcome?: WritingAdjudicationOutcome;
  /** 生命周期尝试次数（journal id 唯一：`w-<candidateId>-<attempt>`）。 */
  attempts: number;
}

/**
 * I63「候选生产」段（架构审查 §4.1 拆分 —— propose / preview / accept-saga /
 * reject / rewrite / 恢复注册 7 类职责的三段拆分之一，design §14.9「候选优先」）。
 *
 * 职责与不变式：
 * - 唯一持有进程内候选条目表（`entries`）与候选 id 序列；propose（continue/
 *   scene-card/rewrite）、rewrite 后继候选（repropose）与 I65 队列恢复注册
 *   （registerRecoveredCandidate）都只产候选、零写任何层。
 * - 复用 I62 `createWritingCandidateService`（不复制生成/prompt 装配）；rewrite
 *   经 `ensureOpen` 读 C5 绑定源正文哈希；continue/scene-card 经共享
 *   `NextSceneContextProvider` 装配（复用 I44/I43 prompt builder，不复制）。
 * - 恢复注册严格复验（`parseWritingCandidate` + `validateCandidateTarget`）；
 *   同 candidateId 重复注册幂等；非 scene-card 意图 fail-closed。
 */
export interface CandidateProduction {
  readonly candidates: ReturnType<typeof createWritingCandidateService>;
  readonly entries: Map<string, CandidateEntry>;
  readonly nextId: (intent: WritingProposeIntent) => string;
  readonly requireEntry: (candidateId: string) => CandidateEntry;
  propose(projectId: string, input: WritingProposeInput, settings?: unknown, signal?: AbortSignal): Promise<{ readonly candidate: WritingCandidate }>;
  repropose(entry: CandidateEntry, settings?: unknown, signal?: AbortSignal): Promise<{ readonly candidate: WritingCandidate }>;
  registerRecoveredCandidate(candidate: WritingCandidate, recovery: { card: DetailBeat; navigation: OutlineNavigation; settings: GenerationSettings }): void;
}

export interface CandidateProductionDeps {
  readonly llm: unknown;
  readonly projectsRoot: string;
  readonly onDispose?: (dispose: () => void) => void;
  /** 下一场景上下文装配（与对话 Agent 共用，见 writing-context）。 */
  readonly context: NextSceneContextProvider;
  /** A2 生成设置解析（Client/Agent 不传 settings 时惰性解析）。 */
  readonly resolveSettings: () => Promise<GenerationSettings>;
  /** 只读 C5 仓库访问（rewrite 绑定源正文哈希；由组合根注入共享池）。 */
  readonly ensureOpen: (projectId: string) => Promise<TextRepository>;
}

export function createCandidateProduction(deps: CandidateProductionDeps): CandidateProduction {
  const candidates = createWritingCandidateService({ llm: deps.llm, projectsRoot: deps.projectsRoot, onDispose: deps.onDispose });
  const entries = new Map<string, CandidateEntry>();
  let sequence = 0;
  const nextId = (intent: WritingProposeIntent): string => `cand-${intent}-${Date.now()}-${++sequence}`;
  const requireEntry = (candidateId: string): CandidateEntry => {
    const entry = entries.get(candidateId);
    if (entry === undefined) throw new Error(`Unknown candidate: ${candidateId}`);
    return entry;
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
    entries.set(candidate.id, { candidate, request: next, context: entry.context, trace: entry.trace, attempts: entry.attempts + 1 });
    return Object.freeze({ candidate });
  };

  return Object.freeze({
    candidates,
    entries,
    nextId,
    requireEntry,
    async propose(projectId: string, input: WritingProposeInput, settings?: unknown, signal?: AbortSignal) {
      validateProjectId(projectId);
      const resolved = (settings as GenerationSettings | undefined) ?? await deps.resolveSettings();
      if (input.intent === 'rewrite') {
        const chapterId = input.chapterId as string;
        const sceneId = input.sceneId as string;
        const prompt = input.prompt ?? '';
        if (!prompt.trim()) throw new Error('Rewrite candidate requires a non-empty prompt');
        const repository = await deps.ensureOpen(projectId);
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
        entries.set(candidate.id, {
          candidate,
          request,
          // I71：rewrite 不注入结构层，只注入调用方重写指令（长度摘要）。
          trace: buildContextTrace({ intent: 'rewrite', rewritePrompt: prompt }),
          attempts: 0,
        });
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
      // I71：continue 注入故事上下文（复用上下文装配的 trace，与 ContextAssembler
      // 实际选择一致）；scene-card 只注入场景卡/导航 —— 单独构建如实报告零结构层。
      const trace = input.intent === 'continue'
        ? built.trace
        : buildContextTrace({ intent: 'scene-card', pov: card.pov, navigation: built.navigation, card });
      entries.set(candidate.id, { candidate, request, context: built, trace, attempts: 0 });
      return Object.freeze({ candidate });
    },
    repropose,
    registerRecoveredCandidate(candidate: WritingCandidate, recovery: { card: DetailBeat; navigation: OutlineNavigation; settings: GenerationSettings }): void {
      // 严格复验（消费方不得绕过合同）；同 id 重复注册幂等（I65 恢复可重入）。
      const parsed = parseWritingCandidate(candidate);
      if (entries.has(parsed.id)) return;
      // I65 队列只编排 scene-card 意图；其余意图 fail-closed（避免伪造候选入账）。
      if (parsed.intent !== 'scene-card') {
        throw new Error(`Queue recovery supports scene-card candidates only: ${parsed.intent}`);
      }
      validateCandidateTarget(parsed.intent, parsed.target);
      const request: WritingCandidateRequest = {
        id: parsed.id,
        intent: parsed.intent,
        target: parsed.target,
        card: recovery.card,
        navigation: recovery.navigation,
        settings: recovery.settings,
      };
      entries.set(parsed.id, {
        candidate: parsed,
        request,
        recovery: { card: recovery.card, navigation: recovery.navigation },
        // I71：队列恢复的场景卡候选不经 ContextAssembler —— 如实报告无结构层注入。
        trace: buildContextTrace({ intent: 'scene-card', pov: recovery.card.pov, navigation: recovery.navigation, card: recovery.card }),
        attempts: 0,
      });
    },
  });
}
