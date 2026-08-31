import type { NovelCharacterService } from './character-service.js';
import type { NovelWorldviewService } from './worldview-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelRelationshipService } from './relationship-service.js';
import type { NovelStateService } from './state-service.js';
import type { NovelCanonService } from './canon-service.js';
import type { NovelStyleService } from './style-service.js';
import type { NovelRuleService } from './rule-service.js';
import type { NovelKnowledgeService } from './knowledge-service.js';
import type { NovelTextService } from './text-service.js';
import type { NovelTimelineService } from './timeline-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import type { Relationship } from '../core/schema/relationship.js';
import type { StoryGenerationSources } from '../core/pipeline/index.js';
import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import type { Chapter, Scene } from '../core/schema/text.js';
import type { StoryLifecycleParserInputs } from './story-lifecycle-service.js';
import { buildContextTrace, type ContextTrace } from '../core/trace/index.js';
import { anchorNodeId, filterRelationshipsByTimeline } from '../core/timeline/index.js';
import { textContentHash } from '../core/text/index.js';

/**
 * I63 下一场景上下文装配（design §14.9 / R13-4）。
 *
 * 从 I47–I44 时代 agent-tools 的 buildContext 抽取为共享 Host 模块：GUI 写作裁决
 * 服务与对话 Agent 工具都消费同一装配，绝不复制第二套上下文组装（AGENTS §2
 * 「不复制已有实现」）。装配只读各层 owner，从不写任何层。
 *
 * 不变式：
 * - `context()` 返回 `NovelAgentContext`（navigation/card/sources/parserInputs/
 *   recentScenes/creation 的最小 owned 视图）；sources 供 I19 `assembleStoryContext`
 *   组装生成 prompt，parserInputs 供 I30 五层解析器消费。
 * - B2 触发注入只取 active 命中（design §5.4 / R1-B2）：rewritten/obsolete 旧条目与
 *   尚未在正文揭示的条目不得进入生成上下文；全量 worldview 只进 parserInputs.b2
 *   以支持改写提案。
 * - I71 trace：`trace` 是本装配的注入解释（层/触发原因/预算裁剪摘要），由
 *   `core/trace.buildContextTrace` 用与生成路径相同的注册器/组装器确定性重组装
 *   （ContextAssembler 确定性 ⇒ trace 与生成实际注入一致），不泄露 secret/完整对象。
 */
export interface NextSceneContextDeps {
  readonly outline: NovelOutlineService;
  readonly characters: NovelCharacterService;
  readonly worldview: NovelWorldviewService;
  readonly relationship: NovelRelationshipService;
  readonly state: NovelStateService;
  readonly canon: NovelCanonService;
  readonly style: NovelStyleService;
  readonly rules: NovelRuleService;
  readonly knowledge: NovelKnowledgeService;
  readonly text: NovelTextService;
  /** I121：在生产组合根提供 C5 project fingerprint，防止历史快照跨保存混入一次 prompt。 */
  readonly textFingerprint?: (projectId: string) => Promise<string>;
  /** I121：当前细纲卡的唯一 SceneOutlineBinding owner。 */
  readonly sceneOutlineBinding?: Pick<NovelSceneOutlineBindingService, 'read'>;
  /** I121：当前细纲卡的唯一 OutlineGenerationBaseline owner。 */
  readonly outlineGenerationBaseline?: Pick<NovelOutlineGenerationBaselineService, 'current'>;
  /** 方案 A 时间线层：提供后按「当前时间线节点」过滤关系注入；缺席时全量注入（兼容旧数据）。 */
  readonly timeline?: NovelTimelineService;
  /** 创作台通用设置：目标字数 + 内容不足时是否询问。 */
  readonly workbenchSettings: {
    load(): Promise<{ readonly wordTarget: number; readonly askWhenThin: boolean }>;
  };
}

/** 创作台通用设置的紧凑视图（透出给 Agent/写作服务决定是否询问补充）。 */
export interface NovelCreationSettingsView {
  readonly wordTarget: number;
  readonly askWhenThin: boolean;
}

/** 下一场景的写作上下文（compact JSON 视图 + 内部装配结果）。 */
export interface NovelAgentContext {
  readonly projectId: string;
  /** Host-only B5 token proving navigation/card and generation sources share one outline revision. */
  readonly outlineFingerprint: string;
  readonly navigation: OutlineNavigation;
  readonly card: DetailBeat;
  readonly sources: StoryGenerationSources;
  /** I30 解析器的输入快照（写回前由生命周期使用）。 */
  readonly parserInputs: StoryLifecycleParserInputs;
  readonly recentScenes: number;
  /**
   * I121 当前逐章循环的只读 provenance。只保留 ID/指纹/顺序元数据，不携带
   * baseline.authoringBase.content，避免旧草稿重新进入 prompt（设计 §14.14.2）。
   */
  readonly provenance: WritingContextProvenance;
  readonly creation: NovelCreationSettingsView;
  /** I71 注入解释（层/触发原因/预算裁剪摘要；与 ContextAssembler 实际选择一致）。 */
  readonly trace: ContextTrace;
}

export interface NextSceneContextProvider {
  context(projectId: string): Promise<NovelAgentContext>;
}

export interface WritingContextTarget {
  readonly chapterId: string;
  readonly sceneId: string;
  readonly detailBeatId: string;
  readonly sourceHash: string;
}

export interface WritingContextBaseline {
  readonly baselineId: string;
  readonly revision: number;
  readonly chapterId: string;
  readonly sceneId: string;
  readonly detailBeatId: string;
  readonly b5ContentFingerprint: string;
  readonly bindingFingerprint: string;
  readonly sourceHash: string;
}

export interface WritingContextHistoryEntry {
  readonly chapterId: string;
  readonly chapterIndex: number;
  readonly sceneId: string;
  readonly sceneIndex: number;
  readonly sourceHash: string;
}

export interface WritingContextProvenance {
  /** The bound scene receiving the next generation, when the I121 gate is active. */
  readonly target?: WritingContextTarget;
  /** Current, fresh I108 baseline; stale/none baselines never appear here. */
  readonly baseline?: WritingContextBaseline;
  /** The exact bounded history order consumed by StoryContextAssembler. */
  readonly history: readonly WritingContextHistoryEntry[];
}

export interface NarrativeSceneEntry {
  readonly chapterId: string;
  readonly chapterIndex: number;
  readonly scene: Scene;
}

/**
 * C5 的唯一叙事排序规则（I121）：chapter.index 优先，其次 chapter id；章内
 * scene.index 优先，其次 scene id。调用方不应依赖文件名或目录枚举顺序。
 */
export function orderNarrativeScenes(chapters: readonly Chapter[]): readonly NarrativeSceneEntry[] {
  return Object.freeze(chapters
    .slice()
    .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
    .flatMap((chapter) => chapter.scenes
      .slice()
      .sort((left, right) => left.index - right.index || left.id.localeCompare(right.id))
      .map((scene) => ({ chapterId: chapter.id, chapterIndex: chapter.index, scene }))));
}

/**
 * 取目标场景之前最多 `limit` 个已有正文。空场景不进入 history；返回顺序已经
 * 是 prompt 应消费的跨章顺序，后续 assembler 不得再按 scene.index 重排。
 */
export function selectRecentNarrativeScenes(
  chapters: readonly Chapter[],
  target?: Pick<WritingContextTarget, 'chapterId' | 'sceneId'>,
  limit = 3,
): readonly NarrativeSceneEntry[] {
  if (!Number.isInteger(limit) || limit < 0) throw new Error('History limit must be a non-negative integer');
  if (limit === 0) return Object.freeze([]);
  const ordered = orderNarrativeScenes(chapters);
  const targetPosition = target === undefined
    ? ordered.length
    : ordered.findIndex((entry) => entry.chapterId === target.chapterId && entry.scene.id === target.sceneId);
  if (target !== undefined && targetPosition < 0) throw new Error(`Context target scene is missing: ${target.chapterId}/${target.sceneId}`);
  return Object.freeze(ordered
    .slice(0, targetPosition)
    .filter((entry) => entry.scene.content.trim().length > 0)
    .slice(-limit));
}

/** 从细纲卡中选择当前应写的一张：优先当前 beat 中未完成的，其次最后一张。 */
export function pickCurrentCard(
  cards: readonly { beatId: string; detailBeat: DetailBeat }[],
  navigation: OutlineNavigation,
): DetailBeat | undefined {
  const inBeat = cards.filter((card) => card.beatId === navigation.beatId);
  const picked = inBeat.find((card) => card.detailBeat.status !== 'done') ?? inBeat[inBeat.length - 1];
  return picked?.detailBeat ?? undefined;
}

export function fallbackCard(navigation: OutlineNavigation): DetailBeat {
  return {
    id: 'agent-fallback-card',
    title: navigation.title,
    summary: navigation.instruction,
    pov: 'mira',
    wordTarget: 500,
    points: [],
    status: 'planned',
  };
}

export function createNextSceneContextBuilder(deps: NextSceneContextDeps): NextSceneContextProvider {
  const currentBaseline = async (
    projectId: string,
    card: DetailBeat,
  ): Promise<WritingContextBaseline | undefined> => {
    const bindingOwner = deps.sceneOutlineBinding;
    const baselineOwner = deps.outlineGenerationBaseline;
    // Direct unit consumers from earlier iterations intentionally omit the
    // I108 owners. Production composition supplies both, so no production
    // caller can silently fall back once the I121 gate is active.
    if (bindingOwner === undefined && baselineOwner === undefined) return undefined;
    if (bindingOwner === undefined || baselineOwner === undefined) {
      throw new Error('I121 context requires both SceneOutlineBinding and outline generation baseline owners');
    }
    const binding = await bindingOwner.read(projectId);
    const owned = binding.effective.find((item) => item.detailBeatId === card.id);
    // A card with no C5 binding is the first-draft/legacy unbound path. There
    // is no baseline target to validate yet, so retain deterministic history
    // assembly; once a binding exists, missing/stale baseline is fail-closed.
    if (owned === undefined) return undefined;
    const result = await baselineOwner.current(projectId, {
      chapterId: owned.chapterId,
      sceneId: owned.sceneId,
      detailBeatId: card.id,
    });
    if (result.freshness === 'stale') {
      throw new Error(`Stale outline generation baseline for context: ${result.staleReasons.join(', ')}`);
    }
    if (result.baseline === null || result.freshness !== 'fresh') {
      throw new Error(`No current outline generation baseline for detail beat: ${card.id}`);
    }
    const baseline = result.baseline;
    if (baseline.status !== 'current') {
      throw new Error(`Outline generation baseline is not current: ${baseline.baselineId}`);
    }
    if (baseline.chapterId !== owned.chapterId || baseline.sceneId !== owned.sceneId || baseline.detailBeatId !== card.id) {
      throw new Error(`Outline generation baseline target mismatch: ${card.id}`);
    }
    return Object.freeze({
      baselineId: baseline.baselineId,
      revision: baseline.revision,
      chapterId: baseline.chapterId,
      sceneId: baseline.sceneId,
      detailBeatId: baseline.detailBeatId,
      b5ContentFingerprint: baseline.b5ContentFingerprint,
      bindingFingerprint: baseline.bindingFingerprint,
      sourceHash: baseline.authoringBase.sourceHash,
    });
  };

  /** 装配下一场景的全部生成源（上下文/导航/知情/正史/历史）。 */
  async function context(projectId: string): Promise<NovelAgentContext> {
    const outlineFingerprintBefore = await deps.outline.contentFingerprint(projectId);
    const textFingerprintBefore = deps.textFingerprint === undefined ? undefined : await deps.textFingerprint(projectId);
    const navigation = await deps.outline.navigate(projectId);
    const cards = await deps.outline.beatCards(projectId);
    const card = pickCurrentCard(cards, navigation) ?? fallbackCard(navigation);
    const [characters, worldview, relationships, state, canonViews, styleSegment, activeRules, knowledgeView, fullKnowledge, chapters] = await Promise.all([
      deps.characters.list(projectId),
      deps.worldview.list(projectId),
      deps.relationship.read(projectId),
      deps.state.current(projectId),
      deps.canon.query(projectId),
      deps.style.constantSegment(projectId),
      deps.rules.listActive(projectId),
      deps.knowledge.forPov(projectId, card.pov),
      deps.knowledge.read(projectId),
      deps.text.listChapters(projectId),
    ]);
    const baseline = await currentBaseline(projectId, card);
    const target = baseline === undefined ? undefined : {
      chapterId: baseline.chapterId,
      sceneId: baseline.sceneId,
      detailBeatId: baseline.detailBeatId,
      sourceHash: baseline.sourceHash,
    };
    const selectedHistory = selectRecentNarrativeScenes(chapters, target);
    const recentScenes = selectedHistory.map((entry) => entry.scene);
    const provenanceHistory = selectedHistory.map((entry) => ({
      chapterId: entry.chapterId,
      chapterIndex: entry.chapterIndex,
      sceneId: entry.scene.id,
      sceneIndex: entry.scene.index,
      sourceHash: textContentHash(entry.scene.content),
    }));
    const characterIds = characters.map((character) => character.id);
    const sceneCharacters = await deps.characters.listForScene(projectId, characterIds);
    // 方案 A 时间线层：关系注入只保留「当前时间线节点之前已建立」的关系
    // （design §8 相关角色对 / 排除尚未发生的关系）。锚定 = 手动选择优先，
    // 否则按当前写作位置（细纲卡 → beat）自动匹配；时间线缺失/未锚定 → 全量
    // 注入（兼容旧数据，时间线未配置时行为不变）。
    let injectedRelationships: readonly Relationship[] = relationships;
    if (deps.timeline !== undefined) {
      const timeline = await deps.timeline.read(projectId);
      if (timeline !== null) {
        const currentNodeId = anchorNodeId(timeline, { beatId: navigation.beatId, detailBeatId: card.id });
        injectedRelationships = filterRelationshipsByTimeline(timeline, relationships, currentNodeId);
      }
    }
    // B2 触发注入只取 active 命中（design §5.4 / R1-B2）：rewritten/obsolete 旧条目与
    // 尚未在正文揭示的条目不得进入生成上下文——组装器对非 active 命中 fail-closed，
    // 且全量注入会把未来才应知道的条目泄漏进生成提示（C3 知情边界）。
    // 触发文本 = 当前细纲卡 + 最近场景正文；parserInputs.b2 仍保留全量 worldview 以支持改写提案。
    const triggerText = [card.title, card.summary, ...card.points]
      .concat(recentScenes.map((scene) => scene.content))
      .filter((text) => text.trim().length > 0)
      .join('\n');
    const worldviewHits =
      triggerText.length > 0 ? await deps.worldview.matchTriggers(projectId, [triggerText], []) : [];
    const sources: StoryGenerationSources = {
      context: {
        macros: { user: '作者', pov: card.pov },
        sources: {
          rules: activeRules,
          style: styleSegment,
          characters: sceneCharacters,
          worldview: worldviewHits,
          relationships: { relationships: injectedRelationships, characterIds },
          state,
        },
      },
      navigation,
      knowledge: knowledgeView,
      canon: canonViews,
      history: { recentScenes, historicalSummaries: [] },
    };
    const parserInputs: StoryLifecycleParserInputs = {
      c2: { state },
      c1: { current: relationships },
      c3: { entries: [...fullKnowledge.entries], states: [...fullKnowledge.states] },
      c4: { canon: [...canonViews] },
      b2: { current: worldview },
    };
    const creation = await deps.workbenchSettings.load();
    // I71 trace：与生成路径同注册器/组装器确定性重组装，逐层记录注入与预算裁剪；
    // 触发原因由触发文本复现命中关键词（零查询零写，只摘要已注入的 hits）。
    const trace = buildContextTrace({
      intent: 'continue',
      pov: card.pov,
      sources,
      triggerText,
      navigation,
      card,
    });
    const outlineFingerprint = await deps.outline.contentFingerprint(projectId);
    if (outlineFingerprint !== outlineFingerprintBefore) throw new Error('Outline changed during context assembly');
    if (deps.textFingerprint !== undefined) {
      const textFingerprintAfter = await deps.textFingerprint(projectId);
      if (textFingerprintBefore !== textFingerprintAfter) throw new Error('Text changed during context assembly');
    }
    return {
      projectId,
      outlineFingerprint,
      navigation,
      card,
      sources,
      parserInputs,
      recentScenes: recentScenes.length,
      provenance: Object.freeze({
        ...(target === undefined ? {} : { target: Object.freeze(target) }),
        ...(baseline === undefined ? {} : { baseline }),
        history: Object.freeze(provenanceHistory),
      }),
      creation,
      trace,
    };
  }

  return Object.freeze({ context });
}
