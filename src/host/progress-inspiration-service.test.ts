import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectRepository } from '../core/project/index.js';
import { createOutlineService } from './outline-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { createInspirationService, type InspirationDirection } from './inspiration-service.js';
import { createProgressInspirationService, inspirationProposalId } from './progress-inspiration-service.js';
import type { Outline } from '../core/schema/outline.js';
import type { OutlineProgress } from '../core/schema/outline-progress.js';

/**
 * I68 C6 进度与灵感方向落地 Host owner 测试（design §14.10「C6 与灵感落地」/ R14-3）。
 *
 * 消费者夹具：真实 outlineService（B5/C6 唯一写 owner）+ 真实 ConfirmationGate
 * （I11）+ 真实 I45 灵感服务（fake LLM 流式返回 2 个可区分方向）。断言：
 * - 未选择/拒绝时 B5/C6 零写（inspire/select/reject 前后 projection 一致）；
 * - select 后方向经 Gate 持久化（pending，重载一致），accept 才写回；
 * - apply 只改授权的 B5（logline/themes/version）与 C6（追加一条偏差），
 *   acts/beats/场景卡不变；重复 apply 幂等（applied=false 且零额外写）；
 * - 审计记录（accepted/rejected 裁决）按插入顺序持久化。
 */
describe('I68 C6 进度与灵感落地 Host owner（R14-3）', () => {
  let roots: string[] = [];
  const tempRoot = async (): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i68-'));
    roots.push(root);
    return root;
  };
  afterEach(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
    roots = [];
  });

  const outlineFixture: Outline = {
    id: 'outline', version: 1, structure: 'three-act', logline: '米拉追查旧港封印。', themes: ['信任'],
    acts: [{ id: 'act-one', index: 1, title: '第一幕', goal: '抵达旧港', beats: [
      { id: 'first', title: '进入旧港', description: '米拉找到入口。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [
        { id: 'scene-1', title: '雨夜入港', summary: '米拉抵达旧港。', pov: 'mira', wordTarget: 800, points: ['到达'], status: 'planned' },
      ] },
      { id: 'second', title: '打开封印', description: '打开封印之门。', charactersInvolved: [], conflictType: 'world', prerequisites: ['first'], optional: false, detailBeats: [] },
    ] }],
    foreshadowing: [], endings: [],
  };
  const progressFixture: OutlineProgress = {
    outlineId: 'outline', currentAct: 'act-one', currentBeat: 'first', completedBeats: [], deviations: [], tensionLevel: 20,
  };

  const direction = (id: string, title: string, logline?: string): InspirationDirection => ({
    id, title, premise: `${title}的方向前提。`,
    changes: {
      ...(logline === undefined ? {} : { logline }),
      outlineNote: `${title}改变了剧情走向。`,
      progressNote: `${title}带来新的冲突。`,
    },
    rationale: `${title}的理由。`,
  });

  const fakeLlm = (directions: InspirationDirection[]) => ({
    async *stream() {
      yield { type: 'text-delta', text: JSON.stringify({ directions }) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  });

  const setup = async () => {
    const projectsRoot = await tempRoot();
    const project = new ProjectRepository(projectsRoot);
    await project.createProject({ projectId: 'demo', name: '进度灵感演示' });
    const outline = createOutlineService(projectsRoot);
    const confirmation = createConfirmationService(projectsRoot);
    await outline.open('demo');
    await confirmation.open('demo');
    await outline.save('demo', outlineFixture);
    await outline.saveProgress('demo', progressFixture);
    let disposed = 0;
    const inspiration = createInspirationService(fakeLlm([direction('dawn', '黎明交易'), direction('storm', '风暴交易')]), (dispose) => { disposed += 1; void dispose; });
    const service = createProgressInspirationService({
      outline, confirmation, inspiration, projectsRoot,
      onDispose: (dispose) => { disposed += 1; void dispose; },
    });
    return { projectsRoot, outline, confirmation, inspiration, service, disposed };
  };

  it('projection：当前幕/节/场景卡完成状态、导航与一致性（只读零写）', async () => {
    const { service } = await setup();
    const projection = await service.projection('demo');
    expect(projection.acts[0].beats[0]).toMatchObject({ id: 'first', current: true, completed: false, doneScenes: 0, totalScenes: 1 });
    expect(projection.navigation).toMatchObject({ beatId: 'first', prerequisitesMet: true });
    expect(projection.consistency).toEqual({ currentBeatCompleted: false, completedBeatsWithOpenScenes: [], navigationTargetAllScenesDone: false });
    expect(await service.projection('demo')).toEqual(projection);
  });

  it('inspire 零写：fake LLM 返回 2 个可区分方向，projection 不变', async () => {
    const { service } = await setup();
    const before = await service.projection('demo');
    const result = await service.inspire('demo', '给一个转折');
    expect(result.directions).toHaveLength(2);
    expect(result.directions[0].id).not.toBe(result.directions[1].id);
    expect(await service.projection('demo')).toEqual(before);
  });

  it('select→apply：未确认零写；确认后只改授权的 B5/C6；重复 apply 幂等', async () => {
    const { service, outline } = await setup();
    const before = await service.projection('demo');
    const proposed = await service.inspire('demo');
    const chosen = proposed.directions[0];

    // select → Gate pending；零写。
    const selected = await service.select('demo', { direction: chosen });
    expect(selected.status).toBe('pending');
    expect(await service.projection('demo')).toEqual(before);
    const pending = await service.pending('demo');
    expect(pending.proposals.map((proposal) => proposal.proposalId)).toContain(selected.proposalId);

    // apply（未确认前由 Host 校验拒绝 —— 用未知 proposalId 演示 fail-fast）。
    await expect(service.apply('demo', 'unknown-proposal')).rejects.toThrow(/Unknown confirmation/);

    // apply：Gate 确认后只改 B5 logline/themes/version 与 C6 偏差。
    const applied = await service.apply('demo', selected.proposalId);
    expect(applied.applied).toBe(true);
    const projection = applied.projection;
    expect(projection.deviations).toHaveLength(1);
    expect(projection.deviations[0].id).toBe(`${selected.proposalId}-deviation`);
    expect(projection.deviations[0].planned).toBe(outlineFixture.logline);
    expect(projection.deviations[0].actual).toBe(chosen.changes.outlineNote);
    // B5 结构（acts/beats/场景卡）与 C6 导航目标/完成状态不变（导航 deviationIds
    // 会随新增偏差合法增长，故只比较结构字段）。
    const stored = await outline.read('demo');
    expect(stored.version).toBe(2);
    expect(stored.acts).toEqual(outlineFixture.acts);
    expect(projection.navigation.beatId).toBe(before.navigation.beatId);
    expect(projection.navigation.instruction).toBe(before.navigation.instruction);
    expect(projection.navigation.deviationIds).toEqual([`${selected.proposalId}-deviation`]);
    expect(projection.completedBeats).toEqual([]);
    // 未选 logline 的方向 → logline 不变；审计记录含 accepted。
    expect(stored.logline).toBe(outlineFixture.logline);
    expect((await service.audit('demo')).records.map((record) => record.status)).toEqual(['accepted']);

    // 重复 apply 幂等：applied=false，投影与文件不再变化。
    const repeat = await service.apply('demo', selected.proposalId);
    expect(repeat.applied).toBe(false);
    expect(repeat.projection).toEqual(applied.projection);
    expect(await outline.read('demo')).toEqual(stored);
  });

  it('apply 可选 logline/themes 只写 B5 顶层并追加 C6 偏差', async () => {
    const { service, outline } = await setup();
    const dawn = direction('dawn', '黎明交易', '米拉以黎明交易换取封印。');
    const selected = await service.select('demo', { direction: dawn });
    const applied = await service.apply('demo', selected.proposalId);
    expect(applied.applied).toBe(true);
    const stored = await outline.read('demo');
    expect(stored.logline).toBe('米拉以黎明交易换取封印。');
    expect(stored.acts).toEqual(outlineFixture.acts);
    expect(applied.projection.deviations).toHaveLength(1);
  });

  it('reject：Gate 拒绝后 B5/C6 零写，审计记录含 rejected', async () => {
    const { service } = await setup();
    const before = await service.projection('demo');
    const proposed = await service.inspire('demo');
    const selected = await service.select('demo', { direction: proposed.directions[1] });
    const rejected = await service.reject('demo', selected.proposalId);
    expect(rejected.status).toBe('rejected');
    expect(await service.projection('demo')).toEqual(before);
    const audit = await service.audit('demo');
    expect(audit.records.map((record) => record.status)).toEqual(['rejected']);
    expect((await service.pending('demo')).proposals).toHaveLength(0);
  });

  it('pending/audit 重载一致：新服务实例读同一 Gate 持久化', async () => {
    const { projectsRoot, outline, confirmation, inspiration, service } = await setup();
    const proposed = await service.inspire('demo');
    const selected = await service.select('demo', { direction: proposed.directions[0] });
    await service.apply('demo', selected.proposalId);

    // 重开（新实例，模拟刷新/重启）。
    const reopened = createProgressInspirationService({
      outline: createOutlineService(projectsRoot), confirmation: createConfirmationService(projectsRoot), inspiration, projectsRoot,
    });
    await reopened.projection('demo');
    const pending = await reopened.pending('demo');
    expect(pending.proposals).toHaveLength(0);
    const audit = await reopened.audit('demo');
    expect(audit.records.map((record) => record.proposalId)).toEqual([selected.proposalId]);
    // 重放同一提案 → 幂等 no-op（不重复写）。
    const replay = await reopened.apply('demo', selected.proposalId);
    expect(replay.applied).toBe(false);
    expect((await reopened.projection('demo')).deviations).toHaveLength(1);
  });

  it('recordDeviation / reconcileDeviation：只写 C6，B5 不变', async () => {
    const { service, outline } = await setup();
    const before = await outline.read('demo');
    const recorded = await service.recordDeviation('demo', { planned: '入港', actual: '绕行山道', reason: '守夜人封路' });
    expect(recorded.deviations).toHaveLength(1);
    expect(recorded.deviations[0].reconciled).toBe(false);
    const reconciled = await service.reconcileDeviation('demo', recorded.deviations[0].id);
    expect(reconciled.deviations[0].reconciled).toBe(true);
    expect(await outline.read('demo')).toEqual(before);
    await expect(service.reconcileDeviation('demo', 'missing')).rejects.toThrow(/Unknown deviation/);
  });

  it('proposal id 稳定合法（≤64 且匹配 entityId，偏差标记也合法）', () => {
    const id = inspirationProposalId('黎明交易 direction!', 1700000000000);
    expect(id).toMatch(/^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(`${id}-deviation`.length).toBeLessThanOrEqual(64);
  });

  it('Fiber dispose 挂钩注册（H0-6）', async () => {
    const { disposed } = await setup();
    expect(disposed).toBeGreaterThanOrEqual(1);
  });
});
