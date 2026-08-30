import { Context } from '@deepseek-ai/cordis';
import { TypertGatewayError, TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { CallId, LlmAdapter, LlmError, LlmRuntime, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it, vi } from 'vitest';

import { registerNovelAgentTools, type NovelAgentService } from '../agents/agent-tools.js';
import { asLlmBackend, collectCandidate, GenerationError, type GenerationSettings } from '../llm/port/index.js';
import { NOVEL_PROBE_NAMESPACE, probeContribution, probeData, PROBE_MARKER } from '../remote.js';
import { defineRemote } from './remote/shared.js';

/**
 * I85 DSH family `0.1.1-rc.2` 真实运行时兼容门（R17-3 / R17-4；计划 §17 I85 交付物 4）。
 *
 * 不是 Host-only artifact scan：以下断言直接使用已安装的 rc.2 公共包驱动真实
 * ToolRuntime / LlmRuntime / TypertGateway：
 * - Tools：真实注册 + 合法执行 + 非法参数在业务执行前 fail closed（defineTool
 *   的 ToolArgsError/INVALID_ARGS），缺失 projectId 绝不变成字符串 "undefined"；
 * - LLM：真实 `ctx.llm` runtime + fake adapter 锁定 request/text-delta/finish/
 *   cancel，以及 provider-specific stop 支持/拒绝（pi-ai 式 UNSUPPORTED_OPTION
 *   显式浮出，不静默承诺）；
 * - Remote：真实 Typert gateway 往返成功、非法参数、卸载负测。
 */

const SETTINGS: GenerationSettings = {
  modelRef: 'dsh/default',
  credentialRef: 'dsh/managed',
  temperature: 0.4,
  stopSequences: ['<END>'],
};

/* --------------------------------------------------------------------------
 * Tools：真实 ToolRuntime（R17-4）
 * ------------------------------------------------------------------------ */

function mountToolRuntime(): { ctx: Context; tools: ToolRuntime } {
  const ctx = new Context();
  // ToolRuntime 构造时经 `ctx.systemPrompt.tools(...)` 注册提示装配回调；本门
  // 只验证注册/执行/参数闸，systemPrompt 用最小 stub 而非完整装配服务。
  ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} });
  const tools = new ToolRuntime(ctx, { mode: 'native' });
  return { ctx, tools };
}

function fakeAgentService(): NovelAgentService & {
  open: ReturnType<typeof vi.fn>;
  listProjects: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  context: ReturnType<typeof vi.fn>;
  proposeContinue: ReturnType<typeof vi.fn>;
  adjudicate: ReturnType<typeof vi.fn>;
  inspire: ReturnType<typeof vi.fn>;
} {
  const service = {
    open: vi.fn(async (projectId: string) => ({ project: { id: projectId }, layers: {} })),
    listProjects: vi.fn(async () => []),
    status: vi.fn(),
    context: vi.fn(),
    proposeContinue: vi.fn(),
    adjudicate: vi.fn(),
    inspire: vi.fn(),
  } as unknown as NovelAgentService & {
    open: ReturnType<typeof vi.fn>;
    listProjects: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
    context: ReturnType<typeof vi.fn>;
    proposeContinue: ReturnType<typeof vi.fn>;
    adjudicate: ReturnType<typeof vi.fn>;
    inspire: ReturnType<typeof vi.fn>;
  };
  return service;
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((block) => block.text ?? '').join('');
}

describe('I85 Tools 真实 ToolRuntime 门（R17-4）', () => {
  it('注册六个 novel 工具并经真实 runtime 合法执行', async () => {
    const { ctx, tools } = mountToolRuntime();
    const service = fakeAgentService();
    try {
      const dispose = registerNovelAgentTools(ctx, service);
      for (const name of ['novel_open', 'novel_status', 'novel_context', 'novel_continue', 'novel_adjudicate', 'novel_inspire']) {
        expect(tools.get(name)).toBeDefined();
      }
      const result = await tools.execute({
        callId: CallId('call-1'),
        name: 'novel_open',
        arguments: { projectId: 'demo' },
        signal: new AbortController().signal,
      });
      expect(result.isError).toBe(false);
      expect(service.open).toHaveBeenCalledTimes(1);
      expect(service.open).toHaveBeenCalledWith('demo');
      dispose();
      expect(tools.get('novel_open')).toBeUndefined();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('缺失 projectId 在业务执行前 fail closed，绝不变成字符串 "undefined"', async () => {
    const { ctx, tools } = mountToolRuntime();
    const service = fakeAgentService();
    try {
      const dispose = registerNovelAgentTools(ctx, service);
      const result = await tools.execute({
        callId: CallId('call-2'),
        name: 'novel_open',
        arguments: {},
        signal: new AbortController().signal,
      });
      expect(result.isError).toBe(true);
      expect(service.open).not.toHaveBeenCalled();
      const text = textOf(result);
      expect(text).toContain('projectId');
      expect(text).not.toContain('undefined');
      dispose();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('I105 novel_continue accepts both/neither explicit target fields and rejects half before the service', async () => {
    const { ctx, tools } = mountToolRuntime();
    const service = fakeAgentService();
    service.proposeContinue.mockResolvedValue({
      candidate: {
        id: 'cand-1', intent: 'continue', target: { projectId: 'demo', chapterId: 'chapter-main', sceneId: 'scene-next' },
        prompt: 'p', text: 'text', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    try {
      const dispose = registerNovelAgentTools(ctx, service);
      const signal = new AbortController().signal;
      const implicit = await tools.execute({ callId: CallId('call-target-1'), name: 'novel_continue', arguments: { projectId: 'demo' }, signal });
      const explicit = await tools.execute({ callId: CallId('call-target-2'), name: 'novel_continue', arguments: { projectId: 'demo', chapterId: 'chapter-main', sceneId: 'scene-next' }, signal });
      const partial = await tools.execute({ callId: CallId('call-target-3'), name: 'novel_continue', arguments: { projectId: 'demo', chapterId: 'chapter-main' }, signal });
      expect(implicit.isError).toBe(false);
      expect(explicit.isError).toBe(false);
      expect(partial.isError).toBe(true);
      expect(service.proposeContinue).toHaveBeenCalledTimes(2);
      expect(service.proposeContinue.mock.calls[0][1]).toBe(signal);
      expect(service.proposeContinue.mock.calls[1][1]).toEqual({ chapterId: 'chapter-main', sceneId: 'scene-next' });
      expect(service.proposeContinue.mock.calls[1][2]).toBe(signal);
      dispose();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('枚举越界的 decision 在业务执行前 fail closed', async () => {
    const { ctx, tools } = mountToolRuntime();
    const service = fakeAgentService();
    try {
      const dispose = registerNovelAgentTools(ctx, service);
      const result = await tools.execute({
        callId: CallId('call-3'),
        name: 'novel_adjudicate',
        arguments: { candidateId: 'cand-1', decision: 'accept-forever' },
        signal: new AbortController().signal,
      });
      expect(result.isError).toBe(true);
      expect(service.adjudicate).not.toHaveBeenCalled();
      dispose();
    } finally {
      await ctx.fiber.dispose();
    }
  });
});

/* --------------------------------------------------------------------------
 * LLM：真实 LlmRuntime + fake adapter（R17-4）
 * ------------------------------------------------------------------------ */

type AdapterBehavior = 'stop-capable' | 'stop-refusing' | 'abort';

class RecordingAdapter extends LlmAdapter {
  readonly seen: GenerateOptions[] = [];
  constructor(private readonly behavior: AdapterBehavior) {
    super();
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.seen.push(options);
    if (this.behavior === 'stop-refusing' && options.stop !== undefined) {
      // rc.2 `dsh-llm-pi-ai` 对非空 stop 的显式拒绝（UNSUPPORTED_OPTION，provider I/O 前）。
      throw new LlmError('llm-pi-ai does not support GenerateOptions.stop', 'UNSUPPORTED_OPTION');
    }
    if (this.behavior === 'abort') {
      // rc.2 runtime 把 adapter throw 归一为 terminal aborted/error finish。
      throw new LlmError('cancelled by adapter', 'ABORTED');
    }
    yield { type: 'text-delta', index: 0, text: '夜色' };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

function mountLlm(behavior: AdapterBehavior): { ctx: Context; llm: LlmRuntime; adapter: RecordingAdapter } {
  const ctx = new Context();
  const llm = new LlmRuntime(ctx);
  const adapter = new RecordingAdapter(behavior);
  llm.registerAdapter(['dsh'], adapter);
  return { ctx, llm, adapter };
}

describe('I85 LLM 真实 runtime 门（R17-4）', () => {
  it('锁定 request 合同并转发 stopSequences（deepseek 式支持路由）', async () => {
    const { ctx, llm, adapter } = mountLlm('stop-capable');
    try {
      const result = await collectCandidate(asLlmBackend(llm), { prompt: 'continue', settings: SETTINGS });
      expect(result).toEqual({ text: '夜色', chunks: 2 });
      expect(adapter.seen).toHaveLength(1);
      expect(adapter.seen[0]).toMatchObject({
        provider: 'dsh',
        model: 'default',
        temperature: 0.4,
        stop: ['<END>'],
      });
      expect(adapter.seen[0].messages[0]).toMatchObject({
        role: 'user',
        content: [{ type: 'text', text: 'continue' }],
        source: { kind: 'plugin', plugin: 'novel-creation-tool' },
      });
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('pi-ai 式 stop 拒绝显式浮出，不静默承诺', async () => {
    const { ctx, llm, adapter } = mountLlm('stop-refusing');
    try {
      const rejection = collectCandidate(asLlmBackend(llm), { prompt: 'continue', settings: SETTINGS });
      await expect(rejection).rejects.toMatchObject({ code: 'backend' });
      await expect(rejection).rejects.toThrow(/does not support GenerateOptions\.stop/);
      // 拒绝发生在 provider 业务之前：适配器只收到一次请求，无静默跳过。
      expect(adapter.seen).toHaveLength(1);
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('adapter 中止归一为显式 aborted finish，不悬挂', async () => {
    const { ctx, llm } = mountLlm('abort');
    try {
      const rejection = collectCandidate(asLlmBackend(llm), { prompt: 'continue', settings: SETTINGS });
      await expect(rejection).rejects.toMatchObject({ code: 'backend' });
      await expect(rejection).rejects.toThrow(/cancelled/);
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('端口级 cancel 仍以 cancelled 码显式终止', async () => {
    const { ctx, llm } = mountLlm('stop-capable');
    try {
      const controller = new AbortController();
      controller.abort();
      await expect(collectCandidate(asLlmBackend(llm), { prompt: 'continue', settings: SETTINGS, signal: controller.signal }))
        .rejects.toBeInstanceOf(GenerationError);
      await expect(collectCandidate(asLlmBackend(llm), { prompt: 'continue', settings: SETTINGS, signal: controller.signal }))
        .rejects.toMatchObject({ code: 'cancelled' });
    } finally {
      await ctx.fiber.dispose();
    }
  });
});

/* --------------------------------------------------------------------------
 * Remote：真实 Typert gateway（R17-3）
 * ------------------------------------------------------------------------ */

describe('I85 Typert gateway 真实往返门（R17-3）', () => {
  async function mountGateway(): Promise<{ ctx: Context; dispose: () => Promise<void> }> {
    const ctx = new Context();
    await ctx.plugin(TypertRegistry);
    await ctx.plugin(TypertGatewayService);
    // 生产同款装配：receiver 必须带 `typertRemote` 绑定（defineRemote，I75 接线工厂），
    // 否则 gateway 的 binding 校验拒绝（与生产组合根一致）。
    const probeService = defineRemote(NOVEL_PROBE_NAMESPACE, NOVEL_PROBE_NAMESPACE, { probe: probeData }, [
      { method: 'probe', call: () => probeData() },
    ]);
    ctx.provide(NOVEL_PROBE_NAMESPACE, probeService);
    const dispose = ctx.typert.register(probeContribution);
    return { ctx, dispose };
  }

  it('往返成功：gateway invoke 到达业务并返回校验结果', async () => {
    const { ctx, dispose } = await mountGateway();
    try {
      const gateway = ctx.get('typertGateway') as TypertGatewayService;
      const result = await gateway.invoke({ namespace: NOVEL_PROBE_NAMESPACE, method: 'probe', args: {} });
      expect(result).toEqual({ marker: PROBE_MARKER, ready: true });
      dispose();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('非法参数在业务前拒绝（输入校验负测）', async () => {
    const { ctx, dispose } = await mountGateway();
    try {
      const gateway = ctx.get('typertGateway') as TypertGatewayService;
      await expect(gateway.invoke({ namespace: NOVEL_PROBE_NAMESPACE, method: 'probe', args: { projectId: 'x' } }))
        .rejects.toBeInstanceOf(TypertGatewayError);
      dispose();
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('卸载后 endpoint 消失且调用失败（卸载负测）', async () => {
    const { ctx, dispose } = await mountGateway();
    const gateway = ctx.get('typertGateway') as TypertGatewayService;
    await dispose();
    await expect(gateway.invoke({ namespace: NOVEL_PROBE_NAMESPACE, method: 'probe', args: {} }))
      .rejects.toBeInstanceOf(TypertGatewayError);
    await ctx.fiber.dispose();
  });
});
