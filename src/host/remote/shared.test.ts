import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { strictCodec, stringCodec } from './common.js';
import { defineRemote, param, remoteInvocation } from './shared.js';
import { timelineReadInvocation } from './timeline.js';

/**
 * I75 接线层消费者夹具（design §0.1.2；架构审查 §9#1）。
 *
 * `defineRemote` 是组合根 16 个 Remote 适配块的统一工厂。本测试按「下游消费方式」
 * 验证：
 * - 适配对象带 `typertRemote` 绑定（gateway 派发元数据），方法按 wire 名直接
 *   转发到 domain service；
 * - 空方法规格 = 直通面（绑定 service 本身，如 novelWorkspace）；
 * - 经真实 Typert registry 注册后可解析 endpoint 并调用；
 * - `remoteInvocation` 生成的 descriptor 与既有公开 wire 契约逐字段一致
 *   （重构前后 wire 形状等价，公开契约不变）。
 */

interface DemoService {
  greet(projectId: string): Promise<{ greeting: string }>;
  ping(): { ok: true };
}

const demoService: DemoService = {
  async greet(projectId) { return { greeting: `hi ${projectId}` }; },
  ping() { return { ok: true } as const; },
};

// I91：defineRemote 第 5 参传 descriptor（类型耦合面）—— methods 逐个与
// descriptor 派生调用形状对齐；这里按下游方式同时消费 descriptor（注册解析）。
const greetInvocation = remoteInvocation('novelDemo', 'greet', [param('projectId', stringCodec)], strictCodec('novel-creation-tool#demoGreet', z.object({ greeting: z.string() }).strict()));
const pingInvocation = remoteInvocation('novelDemo', 'ping', [], strictCodec('novel-creation-tool#demoPing', z.object({ ok: z.literal(true) }).strict()));

describe('I75 defineRemote 接线工厂', () => {
  it('构建带 typertRemote 绑定的适配对象并按 wire 方法名转发', async () => {
    const adapter = defineRemote('novelDemo', 'novelDemo', demoService, [
      { method: 'greet', call: (projectId: string) => demoService.greet(projectId) },
      { method: 'ping', call: () => demoService.ping() },
    ], [greetInvocation, pingInvocation]);
    expect((adapter as unknown as { typertRemote?: unknown }).typertRemote).toMatchObject({
      service: adapter, serviceKey: 'novelDemo', namespace: 'novelDemo',
    });
    // 消费者夹具：下游（gateway）按 wire 方法名调用适配对象。
    await expect(adapter.greet('demo')).resolves.toEqual({ greeting: 'hi demo' });
    expect(adapter.ping()).toEqual({ ok: true });
  });

  it('空方法规格 = 直通面：直接绑定 domain service 本身', () => {
    const bound = defineRemote('novelDirect', 'novelDirect', demoService);
    expect(bound).toBe(demoService);
    expect((bound as unknown as { typertRemote?: unknown }).typertRemote).toMatchObject({
      service: demoService, serviceKey: 'novelDirect', namespace: 'novelDirect',
    });
  });

  it('经真实 Typert registry 注册后可解析 endpoint 并调用', async () => {
    const root = new Context();
    await root.plugin(TypertRegistry);
    const invocation = remoteInvocation('novelDemo', 'greet', [param('projectId', stringCodec)], strictCodec('novel-creation-tool#demoGreet', z.object({ greeting: z.string() }).strict()));
    root.provide('novelDemo', defineRemote('novelDemo', 'novelDemo', demoService, [
      { method: 'greet', call: (projectId: string) => demoService.greet(projectId) },
    ], [invocation]));
    // 与 remote.test.ts 同一注册方式：Typert registry 只接受 host face contribution。
    const disposer = root.typert.register({
      package: 'novel-creation-tool-demo', face: 'host', schemas: [], model: { services: [], events: [], objects: [] },
      invocations: [invocation],
    });

    const descriptor = root.typert.local.get('novelDemo/greet');
    expect(descriptor).toBeDefined();
    const service = root.get('novelDemo') as { greet(projectId: string): Promise<unknown> };
    await expect(service.greet('demo')).resolves.toEqual({ greeting: 'hi demo' });

    disposer();
    await root.fiber.dispose();
  });

  it('remoteInvocation 与既有 wire 契约逐字段一致（重构前后形状等价）', () => {
    expect(timelineReadInvocation.id).toBe('novel-creation-tool/novelTimeline/read');
    expect(timelineReadInvocation.service).toBe('novelTimeline');
    expect(timelineReadInvocation.namespace).toBe('novelTimeline');
    expect(timelineReadInvocation.method).toBe('read');
    expect(timelineReadInvocation.invocation).toEqual({ kind: 'direct' });
    expect(timelineReadInvocation.parameters).toHaveLength(1);
    expect(timelineReadInvocation.parameters[0]).toMatchObject({ name: 'projectId', wire: 'projectId', source: 'json' });
    expect(timelineReadInvocation.result.mode).toBe('strict');
  });
});
