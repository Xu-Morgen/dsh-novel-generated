import type { Context } from '@deepseek-ai/cordis';

import { validateProjectId } from '../core/io/path.js';
import { INITIAL_STATE, type ProjectOpenResult } from '../core/schema/project-lifecycle.js';
import type { DetailBeat } from '../core/schema/outline.js';
import type { OutlineNavigation } from '../core/schema/outline-progress.js';
import type { GenerationSettings } from '../llm/port/index.js';
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
import type { NovelWritingAdjudicationService, WritingAdjudicationOutcome } from '../host/writing-adjudication-service.js';
import type { WritingCandidate } from '../core/candidate/index.js';
import { createNextSceneContextBuilder, type NovelAgentContext, type NovelCreationSettingsView } from '../host/writing-context.js';

/**
 * 小说创作 Agent 工具层（对话驱动写作，design §14.8 之后新增的对话创作入口）。
 *
 * I63 退役生成前预先 accept 的产品路径（design §14.9 / R13-4）：`novel_continue`
 * 不再接受 `decision=accept` —— 它只产生绑定 project/chapter/scene/sourceHash 的
 * 候选（零写），接受/拒绝/重写统一经 `novel_adjudicate` 走写作裁决服务（与 GUI
 * 审阅面板同一 owner，见 writing-adjudication-service）。
 *
 * - `novel_open` / `novel_status`：打开作品并回读各层就绪状态（只读）；
 * - `novel_context`：组装「下一场景」写作上下文（大纲导航、当前细纲卡、C2 状态、
 *   C4 正史尾部、B3 角色、B4 风格、B1 规则、C3 POV 知情、C5 文本尾部）；
 * - `novel_continue`：续写下一场景候选（只产候选，绝不预先接受或写任何层）；
 * - `novel_adjudicate`：对候选接受 / 拒绝 / 重写（accept 才经 I30 标准生命周期
 *   受控写回；reject 零写；rewrite 产生后继候选且旧候选不可静默接受）；
 * - `novel_inspire`：2–3 个灵感方向（只读，不写）。
 *
 * 契约/不变式：
 * - 本模块不拥有任何存储；上下文装配复用 `writing-context` 共享 builder，裁决委托
 *   `novelWritingAdjudication`（不复制第二套实现）。
 * - 低置信结构化变更 fail-closed（由写作裁决服务在写回层拒绝）。
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
  /** I63：候选产生与裁决统一走写作裁决服务（退役 novel_continue 预先 accept）。 */
  readonly writing: NovelWritingAdjudicationService;
  readonly inspiration: NovelInspirationService;
  readonly confirmation: NovelConfirmationService;
  /** 解析当前活动生成设置（modelRef/credentialRef/maxTokens/思维链）。 */
  readonly resolveSettings: () => Promise<GenerationSettings>;
  /** 创作台通用设置：目标字数 + 内容不足时是否询问。 */
  readonly workbenchSettings: {
    load(): Promise<{ readonly wordTarget: number; readonly askWhenThin: boolean }>;
  };
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

export interface NovelAgentService {
  open(projectId: string): Promise<ProjectOpenResult>;
  listProjects(): Promise<readonly { id: string; name: string }[]>;
  status(projectId: string): Promise<NovelProjectStatus>;
  context(projectId: string): Promise<NovelAgentContext>;
  /** I63：续写下一场景候选（只产候选、零写；接受经 novel_adjudicate）。 */
  proposeContinue(projectId: string, signal?: AbortSignal): Promise<{ readonly candidate: WritingCandidate }>;
  /** I63：对候选裁决（accept 受控写回 / reject 零写 / rewrite 后继候选）。 */
  adjudicate(candidateId: string, decision: 'accept' | 'reject' | 'rewrite', signal?: AbortSignal): Promise<WritingAdjudicationOutcome>;
  inspire(projectId: string, signal?: AbortSignal): Promise<InspirationResult>;
}

export function createNovelAgentService(deps: NovelAgentDeps): NovelAgentService {
  const opened = new Set<string>();
  // 共享下一场景上下文装配（与 GUI 写作裁决服务同一 builder，AGENTS §2 不复制）。
  const contextBuilder = createNextSceneContextBuilder(deps);

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
        deps.writing.open(projectId),
      ]);
      opened.add(projectId);
    }
    return deps.project.openProject(projectId);
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
      return contextBuilder.context(projectId);
    },
    async proposeContinue(projectId, signal) {
      await openProject(projectId);
      return deps.writing.propose(projectId, { intent: 'continue' }, undefined, signal);
    },
    async adjudicate(candidateId, decision, signal) {
      return deps.writing.adjudicate(candidateId, decision, undefined, signal);
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
          // sources 仅回传紧凑摘要，避免把整包上下文塞给模型（完整 prompt 由候选命令内部装配）。
          characters: built.sources.context.sources.characters.length,
          worldview: built.sources.context.sources.worldview.length,
          canon: built.sources.canon.length,
          creation: built.creation,
        };
      },
    },
    {
      name: 'novel_continue',
      description: '按当前大纲/细纲/状态/正史续写下一场景，只产生可审阅候选（零写，不落盘）。接受/拒绝/重写请调用 novel_adjudicate（candidateId）。',
      parameters: objectParams({ projectId: { type: 'string', description: '作品 id' } }, ['projectId']),
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        const { candidate } = await service.proposeContinue(String(args.projectId), exec.signal);
        return { candidateId: candidate.id, intent: candidate.intent, text: candidate.text, target: candidate.target };
      },
    },
    {
      name: 'novel_adjudicate',
      description: '对候选作出裁决（candidateId 来自 novel_continue）。accept=进入标准校验→解析→受控写回（C5 与结构化层）；reject=零写；rewrite=产生后继候选且旧候选不可再接受。',
      parameters: objectParams({
        candidateId: { type: 'string', description: '候选 id（novel_continue 返回）' },
        decision: { type: 'string', enum: ['accept', 'reject', 'rewrite'], description: 'accept=受控写回；reject=零写；rewrite=后继候选' },
      }, ['candidateId', 'decision']),
      output: TEXT_OUTPUT,
      async execute(args, exec) {
        return service.adjudicate(String(args.candidateId), args.decision as 'accept' | 'reject' | 'rewrite', exec.signal);
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

export type { ProjectOpenResult, NovelAgentContext, NovelCreationSettingsView, OutlineNavigation, DetailBeat };
