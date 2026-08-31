import { lifecycleStageSchema, executeLifecycle, LifecycleJournal } from '../../core/lifecycle/index.js';
import { adjudicateViolations, type ConsistencyViolationView } from '../../core/validate/index.js';
import { assertCandidateFresh } from '../../core/candidate/index.js';
import { projectDirectory } from '../../core/io/path.js';
import type { TextRepository } from '../../core/text/index.js';
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
import type { NovelSceneOutlineBindingService } from '../scene-outline-binding-service.js';
import type { NovelTextMutationService } from '../text-service.js';
import type { NovelOutlineGenerationBaselineService } from '../outline-generation-baseline-service.js';
import type { CandidateEntry, PendingC5Landing } from './candidate-production.js';
import type { WritingAdjudicationOutcome } from '../writing-adjudication-service.js';
import {
  assertStructuralPreviewPlanFresh,
  consumeStructuralPreviewPlan,
  prepareStructuralPreviewPlan as buildStructuralPreviewPlan,
  type StructuralPreviewChange,
  type StructuralPreviewFreshnessInput,
  type StructuralPreviewLayerBaseline,
  type StructuralPreviewOutlineBaseline,
  type StructuralPreviewPlan,
  type StructuralPreviewWriters,
  structuralPreviewFingerprint,
} from './structural-preview-plan.js';

/**
 * I109 的真实 landing-saga 消费夹具：只消费 prepare 阶段冻结的 parser
 * outputs，并在首个 writer 前复核所有 owner 指纹（设计 §14.14）。
 */
export async function replayStructuralPreviewPlan(
  plan: StructuralPreviewPlan,
  current: StructuralPreviewFreshnessInput,
  writers: StructuralPreviewWriters,
): Promise<readonly StructuralPreviewChange[]> {
  return consumeStructuralPreviewPlan(plan, current, writers);
}

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
  prepareStructuralPreviewPlan(entry: CandidateEntry, settings?: unknown, signal?: AbortSignal): Promise<StructuralPreviewPlan>;
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
  readonly sceneOutlineBinding: NovelSceneOutlineBindingService;
  /** I108 baseline owner; absent only for legacy direct/test composition. */
  readonly outlineGenerationBaseline?: NovelOutlineGenerationBaselineService;
  readonly textMutation: Pick<NovelTextMutationService, 'createSceneMutation'>;
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

  const generationBaseline = async (entry: CandidateEntry, required: boolean): Promise<StructuralPreviewOutlineBaseline> => {
    const snapshot = entry.targetSnapshot;
    if (deps.outlineGenerationBaseline === undefined || snapshot?.detailBeatId === undefined) {
      return { kind: 'no-outline-baseline' };
    }
    const result = await deps.outlineGenerationBaseline.current(entry.candidate.target.projectId, {
      chapterId: snapshot.chapterId, sceneId: snapshot.sceneId, detailBeatId: snapshot.detailBeatId,
    });
    if (result.freshness === 'stale') {
      throw new Error(`Stale outline generation baseline for candidate ${entry.candidate.id}: ${result.staleReasons.join(', ')}`);
    }
    if (result.baseline === null) {
      if (required) throw new Error(`Candidate ${entry.candidate.id} requires a current outline generation baseline`);
      return { kind: 'no-outline-baseline' };
    }
    const baseline = result.baseline;
    return {
      kind: 'baseline', generationBaselineId: baseline.baselineId, baselineRevision: baseline.revision,
      detailBeatId: baseline.detailBeatId, b5ContentFingerprint: baseline.b5ContentFingerprint,
      bindingFingerprint: baseline.bindingFingerprint,
    };
  };

  const sourceHashFor = async (entry: CandidateEntry, repository: TextRepository): Promise<string> => {
    const candidate = entry.candidate;
    if (candidate.target.sourceHash !== undefined) return candidate.target.sourceHash;
    if (entry.targetSnapshot !== undefined) return entry.targetSnapshot.textFingerprint;
    return repository.projectFingerprint();
  };

  const layerBaselinesFor = (inputs: StoryLifecycleParserInputs): StructuralPreviewLayerBaseline[] => [
    { layer: 'c2', snapshot: inputs.c2.state, fingerprint: structuralPreviewFingerprint(inputs.c2.state) },
    { layer: 'c1', snapshot: inputs.c1.current, fingerprint: structuralPreviewFingerprint(inputs.c1.current) },
    { layer: 'c3', snapshot: { entries: inputs.c3.entries, states: inputs.c3.states }, fingerprint: structuralPreviewFingerprint({ entries: inputs.c3.entries, states: inputs.c3.states }) },
    { layer: 'c4', snapshot: inputs.c4.canon, fingerprint: structuralPreviewFingerprint(inputs.c4.canon) },
    { layer: 'b2', snapshot: inputs.b2.current, fingerprint: structuralPreviewFingerprint(inputs.b2.current) },
  ];

  const structuralFreshnessFor = async (
    entry: CandidateEntry,
    repository: TextRepository,
    inputs: StoryLifecycleParserInputs,
  ): Promise<StructuralPreviewFreshnessInput> => {
    const baselines = layerBaselinesFor(inputs);
    return {
      sourceHash: await sourceHashFor(entry, repository),
      generationBaseline: await generationBaseline(entry, false),
      layerFingerprints: Object.fromEntries(baselines.map((baseline) => [baseline.layer, baseline.fingerprint])) as StructuralPreviewFreshnessInput['layerFingerprints'],
    };
  };

  /** Parse once into the I109 session plan; this is the only preview parser entrypoint. */
  const prepareStructuralPreviewPlan = async (
    entry: CandidateEntry,
    settings?: unknown,
    signal?: AbortSignal,
  ): Promise<StructuralPreviewPlan> => {
    const candidate = entry.candidate;
    const projectId = candidate.target.projectId;
    const repository = await deps.ensureOpen(projectId);
    const inputs = await buildParserInputs(projectId);
    const resolved = (settings as GenerationSettings | undefined) ?? entry.request.settings;
    const outlineBaseline = await generationBaseline(entry, true);
    const [c2, c1, c3, c4, b2] = await Promise.all([
      parseC2StateFromNarrative(backend, { prose: candidate.text, ...inputs.c2 }, resolved, signal),
      parseC1RelationshipsFromNarrative(backend, { prose: candidate.text, ...inputs.c1 }, resolved, signal),
      parseC3KnowledgeFromNarrative(backend, { prose: candidate.text, ...inputs.c3 }, resolved, signal),
      parseC4CanonFromNarrative(backend, { prose: candidate.text, ...inputs.c4 }, resolved, signal),
      parseB2WorldviewFromNarrative(backend, { prose: candidate.text, ...inputs.b2 }, resolved, signal),
    ]);
    return buildStructuralPreviewPlan({
      planId: `preview-${candidate.id}`,
      projectId,
      candidateId: candidate.id,
      sourceHash: await sourceHashFor(entry, repository),
      generationBaseline: outlineBaseline,
      layerBaselines: layerBaselinesFor(inputs),
      parserOutputs: { c2, c1, c3, c4, b2 },
      createdAt: new Date().toISOString(),
    });
  };

  /** Freeze every value C5 consumes before the first landing attempt. */
  const buildLandingPlan = async (entry: CandidateEntry, repository: TextRepository): Promise<PendingC5Landing> => {
    const candidate = entry.candidate;
    const projectId = candidate.target.projectId;
    const chapterId = candidate.target.chapterId as string;
    const sceneId = candidate.target.sceneId as string;
    if (candidate.target.sourceHash !== undefined) {
      return Object.freeze({ kind: 'rewrite', projectId, chapterId, sceneId, content: candidate.text });
    }
    const chapter = await repository.readChapter(chapterId);
    const card = entry.context?.card ?? entry.recovery?.card;
    const navigation = entry.context?.navigation ?? entry.recovery?.navigation;
    const base = {
      kind: 'new-scene' as const,
      projectId,
      chapterId,
      sceneId,
      index: chapter.scenes.length,
      content: candidate.text,
      summary: card?.summary ?? '',
      beats: Object.freeze(navigation ? [navigation.beatId] : []),
    };
    return entry.targetSnapshot === undefined
      ? Object.freeze(base)
      : Object.freeze({ ...base, expectedFingerprint: entry.targetSnapshot.textFingerprint });
  };

  /** Replay only a frozen C5 plan; no detector, parser, or structured writer is reachable here. */
  const landScene = async (plan: PendingC5Landing): Promise<{ chapterId: string; sceneId: string; index: number; content: string }> => {
    const repository = await deps.ensureOpen(plan.projectId);
    if (plan.kind === 'rewrite') {
      const scene = await repository.commitSceneVersion(plan.chapterId, plan.sceneId, plan.content, '重写候选');
      return { chapterId: plan.chapterId, sceneId: plan.sceneId, index: scene.index, content: scene.content };
    }
    if (plan.expectedFingerprint === undefined) {
      // Queue-owned recovered candidates acquire snapshots in Task2B; preserve their legacy landing seam here.
      const scene = await repository.appendScene(plan.chapterId, {
        id: plan.sceneId,
        content: plan.content,
        summary: plan.summary,
        beats: [...plan.beats],
        canonEvents: [],
        notes: '',
      });
      return { chapterId: plan.chapterId, sceneId: plan.sceneId, index: scene.index, content: scene.content };
    }
    const result = await deps.textMutation.createSceneMutation(plan.projectId, {
      chapterId: plan.chapterId,
      index: plan.index,
      scene: {
        id: plan.sceneId,
        content: plan.content,
        summary: plan.summary,
        beats: [...plan.beats],
        canonEvents: [],
        notes: '',
      },
      expectedFingerprint: plan.expectedFingerprint,
    });
    return { chapterId: plan.chapterId, sceneId: plan.sceneId, index: result.scene.index, content: result.scene.content };
  };

  const finishPendingC5 = async (entry: CandidateEntry): Promise<WritingAdjudicationOutcome> => {
    const plan = entry.pendingC5;
    if (plan === undefined) throw new Error(`Candidate has no pending C5 landing: ${entry.candidate.id}`);
    try {
      const scene = await landScene(plan);
      entry.pendingC5 = undefined;
      return Object.freeze({
        status: 'written',
        candidateId: entry.candidate.id,
        scene,
        layers: Object.freeze([...lifecycleStageSchema.options]),
      });
    } catch (cause) {
      throw new Error(
        `C5 candidate landing failed after structured writeback; compensation is required. Retry accept for ${entry.candidate.id} to resume C5 only`,
        { cause },
      );
    }
  };

  /** accept 主体：绑定/新鲜度零写拒绝 → 校验门 → 五层解析 → I30 journal 写回 → C5 落地。 */
  const accept = async (entry: CandidateEntry, settings?: unknown, signal?: AbortSignal): Promise<WritingAdjudicationOutcome> => {
    const candidate = entry.candidate;
    if (entry.pendingC5 !== undefined) return finishPendingC5(entry);
    const projectId = candidate.target.projectId;
    const resolved = (settings as GenerationSettings | undefined) ?? entry.request.settings;
    const repository = await deps.ensureOpen(projectId);
    // 1. 绑定与新鲜度（零写拒绝）：rewrite 命中既有场景且哈希一致；新场景目标未占用。
    if (candidate.target.sourceHash !== undefined) {
      const chapter = await repository.readChapter(candidate.target.chapterId as string);
      const scene = chapter.scenes.find((item) => item.id === candidate.target.sceneId);
      if (scene === undefined) throw new Error(`Unknown scene: ${candidate.target.sceneId}`);
      assertCandidateFresh(candidate, scene.content);
    } else if (entry.targetSnapshot !== undefined) {
      await deps.sceneOutlineBinding.assertCandidateTargetFresh(projectId, entry.targetSnapshot);
    } else {
      const chapter = await repository.readChapter(candidate.target.chapterId as string);
      if (chapter.scenes.some((item) => item.id === candidate.target.sceneId)) {
        throw new Error(`Target scene already exists: ${candidate.target.sceneId}`);
      }
    }
    // Freeze the C5 replay input while the validated owner snapshot is still current.
    // It is not exposed as pending until the lifecycle reports every structured writer complete.
    const landingPlan = await buildLandingPlan(entry, repository);
    // 2. 标准校验门（接受才进入；preview 同源 violations 经 I20 复判）→ 硬违规零写。
    const violations = await deps.ensureViolations(entry, signal);
    const afterGeneration = adjudicateViolations(violations);
    if (afterGeneration.status === 'reject') {
      return Object.freeze({ status: 'generation-rejected', candidateId: candidate.id, adjudication: afterGeneration });
    }
    // 3. 解析 fan-out（I25–I29 真实解析器；prose = 候选正文）。已有 I110
    // plan 只取冻结 outputs；没有 preview 的兼容调用才建立一次即时解析结果。
    let parserOutputs: StructuralPreviewPlan['parserOutputs'];
    if (entry.structuralPreviewPlan !== undefined) {
      const inputs = await buildParserInputs(projectId);
      const current = await structuralFreshnessFor(entry, repository, inputs);
      assertStructuralPreviewPlanFresh(entry.structuralPreviewPlan, current);
      parserOutputs = entry.structuralPreviewPlan.parserOutputs;
    } else {
      const inputs = await buildParserInputs(projectId);
      const prose = candidate.text;
      const [c2, c1, c3, c4, b2] = await Promise.all([
        parseC2StateFromNarrative(backend, { prose, ...inputs.c2 }, resolved, signal),
        parseC1RelationshipsFromNarrative(backend, { prose, ...inputs.c1 }, resolved, signal),
        parseC3KnowledgeFromNarrative(backend, { prose, ...inputs.c3 }, resolved, signal),
        parseC4CanonFromNarrative(backend, { prose, ...inputs.c4 }, resolved, signal),
        parseB2WorldviewFromNarrative(backend, { prose, ...inputs.b2 }, resolved, signal),
      ]);
      parserOutputs = { c2, c1, c3, c4, b2 };
    }
    // 4. I30 受控写回：journal 记录 C2→C1→C3→C4→B2 进度，部分失败显式 pending-compensation。
    const journal = await LifecycleJournal.open(projectDirectory(deps.projectsRoot, projectId));
    // Detector/parser work is asynchronous. Keep this pre-execute rejection,
    // then gate the first real layer call again after journal.start.
    if (entry.targetSnapshot !== undefined) {
      await deps.sceneOutlineBinding.assertCandidateTargetFresh(projectId, entry.targetSnapshot);
    }
    const layerWriters = buildFiveLayerWriters(
      { state: deps.state, relationship: deps.relationship, knowledge: deps.knowledge, canon: deps.canon, worldview: deps.worldview, confirmation: deps.confirmation },
      projectId,
      candidate.id,
    );
    let firstLayerWriteGate: Promise<void> | undefined;
    const requireFreshFirstLayerWrite = (): Promise<void> => {
      firstLayerWriteGate ??= entry.targetSnapshot === undefined
        ? Promise.resolve()
        : deps.sceneOutlineBinding.assertCandidateTargetFresh(projectId, entry.targetSnapshot);
      return firstLayerWriteGate;
    };
    // Every structured writer shares the one-shot gate. executeLifecycle calls
    // journal.start before c2; the c2 wrapper therefore checks freshness at the
    // last async boundary before any real layer/C5 side effect. Later wrappers
    // reuse the same settled promise rather than claiming a cross-owner transaction.
    const gatedLayerWriters = {
      c2: async (output: Parameters<typeof layerWriters.c2>[0]) => { await requireFreshFirstLayerWrite(); await layerWriters.c2(output); },
      c1: async (output: Parameters<typeof layerWriters.c1>[0]) => { await requireFreshFirstLayerWrite(); await layerWriters.c1(output); },
      c3: async (output: Parameters<typeof layerWriters.c3>[0]) => { await requireFreshFirstLayerWrite(); await layerWriters.c3(output); },
      c4: async (output: Parameters<typeof layerWriters.c4>[0]) => { await requireFreshFirstLayerWrite(); await layerWriters.c4(output); },
      b2: async (output: Parameters<typeof layerWriters.b2>[0]) => { await requireFreshFirstLayerWrite(); await layerWriters.b2(output); },
    };
    entry.attempts += 1;
    const result = await executeLifecycle({
      id: `w-${candidate.id}-${entry.attempts}`,
      decision: 'accept',
      afterGenerationViolations: violations,
      beforeWritebackViolations: [],
      journal,
      parsers: {
        c2: async () => parserOutputs.c2, c1: async () => parserOutputs.c1,
        c3: async () => parserOutputs.c3, c4: async () => parserOutputs.c4, b2: async () => parserOutputs.b2,
      },
      writers: gatedLayerWriters,
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
    // 5. Lifecycle 已完整写入后先冻结补偿点，再尝试 C5。失败保留 pending；
    // retry accept 只会进入 finishPendingC5，绝不重跑探测器/解析器/五层 writer。
    entry.pendingC5 = landingPlan;
    return finishPendingC5(entry);
  };

  return Object.freeze({ prepareStructuralPreviewPlan, accept });
}
