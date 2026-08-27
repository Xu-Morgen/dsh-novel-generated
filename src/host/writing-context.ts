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
import type { StoryGenerationSources } from '../core/pipeline/index.js';
import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import type { StoryLifecycleParserInputs } from './story-lifecycle-service.js';
import { buildContextTrace, type ContextTrace } from '../core/trace/index.js';

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
  readonly navigation: OutlineNavigation;
  readonly card: DetailBeat;
  readonly sources: StoryGenerationSources;
  /** I30 解析器的输入快照（写回前由生命周期使用）。 */
  readonly parserInputs: StoryLifecycleParserInputs;
  readonly recentScenes: number;
  readonly creation: NovelCreationSettingsView;
  /** I71 注入解释（层/触发原因/预算裁剪摘要；与 ContextAssembler 实际选择一致）。 */
  readonly trace: ContextTrace;
}

export interface NextSceneContextProvider {
  context(projectId: string): Promise<NovelAgentContext>;
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
  /** 装配下一场景的全部生成源（上下文/导航/知情/正史/历史）。 */
  async function context(projectId: string): Promise<NovelAgentContext> {
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
    const characterIds = characters.map((character) => character.id);
    const sceneCharacters = await deps.characters.listForScene(projectId, characterIds);
    const recentScenes = chapters.flatMap((chapter) => chapter.scenes).slice(-3);
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
          relationships: { relationships, characterIds },
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
    return { projectId, navigation, card, sources, parserInputs, recentScenes: recentScenes.length, creation, trace };
  }

  return Object.freeze({ context });
}
