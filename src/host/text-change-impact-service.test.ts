import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { textChangeHash, buildTextChangeDelta } from '../core/text-change-impact/index.js';
import { createOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';
import { createOutlineService } from './outline-service.js';
import { createSceneOutlineBindingService } from './scene-outline-binding-service.js';
import { createTextChangeImpactService } from './text-change-impact-service.js';
import { createTextService } from './text-service.js';

const roots: string[] = [];
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function classifierOutput(before: string, after: string, affectedDetailBeatIds: string[] = ['detail-2'], classification = 'story-fact') {
  const delta = buildTextChangeDelta(before, after);
  return {
    classification,
    confidence: 'high',
    evidence: [{ sourceHash: delta.afterHash, beforeRange: delta.beforeRange, afterRange: delta.afterRange, beforeQuote: delta.beforeQuote, afterQuote: delta.afterQuote }],
    affectedDetailBeatIds,
    rationale: '正文事实发生变化，后续卡需要作者裁决。',
  };
}

async function realFixture(llm: unknown, finalContent: string, before = '米拉在码头找到一张旧地图。') {
  const root = await mkdtemp(join(tmpdir(), 'novel-text-change-impact-'));
  roots.push(root);
  const text = createTextService(root);
  const outline = createOutlineService(root);
  await text.open('project');
  await outline.open('project');
  await text.createChapter('project', { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
  await text.appendScene('project', 'chapter-1', { id: 'scene-1', content: before, summary: '码头', beats: [], canonEvents: [], notes: '' });
  await outline.save('project', {
    id: 'outline-1', structure: 'free', logline: '追查真相。', themes: [], foreshadowing: [], endings: [],
    acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '找到线索', beats: [{
      id: 'beat-1', title: '码头线索', description: '找到线索。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false,
      detailBeats: [
        { id: 'detail-1', title: '抵达码头', summary: '主角抵达码头。', pov: 'mira', wordTarget: 500, points: ['码头'], status: 'writing' },
        { id: 'detail-2', title: '核对线索', summary: '主角核对旧地图。', pov: 'mira', wordTarget: 500, points: ['地图'], status: 'planned' },
        { id: 'detail-3', title: '完成旧事', summary: '已完成的旧事。', pov: 'mira', wordTarget: 500, points: ['完成'], status: 'done' },
        { id: 'detail-4', title: '前往灯塔', summary: '主角前往灯塔。', pov: 'mira', wordTarget: 500, points: ['灯塔'], status: 'planned' },
      ],
    }] }],
  });
  const binding = createSceneOutlineBindingService(text, outline, root);
  const initial = await binding.read('project');
  await binding.save('project', { sceneId: 'scene-1', detailBeatId: 'detail-1', expectedFingerprint: initial.fingerprint });
  const baseline = createOutlineGenerationBaselineService({ text, outline, binding }, root);
  const created = await baseline.create('project', { chapterId: 'chapter-1', sceneId: 'scene-1', detailBeatId: 'detail-1' });
  await text.replaceRange('project', 'chapter-1', 'scene-1', { start: 0, end: before.length }, finalContent);
  const impact = createTextChangeImpactService({ llm, text, outline, binding, baseline });
  return { root, text, outline, binding, baseline, impact, created, before, finalContent };
}

describe('I112 TextChangeImpactAnalyzer', () => {
  it('消费真实 baseline+C5+B5，输出有界未来卡并且零写', async () => {
    let calls = 0;
    const before = '米拉在码头找到一张旧地图。';
    const after = '米拉在码头找到一把铜钥匙和一张旧地图。';
    const fixture = await realFixture({
      async *stream() {
        calls += 1;
        yield { type: 'text-delta' as const, text: JSON.stringify(classifierOutput(before, after)) };
        yield { type: 'finish' as const, reason: { kind: 'stop' } };
      },
    }, after);
    const outlineBefore = await fixture.outline.read('project');
    const result = await fixture.impact.prepare('project', {
      baselineId: fixture.created.baseline.baselineId,
      finalSourceHash: textChangeHash(after),
    }, { modelRef: 'dsh/fake', credentialRef: 'dsh/test' });
    const report = fixture.impact.read('project', result.impactId);
    expect(report).toMatchObject({ classification: 'story-fact', confidence: 'high', affectedDetailBeatIds: ['detail-2'] });
    expect(report.eligibleFutureDetailBeatIds).toEqual(['detail-2', 'detail-4']);
    expect(report.delta.pureFormatting).toBe(false);
    expect(report.evidence[0]).toMatchObject({ sourceHash: textChangeHash(after), beforeQuote: report.delta.beforeQuote, afterQuote: report.delta.afterQuote });
    expect(calls).toBe(1);
    expect(await fixture.outline.read('project')).toEqual(outlineBefore);
    expect((await fixture.text.readChapter('project', 'chapter-1')).scenes[0].content).toBe(after);
    await expect(fixture.impact.prepare('project', { baselineId: fixture.created.baseline.baselineId, finalSourceHash: textChangeHash('另一个正文') }, settings)).rejects.toThrow(/does not match/);
  });

  it('纯空白/格式变化确定性返回 wording-only，不调用 LLM', async () => {
    let calls = 0;
    const before = '第一段。';
    const after = '第一段。\n';
    const fixture = await realFixture({
      async *stream() { calls += 1; yield { type: 'text-delta' as const, text: '{}' }; },
    }, after, before);
    const result = await fixture.impact.prepare('project', { baselineId: fixture.created.baseline.baselineId, finalSourceHash: textChangeHash(after) }, settings);
    const report = fixture.impact.read('project', result.impactId);
    expect(report).toMatchObject({ classification: 'wording-only', confidence: 'high', affectedDetailBeatIds: [], delta: { pureFormatting: true } });
    expect(calls).toBe(0);
  });

  it('B5/binding 变化、非法证据与取消均 fail closed', async () => {
    const before = '米拉在码头找到一张旧地图。';
    const after = '米拉在码头找到一把铜钥匙和一张旧地图。';
    const fixture = await realFixture({
      async *stream() {
        yield { type: 'text-delta' as const, text: JSON.stringify({ ...classifierOutput(before, after), evidence: [{ ...classifierOutput(before, after).evidence[0], afterQuote: '越界' }] }) };
      },
    }, after);
    await expect(fixture.impact.prepare('project', { baselineId: fixture.created.baseline.baselineId, finalSourceHash: textChangeHash(after) }, settings)).rejects.toThrow(/quote/);

    const b5Fixture = await realFixture({ async *stream() { yield { type: 'text-delta' as const, text: '{}' }; } }, after);
    const changedOutline = await b5Fixture.outline.read('project');
    await b5Fixture.outline.save('project', { ...changedOutline, acts: [{ ...changedOutline.acts[0], beats: [{ ...changedOutline.acts[0].beats[0], title: '改过的线索' }] }] });
    await expect(b5Fixture.impact.prepare('project', { baselineId: b5Fixture.created.baseline.baselineId, finalSourceHash: textChangeHash(after) }, settings)).rejects.toThrow(/b5-changed/);

    const cancelled = await realFixture({
      async *stream(request: { signal?: AbortSignal }) {
        await new Promise<void>((resolve) => request.signal?.addEventListener('abort', () => resolve(), { once: true }));
        yield { type: 'text-delta' as const, text: '{}' };
      },
    }, after);
    const controller = new AbortController();
    const pending = cancelled.impact.prepare('project', { baselineId: cancelled.created.baseline.baselineId, finalSourceHash: textChangeHash(after) }, settings, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
