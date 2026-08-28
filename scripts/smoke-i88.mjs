import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createQueuePollController, QUEUE_POLL_INTERVAL_MS } from '../lib/client/queue-poll.js';

/**
 * I88 队列轮询 timer 归 Fiber smoke（review v2.0 §3.3 / 计划 §18 I88）。
 *
 * Part 0 — 静态负向扫描：
 * - ops/queue.ts 不再拥有 timer（queuePollTimer/clearQueuePoll/pollQueueStatus 归零），
 *   只向 Fiber 级控制器发 start/stop 命令；
 * - OpsContext.active 布尔快照归零（改为 isActive() 函数）；
 * - client.ts 组合根创建 createQueuePollController 并在 Fiber disposer 停表。
 * Part 1 — lib 产物运行时契约：控制器单飞行（多轮 start 不堆积）、stop 归零、
 *   isActive 守卫（用真实 setTimeout/clearTimeout 短间隔实测）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I88 smoke: ${msg}`); };

const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});
const has = (p, fragment) => codeLines(p).some((line) => line.includes(fragment));

// Part 0 — 静态负向扫描。
{
  const contextOps = codeLines('src/client/ops/context.ts');
  const client = codeLines('src/client.ts');
  // 所有 ops 工厂不得再 destructure 布尔 active。
  const opsDir = resolve(repoRoot, 'src/client/ops');
  const { readdirSync } = await import('node:fs');
  for (const name of readdirSync(opsDir)) {
    if (!name.endsWith('.ts') || name === 'context.ts' || name === 'index.ts') continue;
    const lines = codeLines(`src/client/ops/${name}`);
    if (lines.some((line) => line.includes('const { act, snapshot, beginOp, endOp, active }'))) fail(`${name} 仍 destructure 布尔 active 快照`);
  }
  if (has('src/client/ops/queue.ts', 'queuePollTimer')) fail('ops/queue.ts 仍持有 queuePollTimer');
  if (has('src/client/ops/queue.ts', 'clearQueuePoll')) fail('ops/queue.ts 仍持有 clearQueuePoll');
  if (has('src/client/ops/queue.ts', 'pollQueueStatus')) fail('ops/queue.ts 仍自建 pollQueueStatus');
  if (!has('src/client/ops/queue.ts', 'queuePoll.start()') || !has('src/client/ops/queue.ts', 'queuePoll.stop()')) fail('ops/queue.ts 未只发 start/stop 命令');
  if (has('src/client/ops/context.ts', 'active: boolean')) fail('OpsContext 仍声明 active 布尔快照');
  if (!has('src/client/ops/context.ts', 'isActive(): boolean')) fail('OpsContext 缺少 isActive() 函数');
  if (!has('src/client.ts', 'createQueuePollController(')) fail('client.ts 未创建 Fiber 级轮询控制器');
  if (!has('src/client.ts', 'isActive: () => active')) fail('client.ts makeOps 未传 isActive 函数');
  if (!has('src/client.ts', 'queuePoll.stop()')) fail('client.ts Fiber disposer 未停表');
}

// Part 1 — lib 产物运行时契约（真实 timer，短间隔；精确计数由 vitest fake-timer
// 单测覆盖，这里只做有界粗断言：单飞行 / 续调有界 / stop 归零 / isActive 守卫）。
{
  let statusCalls = 0;
  const makeStatus = () => async () => {
    statusCalls += 1;
    return { projectId: 'p1', runState: 'running', config: { wordBudget: null, maxRetries: 1, stopOnSoftWarnings: true }, consumedUnits: 0, updatedAt: '2026-01-01T00:00:00.000Z', error: null, tasks: [] };
  };
  const controller = createQueuePollController({
    isActive: () => true,
    projectId: () => 'p1',
    queue: () => ({ status: makeStatus() }),
    onStatus: () => {},
    intervalMs: 30,
  });
  const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  controller.start();
  controller.start(); // 单飞行：挂起轮询期间不重复调度。
  controller.start();
  await sleep(15); // 首间隔（30ms）前：三次 start 只产生一次立即拉取。
  if (statusCalls !== 1) fail(`单飞行失败：立即拉取应为 1 次，实际 ${statusCalls}`);
  await sleep(90); // 约 3 个间隔：链继续且不堆积（有界 1 + 4 次）。
  if (statusCalls < 2 || statusCalls > 5) fail(`续调异常：90ms 内应 2–5 次，实际 ${statusCalls}`);
  controller.stop();
  const frozen = statusCalls;
  await sleep(120);
  if (statusCalls !== frozen) fail('stop() 后轮询链未归零');
  // isActive 守卫：卸载后不再拉取。
  let active = false;
  const dead = createQueuePollController({
    isActive: () => active,
    projectId: () => 'p1',
    queue: () => ({ status: makeStatus() }),
    onStatus: () => {},
    intervalMs: 30,
  });
  dead.start();
  await sleep(50);
  const beforeDead = statusCalls;
  await sleep(80);
  if (statusCalls !== beforeDead) fail('isActive()=false 时仍产生轮询拉取');
  console.log('I88 smoke: 静态（timer 归控制器/active 归零）+ lib 产物单飞行/续调有界/stop 归零/isActive 守卫 通过');
}
