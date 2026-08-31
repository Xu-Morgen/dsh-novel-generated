import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseWritingCandidate, type WritingCandidate } from '../core/candidate/index.js';
import { readYaml, writeYaml } from '../core/io/yaml.js';
import { stableSceneId, queueTaskId, countProseUnits } from '../core/queue/index.js';
import { createQueueService, type QueueServiceDeps, type QueueStatusView } from './queue-service.js';
import type { Chapter } from '../core/schema/text.js';
import { createOutlineService } from './outline-service.js';
import { queueStartAtInputSchema } from './remote/queue.js';
import { createSceneOutlineBindingService } from './scene-outline-binding-service.js';
import { createTextService } from './text-service.js';

/**
 * I65 可恢复自动生成队列 —— Host owner 控制流回归（design §14.9 / R13-6）。
 *
 * 用桩服务（candidate/writing/text/outline/resolveSettings）验证确定性控制流：
 * - 按场景卡范围顺序生成：每卡一个独立候选并停在待裁决（candidate-ready），
 *   同一场景不重复生成（幂等入队 + recover 对账）；
 * - 停止策略：硬冲突立即停（stopped-hard）、软警告按 stopOnSoftWarnings 停/续；
 * - 预算：consumedUnits 达到 wordBudget 后不再启动新任务（预算不超限）；
 * - 控制幂等：pause/resume/cancel 重复调用 no-op；cancel 把 running 复位 queued；
 * - retry：failed 任务归零重排队；candidate-ready 任务可重生成；
 * - 重启恢复：新实例 recover 把候选 rehydrate 回裁决服务（不重新生成）、
 *   已写正文的场景标 completed（无重复正文）。
 *
 * LLM/探测器/落盘行为由 smoke-i65 用真实服务覆盖；本测试只验证 owner 编排逻辑。
 */

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const PROSE = '米拉在码头找到铜钥匙。';
const PROSE_UNITS = countProseUnits(PROSE);

interface CardFixture { actId: string; beatId: string; id: string; title: string; }
const CARDS: CardFixture[] = [
  { actId: 'act-1', beatId: 'beat-1', id: 'detail-1', title: '发现海图' },
  { actId: 'act-1', beatId: 'beat-1', id: 'detail-2', title: '灯塔守夜' },
  { actId: 'act-1', beatId: 'beat-2', id: 'detail-3', title: '铜钥匙之谜' },
];

const NAVIGATION = {
  actId: 'act-1', beatId: 'beat-1', title: '午夜旧灯塔', description: 'd',
  prerequisites: [], prerequisitesMet: true, instruction: 'i', deviationIds: [],
};

interface StubServices {
  generated: WritingCandidate[];
  registered: Array<{ candidateId: string; sceneId: string; targetSnapshot: unknown }>;
  proposeCalls: number;
  validationByScene: Map<string, 'pass' | 'warn' | 'reject'>;
  failNextPropose: boolean;
  failNextRegistration: boolean;
  candidateBodies: string[];
  chapters: Array<{ id: string; scenes: Array<{ id: string; content: string }> }>;
  disposeFns: Array<() => void>;
  targetOverrides: Map<string, { chapterId: string; sceneId: string; source: 'manual' | 'default'; occupied: boolean }>;
  staleSnapshots: boolean;
  resolveQueueCalls: number;
  listChapterCalls: number;
  failListChaptersAt: number | null;
  assertFreshCalls: number;
  failAssertFreshAt: number | null;
  failPreviewForScene: string | null;
  rejectedCandidates: Set<string>;
  rejectCalls: string[];
  acceptWrites: number;
  lifecycleEvents: string[];
}

async function stubAcceptCandidate(services: StubServices, candidateId: string): Promise<void> {
  if (services.rejectedCandidates.has(candidateId)) throw new Error(`Candidate already rejected: ${candidateId}`);
  if (!services.registered.some((candidate) => candidate.candidateId === candidateId)) throw new Error(`Unknown candidate: ${candidateId}`);
  services.acceptWrites += 1;
}

function makeDeps(services: StubServices, projectsRoot: string): QueueServiceDeps {
  return {
    projectsRoot,
    candidate: {
      open: async () => undefined,
      async propose(request) {
        services.proposeCalls += 1;
        services.lifecycleEvents.push(`propose:${request.target.sceneId ?? ''}`);
        if (services.failNextPropose) {
          services.failNextPropose = false;
          throw new Error('backend exploded');
        }
        const candidate = parseWritingCandidate({
          id: request.id,
          intent: 'scene-card',
          target: request.target,
          prompt: '你是长篇小说章节写作器。…',
          text: services.candidateBodies[services.generated.length] ?? PROSE,
          chunkCount: 1,
          createdAt: new Date().toISOString(),
        });
        services.generated.push(candidate);
        return { candidate };
      },
    },
    writing: {
      open: async () => undefined,
      propose: async () => { throw new Error('unused'); },
      proposeAt: async () => { throw new Error('unused'); },
      preview: async (candidateId: string) => {
        if (!services.registered.some((item) => item.candidateId === candidateId)) throw new Error(`unknown candidate ${candidateId}`);
        const candidate = services.generated.find((item) => item.id === candidateId);
        if (candidate === undefined) throw new Error(`unknown candidate body ${candidateId}`);
        if (candidate.target.sceneId === services.failPreviewForScene) throw new Error('injected preview infrastructure fault');
        const status = services.validationByScene.get(candidate.target.sceneId as string) ?? 'pass';
        return {
          candidateId,
          intent: 'scene-card',
          target: candidate.target,
          text: candidate.text,
          diff: { kind: 'new-scene' },
          validation: {
            status,
            violations: status === 'pass'
              ? []
              : [{ kind: 'queue-stub', severity: status === 'reject' ? 'hard' : 'soft', message: 'x', references: ['r'] }],
          },
          // I71：preview 携带注入解释（scene-card 无结构层注入，sections 为空）。
          trace: {
            intent: 'scene-card', pov: 'mira', sections: [], triggers: [],
            totals: { characterCount: 0, budget: 0, truncatedSectionCount: 0 },
            rewritePromptCharacters: 0, knowledgeVisibleCount: 0,
          },
        };
      },
      previewLayers: async (candidateId: string) => ({
        candidateId, sourceHash: '0'.repeat(64), generationBaseline: { kind: 'no-outline-baseline' as const },
        changes: [], validation: { status: 'pass' as const, violations: [] },
      }),
      adjudicate: async (candidateId, decision) => {
        if (decision === 'reject') {
          if (!services.rejectedCandidates.has(candidateId)) {
            services.rejectedCandidates.add(candidateId);
            services.rejectCalls.push(candidateId);
            services.lifecycleEvents.push(`reject:${candidateId}`);
          }
          return { status: 'rejected' as const, candidateId };
        }
        if (decision === 'accept') {
          await stubAcceptCandidate(services, candidateId);
          const candidate = services.generated.find((item) => item.id === candidateId)!;
          return { status: 'written' as const, candidateId, scene: { chapterId: candidate.target.chapterId as string, sceneId: candidate.target.sceneId as string, index: 0, content: candidate.text }, layers: ['c2', 'c1', 'c3', 'c4', 'b2'] as const };
        }
        throw new Error('unused rewrite');
      },
      async registerRecoveredCandidate(candidate, recovery) {
        if (services.failNextRegistration) {
          services.failNextRegistration = false;
          throw new Error('injected registration fault');
        }
        services.registered.push({ candidateId: candidate.id, sceneId: candidate.target.sceneId as string, targetSnapshot: recovery.targetSnapshot });
      },
    },
    text: {
      open: async () => undefined,
      createChapter: async () => { throw new Error('unused'); },
      listChapters: async () => {
        services.listChapterCalls += 1;
        if (services.listChapterCalls === services.failListChaptersAt) throw new Error('injected journal-adjacent infrastructure fault');
        return services.chapters as unknown as Chapter[];
      },
      readChapter: async () => { throw new Error('unused'); },
      appendScene: async () => { throw new Error('unused'); },
      replaceRange: async () => { throw new Error('unused'); },
      readCompleteChapter: async () => { throw new Error('unused'); },
    },
    outline: {
      open: async () => undefined,
      readiness: async () => 'ready',
      save: async () => { throw new Error('unused'); },
      read: async () => { throw new Error('unused'); },
      contentFingerprint: async () => '0'.repeat(64),
      async beatCards() {
        return CARDS.map((card) => ({ actId: card.actId, beatId: card.beatId, beatTitle: 'beat', detailBeat: { id: card.id, title: card.title, summary: card.title, pov: 'mira', wordTarget: 20, points: [], status: 'writing' } }));
      },
      saveProgress: async () => { throw new Error('unused'); },
      readProgress: async () => { throw new Error('unused'); },
      async navigate() { return NAVIGATION; },
      recordDeviation: async () => { throw new Error('unused'); },
      reconcileDeviation: async () => { throw new Error('unused'); },
    },
    sceneOutlineBinding: {
      async resolveQueueTargets(_projectId: string, chapterId: string, cardIds?: readonly string[]) {
        services.resolveQueueCalls += 1;
        services.lifecycleEvents.push(`resolve:${cardIds?.join(',') ?? '*'}`);
        const textFingerprint = createHash('sha256').update(JSON.stringify(services.chapters)).digest('hex');
        const selected = cardIds === undefined ? CARDS : cardIds.map((id) => CARDS.find((card) => card.id === id)).filter((card): card is CardFixture => card !== undefined);
        if (cardIds !== undefined && selected.length !== cardIds.length) throw new Error('Unknown scene cards');
        return selected.map((card) => {
          const override = services.targetOverrides.get(card.id);
          const sceneId = override?.sceneId ?? sceneIdOf(card);
          return {
            card: { actId: card.actId, beatId: card.beatId, beatTitle: 'beat', detailBeat: { id: card.id, title: card.title, summary: card.title, pov: 'mira', wordTarget: 20, points: [], status: 'writing' as const } },
            chapterId: override?.chapterId ?? chapterId,
            sceneId,
            source: override?.source ?? ('default' as const),
            occupied: override?.occupied ?? false,
            targetSnapshot: { chapterId: override?.chapterId ?? chapterId, sceneId, detailBeatId: card.id, textFingerprint, outlineFingerprint: '0'.repeat(64), bindingFingerprint: '0'.repeat(64) },
          };
        });
      },
      async assertQueueTargetFresh(_projectId: string, snapshot: { textFingerprint: string }) {
        services.assertFreshCalls += 1;
        if (services.assertFreshCalls === services.failAssertFreshAt) throw new Error('Stale queue target: injected post-persist owner change');
        if (services.staleSnapshots) throw new Error('Stale queue target: injected owner change');
        const actual = createHash('sha256').update(JSON.stringify(services.chapters)).digest('hex');
        if (snapshot.textFingerprint !== actual) throw new Error('Stale queue target: text fingerprint changed');
      },
    } as unknown as QueueServiceDeps['sceneOutlineBinding'],
    resolveSettings: async () => settings,
    onDispose: (dispose) => services.disposeFns.push(dispose),
  };
}

function sceneIdOf(card: CardFixture): string {
  return stableSceneId(card.actId, card.beatId, card.id);
}

function legacyJournal(status: 'queued' | 'running' | 'candidate-ready') {
  const card = CARDS[0];
  const sceneId = sceneIdOf(card);
  const candidate = status === 'candidate-ready' ? parseWritingCandidate({
    id: 'legacy-candidate', intent: 'scene-card', target: { projectId: 'demo', chapterId: 'chapter-1', sceneId },
    prompt: 'p', text: PROSE, chunkCount: 1, createdAt: '2025-01-01T00:00:00.000Z',
  }) : null;
  return {
    projectId: 'demo', runState: status === 'running' ? 'running' : 'idle',
    config: { wordBudget: null, maxRetries: 0, stopOnSoftWarnings: false }, consumedUnits: 0,
    tasks: [{
      id: queueTaskId(sceneId), projectId: 'demo', chapterId: 'chapter-1', sceneId,
      actId: card.actId, beatId: card.beatId, cardId: card.id,
      card: { id: card.id, title: card.title, summary: card.title, pov: 'mira', wordTarget: 20, points: [], status: 'writing' },
      navigation: NAVIGATION, intent: 'scene-card', status, candidateId: candidate?.id ?? null,
      attempts: 0, error: null, budgetUnits: candidate === null ? null : PROSE_UNITS,
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z', candidate,
      settings: candidate === null ? null : settings,
    }],
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** 新建服务实例；共享 root 时传入同一目录（模拟同一项目目录上的重启恢复）。 */
async function newService(
  services: StubServices,
  sharedRoot?: string,
  overrides: Partial<QueueServiceDeps> = {},
): Promise<ReturnType<typeof createQueueService>> {
  const root = sharedRoot ?? await mkdtemp(join(tmpdir(), 'novel-queue-svc-'));
  if (sharedRoot === undefined) roots.push(root);
  return createQueueService({ ...makeDeps(services, root), ...overrides });
}

async function waitFor(predicate: () => Promise<boolean> | boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error(`waitFor timeout: ${label}`);
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function freshServices(): StubServices {
  return {
    generated: [],
    registered: [],
    proposeCalls: 0,
    validationByScene: new Map(),
    failNextPropose: false,
    failNextRegistration: false,
    candidateBodies: [],
    chapters: [{ id: 'chapter-1', scenes: [] }],
    disposeFns: [],
    targetOverrides: new Map(),
    staleSnapshots: false,
    resolveQueueCalls: 0,
    listChapterCalls: 0,
    failListChaptersAt: null,
    assertFreshCalls: 0,
    failAssertFreshAt: null,
    failPreviewForScene: null,
    rejectedCandidates: new Set(),
    rejectCalls: [],
    acceptWrites: 0,
    lifecycleEvents: [],
  };
}

const terminal = (status: QueueStatusView['runState']): boolean =>
  status !== 'running' && status !== 'paused';

describe('I65 queue service control flow', () => {
  it('I105 startAt local wire input is strict and requires chapterId', () => {
    expect(queueStartAtInputSchema.parse({ chapterId: 'chapter-a', cardIds: ['detail-1'] })).toEqual({ chapterId: 'chapter-a', cardIds: ['detail-1'] });
    expect(() => queueStartAtInputSchema.parse({ cardIds: ['detail-1'] })).toThrow();
    expect(() => queueStartAtInputSchema.parse({ chapterId: 'chapter-a', extra: true })).toThrow();
    expect(() => queueStartAtInputSchema.parse({ chapterId: '', maxRetries: -1 })).toThrow();
  });

  it('生成范围顺序执行：每卡独立候选并停在待裁决；入队幂等不重复生成', async () => {
    const services = freshServices();
    const queue = await newService(services);
    await queue.open('demo');

    const started = await queue.start('demo', { cardIds: [CARDS[0].id, CARDS[1].id, CARDS[2].id] });
    expect(started.runState).toBe('running');
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'run completes');
    const status = await queue.status('demo');
    expect(status.runState).toBe('completed');
    expect(status.tasks.map((task) => task.status)).toEqual(['candidate-ready', 'candidate-ready', 'candidate-ready']);
    // 每个任务独立候选（不同 scene id）+ 停在待裁决。
    expect(status.tasks.map((task) => task.sceneId)).toEqual(CARDS.map(sceneIdOf));
    expect(status.tasks.every((task) => task.candidateId !== null)).toBe(true);
    expect(services.proposeCalls).toBe(3);
    expect(services.generated.map((candidate) => candidate.target.sceneId)).toEqual(CARDS.map(sceneIdOf));
    expect(services.registered.length).toBe(3);
    expect(services.registered.every((entry) => entry.targetSnapshot !== undefined)).toBe(true);
    expect(status.consumedUnits).toBe(3 * PROSE_UNITS);

    // 幂等入队：同一范围再次 start 不重复创建任务、不重复生成。
    const again = await queue.start('demo', { cardIds: [CARDS[0].id] });
    expect(again.tasks).toHaveLength(3);
    expect(services.proposeCalls).toBe(3);
  });

  it('I105 startAt uses selected chapter/default target; manual target uses actual chapter and completes without LLM; invalid batches are all-or-nothing', async () => {
    const stableServices = freshServices();
    stableServices.chapters = [{ id: 'chapter-selected', scenes: [] }];
    const stableQueue = await newService(stableServices);
    await stableQueue.startAt('demo', { chapterId: 'chapter-selected', cardIds: [CARDS[0].id] });
    await waitFor(async () => terminal((await stableQueue.status('demo')).runState), 'startAt stable target');
    const stable = await stableQueue.status('demo');
    expect(stable.tasks[0]).toMatchObject({ chapterId: 'chapter-selected', sceneId: sceneIdOf(CARDS[0]), status: 'candidate-ready' });

    const manualServices = freshServices();
    manualServices.chapters = [{ id: 'chapter-selected', scenes: [] }, { id: 'chapter-bound', scenes: [{ id: 'manual-scene', content: '' }] }];
    manualServices.targetOverrides.set(CARDS[0].id, { chapterId: 'chapter-bound', sceneId: 'manual-scene', source: 'manual', occupied: true });
    const manualQueue = await newService(manualServices);
    const manual = await manualQueue.startAt('demo', { chapterId: 'chapter-selected', cardIds: [CARDS[0].id] });
    expect(manual.tasks[0]).toMatchObject({ chapterId: 'chapter-bound', sceneId: 'manual-scene', status: 'completed' });
    expect(manualServices.proposeCalls).toBe(0);

    const invalidServices = freshServices();
    const invalidQueue = await newService(invalidServices);
    await expect(invalidQueue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id, 'missing-card'] })).rejects.toThrow(/Unknown scene cards/);
    expect((await invalidQueue.status('demo')).tasks).toEqual([]);
    invalidServices.targetOverrides.set(CARDS[0].id, { chapterId: 'chapter-1', sceneId: 'collision-scene', source: 'default', occupied: false });
    invalidServices.targetOverrides.set(CARDS[1].id, { chapterId: 'chapter-1', sceneId: 'collision-scene', source: 'default', occupied: false });
    await expect(invalidQueue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id, CARDS[1].id] })).rejects.toThrow(/collision/);
    expect((await invalidQueue.status('demo')).tasks).toEqual([]);

    const zeroServices = freshServices(); zeroServices.chapters = [];
    await expect((await newService(zeroServices)).start('demo', { cardIds: [CARDS[0].id] })).rejects.toThrow(/exactly one/);
    const multiServices = freshServices(); multiServices.chapters = [{ id: 'a', scenes: [] }, { id: 'b', scenes: [] }];
    await expect((await newService(multiServices)).start('demo', { cardIds: [CARDS[0].id] })).rejects.toThrow(/startAt/);
  });

  it('startAt reconciles a real occupied stable target to its actual chapter without generation or unrelated task mutation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-queue-real-binding-'));
    roots.push(root);
    const text = createTextService(root);
    const outline = createOutlineService(root);
    await text.open('demo');
    await outline.open('demo');
    await text.createChapter('demo', { id: 'chapter-selected', index: 1, title: 'Selected', pov: 'mira', status: 'draft' });
    await text.createChapter('demo', { id: 'chapter-actual', index: 2, title: 'Actual', pov: 'mira', status: 'draft' });
    await text.appendScene('demo', 'chapter-actual', { id: sceneIdOf(CARDS[0]), content: 'already written', summary: '', beats: [], canonEvents: [], notes: '' });
    await text.appendScene('demo', 'chapter-actual', { id: 'manual-scene', content: 'manual body', summary: '', beats: [], canonEvents: [], notes: '' });
    await outline.save('demo', {
      id: 'outline', structure: 'free', logline: 'Queue reconciliation.', themes: [], foreshadowing: [], endings: [],
      acts: [{ id: 'act-1', index: 0, title: 'Act', goal: 'Reconcile.', beats: [{
        id: 'beat-1', title: 'Beat', description: 'Queue cards.', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false,
        detailBeats: CARDS.slice(0, 2).map((card) => ({ id: card.id, title: card.title, summary: card.title, pov: 'mira', wordTarget: 20, points: [], status: 'writing' as const })),
      }] }],
    });
    const binding = createSceneOutlineBindingService(text, outline, root);
    const initialBinding = await binding.read('demo');
    await binding.save('demo', { sceneId: 'manual-scene', detailBeatId: CARDS[1].id, expectedFingerprint: initialBinding.fingerprint });

    const services = freshServices();
    const queue = createQueueService({ ...makeDeps(services, root), sceneOutlineBinding: binding });
    const first = await queue.startAt('demo', { chapterId: 'chapter-selected', cardIds: [CARDS[1].id] });
    const unrelatedBefore = first.tasks.find((task) => task.sceneId === 'manual-scene');
    expect(unrelatedBefore).toMatchObject({ chapterId: 'chapter-actual', status: 'completed' });

    const started = await queue.startAt('demo', { chapterId: 'chapter-selected', cardIds: [CARDS[0].id] });
    expect(started.tasks.find((task) => task.sceneId === sceneIdOf(CARDS[0])))
      .toMatchObject({ chapterId: 'chapter-actual', status: 'completed', candidateId: null });
    expect(started.tasks.find((task) => task.sceneId === 'manual-scene')).toEqual(unrelatedBefore);
    expect(services.proposeCalls).toBe(0);
    expect(services.generated).toEqual([]);
    expect(services.registered).toEqual([]);
  });

  it('queued target stale before generation fails without LLM or candidate registration', async () => {
    const services = freshServices();
    services.staleSnapshots = true;
    const queue = await newService(services);
    const started = await queue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id] });
    expect(['running', 'completed']).toContain(started.runState);
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'stale target settles');
    const status = await queue.status('demo');
    expect(status.tasks[0]).toMatchObject({ status: 'failed', candidateId: null });
    expect(status.tasks[0].error).toMatch(/Stale queue target/);
    expect(services.proposeCalls).toBe(0);
    expect(services.registered).toEqual([]);
  });

  it('硬冲突立即停（stopped-hard）：后续场景卡保持 queued，当前候选停在待裁决', async () => {
    const services = freshServices();
    services.validationByScene.set(sceneIdOf(CARDS[1]), 'reject');
    const queue = await newService(services);
    await queue.open('demo');

    await queue.start('demo', { cardIds: CARDS.map((card) => card.id) });
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'hard stop');
    const status = await queue.status('demo');
    expect(status.runState).toBe('stopped-hard');
    expect(status.tasks.map((task) => task.status)).toEqual(['candidate-ready', 'candidate-ready', 'queued']);
    // 硬冲突场景的候选仍待作者裁决（队列不裁决、不落地）。
    expect(status.tasks[1].candidateId).not.toBeNull();
  });

  it('软警告按策略停：stopOnSoftWarnings=true 停（stopped-soft），false 继续', async () => {
    const services = freshServices();
    services.validationByScene.set(sceneIdOf(CARDS[0]), 'warn');
    const softStop = await newService(services);
    await softStop.open('demo');
    await softStop.start('demo', { cardIds: CARDS.map((card) => card.id), stopOnSoftWarnings: true });
    await waitFor(async () => terminal((await softStop.status('demo')).runState), 'soft stop');
    expect((await softStop.status('demo')).runState).toBe('stopped-soft');
    expect((await softStop.status('demo')).tasks.map((task) => task.status)).toEqual(['candidate-ready', 'queued', 'queued']);

    const services2 = freshServices();
    services2.validationByScene.set(sceneIdOf(CARDS[0]), 'warn');
    const softContinue = await newService(services2);
    await softContinue.open('demo');
    await softContinue.start('demo', { cardIds: CARDS.map((card) => card.id), stopOnSoftWarnings: false });
    await waitFor(async () => terminal((await softContinue.status('demo')).runState), 'soft continue');
    const status = await softContinue.status('demo');
    expect(status.runState).toBe('completed');
    expect(status.tasks.map((task) => task.status)).toEqual(['candidate-ready', 'candidate-ready', 'candidate-ready']);
  });

  it('预算不超限：consumedUnits 达到 wordBudget 后不再启动新任务（budget-exhausted）', async () => {
    const services = freshServices();
    const queue = await newService(services);
    await queue.open('demo');
    await queue.start('demo', { cardIds: CARDS.map((card) => card.id), wordBudget: PROSE_UNITS + 1 });
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'budget exhausted');
    const status = await queue.status('demo');
    expect(status.runState).toBe('budget-exhausted');
    // 第 1 个候选后 consumed=10 < 11 → 第 2 个执行（consumed=20 ≥ 11）；第 3 个不再启动。
    expect(services.proposeCalls).toBe(2);
    expect(status.consumedUnits).toBe(2 * PROSE_UNITS);
    expect(status.tasks.map((task) => task.status)).toEqual(['candidate-ready', 'candidate-ready', 'queued']);
  });

  it('pause/resume/cancel 幂等；cancel 复位 running→queued 并置 idle', async () => {
    const services = freshServices();
    const queue = await newService(services);
    await queue.open('demo');

    // 空队列 start → idle；pause/cancel 均为幂等 no-op。
    const idle = await queue.start('demo');
    expect(idle.runState).toBe('idle');
    expect((await queue.pause('demo')).runState).toBe('idle');
    expect((await queue.cancel('demo')).runState).toBe('idle');
    expect((await queue.cancel('demo')).runState).toBe('idle');
    expect((await queue.resume('demo')).runState).toBe('idle');

    // 正常 run 完成后：pause 在非运行态 no-op；cancel 把 completed 收口为 idle（幂等）。
    await queue.start('demo', { cardIds: CARDS.map((card) => card.id) });
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'run completes');
    expect((await queue.status('demo')).runState).toBe('completed');
    expect((await queue.pause('demo')).runState).toBe('completed');
    const cancelled = await queue.cancel('demo');
    expect(cancelled.runState).toBe('idle');
    expect(cancelled.tasks.map((task) => task.status)).toEqual(['candidate-ready', 'candidate-ready', 'candidate-ready']);
    expect((await queue.cancel('demo')).runState).toBe('idle');
  });

  it('retry：failed 任务归零重排队；fresh service rejects recovered candidate and exposes only a unique regenerated body', async () => {
    const services = freshServices();
    const regeneratedBody = '米拉在重启后的潮声里找到了第二把银钥匙。';
    services.candidateBodies = [PROSE, regeneratedBody];
    services.failNextPropose = true; // 第一次 propose 失败（maxRetries=0 → failed）
    const root = await mkdtemp(join(tmpdir(), 'novel-queue-restart-retry-')); roots.push(root);
    const first = createQueueService(makeDeps(services, root));
    await first.open('demo');
    await first.start('demo', { cardIds: [CARDS[0].id], maxRetries: 0 });
    await waitFor(async () => terminal((await first.status('demo')).runState), 'fail settles');
    let status = await first.status('demo');
    expect(status.tasks[0].status).toBe('failed');
    expect(services.proposeCalls).toBe(1);

    status = await first.retry('demo', status.tasks[0].id);
    expect(status.tasks[0].status).toBe('queued');
    await first.start('demo');
    await waitFor(async () => terminal((await first.status('demo')).runState), 'retry settles');
    status = await first.status('demo');
    expect(status.tasks[0].status).toBe('candidate-ready');
    expect(services.proposeCalls).toBe(2);
    const oldCandidateId = status.tasks[0].candidateId as string;
    expect(oldCandidateId).toMatch(/-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    // Simulate loss of the process-local writing registry. The new service must
    // rehydrate the persisted body before retry rejects that exact old candidate.
    services.registered = [];
    const restartedDeps = makeDeps(services, root);
    const restarted = createQueueService(restartedDeps);
    const recovered = await restarted.recover('demo');
    expect(recovered.tasks[0]).toMatchObject({ status: 'candidate-ready', candidateId: oldCandidateId });
    expect(services.registered.map((entry) => entry.candidateId)).toEqual([oldCandidateId]);

    const eventsBeforeRetry = services.lifecycleEvents.length;
    const retried = await restarted.retry('demo', recovered.tasks[0].id);
    expect(retried.tasks[0]).toMatchObject({ status: 'queued', candidateId: null });
    expect(services.rejectCalls).toEqual([oldCandidateId]);
    expect(services.lifecycleEvents.slice(eventsBeforeRetry)).toEqual([
      `resolve:${CARDS[0].id}`,
      `reject:${oldCandidateId}`,
    ]);
    await expect(restartedDeps.writing.adjudicate(oldCandidateId, 'accept')).rejects.toThrow(/already rejected/);
    expect(services.acceptWrites).toBe(0);

    await restarted.start('demo');
    await waitFor(async () => terminal((await restarted.status('demo')).runState), 'candidate-ready retry regenerates');
    const regenerated = await restarted.status('demo');
    const newCandidateId = regenerated.tasks[0].candidateId as string;
    expect(newCandidateId).toMatch(/-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newCandidateId).not.toBe(oldCandidateId);
    expect(services.registered.at(-1)?.candidateId).toBe(newCandidateId);
    await expect(restartedDeps.writing.preview(newCandidateId)).resolves.toMatchObject({ candidateId: newCandidateId, text: regeneratedBody });
    await expect(restartedDeps.writing.adjudicate(newCandidateId, 'accept')).resolves.toMatchObject({ status: 'written', candidateId: newCandidateId, scene: { content: regeneratedBody } });
    await expect(restartedDeps.writing.adjudicate(oldCandidateId, 'accept')).rejects.toThrow(/already rejected/);
    expect(services.acceptWrites).toBe(1);
  });

  it('concurrent retries transform the live journal without losing another task or resurrecting candidate-ready', async () => {
    const services = freshServices();
    const root = await mkdtemp(join(tmpdir(), 'novel-queue-concurrent-retry-')); roots.push(root);
    const base = makeDeps(services, root);
    let retryGate: { entered: ReturnType<typeof deferred>[]; release: ReturnType<typeof deferred>; count: number } | null = null;
    const sceneOutlineBinding = {
      ...base.sceneOutlineBinding,
      async resolveQueueTargets(projectId: string, chapterId: string, cardIds?: readonly string[]) {
        const gate = retryGate;
        if (gate !== null) {
          const index = gate.count++;
          gate.entered[index]?.resolve();
          await gate.release.promise;
        }
        return base.sceneOutlineBinding.resolveQueueTargets(projectId, chapterId, cardIds);
      },
    } as QueueServiceDeps['sceneOutlineBinding'];
    const queue = createQueueService({ ...base, sceneOutlineBinding });
    await queue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id, CARDS[1].id] });
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'two retry candidates ready');
    const ready = await queue.status('demo');
    const [first, second] = ready.tasks;
    retryGate = { entered: [deferred(), deferred()], release: deferred(), count: 0 };
    const differentGate = retryGate;
    const retries = Promise.all([queue.retry('demo', first.id), queue.retry('demo', second.id)]);
    await Promise.all(differentGate.entered.map((gate) => gate.promise));
    differentGate.release.resolve();
    await retries;
    const afterDifferent = await queue.status('demo');
    expect(afterDifferent.tasks.map((task) => task.status)).toEqual(['queued', 'queued']);
    expect(afterDifferent.tasks.map((task) => task.candidateId)).toEqual([null, null]);
    expect(services.rejectCalls).toEqual(expect.arrayContaining([first.candidateId, second.candidateId]));

    await queue.start('demo');
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'duplicate retry candidate ready');
    const current = (await queue.status('demo')).tasks[0];
    retryGate = { entered: [deferred(), deferred()], release: deferred(), count: 0 };
    const duplicateGate = retryGate;
    const duplicateRetries = Promise.all([queue.retry('demo', current.id), queue.retry('demo', current.id)]);
    await Promise.all(duplicateGate.entered.map((gate) => gate.promise));
    duplicateGate.release.resolve();
    // Both calls observed candidate-ready before either final transform. The
    // second live transform is an idempotent no-op, never a stale replacement.
    await duplicateRetries;
    const afterDuplicate = await queue.status('demo');
    expect(afterDuplicate.tasks[0]).toMatchObject({ status: 'queued', candidateId: null });
    expect(afterDuplicate.tasks[1].status).toBe('candidate-ready');
  });

  it('post-persist freshness failure rolls back the exact candidate attempt and units without registration', async () => {
    const services = freshServices();
    services.failAssertFreshAt = 4;
    const root = await mkdtemp(join(tmpdir(), 'novel-queue-post-persist-')); roots.push(root);
    const queue = await newService(services, root);
    const journalPath = join(root, 'demo', 'queue-journal.yaml');

    type RollbackDisk = { runState: string; consumedUnits: number; tasks: Array<{ status: string; candidate: unknown; settings: unknown; candidateId: unknown; budgetUnits: unknown }> };
    let settledDisk: RollbackDisk | undefined;
    await queue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id] });
    await waitFor(async () => {
      const observed = await readYaml<RollbackDisk>(journalPath);
      if (observed.runState === 'idle' && observed.consumedUnits === 0 && observed.tasks[0]?.status === 'failed') {
        settledDisk = observed;
        return true;
      }
      return false;
    }, 'post-persist freshness rollback');
    const status = await queue.status('demo');
    expect(status.tasks[0]).toMatchObject({ status: 'failed', candidateId: null, budgetUnits: null });
    expect(status.tasks[0].error).toMatch(/post-persist owner change/);
    expect(status.consumedUnits).toBe(0);
    expect(services.registered).toEqual([]);
    expect(settledDisk).toBeDefined();
    expect(settledDisk?.consumedUnits).toBe(0);
    expect(settledDisk?.tasks[0]).toMatchObject({ candidate: null, settings: null, candidateId: null, budgetUnits: null });
  });

  it('registerRecoveredCandidate failure rolls back the durable attempt, refunds exact units, halts, then retries with a unique id', async () => {
    const services = freshServices();
    services.failNextRegistration = true;
    const root = await mkdtemp(join(tmpdir(), 'novel-queue-registration-fault-')); roots.push(root);
    const deps = makeDeps(services, root);
    const queue = createQueueService(deps);
    const journalPath = join(root, 'demo', 'queue-journal.yaml');

    await queue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id, CARDS[1].id] });
    await waitFor(async () => {
      const observed = await readYaml<{ runState: string; consumedUnits: number; tasks: Array<{ status: string }> }>(journalPath);
      return observed.runState === 'idle' && observed.consumedUnits === 0 && observed.tasks[0]?.status === 'failed';
    }, 'registration rollback');
    const failed = await queue.status('demo');
    const failedCandidateId = services.generated[0].id;
    expect(failed.runState).toBe('idle');
    expect(failed.tasks[0]).toMatchObject({ status: 'failed', candidateId: null, budgetUnits: null, error: 'injected registration fault' });
    expect(failed.tasks[1]).toMatchObject({ status: 'queued', candidateId: null });
    expect(failed.consumedUnits).toBe(0);
    expect(services.proposeCalls).toBe(1);
    expect(services.registered).toEqual([]);
    await expect(deps.writing.preview(failedCandidateId)).rejects.toThrow(/unknown candidate/);

    const disk = await readYaml<{ runState: string; consumedUnits: number; tasks: Array<{ status: string; candidate: unknown; settings: unknown; candidateId: unknown; budgetUnits: unknown }> }>(journalPath);
    expect(disk.runState).toBe('idle');
    expect(disk.consumedUnits).toBe(0);
    expect(disk.tasks[0]).toMatchObject({ status: 'failed', candidate: null, settings: null, candidateId: null, budgetUnits: null });
    expect(disk.tasks[1]).toMatchObject({ status: 'queued', candidate: null, settings: null, candidateId: null, budgetUnits: null });

    services.validationByScene.set(sceneIdOf(CARDS[0]), 'reject');
    await queue.retry('demo', failed.tasks[0].id);
    await queue.start('demo');
    await waitFor(async () => {
      const observed = await queue.status('demo');
      return observed.runState === 'stopped-hard' && observed.tasks[0]?.status === 'candidate-ready';
    }, 'registration retry');
    const retried = await queue.status('demo');
    const retryCandidateId = retried.tasks[0].candidateId as string;
    expect(retried.tasks[0]).toMatchObject({ status: 'candidate-ready', budgetUnits: PROSE_UNITS, error: null });
    expect(retried.tasks[1].status).toBe('queued');
    expect(retryCandidateId).toMatch(/-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(retryCandidateId).not.toBe(failedCandidateId);
    expect(services.registered.map((entry) => entry.candidateId)).toEqual([retryCandidateId]);
    await expect(deps.writing.preview(retryCandidateId)).resolves.toMatchObject({ candidateId: retryCandidateId, text: PROSE });
  });

  it('registered candidate survives preview infrastructure failure and stops the loop idle with actionable error', async () => {
    const services = freshServices();
    services.failPreviewForScene = sceneIdOf(CARDS[0]);
    const root = await mkdtemp(join(tmpdir(), 'novel-queue-preview-fault-')); roots.push(root);
    const queue = await newService(services, root);

    await queue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id, CARDS[1].id] });
    const journalPath = join(root, 'demo', 'queue-journal.yaml');
    await waitFor(async () => (await readYaml<{ runState: string }>(journalPath)).runState === 'idle', 'registered preview fault persists idle');
    const status = await queue.status('demo');
    expect(status.tasks[0]).toMatchObject({ status: 'candidate-ready', budgetUnits: PROSE_UNITS });
    expect(status.tasks[0].candidateId).not.toBeNull();
    expect(status.tasks[0].error).toBe('injected preview infrastructure fault');
    expect(status.tasks[1].status).toBe('queued');
    expect(status.consumedUnits).toBe(PROSE_UNITS);
    expect(services.proposeCalls).toBe(1);
    expect(services.registered).toHaveLength(1);
    const disk = await readYaml<{ runState: string; consumedUnits: number; tasks: Array<{ status: string; candidate: unknown; settings: unknown; candidateId: unknown; budgetUnits: unknown; error: unknown }> }>(journalPath);
    expect(disk.runState).toBe('idle');
    expect(disk.consumedUnits).toBe(PROSE_UNITS);
    expect(disk.tasks[0]).toMatchObject({ status: 'candidate-ready', budgetUnits: PROSE_UNITS, error: 'injected preview infrastructure fault' });
    expect(disk.tasks[0].candidate).not.toBeNull();
    expect(disk.tasks[0].settings).not.toBeNull();
    expect(disk.tasks[0].candidateId).not.toBeNull();
  });

  it('retry refreshes a failed stale snapshot after unrelated C5 change and allows generation', async () => {
    const services = freshServices();
    services.failNextPropose = true;
    const queue = await newService(services);
    await queue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id], maxRetries: 0 });
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'initial failure');
    const failed = (await queue.status('demo')).tasks[0];
    expect(failed.status).toBe('failed');

    services.chapters[0].scenes.push({ id: 'unrelated-scene', content: 'unrelated edit' });
    const retried = await queue.retry('demo', failed.id);
    expect(retried.tasks[0]).toMatchObject({ id: failed.id, status: 'queued', attempts: 0, candidateId: null, error: null });
    await queue.start('demo');
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'refreshed retry generation');
    expect((await queue.status('demo')).tasks[0].status).toBe('candidate-ready');
    expect(services.proposeCalls).toBe(2);
  });

  it('startAt refreshes existing failed and queued stale rows before generation', async () => {
    const failedServices = freshServices();
    failedServices.failNextPropose = true;
    const failedQueue = await newService(failedServices);
    await failedQueue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id], maxRetries: 0 });
    await waitFor(async () => terminal((await failedQueue.status('demo')).runState), 'failed row');
    failedServices.chapters[0].scenes.push({ id: 'unrelated-failed-edit', content: 'edit' });
    await failedQueue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id] });
    await waitFor(async () => terminal((await failedQueue.status('demo')).runState), 'failed startAt refresh');
    expect((await failedQueue.status('demo')).tasks[0].status).toBe('candidate-ready');
    expect(failedServices.proposeCalls).toBe(2);

    const queuedServices = freshServices();
    queuedServices.validationByScene.set(sceneIdOf(CARDS[0]), 'reject');
    const queuedQueue = await newService(queuedServices);
    await queuedQueue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id, CARDS[1].id] });
    await waitFor(async () => terminal((await queuedQueue.status('demo')).runState), 'queued row');
    expect((await queuedQueue.status('demo')).tasks[1].status).toBe('queued');
    queuedServices.chapters[0].scenes.push({ id: 'unrelated-queued-edit', content: 'edit' });
    await queuedQueue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[1].id] });
    await waitFor(async () => terminal((await queuedQueue.status('demo')).runState), 'queued startAt refresh');
    expect((await queuedQueue.status('demo')).tasks.find((task) => task.sceneId === sceneIdOf(CARDS[1]))?.status).toBe('candidate-ready');
    expect(queuedServices.proposeCalls).toBe(2);
  });

  it('refresh maintains taskId on target rebind, rejects collisions, and leaves resolution errors atomic', async () => {
    const rebindServices = freshServices();
    rebindServices.failNextPropose = true;
    const rebindQueue = await newService(rebindServices);
    await rebindQueue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id], maxRetries: 0 });
    await waitFor(async () => terminal((await rebindQueue.status('demo')).runState), 'rebind failure');
    const old = (await rebindQueue.status('demo')).tasks[0];
    rebindServices.targetOverrides.set(CARDS[0].id, { chapterId: 'chapter-1', sceneId: 'rebound-scene', source: 'manual', occupied: false });
    const rebound = await rebindQueue.retry('demo', old.id);
    expect(rebound.tasks[0]).toMatchObject({ id: queueTaskId('rebound-scene'), sceneId: 'rebound-scene', status: 'queued' });
    expect(rebound.tasks.some((task) => task.id === old.id)).toBe(false);

    const collisionServices = freshServices();
    collisionServices.failNextPropose = true;
    const collisionQueue = await newService(collisionServices);
    await collisionQueue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id, CARDS[1].id], maxRetries: 0 });
    await waitFor(async () => terminal((await collisionQueue.status('demo')).runState), 'collision setup');
    const beforeCollision = await collisionQueue.status('demo');
    collisionServices.targetOverrides.set(CARDS[0].id, { chapterId: 'chapter-1', sceneId: sceneIdOf(CARDS[1]), source: 'manual', occupied: false });
    await expect(collisionQueue.retry('demo', beforeCollision.tasks[0].id)).rejects.toThrow(/collision|already claimed/);
    expect((await collisionQueue.status('demo')).tasks).toEqual(beforeCollision.tasks);

    const beforeResolutionError = await collisionQueue.status('demo');
    await expect(collisionQueue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id, 'missing-card'] })).rejects.toThrow(/Unknown scene cards/);
    expect((await collisionQueue.status('demo')).tasks).toEqual(beforeResolutionError.tasks);
  });

  it('重启恢复：fresh 候选原样 rehydrate；generation 后 C5 变化使 current candidate-ready fail closed 且不重新生成', async () => {
    const services = freshServices();
    const root = await mkdtemp(join(tmpdir(), 'novel-queue-svc-'));
    roots.push(root);
    const first = await newService(services, root);
    await first.open('demo');
    await first.start('demo', { cardIds: CARDS.map((card) => card.id) });
    await waitFor(async () => terminal((await first.status('demo')).runState), 'first run');
    const before = await first.status('demo');
    expect(before.tasks).toHaveLength(3);
    expect(services.proposeCalls).toBe(3);

    // Fresh restart rehydrates persisted bodies and never calls generation again.
    const second = await newService(services, root);
    const freshRecovered = await second.recover('demo');
    expect(freshRecovered.tasks.every((task) => task.status === 'candidate-ready')).toBe(true);
    expect(services.proposeCalls).toBe(3);
    expect(services.registered.length).toBe(6);

    // An accepted candidate may already have landed before the queue journal
    // status write. Exact target content reconciles to completed before the
    // project-wide text fingerprint rejects the older snapshot.
    const writtenSceneId = sceneIdOf(CARDS[0]);
    services.chapters = [{ id: 'chapter-1', scenes: [{ id: writtenSceneId, content: PROSE }] }];
    const third = await newService(services, root);
    const recovered = await third.recover('demo');
    expect(recovered.tasks.find((task) => task.sceneId === writtenSceneId)?.status).toBe('completed');
    expect(recovered.tasks.filter((task) => task.sceneId !== writtenSceneId).every((task) => task.status === 'failed')).toBe(true);
    expect(services.proposeCalls).toBe(3);
    expect(services.registered.length).toBe(6);

    const resumed = await third.start('demo');
    expect(resumed.runState).toBe('completed');
    expect(services.proposeCalls).toBe(3);
  });

  it('restart recovery fails a candidate-ready occupied target with conflicting body closed', async () => {
    const services = freshServices();
    const root = await mkdtemp(join(tmpdir(), 'novel-queue-conflict-')); roots.push(root);
    const first = await newService(services, root);
    await first.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id] });
    await waitFor(async () => terminal((await first.status('demo')).runState), 'candidate persisted');
    expect(services.proposeCalls).toBe(1);

    services.chapters = [{ id: 'chapter-1', scenes: [{ id: sceneIdOf(CARDS[0]), content: '不同的正文' }] }];
    const restarted = await newService(services, root);
    const recovered = await restarted.recover('demo');
    expect(recovered.tasks[0]).toMatchObject({ status: 'failed', candidateId: null });
    expect(recovered.tasks[0].error).toMatch(/occupied by conflicting content/);
    expect(services.proposeCalls).toBe(1);
  });

  it('restart recovery completes a queued task whose canonical target appeared without generation', async () => {
    const services = freshServices();
    services.validationByScene.set(sceneIdOf(CARDS[0]), 'reject');
    const root = await mkdtemp(join(tmpdir(), 'novel-queue-queued-recovery-')); roots.push(root);
    const first = await newService(services, root);
    await first.startAt('demo', { chapterId: 'chapter-1', cardIds: CARDS.map((card) => card.id) });
    await waitFor(async () => terminal((await first.status('demo')).runState), 'hard stop leaves queued rows');
    expect((await first.status('demo')).tasks[1].status).toBe('queued');
    expect(services.proposeCalls).toBe(1);

    services.chapters = [{ id: 'chapter-1', scenes: [{ id: sceneIdOf(CARDS[1]), content: 'manual canonical body' }] }];
    const restarted = await newService(services, root);
    const recovered = await restarted.recover('demo');
    expect(recovered.tasks.find((task) => task.sceneId === sceneIdOf(CARDS[1]))?.status).toBe('completed');
    expect(services.proposeCalls).toBe(1);
  });

  it('I105 explicit legacy recovery upgrades queued/running only with exactly one chapter and fails closed otherwise/candidate-ready', async () => {
    const oneRoot = await mkdtemp(join(tmpdir(), 'novel-queue-legacy-')); roots.push(oneRoot);
    await mkdir(join(oneRoot, 'demo'), { recursive: true });
    const legacyBatch = legacyJournal('queued');
    const secondCard = CARDS[1];
    const secondSceneId = sceneIdOf(secondCard);
    legacyBatch.tasks.push({
      ...legacyBatch.tasks[0],
      id: queueTaskId(secondSceneId), sceneId: secondSceneId,
      actId: secondCard.actId, beatId: secondCard.beatId, cardId: secondCard.id,
      card: { ...legacyBatch.tasks[0].card, id: secondCard.id, title: secondCard.title, summary: secondCard.title },
    });
    await writeYaml(join(oneRoot, 'demo', 'queue-journal.yaml'), legacyBatch);
    const oneServices = freshServices();
    const one = await newService(oneServices, oneRoot);
    const upgraded = await one.recover('demo');
    expect(upgraded.tasks.map((task) => task.status)).toEqual(['queued', 'queued']);
    expect(oneServices.resolveQueueCalls).toBe(1);
    const upgradedDisk = await readYaml<{ version: number; tasks: Array<{ version: number; targetSnapshot?: unknown }> }>(join(oneRoot, 'demo', 'queue-journal.yaml'));
    expect(upgradedDisk.version).toBe(2);
    expect(upgradedDisk.tasks[0].version).toBe(2);
    expect(upgradedDisk.tasks[0].targetSnapshot).toBeDefined();

    for (const [label, chapters, status] of [
      ['zero', [], 'queued'],
      ['multi', [{ id: 'chapter-a', scenes: [] }, { id: 'chapter-b', scenes: [] }], 'running'],
      ['candidate', [{ id: 'chapter-1', scenes: [] }], 'candidate-ready'],
    ] as const) {
      const root = await mkdtemp(join(tmpdir(), `novel-queue-legacy-${label}-`)); roots.push(root);
      await mkdir(join(root, 'demo'), { recursive: true });
      await writeYaml(join(root, 'demo', 'queue-journal.yaml'), legacyJournal(status));
      const services = freshServices();
      services.chapters = chapters.map((chapter) => ({ id: chapter.id, scenes: [] }));
      const queue = await newService(services, root);
      const recovered = await queue.recover('demo');
      expect(recovered.tasks[0].status).toBe('failed');
      expect(recovered.tasks[0].candidateId).toBeNull();
      expect(recovered.tasks[0].error).toMatch(/Legacy/);
      expect(services.proposeCalls).toBe(0);
      if (label === 'candidate') {
        await queue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id] });
        await waitFor(async () => terminal((await queue.status('demo')).runState), 'explicit legacy startAt retry');
        expect((await queue.status('demo')).tasks[0].status).toBe('candidate-ready');
        expect(services.proposeCalls).toBe(1);
      }
    }
  });

  it('startAt waits for a terminal old RunEntry settlement before starting the refreshed queued row', async () => {
    const services = freshServices();
    services.validationByScene.set(sceneIdOf(CARDS[0]), 'reject');
    const terminalPersisted = deferred();
    const releaseCleanup = deferred();
    let cleanupCalls = 0;
    const queue = await newService(services, undefined, {
      beforeRunCleanup: async () => {
        cleanupCalls += 1;
        if (cleanupCalls !== 1) return;
        terminalPersisted.resolve();
        await releaseCleanup.promise;
      },
    });

    await queue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id, CARDS[1].id] });
    await terminalPersisted.promise;
    expect((await queue.status('demo')).runState).toBe('stopped-hard');
    expect((await queue.status('demo')).tasks[1].status).toBe('queued');

    services.chapters[0].scenes.push({ id: 'unrelated-refresh', content: 'owner changed' });
    let restartResolved = false;
    const restarting = queue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[1].id] })
      .then((status) => { restartResolved = true; return status; });
    await Promise.resolve();
    expect(restartResolved).toBe(false);

    releaseCleanup.resolve();
    const restarted = await restarting;
    expect(restarted.runState).toBe('running');
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'refreshed row run');
    const settled = await queue.status('demo');
    expect(settled.tasks.find((task) => task.sceneId === sceneIdOf(CARDS[1]))).toMatchObject({ status: 'candidate-ready', error: null });
    expect(services.proposeCalls).toBe(2);
  });

  it('run-loop infrastructure rejection is caught, projected once, and reset by the next run', async () => {
    const services = freshServices();
    services.failListChaptersAt = 2;
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
    process.on('unhandledRejection', onUnhandled);
    try {
      await queueStartAndObserve();
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    async function queueStartAndObserve(): Promise<void> {
      const queue = await newService(services);
      await queue.startAt('demo', { chapterId: 'chapter-1', cardIds: [CARDS[0].id] });
      await waitFor(async () => (await queue.status('demo')).error !== null, 'run error projection');
      const failedRun = await queue.status('demo');
      expect(failedRun.error).toBe('injected journal-adjacent infrastructure fault');
      expect(failedRun.runState).toBe('idle');
      expect(failedRun.tasks[0].status).toBe('queued');

      const restarted = await queue.start('demo');
      expect(restarted.error).toBeNull();
      await waitFor(async () => terminal((await queue.status('demo')).runState), 'run after infrastructure fault');
      expect((await queue.status('demo')).tasks[0].status).toBe('candidate-ready');
      await new Promise<void>((resolve) => { setImmediate(resolve); });
      expect(unhandled).toEqual([]);
    }
  });

  it('Fiber dispose：中止在飞运行；journal 持久状态可被新实例恢复', async () => {
    const services = freshServices();
    const root = await mkdtemp(join(tmpdir(), 'novel-queue-svc-'));
    roots.push(root);
    const first = await newService(services, root);
    await first.open('demo');
    await first.start('demo', { cardIds: CARDS.map((card) => card.id) });
    // 不等完成，直接 dispose（模拟 Fiber 卸载）：中止控制器。
    for (const dispose of services.disposeFns) dispose();
    // 等到运行任务全部复位且 runState 收敛（取消路径的持久化已完成，避免 afterEach
    // 清理与在飞写竞争）。
    await waitFor(async () => {
      const status = await first.status('demo');
      return terminal(status.runState) && status.tasks.every((task) => task.status !== 'running');
    }, 'dispose settles');

    // 新实例可恢复：任何 running（若残留）复位 queued；未生成场景仍可继续。
    const second = await newService(services, root);
    const status = await second.status('demo');
    expect(status.tasks.every((task) => task.status !== 'running')).toBe(true);
    expect(status.tasks.filter((task) => task.status === 'candidate-ready').length).toBeGreaterThanOrEqual(0);
  });
});
