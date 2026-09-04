import type { Context } from '@deepseek-ai/cordis';
import { defineTool, type InferArgs, type ParameterSchemaSpec, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { createNovelAgentService, type NovelAgentService } from '../host/novel-agent-service.js';

export { createNovelAgentService } from '../host/novel-agent-service.js';
export type { NovelAgentDeps, NovelAgentService, NovelProjectStatus } from '../host/novel-agent-service.js';
export type { ProjectOpenResult, NovelAgentContext, NovelCreationSettingsView, OutlineNavigation, DetailBeat } from '../host/novel-agent-service.js';

/* --------------------------------------------------------------------------
 * DSH 模型工具注册
 * ------------------------------------------------------------------------ */

/**
 * I85（R17-4）：工具经 `@deepseek-ai/dsh-tools` 的 `defineTool` 定义——它是 DSH
 * 运行时在业务执行前按声明 Schema fail closed 的唯一规范机制（校验失败抛
 * ToolArgsError/INVALID_ARGS，工具体不执行；ToolRuntime 自身不校验参数）。
 * 缺失 projectId 因此绝不可能变成字符串 "undefined" 传入领域服务。
 *
 * `output` 是故意开放的任意 JSON 对象（TEXT_OUTPUT），`execute` 返回领域形状；
 * 运行时仍按 `output.schema` 校验成功值。类型边界在此收窄，不改运行时语义。
 */
function agentTool<const P extends ParameterSchemaSpec>(input: {
  readonly name: string;
  readonly description: string;
  readonly parameters: P;
  readonly execute: (args: InferArgs<P>, exec: ToolRunContext) => Promise<unknown> | unknown;
}): unknown {
  return defineTool({
    name: input.name,
    description: input.description,
    parameters: input.parameters,
    output: TEXT_OUTPUT as never,
    execute: input.execute as never,
  });
}

const TEXT_OUTPUT = {
  schema: { type: 'object', additionalProperties: true },
  render(_args: unknown, value: unknown): Array<{ type: 'text'; text: string }> {
    return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }];
  },
};

/** 注册小说创作工具到 DSH `tools` 注册表；返回卸载器（Fiber 归属）。 */
export function registerNovelAgentTools(ctx: Context, service: NovelAgentService): () => void {
  // 经 get('tools', false) 读取可选服务；直接属性访问会被 Cordis 代理以
  // “cannot get property without inject” 拒绝（tools 未声明进 inject）。
  const tools = ctx.get('tools', false) as { register(def: unknown): unknown } | undefined;
  if (!tools) return () => {};
  const definitions = [
    agentTool({
      name: 'novel_open',
      description: '打开一个小说作品（六层+Gate+文本库），返回各层就绪状态。项目 id 见 novel_status。',
      parameters: { projectId: { type: 'string', description: '作品 id（如 1 或 my-book）', required: true } },
      async execute(args) {
        const result = await service.open(args.projectId);
        return { projectId: result.project.id, layers: result.layers };
      },
    }),
    agentTool({
      name: 'novel_status',
      description: '列出作品，或返回指定作品的层就绪度与实体数量（角色/世界观/关系/正史/场景）。',
      parameters: { projectId: { type: 'string', description: '作品 id；省略则列出全部作品' } },
      async execute(args) {
        if (args.projectId === undefined || args.projectId === '') return { projects: await service.listProjects() };
        return service.status(args.projectId);
      },
    }),
    agentTool({
      name: 'novel_context',
      description: '组装当前写作上下文：大纲导航、当前细纲卡、状态、正史、角色、风格、规则、知情视图、最近文本。用于续写前查看。',
      parameters: { projectId: { type: 'string', description: '作品 id', required: true } },
      async execute(args) {
        const built = await service.context(args.projectId);
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
    }),
    agentTool({
      name: 'novel_continue',
      description: '按当前大纲/细纲/状态/正史续写下一场景，只产生可审阅候选（零写，不落盘）。接受/拒绝/重写请调用 novel_adjudicate（candidateId）。',
      parameters: {
        projectId: { type: 'string', description: '作品 id', required: true },
        chapterId: { type: 'string', description: '显式目标章节 id；必须与 sceneId 同时提供' },
        sceneId: { type: 'string', description: '显式未占用场景 id；必须与 chapterId 同时提供' },
      },
      async execute(args, exec) {
        const hasChapter = args.chapterId !== undefined;
        const hasScene = args.sceneId !== undefined;
        if (hasChapter !== hasScene) throw new Error('chapterId and sceneId must be provided together');
        const target = hasChapter && hasScene ? { chapterId: args.chapterId!, sceneId: args.sceneId! } : undefined;
        const { candidate } = target === undefined
          ? await service.proposeContinue(args.projectId, exec.signal)
          : await service.proposeContinue(args.projectId, target, exec.signal);
        return { candidateId: candidate.id, intent: candidate.intent, text: candidate.text, target: candidate.target };
      },
    }),
    agentTool({
      name: 'novel_adjudicate',
      description: '对候选作出裁决（candidateId 来自 novel_continue）。accept=进入标准校验→解析→受控写回（C5 与结构化层）；reject=零写；rewrite=产生后继候选且旧候选不可再接受。',
      parameters: {
        candidateId: { type: 'string', description: '候选 id（novel_continue 返回）', required: true },
        decision: { type: 'string', enum: ['accept', 'reject', 'rewrite'], description: 'accept=受控写回；reject=零写；rewrite=后继候选', required: true },
      },
      async execute(args, exec) {
        return service.adjudicate(args.candidateId, args.decision, exec.signal);
      },
    }),
    agentTool({
      name: 'novel_inspire',
      description: '为作品生成 2-3 个可区分的下一阶段创作方向（只读，不写入任何层）。',
      parameters: { projectId: { type: 'string', description: '作品 id', required: true } },
      async execute(args, exec) {
        return service.inspire(args.projectId, exec.signal);
      },
    }),
  ];
  const disposers: Array<() => void> = [];
  for (const definition of definitions) {
    const disposer = tools.register(definition) as (() => void) | undefined;
    if (typeof disposer === 'function') disposers.push(disposer);
  }
  return () => { for (const dispose of disposers) dispose(); };
}
