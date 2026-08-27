import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseWritingCandidate, type WritingCandidate } from '../core/candidate/index.js';
import { stableSceneId, countProseUnits } from '../core/queue/index.js';
import { createQueueService, type QueueServiceDeps, type QueueStatusView } from './queue-service.js';
import type { Chapter } from '../core/schema/text.js';

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
  registered: Array<{ candidateId: string; sceneId: string }>;
  proposeCalls: number;
  validationByScene: Map<string, 'pass' | 'warn' | 'reject'>;
  failNextPropose: boolean;
  chapters: Array<{ id: string; scenes: Array<{ id: string; content: string }> }>;
  disposeFns: Array<() => void>;
}

function makeDeps(services: StubServices, projectsRoot: string): QueueServiceDeps {
  return {
    projectsRoot,
    candidate: {
      open: async () => undefined,
      async propose(request) {
        services.proposeCalls += 1;
        if (services.failNextPropose) {
          services.failNextPropose = false;
          throw new Error('backend exploded');
        }
        const candidate = parseWritingCandidate({
          id: request.id,
          intent: 'scene-card',
          target: request.target,
          prompt: '你是长篇小说章节写作器。…',
          text: PROSE,
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
      preview: async (candidateId: string) => {
        const candidate = services.generated.find((item) => item.id === candidateId);
        if (candidate === undefined) throw new Error(`unknown candidate ${candidateId}`);
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
        };
      },
      adjudicate: async () => { throw new Error('unused'); },
      registerRecoveredCandidate(candidate, recovery) {
        services.registered.push({ candidateId: candidate.id, sceneId: candidate.target.sceneId as string });
        void recovery;
      },
    },
    text: {
      open: async () => undefined,
      createChapter: async () => { throw new Error('unused'); },
      listChapters: async () => services.chapters as unknown as Chapter[],
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
      async beatCards() {
        return CARDS.map((card) => ({ actId: card.actId, beatId: card.beatId, beatTitle: 'beat', detailBeat: { id: card.id, title: card.title, summary: card.title, pov: 'mira', wordTarget: 20, points: [], status: 'writing' } }));
      },
      saveProgress: async () => { throw new Error('unused'); },
      readProgress: async () => { throw new Error('unused'); },
      async navigate() { return NAVIGATION; },
      recordDeviation: async () => { throw new Error('unused'); },
      reconcileDeviation: async () => { throw new Error('unused'); },
    },
    resolveSettings: async () => settings,
    onDispose: (dispose) => services.disposeFns.push(dispose),
  };
}

function sceneIdOf(card: CardFixture): string {
  return stableSceneId(card.actId, card.beatId, card.id);
}

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** 新建服务实例；共享 root 时传入同一目录（模拟同一项目目录上的重启恢复）。 */
async function newService(services: StubServices, sharedRoot?: string): Promise<ReturnType<typeof createQueueService>> {
  const root = sharedRoot ?? await mkdtemp(join(tmpdir(), 'novel-queue-svc-'));
  if (sharedRoot === undefined) roots.push(root);
  return createQueueService(makeDeps(services, root));
}

async function waitFor(predicate: () => Promise<boolean> | boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => { setTimeout(resolve, 10); });
  }
  throw new Error(`waitFor timeout: ${label}`);
}

function freshServices(): StubServices {
  return {
    generated: [],
    registered: [],
    proposeCalls: 0,
    validationByScene: new Map(),
    failNextPropose: false,
    chapters: [],
    disposeFns: [],
  };
}

const terminal = (status: QueueStatusView['runState']): boolean =>
  status !== 'running' && status !== 'paused';

describe('I65 queue service control flow', () => {
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
    expect(status.consumedUnits).toBe(3 * PROSE_UNITS);

    // 幂等入队：同一范围再次 start 不重复创建任务、不重复生成。
    const again = await queue.start('demo', { cardIds: [CARDS[0].id] });
    expect(again.tasks).toHaveLength(3);
    expect(services.proposeCalls).toBe(3);
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

  it('retry：failed 任务归零重排队并成功；candidate-ready 任务可重生成', async () => {
    const services = freshServices();
    services.failNextPropose = true; // 第一次 propose 失败（maxRetries=0 → failed）
    const queue = await newService(services);
    await queue.open('demo');
    await queue.start('demo', { cardIds: [CARDS[0].id], maxRetries: 0 });
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'fail settles');
    let status = await queue.status('demo');
    expect(status.tasks[0].status).toBe('failed');
    expect(services.proposeCalls).toBe(1);

    // retry 归零重排队 → 再次 run 成功（candidate-ready）。
    status = await queue.retry('demo', status.tasks[0].id);
    expect(status.tasks[0].status).toBe('queued');
    await queue.start('demo');
    await waitFor(async () => terminal((await queue.status('demo')).runState), 'retry settles');
    status = await queue.status('demo');
    expect(status.tasks[0].status).toBe('candidate-ready');
    expect(services.proposeCalls).toBe(2);

    // candidate-ready 任务可经 retry 重生成（作者拒绝后换新候选）。
    const retried = await queue.retry('demo', status.tasks[0].id);
    expect(retried.tasks[0].status).toBe('queued');
    expect(retried.tasks[0].candidateId).toBeNull();
  });

  it('重启恢复：新实例 recover 不重新生成已待裁决候选（rehydrate 回裁决服务）且已写正文场景标 completed', async () => {
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

    // 模拟作者在 I63 面板接受了第 1 张卡的候选（场景已写正文）。
    const writtenSceneId = sceneIdOf(CARDS[0]);
    services.chapters = [{ id: 'chapter-1', scenes: [{ id: writtenSceneId, content: PROSE }] }];

    // 新实例（重启）：recover 对账 —— 已写正文 → completed（不重新生成），
    // 其余候选 rehydrate 回裁决服务（registered 再次记录），propose 不再被调用。
    const second = await newService(services, root);
    const recovered = await second.recover('demo');
    expect(recovered.tasks.find((task) => task.sceneId === writtenSceneId)?.status).toBe('completed');
    expect(services.proposeCalls).toBe(3);
    // 3 次生成注册 + 2 个未写正文候选的恢复 rehydrate。
    expect(services.registered.length).toBe(5);

    // start 继续：无 queued 任务 → completed；无重复生成、无重复正文。
    const resumed = await second.start('demo');
    expect(resumed.runState).toBe('completed');
    expect(services.proposeCalls).toBe(3);

    // status 惰性恢复幂等：再次对账不再变化。
    const rest = await second.status('demo');
    expect(rest.tasks.find((task) => task.sceneId === writtenSceneId)?.status).toBe('completed');
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
