import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

import { Context } from '@deepseek-ai/cordis';
import * as cordis from '@deepseek-ai/cordis';

import { reviewRemoteContribution } from '../lib/host/remote/review.js';
import { statisticsRemoteContribution } from '../lib/host/remote/statistics.js';
import { writingRemoteContribution } from '../lib/host/remote/writing.js';

/**
 * I86 真实 DSH 客户端绑定器契约 smoke（review v2.0 §3.1 / 计划 §18 I86）。
 *
 * 针对**构建产物**（lib/host/remote/*.js）驱动真实 `dsh-api-gateway` 客户端
 * bundle（rc.2，I85 pin）：
 * - 5 个修复方法（propose/adjudicate/scan/sceneCards/tasks）以完整实参
 *   （缺省位显式 `undefined`）往返成功；缺参在业务前被 binder 拒绝；
 * - wire args 投影断言（未选筛选位不出现在 args；settings 传入才出现）；
 * - 静态负向扫描：Client 调用点不再以旧错误形状（缺参/对象传参）调用。
 * 与 src/remote-binder.test.ts 同语义、双保险：单测跑 src、本 smoke 跑 lib。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I86 smoke: ${msg}`); };

/** 过滤注释行（`//`、`/*`、块注释 `*` 续行），只留代码行做 grep 断言。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});

// Part 0 — 静态负向扫描：接线调用形状不再回归旧错误形态。
{
  const chapters = codeLines('src/client/ops/chapters.ts');
  const review = codeLines('src/client/ops/review.ts');
  const statistics = codeLines('src/client/ops/statistics.ts');
  const has = (lines, fragment) => lines.some((line) => line.includes(fragment));
  if (!has(chapters, "target.propose(projectId, { intent }, undefined)")) fail('propose(continue) 调用点缺少显式 undefined settings');
  if (!has(chapters, "target.propose(projectId, { intent: 'rewrite', chapterId, sceneId, prompt }, undefined)")) fail('propose(rewrite) 调用点缺少显式 undefined settings');
  if (!has(chapters, 'target.adjudicate(candidateId, decision, undefined)')) fail('adjudicate 调用点缺少显式 undefined settings');
  if (!has(review, 'target.scan(projectId, undefined)')) fail('scan 调用点缺少显式 undefined settings');
  if (has(statistics, 'ns.sceneCards(pid, {')) fail('sceneCards 调用点仍以对象传参（binder 缺参必拒）');
  if (has(statistics, '? undefined : { status }')) fail('tasks 调用点仍以对象传参（binder 缺参必拒）');
}

// Part 1 — 真实客户端绑定器往返。
const clientBundlePath = join(repoRoot, 'node_modules/@deepseek-ai/dsh-api-gateway/lib/client.js');
const clientBundleSource = readFileSync(clientBundlePath, 'utf8');
const pending = [];
const windowStub = {
  __ModuleLoader__: {
    mode: 'queue',
    pendingQueue: pending,
    load: (registration) => pending.push(registration),
    create: () => { throw new Error('unexpected ModuleLoader.create in I86 smoke'); },
  },
};
const context = createContext({ window: windowStub, console, AbortController, AbortSignal, setTimeout, clearTimeout });
runInContext(clientBundleSource, context, { filename: clientBundlePath });
if (pending.length !== 1) fail(`expected one api-gateway client registration, got ${pending.length}`);
const gatewayClient = pending[0].factory((spec) => {
  if (spec === '@deepseek-ai/cordis') return cordis;
  throw new Error(`unexpected require(${spec}) from api-gateway client bundle`);
});

const ISO = '2026-01-01T00:00:00.000Z';
const fixtureFor = (endpoint) => {
  switch (endpoint) {
    case 'novelWriting/propose':
      return { candidate: { id: 'cand-1', intent: 'continue', target: { projectId: 'p1' }, prompt: '继续写下去', text: '夜色', chunkCount: 1, createdAt: ISO } };
    case 'novelWriting/adjudicate':
      return { status: 'rejected', candidateId: 'cand-1' };
    case 'novelReview/scan':
      return { projectId: 'p1', scannedAt: ISO, issues: [], summary: { total: 0, hard: 0, soft: 0, byCategory: { rule: 0, canon: 0, knowledge: 0, relationship: 0, style: 0 } } };
    case 'novelReview/records':
      return [];
    case 'novelStatistics/sceneCards':
      return { total: 0, cards: [] };
    case 'novelStatistics/tasks':
      return { total: 0, tasks: [] };
    case 'novelStatistics/stats':
      return { indexExists: false, counts: { chapters: 0, scenes: 0, cards: 0, tasks: 0 } };
    default:
      throw new Error(`no result fixture for ${endpoint}`);
  }
};

const unwrapEnvelope = async (promise) => {
  const envelope = await promise;
  if (envelope !== null && typeof envelope === 'object' && 'ok' in envelope) {
    if (envelope.ok === true) return envelope.value;
    throw new Error(envelope.error?.message ?? 'Remote call failed');
  }
  return envelope;
};

const mount = async (contribution) => {
  const client = new Context();
  client.provide('typert', { remotes: { register: () => () => {} }, contexts: { getClient: () => undefined } });
  const calls = [];
  client.provide('connection', {
    rpc: { call: async (_path, endpoint, payload) => { calls.push({ endpoint, args: payload.args }); return { ok: true, value: fixtureFor(endpoint) }; } },
  });
  await client.plugin({ name: 'api-gateway-client', inject: gatewayClient.inject, apply: gatewayClient.apply });
  const dispose = await client.get('remote').$mount(contribution);
  return { client, calls, dispose: () => dispose() };
};

const expectArgs = (calls, index, endpoint, args) => {
  const actual = calls[index];
  if (!actual || actual.endpoint !== endpoint) fail(`call ${index} must hit ${endpoint}, got ${JSON.stringify(actual)}`);
  const normalized = {};
  for (const [key, value] of Object.entries(actual.args)) if (value !== undefined) normalized[key] = value;
  const expectedJson = JSON.stringify(args);
  if (JSON.stringify(normalized) !== expectedJson) fail(`call ${index} wire args mismatch: expected ${expectedJson}, got ${JSON.stringify(normalized)}`);
};

try {
  // writing：propose(缺省 settings) / propose(带 settings) / adjudicate(缺省 settings)。
  {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const ns = client.get('remote.novelWriting');
      const propose = await unwrapEnvelope(ns.propose('p1', { intent: 'continue' }, undefined));
      if (propose.candidate.id !== 'cand-1') fail('propose 往返结果异常');
      await unwrapEnvelope(ns.propose('p1', { intent: 'rewrite', chapterId: 'c1', sceneId: 's1', prompt: '重写' }, { generation: { temperature: 0.4 } }));
      const adjudicate = await unwrapEnvelope(ns.adjudicate('cand-1', 'accept', undefined));
      if (adjudicate.status !== 'rejected') fail('adjudicate 往返结果异常');
      expectArgs(calls, 0, 'novelWriting/propose', { projectId: 'p1', input: { intent: 'continue' } });
      expectArgs(calls, 1, 'novelWriting/propose', { projectId: 'p1', input: { intent: 'rewrite', chapterId: 'c1', sceneId: 's1', prompt: '重写' }, settings: { generation: { temperature: 0.4 } } });
      expectArgs(calls, 2, 'novelWriting/adjudicate', { candidateId: 'cand-1', decision: 'accept' });
      // 负向：缺参在业务前拒绝（arity 精确）。
      let rejected = false;
      try { await ns.propose('p1', { intent: 'continue' }); } catch (error) { rejected = /expected 3 argument\(s\), got 2/.test(error.message); }
      if (!rejected) fail('propose 缺参未被真实绑定器拒绝');
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  }

  // review：scan(缺省 settings) 往返 + records 正常对照。
  {
    const { client, calls, dispose } = await mount(reviewRemoteContribution);
    try {
      const ns = client.get('remote.novelReview');
      const scan = await unwrapEnvelope(ns.scan('p1', undefined));
      if (scan.projectId !== 'p1') fail('scan 往返结果异常');
      expectArgs(calls, 0, 'novelReview/scan', { projectId: 'p1' });
      let rejected = false;
      try { await ns.scan('p1'); } catch (error) { rejected = /expected 2 argument\(s\), got 1/.test(error.message); }
      if (!rejected) fail('scan 缺参未被真实绑定器拒绝');
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  }

  // statistics：sceneCards/tasks 位置参数补齐，未选筛选位显式 undefined。
  {
    const { client, calls, dispose } = await mount(statisticsRemoteContribution);
    try {
      const ns = client.get('remote.novelStatistics');
      const cards = await unwrapEnvelope(ns.sceneCards('p1', undefined, undefined, undefined, undefined));
      if (cards.total !== 0) fail('sceneCards 无筛选往返结果异常');
      await unwrapEnvelope(ns.sceneCards('p1', 'act-1', 'beat-1', 'done', undefined));
      const tasks = await unwrapEnvelope(ns.tasks('p1', 'completed', undefined));
      if (tasks.total !== 0) fail('tasks 往返结果异常');
      await unwrapEnvelope(ns.tasks('p1', undefined, undefined));
      expectArgs(calls, 0, 'novelStatistics/sceneCards', { projectId: 'p1' });
      expectArgs(calls, 1, 'novelStatistics/sceneCards', { projectId: 'p1', actId: 'act-1', beatId: 'beat-1', status: 'done' });
      expectArgs(calls, 2, 'novelStatistics/tasks', { projectId: 'p1', status: 'completed' });
      expectArgs(calls, 3, 'novelStatistics/tasks', { projectId: 'p1' });
      let rejected = false;
      try { await ns.sceneCards('p1', { actId: 'act-1' }); } catch (error) { rejected = /expected 5 argument\(s\), got 2/.test(error.message); }
      if (!rejected) fail('sceneCards 对象传参未被真实绑定器拒绝');
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  }

  console.log('I86 smoke: 真实客户端绑定器 5 个修复方法往返成功、缺参/错参拒绝、wire args 投影正确、静态调用形状无回归 通过');
} finally {
  // 无临时文件需要回退；如 mount 中途失败，Context fiber 由各块 finally 释放。
}
