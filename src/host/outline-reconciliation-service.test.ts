import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stableSceneId } from '../core/queue/task.js';
import { buildTextChangeDelta, textChangeHash } from '../core/text-change-impact/index.js';
import { createConfirmationService } from './confirmation-service.js';
import { createOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import { createOutlineReconciliationPlannerService } from './outline-reconciliation-planner-service.js';
import { createOutlineReconciliationService } from './outline-reconciliation-service.js';
import { createOutlineService } from './outline-service.js';
import { createSceneOutlineBindingService } from './scene-outline-binding-service.js';
import { createTextChangeImpactService } from './text-change-impact-service.js';
import { createTextService } from './text-service.js';

const roots: string[] = [];
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function streamJson(value: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(value) }; } };
}

async function fixture(withNextScene = true) {
  const root = await mkdtemp(join(tmpdir(), 'novel-outline-reconciliation-apply-'));
  roots.push(root);
  const text = createTextService(root);
  const outline = createOutlineService(root);
  await text.open('project');
  await outline.open('project');
  const nextSceneId = stableSceneId('act-1', 'beat-1', 'detail-2');
  await text.createChapter('project', { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
  await text.appendScene('project', 'chapter-1', { id: 'scene-1', content: '他们从北门进入内城。', summary: '北门', beats: [], canonEvents: [], notes: '' });
  if (withNextScene) await text.appendScene('project', 'chapter-1', { id: nextSceneId, content: '盐沼外的风很冷。', summary: '盐沼', beats: [], canonEvents: [], notes: '' });
  await outline.save('project', {
    id: 'outline-1', structure: 'free', logline: '改变路线。', themes: [], foreshadowing: [], endings: [],
    acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '离开北门', beats: [{
      id: 'beat-1', title: '路线变化', description: '重新选择路线。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false,
      detailBeats: [
        { id: 'detail-1', title: '决定出发', summary: '主角决定出发。', pov: 'mira', wordTarget: 500, points: ['北门'], status: 'writing' },
        { id: 'detail-2', title: '穿过盐沼', summary: '主角穿过盐沼。', pov: 'mira', wordTarget: 500, points: ['盐沼'], status: 'planned' },
      ],
    }] }],
  });
  await outline.saveProgress('project', { outlineId: 'outline-1', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: [], deviations: [], tensionLevel: 20 });
  const binding = createSceneOutlineBindingService(text, outline, root);
  const bindingBefore = await binding.read('project');
  await binding.save('project', { sceneId: 'scene-1', detailBeatId: 'detail-1', expectedFingerprint: bindingBefore.fingerprint });
  const baseline = createOutlineGenerationBaselineService({ text, outline, binding }, root);
  const created = await baseline.create('project', { chapterId: 'chapter-1', sceneId: 'scene-1', detailBeatId: 'detail-1' });
  const before = '他们从北门进入内城。';
  const after = '他们改道穿过盐沼，三天后才抵达内城。';
  await text.replaceRange('project', 'chapter-1', 'scene-1', { start: 0, end: before.length }, after);
  const delta = buildTextChangeDelta(before, after);
  const impact = createTextChangeImpactService({
    llm: streamJson({ classification: 'plot-direction', confidence: 'high', evidence: [{ sourceHash: delta.afterHash, beforeRange: delta.beforeRange, afterRange: delta.afterRange, beforeQuote: delta.beforeQuote, afterQuote: delta.afterQuote }], affectedDetailBeatIds: ['detail-2'], rationale: '路线发生改变。' }),
    text, outline, binding, baseline,
  });
  const impactResult = await impact.prepare('project', { baselineId: created.baseline.baselineId, finalSourceHash: textChangeHash(after) }, settings);
  const report = impact.read('project', impactResult.impactId);
  const planner = createOutlineReconciliationPlannerService({ llm: streamJson({ suggestions: [{ detailBeatId: 'detail-2', title: '穿过盐沼抵达内城', summary: '主角改道穿过盐沼。', pov: 'mira', wordTarget: 700, points: ['盐沼', '改道'], rationale: '遵循正文路线变化。' }] }), text, outline, binding, baseline });
  const plan = await planner.prepare('project', { report }, settings);
  const confirmation = createConfirmationService(root);
  await confirmation.open('project');
  const service = createOutlineReconciliationService({ planner, text, outline, binding, baseline, confirmation });
  return { root, text, outline, binding, baseline, confirmation, service, plan, after, nextSceneId };
}

describe('I114 OutlineReconciliationService', () => {
  it('keeps proposal zero-write, applies only authorized future cards, finalizes current C6, and continues to the next baseline', async () => {
    const fixtureValue = await fixture(true);
    const beforeOutline = await fixtureValue.outline.read('project');
    const proposal = await fixtureValue.service.propose('project', { planId: fixtureValue.plan.planId, decisions: [{ detailBeatId: 'detail-2', choice: 'ai' }] });
    expect(proposal.status).toBe('pending');
    expect((await fixtureValue.baseline.read('project', fixtureValue.plan.baselineId)).staleReasons).toEqual(['source-changed']);
    expect((await fixtureValue.outline.read('project')).acts[0].beats[0].detailBeats[1].title).toBe('穿过盐沼');
    expect(fixtureValue.confirmation.pending('project')).toHaveLength(1);

    const accepted = await fixtureValue.service.accept('project', proposal.proposalId);
    expect(accepted.status).toBe('accepted');
    expect((await fixtureValue.outline.read('project')).acts[0].beats[0].detailBeats[1]).toMatchObject({ id: 'detail-2', title: '穿过盐沼抵达内城', status: 'planned' });
    expect((await fixtureValue.outline.read('project')).acts[0].beats[0].detailBeats[0].status).toBe('writing');
    expect(await fixtureValue.service.accept('project', proposal.proposalId)).toMatchObject({ status: 'already-accepted', proposalId: proposal.proposalId });

    const finalized = await fixtureValue.service.finalize('project', { planId: fixtureValue.plan.planId, finalSourceHash: textChangeHash(fixtureValue.after) });
    expect(finalized.status).toBe('finalized');
    expect(finalized.current).toMatchObject({ chapterId: 'chapter-1', sceneId: 'scene-1', detailBeatId: 'detail-1', status: 'done' });
    expect(finalized.progress.completedBeats).toEqual([]);
    expect((await fixtureValue.outline.read('project')).acts[0].beats[0].detailBeats[0].status).toBe('done');
    expect(await fixtureValue.service.finalize('project', { planId: fixtureValue.plan.planId, finalSourceHash: textChangeHash(fixtureValue.after) })).toMatchObject({ status: 'already-finalized' });

    const continued = await fixtureValue.service.continue('project', { planId: fixtureValue.plan.planId, finalSourceHash: textChangeHash(fixtureValue.after) });
    expect(continued.status).toBe('continued');
    if (continued.status !== 'continued') throw new Error('Expected next baseline');
    expect(continued.next).toMatchObject({ chapterId: 'chapter-1', sceneId: fixtureValue.nextSceneId, detailBeatId: 'detail-2' });
    expect((await fixtureValue.baseline.read('project', continued.next.baselineId)).baseline.sceneCard.detailBeat.title).toBe('穿过盐沼抵达内城');
    expect(await fixtureValue.service.continue('project', { planId: fixtureValue.plan.planId, finalSourceHash: textChangeHash(fixtureValue.after) })).toEqual(continued);
    expect((await fixtureValue.outline.read('project')).acts[0].beats[0].detailBeats[1].status).toBe('planned');
    expect(beforeOutline.acts[0].beats[0].detailBeats[0].status).toBe('writing');
  });

  it('rejects without writes, records pending C6 deviations, and returns needs-target without inventing a baseline', async () => {
    const fixtureValue = await fixture(false);
    const proposal = await fixtureValue.service.propose('project', { planId: fixtureValue.plan.planId, decisions: [{ detailBeatId: 'detail-2', choice: 'pending' }] });
    expect((await fixtureValue.service.reject('project', proposal.proposalId)).status).toBe('rejected');
    expect((await fixtureValue.outline.read('project')).acts[0].beats[0].detailBeats[1].title).toBe('穿过盐沼');
    await expect(fixtureValue.service.accept('project', proposal.proposalId)).rejects.toThrow(/rejected/);

    const second = await fixture(false);
    const secondProposal = await second.service.propose('project', { planId: second.plan.planId, decisions: [{ detailBeatId: 'detail-2', choice: 'pending' }] });
    await second.service.accept('project', secondProposal.proposalId);
    const progress = await second.outline.readProgress('project');
    expect(progress.deviations).toHaveLength(1);
    const finalized = await second.service.finalize('project', { planId: second.plan.planId, finalSourceHash: textChangeHash(second.after) });
    expect(finalized.current.status).toBe('done');
    const continued = await second.service.continue('project', { planId: second.plan.planId, finalSourceHash: textChangeHash(second.after) });
    expect(continued).toMatchObject({ status: 'blocked-pending', detailBeatId: 'detail-2' });
    if (continued.status === 'continued') throw new Error('Pending card must block continuation');
    expect((await second.outline.readProgress('project')).deviations[0].reconciled).toBe(false);
  });

  it('fails closed on stale B5 and strict incomplete decisions before opening a Gate record', async () => {
    const fixtureValue = await fixture(true);
    await expect(fixtureValue.service.propose('project', { planId: fixtureValue.plan.planId, decisions: [] })).rejects.toThrow(/exactly one decision/);
    const changed = await fixtureValue.outline.read('project');
    await fixtureValue.outline.save('project', { ...changed, logline: '另一个方向。' });
    await expect(fixtureValue.service.propose('project', { planId: fixtureValue.plan.planId, decisions: [{ detailBeatId: 'detail-2', choice: 'keep' }] })).rejects.toThrow(/stale|b5-changed/i);
    expect(fixtureValue.confirmation.list('project')).toEqual([]);
  });
});
