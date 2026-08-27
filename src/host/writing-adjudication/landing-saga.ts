import { lifecycleStageSchema, executeLifecycle, LifecycleJournal } from '../../core/lifecycle/index.js';
import { adjudicateViolations, type ConsistencyViolationView } from '../../core/validate/index.js';
import { assertCandidateFresh, type WritingCandidate } from '../../core/candidate/index.js';
import { projectDirectory } from '../../core/io/path.js';
import type { TextRepository } from '../../core/text/index.js';
import type { Chapter } from '../../core/schema/text.js';
import type { StoryLifecycleParserInputs } from '../story-lifecycle-service.js';
import { asLlmBackend, type GenerationSettings } from '../../llm/port/index.js';
import { parseC2StateFromNarrative } from '../../llm/parse/state.js';
import { parseC1RelationshipsFromNarrative } from '../../llm/parse/relationship.js';
import { parseC3KnowledgeFromNarrative } from '../../llm/parse/knowledge.js';
import { parseC4CanonFromNarrative } from '../../llm/parse/canon.js';
import { parseB2WorldviewFromNarrative } from '../../llm/parse/worldview.js';
import { buildFiveLayerWriters } from '../five-layer-writeback.js';
import type { NovelStateService } from '../state-service.js';
import type { NovelRelationshipService } from '../relationship-service.js';
import type { NovelKnowledgeService } from '../knowledge-service.js';
import type { NovelCanonService } from '../canon-service.js';
import type { NovelWorldviewService } from '../worldview-service.js';
import type { NovelConfirmationService } from '../confirmation-service.js';
import type { CandidateEntry } from './candidate-production.js';
import type { WritingAdjudicationOutcome } from '../writing-adjudication-service.js';

/**
 * I63「落地 saga」段（架构审查 §4.1 拆分 —— propose / preview / accept-saga /
 * reject / rewrite / 恢复注册 7 类职责的三段拆分之一，design §14.9「候选优先」）。
 *
 * `accept` 是唯一裁决入口的落地主体，顺序固定：
 * 1. 绑定与新鲜度（零写拒绝）：rewrite 命中既有场景且哈希一致；新场景目标未占用。
 * 2. 标准校验门（接受才进入；preview 同源 violations 经 I20 复判）→ 硬违规零写。
 * 3. 解析 fan-out（I25–I29 真实解析器；prose = 候选正文）。
 * 4. I30 受控写回：journal 记录 C2→C1→C3→C4→B2 进度，写回器为共享五层写回器
 *    （five-layer-writeback，与 I61 text-edit 同一份实现）；部分失败显式
 *    pending-compensation，绝不部分成功伪装为完成。
 * 5. C5 落地（仅 written 后）：rewrite 替换既有场景全文（半开区间语义由
 *    commitSceneVersion 承担 —— I70/R14-5 保留旧正文为非 chosen 分支）；新场景追加。
 */
export interface LandingSaga {
  accept(entry: CandidateEntry, settings?: unknown, signal?: AbortSignal): Promise<WritingAdjudicationOutcome>;
}

export interface LandingSagaDeps {
  readonly llm: unknown;
  readonly projectsRoot: string;
  /** 结构化层写回 owner（既有 Domain Service；低置信 fail-closed）。 */
  readonly state: NovelStateService;
  readonly relationship: NovelRelationshipService;
  readonly knowledge: NovelKnowledgeService;
  readonly canon: NovelCanonService;
  readonly worldview: NovelWorldviewService;
  readonly confirmation: NovelConfirmationService;
  /** 校验结果（与 preview 同源，I20 复判；由校验投影段注入，接受才进入落地）。 */
  readonly ensureViolations: (entry: CandidateEntry, signal?: AbortSignal) => Promise<readonly ConsistencyViolationView[]>;
  readonly entries: Map<string, CandidateEntry>;
  /** 只读 C5 仓库访问（新鲜度核对与场景落地；由组合根注入共享池）。 */
  readonly ensureOpen: (projectId: string) => Promise<TextRepository>;
}

export function createLandingSaga(deps: LandingSagaDeps): LandingSaga {
  const backend = asLlmBackend(deps.llm);

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

  /**
   * accept 落地 C5：rewrite 替换既有场景全文（半开区间语义由 commitSceneVersion
   * 承担 —— I70/R14-5：替换前把旧正文保留为非 chosen 分支，新正文成为唯一 chosen，
   * 候选可保留为分支、比较并回切）；新场景追加（无分支，隐含单版本）。
   */
  const landScene = async (candidate: WritingCandidate): Promise<{ chapterId: string; sceneId: string; index: number; content: string }> => {
    const projectId = candidate.target.projectId;
    const repository = await deps.ensureOpen(projectId);
    const target = candidate.target;
    if (target.sourceHash !== undefined) {
      const chapterId = target.chapterId as string;
      const sceneId = target.sceneId as string;
      const chapter = await repository.readChapter(chapterId);
      const existing = chapter.scenes.find((item) => item.id === sceneId);
      if (existing === undefined) throw new Error(`Unknown scene: ${sceneId}`);
      const scene = await repository.commitSceneVersion(chapterId, sceneId, candidate.text, '重写候选');
      return { chapterId, sceneId, index: scene.index, content: scene.content };
    }
    const chapterId = target.chapterId as string;
    const sceneId = target.sceneId as string;
    const entry = deps.entries.get(candidate.id);
    const card = entry?.context?.card ?? entry?.recovery?.card;
    const navigation = entry?.context?.navigation ?? entry?.recovery?.navigation;
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

  /** accept 主体：绑定/新鲜度零写拒绝 → 校验门 → 五层解析 → I30 journal 写回 → C5 落地。 */
  const accept = async (entry: CandidateEntry, settings?: unknown, signal?: AbortSignal): Promise<WritingAdjudicationOutcome> => {
    const candidate = entry.candidate;
    const projectId = candidate.target.projectId;
    const resolved = (settings as GenerationSettings | undefined) ?? entry.request.settings;
    const repository = await deps.ensureOpen(projectId);
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
    const violations = await deps.ensureViolations(entry, signal);
    const afterGeneration = adjudicateViolations(violations);
    if (afterGeneration.status === 'reject') {
      return Object.freeze({ status: 'generation-rejected', candidateId: candidate.id, adjudication: afterGeneration });
    }
    // 3. 解析 fan-out（I25–I29 真实解析器；prose = 候选正文）。
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
    const journal = await LifecycleJournal.open(projectDirectory(deps.projectsRoot, projectId));
    entry.attempts += 1;
    const result = await executeLifecycle<unknown>({
      id: `w-${candidate.id}-${entry.attempts}`,
      decision: 'accept',
      afterGenerationViolations: violations,
      beforeWritebackViolations: [],
      journal,
      parsers: { c2: async () => c2, c1: async () => c1, c3: async () => c3, c4: async () => c4, b2: async () => b2 },
      writers: buildFiveLayerWriters(
        { state: deps.state, relationship: deps.relationship, knowledge: deps.knowledge, canon: deps.canon, worldview: deps.worldview, confirmation: deps.confirmation },
        projectId,
        candidate.id,
      ),
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

  return Object.freeze({ accept });
}
