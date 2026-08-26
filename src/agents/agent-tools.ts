import type { Context } from '@deepseek-ai/cordis';

import { validateProjectId } from '../core/io/path.js';
import { INITIAL_STATE, type ProjectOpenResult } from '../core/schema/project-lifecycle.js';
import type { StoryGenerationSources } from '../core/pipeline/index.js';
import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import type { GenerationSettings } from '../llm/port/index.js';
import type { StoryLifecycleParserInputs, StoryLifecycleRequest } from '../host/story-lifecycle-service.js';
import type { ContinuationResult, NovelContinuationService } from '../host/continuation-service.js';
import type { NovelProjectService } from '../host/project-service.js';
import type { NovelCharacterService } from '../host/character-service.js';
import type { NovelWorldviewService } from '../host/worldview-service.js';
import type { NovelOutlineService } from '../host/outline-service.js';
import type { NovelRelationshipService } from '../host/relationship-service.js';
import type { NovelStateService } from '../host/state-service.js';
import type { NovelCanonService } from '../host/canon-service.js';
import type { NovelStyleService } from '../host/style-service.js';
import type { NovelRuleService } from '../host/rule-service.js';
import type { NovelKnowledgeService } from '../host/knowledge-service.js';
import type { NovelTextService } from '../host/text-service.js';
import type { NovelInspirationService, InspirationResult } from '../host/inspiration-service.js';
import type { NovelConfirmationService } from '../host/confirmation-service.js';
import type { C2StateParserOutput } from '../llm/parse/state.js';
import { applyC2StateOperationsToDraft } from '../llm/parse/state.js';
import type { C1RelationshipParserOutput } from '../llm/parse/relationship.js';
import { materializeC1RelationshipOperations } from '../llm/parse/relationship.js';
import type { C3KnowledgeParserOutput } from '../llm/parse/knowledge.js';
import { materializeC3KnowledgeOperations } from '../llm/parse/knowledge.js';
import type { C4CanonParserOutput } from '../llm/parse/canon.js';
import type { B2WorldviewParserOutput } from '../llm/parse/worldview.js';
import type { StateDraft } from '../core/state/index.js';

/**
 * 小说创作 Agent 工具层（对话驱动写作，设计 §14.8 之后新增的对话创作入口）。
 *
 * 职责：把既有 Host 领域服务包装成 Agent 可调用的模型工具，让用户直接在 DSH
 * 对话框里驱动生成并落到本地项目：
 *
 * - `novel_open` / `novel_status`：打开作品并回读各层就绪状态（只读）；
 * - `novel_context`：组装「下一场景」写作上下文（大纲导航、当前细纲卡、C2 状态、
 *   C4 正史尾部、B3 角色、B4 风格、B1 规则、C3 POV 知情、C5 文本尾部）；
 * - `novel_continue`：按当前上下文续写下一场景；`decision: 'accept'` 时经 I30
 *   生命周期把 C5 文本与 C2/C1/C3/C4/B2 结构化变更落盘（仍走既有 Domain Service
 *   写入与 ConfirmationGate，绝不绕过 Host 改文件）；
 * - `novel_inspire`：2–3 个灵感方向（只读，不写）。
 *
 * 契约/不变式：
 * - 本模块不拥有任何存储；全部读写委托给注入的 Host 服务（H0-5）。
 * - 低置信结构化变更 fail-closed（抛错并提示需 GUI 确认），不自动落盘。
 * - 工具经 DSH `tools` 注册表暴露（`registerNovelAgentTools`），卸载时完整释放。
 */

/** 该工具层需要的全部 Host 服务与设置解析器。 */
export interface NovelAgentDeps {
  readonly project: NovelProjectService;
  readonly characters: NovelCharacterService;
  readonly worldview: NovelWorldviewService;
  readonly outline: NovelOutlineService;
  readonly relationship: NovelRelationshipService;
  readonly state: NovelStateService;
  readonly canon: NovelCanonService;
  readonly style: NovelStyleService;
  readonly rules: NovelRuleService;
  readonly knowledge: NovelKnowledgeService;
  readonly text: NovelTextService;
  readonly continuation: NovelContinuationService;
  readonly inspiration: NovelInspirationService;
  readonly confirmation: NovelConfirmationService;
  /** 解析当前活动生成设置（modelRef/credentialRef/maxTokens/思维链）。 */
  readonly resolveSettings: () => Promise<GenerationSettings>;
  /** 创作台通用设置：目标字数 + 内容不足时是否询问。 */
  readonly workbenchSettings: {
    load(): Promise<{ readonly wordTarget: number; readonly askWhenThin: boolean }>;
  };
}

/** 创作台通用设置的紧凑视图（透出给 Agent 决定是否询问补充）。 */
export interface NovelCreationSettingsView {
  readonly wordTarget: number;
  readonly askWhenThin: boolean;
}

/** 一个作品的紧凑状态视图（供 Agent 与工具展示）。 */
export interface NovelProjectStatus {
  readonly projectId: string;
  readonly layers: ProjectOpenResult['layers'];
  readonly characters: number;
  readonly worldview: number;
  readonly relationships: number;
  readonly canonEvents: number;
  readonly scenes: number;
  readonly outlineReady: boolean;
  readonly creation: NovelCreationSettingsView;
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
}

export interface NovelAgentService {
  open(projectId: string): Promise<ProjectOpenResult>;
  listProjects(): Promise<readonly { id: string; name: string }[]>;
  status(projectId: string): Promise<NovelProjectStatus>;
  context(projectId: string): Promise<NovelAgentContext>;
  continueScene(projectId: string, decision: 'accept' | 'reject', signal?: AbortSignal): Promise<ContinuationResult>;
  inspire(projectId: string, signal?: AbortSignal): Promise<InspirationResult>;
}

function hasLowConfidence(ops: readonly { confidence?: unknown }[]): boolean {
  return ops.some((operation) => operation.confidence === 'low');
}

export function createNovelAgentService(deps: NovelAgentDeps): NovelAgentService {
  const opened = new Set<string>();

  async function openProject(projectId: string): Promise<ProjectOpenResult> {
    validateProjectId(projectId);
    if (!opened.has(projectId)) {
      // 六层 + Gate 由 projectService.openProject 打开；其余层在此补齐，幂等。
      await Promise.all([
        deps.project.openProject(projectId),
        deps.style.open(projectId),
        deps.rules.open(projectId),
        deps.knowledge.open(projectId),
        deps.text.open(projectId),
        deps.continuation.open(projectId),
      ]);
      opened.add(projectId);
    }
    return deps.project.openProject(projectId);
  }

  /** 装配下一场景的全部生成源（上下文/导航/知情/正史/历史）。 */
  async function buildContext(projectId: string): Promise<NovelAgentContext> {
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
    const sources: StoryGenerationSources = {
      context: {
        macros: { user: '作者', pov: card.pov },
        sources: {
          rules: activeRules,
          style: styleSegment,
          characters: sceneCharacters,
          worldview: worldview.map((entry) => ({ entry, entryId: entry.id, ancestors: [], level: 0 })),
          relationships: { relationships, characterIds },
          state,
        },
      },
      navigation,
      knowledge: knowledgeView,
      canon: canonViews,
      history: { recentScenes, historicalSummaries: [] },
    };
    const parserInputs = {
      c2: { state },
      c1: { current: relationships },
      c3: { entries: [...fullKnowledge.entries], states: [...fullKnowledge.states] },
      c4: { canon: [...canonViews] },
      b2: { current: worldview },
    };
    const creation = await deps.workbenchSettings.load();
    return { projectId, navigation, card, sources, parserInputs, recentScenes: recentScenes.length, creation };
  }

  /** 把解析输出应用到既有 Domain Service 的写回器（顺序 C2→C1→C3→C4→B2，设计 §14.7.4）。 */
  function buildWriters(projectId: string, requestId: string): StoryLifecycleRequest['writers'] {
    return {
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
          // B2 解析器契约（b2ReplacementSchema）约定 version/status/supersededBy 归存储层；
          // 改写服务要求完整 WorldEntryInput，此处补默认值（语义同 asWorldEntryInput）。
          await deps.worldview.rewrite(projectId, operation.targetId, {
            ...operation.replacement,
            status: 'active',
            supersededBy: null,
          });
        }
      },
    };
  }

  const service: NovelAgentService = {
    async open(projectId) {
      return openProject(projectId);
    },
    listProjects: () => deps.project.listProjects(),
    async status(projectId) {
      const openedResult = await openProject(projectId);
      const [characters, worldview, relationships, canonViews, chapters, outline] = await Promise.all([
        deps.characters.list(projectId),
        deps.worldview.list(projectId),
        deps.relationship.read(projectId),
        deps.canon.query(projectId),
        deps.text.listChapters(projectId),
        deps.outline.readiness(projectId),
      ]);
      return Object.freeze({
        projectId,
        layers: openedResult.layers,
        characters: characters.length,
        worldview: worldview.length,
        relationships: relationships.length,
        canonEvents: canonViews.length,
        scenes: chapters.reduce((total, chapter) => total + chapter.scenes.length, 0),
        outlineReady: outline === 'ready',
        creation: await deps.workbenchSettings.load(),
      });
    },
    async context(projectId) {
      await openProject(projectId);
      return buildContext(projectId);
    },
    async continueScene(projectId, decision, signal) {
      await openProject(projectId);
      const built = await buildContext(projectId);
      const requestId = `agent-continue-${Date.now()}`;
      // 通用目标字数优先于细纲卡自带 wordTarget（创作设置）。
      const card = { ...built.card, wordTarget: built.creation.wordTarget };
      const request = {
        id: requestId,
        projectId,
        chapter: { id: 'chapter-1', index: 1, title: '正文', pov: card.pov, status: 'draft' as const },
        scene: {
          id: `agent-scene-${Date.now()}`,
          summary: card.summary,
          beats: [built.navigation.beatId],
          canonEvents: [],
          notes: '',
        },
        sources: built.sources,
        card,
        navigation: built.navigation,
        settings: await deps.resolveSettings(),
        decision,
        afterGenerationViolations: [],
        beforeWritebackViolations: [],
        parserInputs: built.parserInputs,
        writers: buildWriters(projectId, requestId),
        signal,
      };
      return deps.continuation.continue(request);
    },
    async inspire(projectId, signal) {
      await openProject(projectId);
      const outline = await deps.outline.read(projectId);
      const progress = await deps.outline.readProgress(projectId);
      const prompt = `基于当前大纲「${outline.logline}」给出 2-3 个可区分的下一阶段创作方向。`;
      const context = `当前幕/节：${progress.currentAct}/${progress.currentBeat}`;
      return deps.inspiration.propose({ prompt, context }, signal);
    },
  };
  return Object.freeze(service);
}

/** 从细纲卡中选择当前应写的一张：优先当前 beat 中未完成的，其次最后一张。 */
function pickCurrentCard(
  cards: readonly { beatId: string; detailBeat: DetailBeat }[],
  navigation: OutlineNavigation,
): DetailBeat | undefined {
  const inBeat = cards.filter((card) => card.beatId === navigation.beatId);
  const picked = inBeat.find((card) => card.detailBeat.status !== 'done') ?? inBeat[inBeat.length - 1];
  return picked?.detailBeat ?? undefined;
}

function fallbackCard(navigation: OutlineNavigation): DetailBeat {
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

/* --------------------------------------------------------------------------
 * DSH 模型工具注册
 * ------------------------------------------------------------------------ */

/** 工具执行上下文的最小投影（DSH ToolRunContext）。 */
interface AgentToolExec {
  readonly signal?: AbortSignal;
}

interface AgentToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  readonly output: {
    readonly schema: unknown;
    render(args: unknown, value: unknown): Array<{ type: 'text'; text: string }>;
  };
  readonly execute: (args: Record<string, unknown>, exec: AgentToolExec) => Promise<unknown>;
}

const TEXT_OUTPUT = {
  schema: { type: 'object', additionalProperties: true },
  render(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
    return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
  },
};

/** 把工具参数组装成完整 JSON Schema（DSH 运行时要求顶层 type:'object'）。 */
function objectParams(
  properties: Record<string, { type: string; description?: string; enum?: readonly string[] }>,
  required: readonly string[] = [],
): Record<string, unknown> {
  return { type: 'object', properties, required: [...required], additionalProperties: false };
}

/** 注册小说创作工具到 DSH `tools` 注册表；返回卸载器（Fiber 归属）。 */
export function registerNovelAgentTools(ctx: Context, service: NovelAgentService): () => void {
  // 经 get('tools', false) 读取可选服务；直接属性访问会被 Cordis 代理以
  // “cannot get property without inject” 拒绝（tools 未声明进 inject）。
  const tools = ctx.get('tools', false) as { register(def: unknown): unknown } | undefined;
  if (!tools) return () => {};
  const definitions: AgentToolDefinition[] = [
    {
      name: 'novel_open',
      description: '打开一个小说作品（六层+Gate+文本库），返回各层就绪状态。项目 id 见 novel_status。',
      parameters: objectParams({ projectId: { type: 'string', description: '作品 id（如 1 或 my-book）' } }, ['projectId']),
      output: TEXT_OUTPUT,
      async execute(args) {
        const result = await service.open(String(args.projectId));
        return { projectId: result.project.id, layers: result.layers };
      },
    },
    {
      name: 'novel_status',
      description: '列出作品，或返回指定作品的层就绪度与实体数量（角色/世界观/关系/正史/场景）。',
      parameters: objectParams({ projectId: { type: 'string', description: '作品 id；省略则列出全部作品' } }),
      output: TEXT_OUTPUT,
      async execute(args) {
        if (args.projectId === undefined || args.projectId === '') return { projects: await service.listProjects() };
        return service.status(String(args.projectId));
      },
    },
    {
      name: 'novel_context',
      description: '组装当前写作上下文：大纲导航、当前细纲卡、状态、正史、角色、风格、规则、知情视图、最近文本。用于续写前查看。',
      parameters: objectParams({ projectId: { type: 'string', description: '作品 id' } }, ['projectId']),
      output: TEXT_OUTPUT,
      async execute(args) {
        const built = await service.context(String(args.projectId));
        return {
          projectId: built.projectId,
          navigation: built.navigation,
          currentCard: built.card,
          recentScenes: built.recentScenes,
          // sources 仅回传紧凑摘要，避免把整包上下文塞给模型（完整 prompt 由续写工具内部装配）。
          characters: built.sources.context.sources.characters.length,
          worldview: built.sources.context.sources.worldview.length,
          canon: built.sources.canon.length,
          creation: built.creation,
        };
      },
    },
    {
      name: 'novel_continue',
      description: '按当前大纲/细纲/状态/正史续写下一场景。decision=accept 时落盘 C5 文本与结构化层（C2/C1/C3/C4/B2）；reject 时不写入。返回生成文本与执行状态。',
      parameters: objectParams({
        projectId: { type: 'string', description: '作品 id' },
        decision: { type: 'string', enum: ['accept', 'reject'], description: 'accept=生成并落盘；reject=仅生成不落盘' },
      }, ['projectId', 'decision']),
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        const result = await service.continueScene(String(args.projectId), args.decision as 'accept' | 'reject', exec.signal);
        return {
          status: result.execution.result.status,
          // 失败路径（未落盘）下 scene 与 candidate.text 可能为 undefined，须兜底为
          // 无损 JSON 允许的值，否则工具输出序列化失败、诊断不可见。
          text: result.scene?.content ?? result.execution.candidate.text ?? '',
          sceneId: result.scene?.id ?? null,
          violations: result.execution.result,
        };
      },
    },
    {
      name: 'novel_inspire',
      description: '为作品生成 2-3 个可区分的下一阶段创作方向（只读，不写入任何层）。',
      parameters: objectParams({ projectId: { type: 'string', description: '作品 id' } }, ['projectId']),
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        return service.inspire(String(args.projectId), exec.signal);
      },
    },
  ];
  const disposers: Array<() => void> = [];
  for (const definition of definitions) {
    const disposer = tools.register(definition) as (() => void) | undefined;
    if (typeof disposer === 'function') disposers.push(disposer);
  }
  return () => { for (const dispose of disposers) dispose(); };
}

export type { ProjectOpenResult };
