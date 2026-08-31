import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildTextChangeDelta, textChangeHash } from '../core/text-change-impact/index.js';
import { outlineReconciliationPlanSchema } from '../core/schema/outline-reconciliation.js';
import { createOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import { createOutlineReconciliationPlannerService } from './outline-reconciliation-planner-service.js';
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

function impactModel(before: string, after: string, affectedDetailBeatIds: string[], classification = 'plot-direction') {
  const delta = buildTextChangeDelta(before, after);
  return {
    classification, confidence: 'high',
    evidence: [{ sourceHash: delta.afterHash, beforeRange: delta.beforeRange, afterRange: delta.afterRange, beforeQuote: delta.beforeQuote, afterQuote: delta.afterQuote }],
    affectedDetailBeatIds, rationale: '正文改变了后续事实或方向。',
  };
}

function plannerModel(ids: string[], suffix = '') {
  return { suggestions: ids.map((detailBeatId, index) => ({
    detailBeatId, title: `调和${detailBeatId}${suffix}`, summary: `依据正文更新${detailBeatId}。`, pov: 'mira', wordTarget: 600 + index,
    points: [`正文证据${detailBeatId}`], rationale: `suggestion-${detailBeatId}${suffix}`,
  })) };
}

async function realFixture(plannerLlm: unknown, affected = ['detail-2', 'detail-4', 'detail-5']) {
  const root = await mkdtemp(join(tmpdir(), 'novel-outline-reconciliation-'));
  roots.push(root);
  const text = createTextService(root);
  const outline = createOutlineService(root);
  await text.open('project');
  await outline.open('project');
  await text.createChapter('project', { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
  const before = '他们今晚从北门进入内城。';
  const after = '他们改道穿过盐沼，三天后才抵达内城。';
  await text.appendScene('project', 'chapter-1', { id: 'scene-1', content: before, summary: '北门选择', beats: [], canonEvents: [], notes: '' });
  await outline.save('project', {
    id: 'outline-1', structure: 'free', logline: '改变路线。', themes: [], foreshadowing: [], endings: [],
    acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '离开北门', beats: [{
      id: 'beat-1', title: '路线变化', description: '重新选择路线。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false,
      detailBeats: [
        { id: 'detail-1', title: '决定出发', summary: '主角决定出发。', pov: 'mira', wordTarget: 500, points: ['北门'], status: 'writing' },
        { id: 'detail-2', title: '穿过盐沼', summary: '主角穿过盐沼。', pov: 'mira', wordTarget: 500, points: ['盐沼'], status: 'planned' },
        { id: 'detail-3', title: '旧计划完成', summary: '旧计划已经完成。', pov: 'mira', wordTarget: 500, points: ['完成'], status: 'done' },
        { id: 'detail-4', title: '抵达内城', summary: '主角抵达内城。', pov: 'mira', wordTarget: 500, points: ['内城'], status: 'planned' },
        { id: 'detail-5', title: '寻找落脚处', summary: '主角在内城寻找落脚处。', pov: 'mira', wordTarget: 500, points: ['落脚处'], status: 'planned' },
      ],
    }] }],
  });
  const binding = createSceneOutlineBindingService(text, outline, root);
  const initialBinding = await binding.read('project');
  await binding.save('project', { sceneId: 'scene-1', detailBeatId: 'detail-1', expectedFingerprint: initialBinding.fingerprint });
  const baseline = createOutlineGenerationBaselineService({ text, outline, binding }, root);
  const created = await baseline.create('project', { chapterId: 'chapter-1', sceneId: 'scene-1', detailBeatId: 'detail-1' });
  await text.replaceRange('project', 'chapter-1', 'scene-1', { start: 0, end: before.length }, after);
  const impact = createTextChangeImpactService({ llm: streamJson(impactModel(before, after, affected)), text, outline, binding, baseline });
  const impactResult = await impact.prepare('project', { baselineId: created.baseline.baselineId, finalSourceHash: textChangeHash(after) }, settings);
  const report = impact.read('project', impactResult.impactId);
  const planner = createOutlineReconciliationPlannerService({ llm: plannerLlm, text, outline, binding, baseline });
  return { root, text, outline, binding, baseline, planner, report, created, before, after };
}

describe('I113 OutlineReconciliationPlanner', () => {
  it('消费真实 I112 report 与 B5，生成有序零写 plan，并支持四态表达', async () => {
    const fixture = await realFixture(streamJson(plannerModel(['detail-2', 'detail-4', 'detail-5'])));
    const outlineBefore = await fixture.outline.read('project');
    const plan = await fixture.planner.prepare('project', { report: fixture.report }, settings);
    expect(plan.items.map((item) => [item.detailBeatId, item.position])).toEqual([['detail-2', 1], ['detail-4', 3], ['detail-5', 4]]);
    expect(plan.items.every((item) => item.before.status === 'planned' && item.after.status === 'planned')).toBe(true);
    expect(plan.items.every((item) => item.before.id === item.after.id)).toBe(true);
    expect(plan.items.map((item) => item.diff.changedFields)).toEqual([['title', 'summary', 'wordTarget', 'points'], ['title', 'summary', 'wordTarget', 'points'], ['title', 'summary', 'wordTarget', 'points']]);
    expect(plan.items.every((item) => item.allowedChoices.join(',') === 'keep,ai,manual,pending' && item.choice === 'pending')).toBe(true);
    expect(await fixture.outline.read('project')).toEqual(outlineBefore);
    expect(await fixture.planner.prepare('project', { report: fixture.report }, settings)).toEqual(plan);

    const mixed = outlineReconciliationPlanSchema.parse({
      ...plan,
      items: plan.items.map((item, index) => index === 0
        ? { ...item, choice: 'keep' as const }
        : index === 1
          ? { ...item, choice: 'manual' as const, manualValue: item.before }
          : { ...item, choice: 'ai' as const }),
    });
    expect(mixed.items.map((item) => item.choice)).toEqual(['keep', 'manual', 'ai']);
  });

  it('regenerateOne 只替换目标 item，保留其他 item 与 identity/order/status', async () => {
    let calls = 0;
    const fixture = await realFixture({
      async *stream() {
        calls += 1;
        const ids = ['detail-2', 'detail-4', 'detail-5'];
        yield { type: 'text-delta' as const, text: JSON.stringify(plannerModel(calls === 1 ? ids : ['detail-4'], calls === 1 ? '' : '-again')) };
      },
    });
    const plan = await fixture.planner.prepare('project', { report: fixture.report }, settings);
    const regenerated = await fixture.planner.regenerateOne('project', { planId: plan.planId, detailBeatId: 'detail-4' }, settings);
    expect(regenerated.revision).toBe(2);
    expect(regenerated.items[0]).toEqual(plan.items[0]);
    expect(regenerated.items[2]).toEqual(plan.items[2]);
    expect(regenerated.items[1].after.title).toBe('调和detail-4-again');
    await expect(fixture.planner.regenerateOne('project', { planId: plan.planId, detailBeatId: 'detail-3' }, settings)).rejects.toThrow(/non-plan/);
  });

  it('B5/source/binding stale、非法 report、取消与 wording-only 均 fail closed', async () => {
    const fixture = await realFixture(streamJson(plannerModel(['detail-2', 'detail-4', 'detail-5'])));
    const changed = await fixture.outline.read('project');
    await fixture.outline.save('project', { ...changed, logline: 'B5 已变化。' });
    await expect(fixture.planner.prepare('project', { report: fixture.report }, settings)).rejects.toThrow(/b5-changed|B5/);

    const invalidFixture = await realFixture(streamJson(plannerModel(['detail-2', 'detail-4', 'detail-5'])));
    const invalidReport = { ...invalidFixture.report, affectedDetailBeatIds: ['detail-3'] };
    await expect(invalidFixture.planner.prepare('project', { report: invalidReport }, settings)).rejects.toThrow(/ineligible/);

    const wordingFixture = await realFixture(streamJson(plannerModel([])));
    const wordingReport = { ...wordingFixture.report, classification: 'wording-only' as const, affectedDetailBeatIds: [] };
    const wordingPlan = await wordingFixture.planner.prepare('project', { report: wordingReport }, settings);
    expect(wordingPlan.items).toEqual([]);
    await wordingFixture.planner.cancel('project', wordingPlan.planId);
    expect(() => wordingFixture.planner.read('project', wordingPlan.planId)).toThrow(/cancelled/);
  });
});
