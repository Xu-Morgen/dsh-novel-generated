import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createQueuePollController, QUEUE_POLL_INTERVAL_MS, type QueuePollDeps } from './queue-poll.js';
import type { QueueStatusShape } from './layers/queue.js';

/**
 * I88 队列轮询控制器单元测试（review v2.0 §3.3 / 计划 §18 I88）。
 *
 * 负向断言（验收）：
 * - 多轮 start/refresh 不堆积并行轮询链（单飞行：挂起轮询/在途拉取不重复调度）；
 * - Fiber 卸载（stop()）后轮询链归零：清挂起 timer，配合 isActive() 守卫零新调度；
 * - isActive() 守卫：卸载后旧闭包立即自视 inactive，不 patch 不续调；
 * - terminal 状态自停（不改队列业务语义）。
 */

const RUNNING: QueueStatusShape = {
  projectId: 'p1',
  runState: 'running',
  config: { wordBudget: null, maxRetries: 1, stopOnSoftWarnings: true },
  consumedUnits: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
  error: null,
  tasks: [],
};

function makeDeps(overrides: Partial<QueuePollDeps> = {}): {
  deps: QueuePollDeps;
  statusCalls: number[];
  patches: QueueStatusShape[];
  status: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
} {
  const statusCalls: number[] = [];
  let counter = 0;
  const status = vi.fn(async () => { counter += 1; statusCalls.push(counter); return RUNNING; });
  const patches: QueueStatusShape[] = [];
  const deps: QueuePollDeps = {
    isActive: () => true,
    projectId: () => 'p1',
    queue: () => ({ status } as never),
    onStatus: (next) => patches.push(next),
    ...overrides,
  };
  return { deps, statusCalls, patches, status };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('I88 队列轮询控制器（Fiber 级持有）', () => {
  it('多轮 start 不堆积并行轮询链：每间隔恰好一次 status 拉取', async () => {
    const { deps, status, statusCalls } = makeDeps();
    const poll = createQueuePollController(deps);
    poll.start();
    // 立即 tick 一次；挂起轮询期间再 start 不重复调度。
    poll.start();
    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toHaveBeenCalledTimes(1);
    // 每过一个间隔只有一次拉取（单槽，不堆积并行链）。
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_INTERVAL_MS);
    expect(status).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_INTERVAL_MS);
    expect(status).toHaveBeenCalledTimes(3);
    expect(statusCalls).toEqual([1, 2, 3]);
    poll.stop();
  });

  it('stop() 后轮询链归零：清挂起 timer，不再续调', async () => {
    const { deps, status } = makeDeps();
    const poll = createQueuePollController(deps);
    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toHaveBeenCalledTimes(1);
    poll.stop();
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_INTERVAL_MS * 5);
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('isActive() 为 false（Fiber 已卸载）时零拉取：旧闭包不再自视 active', async () => {
    let active = true;
    const { deps, status } = makeDeps({ isActive: () => active });
    const poll = createQueuePollController(deps);
    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toHaveBeenCalledTimes(1);
    // 卸载：active 翻转为 false；挂起轮询到期后不再发起、不再 patch。
    active = false;
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_INTERVAL_MS * 3);
    expect(status).toHaveBeenCalledTimes(1);
  });

  it('在途拉取期间重复 start 不并发（单飞行 inFlight 守卫）', async () => {
    let resolveStatus: (value: unknown) => void = () => {};
    const status = vi.fn(() => new Promise((resolve) => { resolveStatus = resolve; }));
    const patches: QueueStatusShape[] = [];
    const poll = createQueuePollController({
      isActive: () => true,
      projectId: () => 'p1',
      queue: () => ({ status } as never),
      onStatus: (next) => patches.push(next),
    });
    poll.start(); // 立即 tick → status 在途
    poll.start(); // 在途：tick 的 inFlight 守卫拒绝第二次拉取
    poll.start();
    resolveStatus(RUNNING);
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toHaveBeenCalledTimes(1);
    expect(patches).toHaveLength(1);
    // 挂起轮询照常续调（单槽）。
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_INTERVAL_MS);
    expect(status).toHaveBeenCalledTimes(2);
    poll.stop();
  });

  it('terminal 状态自停：不续调（不改队列业务语义）', async () => {
    const status = vi.fn(async () => ({ ...RUNNING, runState: 'idle' as const }));
    const poll = createQueuePollController({
      isActive: () => true,
      projectId: () => 'p1',
      queue: () => ({ status } as never),
      onStatus: () => {},
    });
    poll.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(status).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(QUEUE_POLL_INTERVAL_MS * 3);
    expect(status).toHaveBeenCalledTimes(1);
    poll.stop();
  });
});
