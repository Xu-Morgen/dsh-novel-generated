import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOutlineService } from './outline-service.js';
import { SceneOutlineBindingRepository } from './scene-outline-binding-repository.js';
import { createSceneOutlineBindingService } from './scene-outline-binding-service.js';
import { createTextService } from './text-service.js';
import { createOutlineGenerationBaselineService } from './outline-generation-baseline-service.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-outline-generation-baseline-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function realFixture() {
  const root = await temporaryRoot();
  const text = createTextService(root);
  const outline = createOutlineService(root);
  await text.open('project');
  await outline.open('project');
  await text.createChapter('project', { id: 'chapter-a', index: 1, title: '第一章', pov: 'hero', status: 'draft' });
  await text.appendScene('project', 'chapter-a', {
    id: 'scene-a', content: '旧灯塔的门紧闭。', summary: '进入灯塔', beats: [], canonEvents: [], notes: '',
  });
  await outline.save('project', {
    id: 'outline', structure: 'free', logline: '寻找入口。', themes: [], foreshadowing: [], endings: [],
    acts: [{ id: 'act-a', index: 0, title: '第一幕', goal: '进入灯塔', beats: [{
      id: 'beat-a', title: '进入灯塔', description: '找到入口。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false,
      detailBeats: [
        { id: 'card-a', title: '发现旧灯塔', summary: '主角发现旧灯塔。', pov: 'hero', wordTarget: 500, points: ['门紧闭'], status: 'planned' },
        { id: 'card-b', title: '打开旧门', summary: '主角打开旧门。', pov: 'hero', wordTarget: 500, points: ['推门'], status: 'planned' },
      ],
    }] }],
  });
  const binding = createSceneOutlineBindingService(text, outline, root);
  const initialBinding = await binding.read('project');
  await binding.save('project', { sceneId: 'scene-a', detailBeatId: 'card-a', expectedFingerprint: initialBinding.fingerprint });
  const service = createOutlineGenerationBaselineService({ text, outline, binding }, root);
  return { root, text, outline, binding, service };
}

describe('I108 OutlineGenerationBaselineService', () => {
  it('freezes B5/C5/binding owners, is idempotent, and recovers after restart', async () => {
    const { root, service } = await realFixture();
    const first = await service.create('project', { chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a' });
    expect(first.freshness).toBe('fresh');
    expect(first.baseline).toMatchObject({
      projectId: 'project', chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a', status: 'current', revision: 1,
      authoringBase: { content: '旧灯塔的门紧闭。' },
      sceneCard: { actId: 'act-a', beatId: 'beat-a', beatTitle: '进入灯塔', detailBeat: { id: 'card-a', title: '发现旧灯塔' } },
    });
    expect(first.baseline.b5ContentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(first.baseline.bindingFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await service.create('project', { chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a' })).toEqual(first);

    const attached = await service.attachGenerated('project', { baselineId: first.baseline.baselineId, candidateId: 'candidate-a' });
    expect(attached.baseline.generatedCandidateIds).toEqual(['candidate-a']);
    expect(await service.attachGenerated('project', { baselineId: first.baseline.baselineId, candidateId: 'candidate-a' })).toEqual(attached);
    const restartedText = createTextService(root);
    const restartedOutline = createOutlineService(root);
    await restartedText.open('project');
    await restartedOutline.open('project');
    const restartedBinding = createSceneOutlineBindingService(restartedText, restartedOutline, root);
    const restarted = createOutlineGenerationBaselineService({ text: restartedText, outline: restartedOutline, binding: restartedBinding }, root);
    expect(await restarted.read('project', first.baseline.baselineId)).toMatchObject({ baseline: attached.baseline, freshness: 'fresh' });
  });

  it('marks only the affected baseline stale when B5, binding, source, or target changes', async () => {
    const { root, text, outline, binding, service } = await realFixture();
    const first = await service.create('project', { chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a' });

    const changedOutline = await outline.read('project');
    const changedBeat = changedOutline.acts[0].beats[0];
    await outline.save('project', {
      ...changedOutline,
      acts: [{ ...changedOutline.acts[0], beats: [{ ...changedBeat, detailBeats: [{ ...changedBeat.detailBeats[0], title: '发现被改写的灯塔' }, changedBeat.detailBeats[1]] }] }],
    });
    expect(await service.read('project', first.baseline.baselineId)).toMatchObject({ freshness: 'stale', staleReasons: ['b5-changed'], baseline: { status: 'stale' } });

    const replacement = await service.create('project', { chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a' });
    expect(replacement.baseline.baselineId).not.toBe(first.baseline.baselineId);
    expect((await service.read('project', first.baseline.baselineId)).baseline.status).toBe('superseded');

    const currentBinding = await binding.read('project');
    await binding.rebind('project', { sceneId: 'scene-a', detailBeatId: 'card-a', nextDetailBeatId: 'card-b', expectedFingerprint: currentBinding.fingerprint });
    expect(await service.read('project', replacement.baseline.baselineId)).toMatchObject({ freshness: 'stale', staleReasons: ['binding-changed'], baseline: { status: 'stale' } });

    // Restore the original card binding to isolate the C5 source change assertion.
    const rebound = await binding.read('project');
    await binding.rebind('project', { sceneId: 'scene-a', detailBeatId: 'card-b', nextDetailBeatId: 'card-a', expectedFingerprint: rebound.fingerprint });
    const sourceTarget = await service.create('project', { chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a' });
    await text.replaceRange('project', 'chapter-a', 'scene-a', { start: 0, end: 1 }, '新');
    expect(await service.read('project', sourceTarget.baseline.baselineId)).toMatchObject({ freshness: 'stale', staleReasons: ['source-changed'] });

    const bindingRepository = new SceneOutlineBindingRepository(join(root, 'project'));
    await bindingRepository.open();
    const stored = await bindingRepository.read();
    await bindingRepository.mutate(stored.fingerprint, () => [{ sceneId: 'deleted-scene', detailBeatId: 'card-a' }]);
    expect(await service.read('project', sourceTarget.baseline.baselineId)).toMatchObject({ freshness: 'stale', staleReasons: ['target-missing'] });
  });

  it('rejects unbound, dangling, cross-project, stale attach, and malformed target requests', async () => {
    const { service, binding, outline } = await realFixture();
    await expect(service.create('project', { chapterId: 'chapter-a', sceneId: 'missing-scene', detailBeatId: 'card-a' })).rejects.toThrow(/Unknown scene/);
    await expect(service.create('project', { chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'missing-card' })).rejects.toThrow(/Unknown detail beat/);
    await expect(service.create('project', { chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-b' })).rejects.toThrow(/not bound/);
    await expect(service.current('project', { chapterId: 'chapter-a', sceneId: 'scene-a', extra: true } as never)).rejects.toThrow();

    const baseline = await service.create('project', { chapterId: 'chapter-a', sceneId: 'scene-a', detailBeatId: 'card-a' });
    await expect(service.read('other-project', baseline.baseline.baselineId)).rejects.toThrow(/Unknown outline generation baseline/);
    await outline.save('project', {
      id: 'outline', structure: 'free', logline: '重写。', themes: [], foreshadowing: [], endings: [],
      acts: [{ id: 'act-a', index: 0, title: '第一幕', goal: '进入灯塔', beats: [{
        id: 'beat-a', title: '进入灯塔', description: '找到入口。', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false,
        detailBeats: [{ id: 'card-a', title: '发现旧灯塔', summary: '主角发现旧灯塔。', pov: 'hero', wordTarget: 500, points: ['门紧闭'], status: 'planned' }],
      }] }],
    });
    const currentBinding = await binding.read('project');
    await binding.unbind('project', { sceneId: 'scene-a', detailBeatId: 'card-a', expectedFingerprint: currentBinding.fingerprint });
    await expect(service.attachGenerated('project', { baselineId: baseline.baseline.baselineId, candidateId: 'candidate-stale' })).rejects.toThrow(/Stale/);
  });
});
