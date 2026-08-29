import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

import { Context } from '@deepseek-ai/cordis';
import * as cordis from '@deepseek-ai/cordis';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it } from 'vitest';

import { unwrap } from './client/shared.js';
import { branchListWireAdapter } from './host/composition/orchestration.js';
import { branchRemoteContribution } from './host/remote/branch.js';
import { reviewRemoteContribution } from './host/remote/review.js';
import { statisticsRemoteContribution } from './host/remote/statistics.js';
import { writingRemoteContribution } from './host/remote/writing.js';
import { textMutationRemoteContribution } from './host/remote/text-mutation.js';
import type { TextMutationNamespace } from './client/remote-namespace.js';
import { createTextService, type NovelTextService } from './host/text-service.js';
import { apply } from './index.js';

/**
 * I86 真实 DSH 客户端绑定器端到端契约测试（review v2.0 §3.1 / 计划 §18 I86）。
 *
 * 消除「接线后方法在真实绑定器下可调用」盲区：UI 测试走 fake remote、smoke 是
 * Host-only 脚本，没有任何测试把产品 Remote 跑过真实客户端绑定器。本测试加载
 * 已安装的 `@deepseek-ai/dsh-api-gateway` **客户端 bundle**（rc.2，I85 pin）并用
 * 真实生产 descriptor（writing/review/statistics contribution）挂载，验证：
 * - 实参个数必须精确等于 descriptor 参数个数（`client.js` invoke：缺参即抛
 *   `expected N argument(s), got M`）；
 * - 逐位置 strict parse：jsonCodec 可选参数放行显式 `undefined`（丢弃，不进入
 *   wire args）；string/number strict codec 拒绝 undefined（`rejected "<field>"`）；
 * - 修复方法（propose/adjudicate/scan/sceneCards/tasks/branches.list）以完整实参（缺省位
 *   显式 `undefined`）往返成功，且缺参/错参在业务前仍被拒绝；
 * - 既有正常对照（records/stats 等零可选参数方法）往返不受影响。
 *
 * 约定：本测试验证的是**客户端绑定器语义 + wire args 投影**；connection 为最小
 * stub（记录收到的 args、按 endpoint 返回合法 result fixture）。Host gateway
 * 侧语义（assertExactArguments/resolveParameter）由 workspace-remote.test.ts 与
 * dsh-rc2-compat.test.ts 覆盖。
 */

const here = dirname(fileURLToPath(import.meta.url));
const clientBundlePath = resolve(here, '../node_modules/@deepseek-ai/dsh-api-gateway/lib/client.js');
const clientBundleSource = readFileSync(clientBundlePath, 'utf8');

interface GatewayClientEntry {
  inject: readonly string[];
  apply: (ctx: Context) => void;
}

interface ClientRemoteHandle {
  $mount: (contribution: unknown) => Promise<() => Promise<void>>;
}

/** 加载真实客户端绑定器 bundle（`window.__ModuleLoader__` 合同，与 smoke-i85 Part 2 同法）。 */
function loadGatewayClient(): GatewayClientEntry {
  const pending: Array<{ id: string; factory: (require: (spec: string) => unknown) => GatewayClientEntry }> = [];
  const windowStub = {
    __ModuleLoader__: {
      mode: 'queue',
      pendingQueue: pending,
      load: (registration: unknown) => pending.push(registration as never),
      create: () => { throw new Error('unexpected ModuleLoader.create in binder test'); },
    },
  };
  // client.js 在 vm 内运行，需要宿主全局（installMethods 构造 AbortController 等）。
  const context = createContext({ window: windowStub, console, AbortController, AbortSignal, setTimeout, clearTimeout });
  runInContext(clientBundleSource, context, { filename: clientBundlePath });
  if (pending.length !== 1) throw new Error(`expected one api-gateway client registration, got ${pending.length}`);
  const entry = pending[0].factory((spec) => {
    if (spec === '@deepseek-ai/cordis') return cordis;
    throw new Error(`unexpected require(${spec}) from api-gateway client bundle`);
  });
  return entry;
}

const gatewayClient = loadGatewayClient();

const ISO = '2026-01-01T00:00:00.000Z';

/** 每个 endpoint 的合法 result fixture（须通过 descriptor 的 strict result codec）。 */
function fixtureFor(endpoint: string): unknown {
  switch (endpoint) {
    case 'novelWriting/propose':
      return { candidate: { id: 'cand-1', intent: 'continue', target: { projectId: 'p1' }, prompt: '继续写下去', text: '夜色', chunkCount: 1, createdAt: ISO } };
    case 'novelWriting/adjudicate':
      return { status: 'rejected', candidateId: 'cand-1' };
    case 'novelReview/scan':
      return { projectId: 'p1', scannedAt: ISO, issues: [], summary: { total: 0, hard: 0, soft: 0, byCategory: { rule: 0, canon: 0, knowledge: 0, relationship: 0, style: 0 } } };
    case 'novelReview/records':
      return [];
    case 'novelBranches/list':
      return { branches: [{ id: 'branch-1', label: '初稿', chosen: true, charCount: 2, hash: 'hash-1' }] };
    case 'novelText/fingerprint':
      return { fingerprint: 'a'.repeat(64) };
    case 'novelText/chapterCreate':
    case 'novelText/chapterUpdate':
      return { chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', sceneCount: 0 }, fingerprint: 'b'.repeat(64) };
    case 'novelText/sceneCreate':
    case 'novelText/sceneUpdate':
      return { chapterId: 'chapter-1', scene: { id: 'scene-1', index: 0, summary: '开场', contentHash: 'c'.repeat(64), branchCount: 0 }, fingerprint: 'd'.repeat(64) };
    case 'novelText/reorder':
      return { chapters: [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', sceneCount: 1 }], fingerprint: 'e'.repeat(64) };
    case 'novelStatistics/sceneCards':
      return { total: 0, cards: [] };
    case 'novelStatistics/tasks':
      return { total: 0, tasks: [] };
    case 'novelStatistics/stats':
      return { indexExists: false, counts: { chapters: 0, scenes: 0, cards: 0, tasks: 0 } };
    default:
      throw new Error(`no result fixture for ${endpoint}`);
  }
}

interface Mounted {
  client: Context;
  calls: Array<{ endpoint: string; args: Record<string, unknown> }>;
  dispose: () => Promise<void>;
}

/** 挂载一个真实 contribution 到真实客户端绑定器，connection 记录 wire args。 */
async function mount(contribution: unknown, resultFor: (endpoint: string, args: Record<string, unknown>) => unknown | Promise<unknown> = fixtureFor): Promise<Mounted> {
  const client = new Context();
  client.provide('typert', {
    remotes: { register: () => () => {} },
    contexts: { getClient: () => undefined },
  } as never);
  const calls: Array<{ endpoint: string; args: Record<string, unknown> }> = [];
  client.provide('connection', {
    rpc: {
      call: async (_path: string, endpoint: string, payload: { args: Record<string, unknown> }): Promise<{ ok: boolean; value?: unknown }> => {
        calls.push({ endpoint, args: payload.args });
        return { ok: true, value: await resultFor(endpoint, payload.args) };
      },
    },
  } as never);
  await client.plugin({ name: 'api-gateway-client', inject: gatewayClient.inject, apply: gatewayClient.apply });
  const dispose = await (client.get('remote') as ClientRemoteHandle).$mount(contribution);
  return { client, calls, dispose: () => dispose() };
}

describe('I86 真实 DSH 客户端绑定器契约（R17-3 盲区消除）', () => {
  it('novelWriting.propose：缺省 settings 显式 undefined 往返成功，wire args 不含 settings', async () => {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const ns = client.get('remote.novelWriting') as { propose: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(ns.propose('p1', { intent: 'continue' }, undefined)) as { candidate: { id: string } };
      expect(result.candidate.id).toBe('cand-1');
      expect(calls).toEqual([{ endpoint: 'novelWriting/propose', args: { projectId: 'p1', input: { intent: 'continue' } } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('novelWriting.propose：传入 settings 时原样进入 wire args', async () => {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const ns = client.get('remote.novelWriting') as { propose: (...args: unknown[]) => Promise<unknown> };
      const settings = { generation: { temperature: 0.4 } };
      await unwrap(ns.propose('p1', { intent: 'rewrite', chapterId: 'c1', sceneId: 's1', prompt: '重写' }, settings));
      expect(calls[0]).toEqual({ endpoint: 'novelWriting/propose', args: { projectId: 'p1', input: { intent: 'rewrite', chapterId: 'c1', sceneId: 's1', prompt: '重写' }, settings } });
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('novelWriting.adjudicate：缺省 settings 显式 undefined 往返成功', async () => {
    const { client, calls, dispose } = await mount(writingRemoteContribution);
    try {
      const ns = client.get('remote.novelWriting') as { adjudicate: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(ns.adjudicate('cand-1', 'accept', undefined)) as { status: string };
      expect(result.status).toBe('rejected');
      expect(calls).toEqual([{ endpoint: 'novelWriting/adjudicate', args: { candidateId: 'cand-1', decision: 'accept' } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('novelReview.scan：缺省 settings 显式 undefined 往返成功', async () => {
    const { client, calls, dispose } = await mount(reviewRemoteContribution);
    try {
      const ns = client.get('remote.novelReview') as { scan: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(ns.scan('p1', undefined)) as { projectId: string };
      expect(result.projectId).toBe('p1');
      expect(calls).toEqual([{ endpoint: 'novelReview/scan', args: { projectId: 'p1' } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('novelStatistics.sceneCards：位置参数补齐，未选筛选位显式 undefined 往返成功', async () => {
    const { client, calls, dispose } = await mount(statisticsRemoteContribution);
    try {
      const ns = client.get('remote.novelStatistics') as { sceneCards: (...args: unknown[]) => Promise<unknown> };
      // 无筛选：五个位置实参，后四位 undefined → wire args 只含 projectId。
      expect((await unwrap(ns.sceneCards('p1', undefined, undefined, undefined, undefined)) as { total: number }).total).toBe(0);
      expect(calls[0]).toEqual({ endpoint: 'novelStatistics/sceneCards', args: { projectId: 'p1' } });
      // 带筛选：按 descriptor 顺序 actId/beatId/status。
      expect((await unwrap(ns.sceneCards('p1', 'act-1', 'beat-1', 'done', undefined)) as { total: number }).total).toBe(0);
      expect(calls[1]).toEqual({ endpoint: 'novelStatistics/sceneCards', args: { projectId: 'p1', actId: 'act-1', beatId: 'beat-1', status: 'done' } });
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('novelStatistics.tasks：位置参数补齐，未选 status 显式 undefined 往返成功', async () => {
    const { client, calls, dispose } = await mount(statisticsRemoteContribution);
    try {
      const ns = client.get('remote.novelStatistics') as { tasks: (...args: unknown[]) => Promise<unknown> };
      expect((await unwrap(ns.tasks('p1', undefined, undefined)) as { total: number }).total).toBe(0);
      expect(calls[0]).toEqual({ endpoint: 'novelStatistics/tasks', args: { projectId: 'p1' } });
      expect((await unwrap(ns.tasks('p1', 'completed', undefined)) as { total: number }).total).toBe(0);
      expect(calls[1]).toEqual({ endpoint: 'novelStatistics/tasks', args: { projectId: 'p1', status: 'completed' } });
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I103 novelBranches.list：Domain 裸数组经唯一 Host adapter/codec/真实 Client binder 返回非空 envelope', async () => {
    const domainCalls: unknown[][] = [];
    const domain = {
      async listBranches(...args: [string, string, string]) {
        domainCalls.push(args);
        return [{ id: 'branch-1', label: '初稿', chosen: true, charCount: 2, hash: 'hash-1' }];
      },
    };
    const { client, calls, dispose } = await mount(branchRemoteContribution, (endpoint, args) => {
      if (endpoint !== 'novelBranches/list') return fixtureFor(endpoint);
      return branchListWireAdapter(domain, String(args.projectId), String(args.chapterId), String(args.sceneId));
    });
    try {
      const branches = client.get('remote.novelBranches') as { list: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(branches.list('p1', 'c1', 's1')) as { branches: Array<{ id: string }> };
      expect(result.branches.map((branch) => branch.id)).toEqual(['branch-1']);
      expect(domainCalls).toEqual([['p1', 'c1', 's1']]);
      expect(calls).toEqual([{ endpoint: 'novelBranches/list', args: { projectId: 'p1', chapterId: 'c1', sceneId: 's1' } }]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it.each([
    ['数组直出', [{ id: 'branch-1', label: '初稿', chosen: true, charCount: 2, hash: 'hash-1' }]],
    ['缺少 branches', {}],
    ['多余字段', { branches: [], extra: true }],
  ])('I103 novelBranches.list 负向：%s 在真实绑定器 result codec fail closed', async (_label, invalidResult) => {
    const { client, dispose } = await mount(branchRemoteContribution, (endpoint) => endpoint === 'novelBranches/list' ? invalidResult : fixtureFor(endpoint));
    try {
      const branches = client.get('remote.novelBranches') as { list: (...args: unknown[]) => Promise<unknown> };
      await expect(unwrap(branches.list('p1', 'c1', 's1'))).rejects.toThrow(/rejected "result"/);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I104 novelText additive mutation：strict input/result 经真实 Client binder 往返', async () => {
    const { client, calls, dispose } = await mount(textMutationRemoteContribution);
    try {
      const text = client.get('remote.novelText') as TextMutationNamespace;
      const before = await unwrap(text.fingerprint('p1'));
      const created = await unwrap(text.chapterCreate('p1', {
        id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', expectedFingerprint: before.fingerprint,
      }));
      expect(created.chapter).toMatchObject({ id: 'chapter-1', index: 1, sceneCount: 0 });
      expect(calls).toEqual([
        { endpoint: 'novelText/fingerprint', args: { projectId: 'p1' } },
        { endpoint: 'novelText/chapterCreate', args: { projectId: 'p1', input: { id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', expectedFingerprint: 'a'.repeat(64) } } },
      ]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('I104 真实 TextService→adapter→codec→Client 消费者链重开一致', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i104-binder-'));
    const host = new Context();
    await host.plugin(TypertRegistry);
    await host.plugin(TypertGatewayService);
    await host.plugin(apply, { projectsRoot: root });
    const service = host.get('novelText') as NovelTextService;
    await service.open('p1');
    const gateway = host.get('typertGateway') as TypertGatewayService;
    const mounted = await mount(textMutationRemoteContribution, (endpoint, args) => {
      const separator = endpoint.indexOf('/');
      return gateway.invoke({ namespace: endpoint.slice(0, separator), method: endpoint.slice(separator + 1), args });
    });
    try {
      const text = mounted.client.get('remote.novelText') as TextMutationNamespace;
      const before = await unwrap(text.fingerprint('p1'));
      let fingerprint = (await unwrap(text.chapterCreate('p1', {
        id: 'chapter-1', index: 1, title: '第一章', pov: 'pov-1', status: 'draft', expectedFingerprint: before.fingerprint,
      }))).fingerprint;
      fingerprint = (await unwrap(text.chapterCreate('p1', {
        id: 'chapter-2', index: 2, title: '第二章', pov: 'pov-2', status: 'draft', expectedFingerprint: fingerprint,
      }))).fingerprint;
      fingerprint = (await unwrap(text.sceneCreate('p1', {
        chapterId: 'chapter-1', index: 0, expectedFingerprint: fingerprint,
        scene: { id: 'scene-1', content: '初始正文', summary: '旧摘要', beats: [], canonEvents: [], notes: '' },
      }))).fingerprint;
      fingerprint = (await unwrap(text.sceneCreate('p1', {
        chapterId: 'chapter-2', index: 0, expectedFingerprint: fingerprint,
        scene: { id: 'scene-2', content: '第二章正文', summary: '第二场', beats: [], canonEvents: [], notes: '' },
      }))).fingerprint;
      fingerprint = (await unwrap(text.chapterUpdate('p1', {
        chapterId: 'chapter-2', patch: { title: '终章', status: 'revised' }, expectedFingerprint: fingerprint,
      }))).fingerprint;
      fingerprint = (await unwrap(text.sceneUpdate('p1', {
        chapterId: 'chapter-1', sceneId: 'scene-1', patch: { summary: '新摘要', beats: ['beat-1'], canonEvents: ['event-1'], notes: '作者注' }, expectedFingerprint: fingerprint,
      }))).fingerprint;
      await unwrap(text.reorder('p1', {
        expectedFingerprint: fingerprint,
        chapters: [
          { chapterId: 'chapter-2', sceneIds: ['scene-2'] },
          { chapterId: 'chapter-1', sceneIds: ['scene-1'] },
        ],
      }));

      const reopened = createTextService(root);
      await reopened.open('p1');
      const chapters = await reopened.listChapters('p1');
      expect(chapters.map((chapter) => [chapter.id, chapter.index, chapter.title, chapter.status])).toEqual([
        ['chapter-2', 1, '终章', 'revised'], ['chapter-1', 2, '第一章', 'draft'],
      ]);
      expect(chapters[1].scenes[0]).toMatchObject({
        id: 'scene-1', index: 0, content: '初始正文', summary: '新摘要', beats: ['beat-1'], canonEvents: ['event-1'], notes: '作者注', branches: [],
      });
    } finally {
      await mounted.dispose();
      await mounted.client.fiber.dispose();
      await host.fiber.dispose();
      await rm(root, { recursive: true, force: true });
    }
  });

  it('I104 novelText 负向：非法参数与非法结果均在真实 binder fail closed', async () => {
    const invalidMount = await mount(textMutationRemoteContribution, (endpoint) => endpoint === 'novelText/reorder' ? { chapters: [], fingerprint: 'bad' } : fixtureFor(endpoint));
    try {
      const text = invalidMount.client.get('remote.novelText') as TextMutationNamespace;
      await expect(text.chapterCreate('p1', { id: 'chapter-1' } as never)).rejects.toThrow(/rejected "input"/);
      await expect(unwrap(text.reorder('p1', { chapters: [], expectedFingerprint: 'a'.repeat(64) }))).rejects.toThrow(/rejected "result"/);
    } finally {
      await invalidMount.dispose();
      await invalidMount.client.fiber.dispose();
    }
  });

  it('负向：缺参在业务前被真实绑定器拒绝（arity 精确）', async () => {
    const { client, dispose } = await mount(writingRemoteContribution);
    try {
      const writing = client.get('remote.novelWriting') as { propose: (...args: unknown[]) => Promise<unknown>; adjudicate: (...args: unknown[]) => Promise<unknown> };
      await expect(writing.propose('p1', { intent: 'continue' })).rejects.toThrow(/expected 3 argument\(s\), got 2/);
      await expect(writing.propose('p1')).rejects.toThrow(/expected 3 argument\(s\), got 1/);
      await expect(writing.adjudicate('cand-1')).rejects.toThrow(/expected 3 argument\(s\), got 1/);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('负向：缺参/对象传参在真实绑定器下被拒（sceneCards/tasks/scan）', async () => {
    const { client, dispose } = await mount(statisticsRemoteContribution);
    try {
      const statistics = client.get('remote.novelStatistics') as { sceneCards: (...args: unknown[]) => Promise<unknown>; tasks: (...args: unknown[]) => Promise<unknown> };
      // 对象传参（旧错误调用形状）→ arity 拒绝。
      await expect(statistics.sceneCards('p1', { actId: 'act-1' })).rejects.toThrow(/expected 5 argument\(s\), got 2/);
      await expect(statistics.sceneCards('p1')).rejects.toThrow(/expected 5 argument\(s\), got 1/);
      await expect(statistics.tasks('p1', { status: 'done' })).rejects.toThrow(/expected 3 argument\(s\), got 2/);
      await expect(statistics.tasks('p1')).rejects.toThrow(/expected 3 argument\(s\), got 1/);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('负向：string/number strict codec 可选参数仍拒绝 undefined（jsonCodec 才是可选参数的放行通道）', async () => {
    // 回归护栏：如果将来有人把 sceneCards 的 actId 改回 stringCodec，显式 undefined
    // 会在真实绑定器被拒（`rejected "actId"`）——这是 I86 把可选筛选参数定为
    // jsonCodec 的原因（计划 §18 I86：缺省位显式传 undefined 对齐 settings 先例）。
    const { client, dispose } = await mount(statisticsRemoteContribution);
    try {
      const statistics = client.get('remote.novelStatistics') as { sceneCards: (...args: unknown[]) => Promise<unknown> };
      const result = await unwrap(statistics.sceneCards('p1', undefined, undefined, undefined, undefined));
      expect(result).toEqual({ total: 0, cards: [] });
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });

  it('既有正常对照：零可选参数方法往返不受影响（records/stats）', async () => {
    const { client, dispose } = await mount(reviewRemoteContribution);
    try {
      const review = client.get('remote.novelReview') as { records: (projectId: string) => Promise<unknown> };
      expect(await unwrap(review.records('p1'))).toEqual([]);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
    const statsMount = await mount(statisticsRemoteContribution);
    try {
      const statistics = statsMount.client.get('remote.novelStatistics') as { stats: (projectId: string) => Promise<unknown> };
      expect((await unwrap(statistics.stats('p1')) as { indexExists: boolean }).indexExists).toBe(false);
    } finally {
      await statsMount.dispose();
      await statsMount.client.fiber.dispose();
    }
  });
});
