import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { Context } from '@deepseek-ai/cordis';
import * as cordis from '@deepseek-ai/cordis';
import { describe, expect, it } from 'vitest';
import { apply } from '../index.js';
import { unwrap } from '../client/shared.js';
import {
  outlineGenerationBaselineAttachGeneratedInvocation,
  outlineGenerationBaselineCreateInvocation,
  outlineGenerationBaselineCurrentInvocation,
  outlineGenerationBaselineInvocations,
  outlineGenerationBaselineReadInvocation,
  outlineGenerationBaselineRemoteContribution,
} from './remote/outline-generation-baseline.js';
import type { NovelOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import type { NovelOutlineService } from './outline-service.js';
import type { NovelSceneOutlineBindingService } from './scene-outline-binding-service.js';
import type { NovelTextService } from './text-service.js';

const ISO = '2026-08-31T00:00:00.000Z';
const baseline = {
  baselineId: 'gb-baseline-a', projectId: 'project-a', chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a',
  b5ContentFingerprint: 'a'.repeat(64), bindingFingerprint: 'b'.repeat(64),
  sceneCard: {
    actId: 'act-a', beatId: 'beat-a', beatTitle: '进入灯塔',
    detailBeat: { id: 'card-a', title: '发现旧灯塔', summary: '主角发现旧灯塔。', pov: 'hero', wordTarget: 500, points: ['门紧闭'], status: 'planned',
    },
  },
  revision: 1, authoringBase: { content: '旧灯塔的门紧闭。', sourceHash: 'c'.repeat(64) }, status: 'current',
  generatedCandidateIds: [], createdAt: ISO,
};
const readResult = { baseline, freshness: 'fresh' as const, staleReasons: [] };

interface GatewayClientEntry { inject: readonly string[]; apply: (ctx: Context) => void }
interface ClientRemoteHandle { $mount: (contribution: unknown) => Promise<() => Promise<void>> }
interface Mounted { client: Context; calls: Array<{ endpoint: string; args: Record<string, unknown> }>; dispose: () => Promise<void> }

const here = dirname(fileURLToPath(import.meta.url));
const clientBundlePath = resolve(here, '../../node_modules/@deepseek-ai/dsh-api-gateway/lib/client.js');
const clientBundleSource = readFileSync(clientBundlePath, 'utf8');

function loadGatewayClient(): GatewayClientEntry {
  const pending: Array<{ id: string; factory: (require: (spec: string) => unknown) => GatewayClientEntry }> = [];
  const windowStub = {
    __ModuleLoader__: {
      mode: 'queue', pendingQueue: pending,
      load: (registration: unknown) => pending.push(registration as never),
      create: () => { throw new Error('unexpected ModuleLoader.create in binder test'); },
    },
  };
  const context = createContext({ window: windowStub, console, AbortController, AbortSignal, setTimeout, clearTimeout });
  runInContext(clientBundleSource, context, { filename: clientBundlePath });
  if (pending.length !== 1) throw new Error(`expected one api-gateway client registration, got ${pending.length}`);
  return pending[0].factory((spec) => {
    if (spec === '@deepseek-ai/cordis') return cordis;
    throw new Error(`unexpected require(${spec}) from api-gateway client bundle`);
  });
}

const gatewayClient = loadGatewayClient();

async function mount(): Promise<Mounted> {
  const client = new Context();
  client.provide('typert', { remotes: { register: () => () => {} }, contexts: { getClient: () => undefined } } as never);
  const calls: Array<{ endpoint: string; args: Record<string, unknown> }> = [];
  client.provide('connection', {
    rpc: { call: async (_path: string, endpoint: string, payload: { args: Record<string, unknown> }) => {
      calls.push({ endpoint, args: payload.args });
      if (endpoint.endsWith('/current')) return { ok: true, value: { baseline, freshness: 'fresh', staleReasons: [] } };
      return { ok: true, value: readResult };
    } },
  } as never);
  await client.plugin({ name: 'api-gateway-client', inject: gatewayClient.inject, apply: gatewayClient.apply });
  const dispose = await (client.get('remote') as ClientRemoteHandle).$mount(outlineGenerationBaselineRemoteContribution);
  return { client, calls, dispose: () => dispose() };
}

describe('I108 OutlineGenerationBaseline Remote', () => {
  it('locks strict additive descriptors and rejects malformed input/result projections', () => {
    expect(outlineGenerationBaselineInvocations.map((descriptor) => `${descriptor.service}/${descriptor.method}`)).toEqual([
      'novelOutlineGenerationBaseline/create', 'novelOutlineGenerationBaseline/read',
      'novelOutlineGenerationBaseline/current', 'novelOutlineGenerationBaseline/attachGenerated',
    ]);
    expect(() => outlineGenerationBaselineCreateInvocation.parameters[1].codec.schema.parse({ chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a', extra: true })).toThrow();
    expect(() => outlineGenerationBaselineAttachGeneratedInvocation.parameters[1].codec.schema.parse({ baselineId: 'gb-baseline-a', candidateId: 'candidate-a', extra: true })).toThrow();
    expect(() => outlineGenerationBaselineReadInvocation.result.schema.parse({ baseline: {}, freshness: 'fresh', staleReasons: [] })).toThrow();
    expect(() => outlineGenerationBaselineCurrentInvocation.result.schema.parse({ baseline: null, freshness: 'none', staleReasons: [], extra: true })).toThrow();
  });

  it('passes the real Host adapter and consumer fixture through strict result codecs', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-outline-baseline-remote-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot });
    const text = root.get('novelText') as NovelTextService;
    const outline = root.get('novelOutline') as NovelOutlineService;
    const binding = root.get('novelSceneOutlineBinding') as NovelSceneOutlineBindingService;
    const service = root.get('novelOutlineGenerationBaseline') as NovelOutlineGenerationBaselineService & { typertRemote: { serviceKey: string; namespace: string } };
    await text.open('project');
    await outline.open('project');
    await text.createChapter('project', { id: 'chapter-a', index: 1, title: '第一章', pov: 'hero', status: 'draft' });
    await text.appendScene('project', 'chapter-a', { id: 'scene-a', content: '旧灯塔。', summary: '灯塔', beats: [], canonEvents: [], notes: '' });
    await outline.save('project', {
      id: 'outline', structure: 'free', logline: '进入灯塔。', themes: [], foreshadowing: [], endings: [],
      acts: [{ id: 'act-a', index: 0, title: '第一幕', goal: '进入', beats: [{ id: 'beat-a', title: '进入', description: '进入', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false,
        detailBeats: [{ id: 'card-a', title: '开门', summary: '开门', pov: 'hero', wordTarget: 100, points: ['门'], status: 'planned' }] }] }],
    });
    const initial = await binding.read('project');
    await binding.save('project', { sceneId: 'scene-a', detailBeatId: 'card-a', expectedFingerprint: initial.fingerprint });

    expect(service.typertRemote).toMatchObject({ serviceKey: 'novelOutlineGenerationBaseline', namespace: 'novelOutlineGenerationBaseline' });
    const created = await service.create('project', { chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a' });
    expect(outlineGenerationBaselineCreateInvocation.result.schema.parse(created)).toEqual(created);
    const generated = await service.attachGenerated('project', { baselineId: created.baseline.baselineId, candidateId: 'fake-candidate-a' });
    expect(generated.baseline.generatedCandidateIds).toEqual(['fake-candidate-a']);
    expect(outlineGenerationBaselineReadInvocation.result.schema.parse(await service.read('project', created.baseline.baselineId))).toMatchObject({ baseline: { generatedCandidateIds: ['fake-candidate-a'] } });
    expect(outlineGenerationBaselineCurrentInvocation.result.schema.parse(await service.current('project', { chapterId: 'chapter-a', sceneId: 'scene-a' })).baseline?.baselineId).toBe(created.baseline.baselineId);

    await fiber.dispose();
    await rm(projectsRoot, { recursive: true, force: true });
  });

  it('uses the real DSH client binder with exact args and fail-closed strict inputs', async () => {
    const { client, calls, dispose } = await mount();
    try {
      const namespace = client.get('remote.novelOutlineGenerationBaseline') as { read: (...args: unknown[]) => Promise<unknown>; current: (...args: unknown[]) => Promise<unknown>; create: (...args: unknown[]) => Promise<unknown> };
      expect(await unwrap(namespace.read('project-a', 'gb-baseline-a'))).toEqual(readResult);
      expect(await unwrap(namespace.current('project-a', { chapterId: 'chapter-a', sceneId: 'scene-a' }))).toMatchObject({ freshness: 'fresh' });
      expect(calls).toEqual([
        { endpoint: 'novelOutlineGenerationBaseline/read', args: { projectId: 'project-a', baselineId: 'gb-baseline-a' } },
        { endpoint: 'novelOutlineGenerationBaseline/current', args: { projectId: 'project-a', input: { chapterId: 'chapter-a', sceneId: 'scene-a' } } },
      ]);
      await expect(namespace.create('project-a', { chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a', extra: true })).rejects.toThrow();
      await expect(namespace.read('project-a')).rejects.toThrow(/expected 2 argument/);
    } finally {
      await dispose();
      await client.fiber.dispose();
    }
  });
});
