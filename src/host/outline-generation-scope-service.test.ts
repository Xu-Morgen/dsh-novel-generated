import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { outlineContentFingerprint } from '../core/outline/index.js';
import type { Outline } from '../core/schema/outline.js';
import { createOutlineService } from './outline-service.js';
import { createSceneOutlineBindingService } from './scene-outline-binding-service.js';
import { createTextService } from './text-service.js';
import { createOutlineGenerationScopeService } from './outline-generation-scope-service.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-outline-generation-scope-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function detailBeat(id: string) {
  return { id, title: id, summary: `${id} summary`, pov: 'hero', wordTarget: 100, points: [], status: 'planned' as const };
}

function fixtureOutline(): Outline {
  return {
    id: 'outline', version: 1, structure: 'free', logline: 'Scope.', themes: [], foreshadowing: [], endings: [],
    // The persisted order is intentionally not the presentation order: act.index is the stable ordering key.
    acts: [
      { id: 'act-b', index: 1, title: '第二幕', goal: '继续', beats: [{ id: 'beat-b', title: '转折', description: '转折', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [detailBeat('card-b')] }] },
      { id: 'act-a', index: 0, title: '第一幕', goal: '开始', beats: [
        { id: 'beat-a', title: '开场', description: '开场', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [detailBeat('card-a'), detailBeat('card-a2')] },
        { id: 'beat-empty', title: '待细化', description: '待细化', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] },
      ] },
    ],
  };
}

async function realFixture() {
  const root = await temporaryRoot();
  const text = createTextService(root);
  const outline = createOutlineService(root);
  await text.open('project');
  await outline.open('project');
  await text.createChapter('project', { id: 'chapter-a', index: 1, title: '第一章', pov: 'hero', status: 'draft' });
  await text.appendScene('project', 'chapter-a', { id: 'scene-a', content: '', summary: '', beats: [], canonEvents: [], notes: '' });
  await text.createChapter('project', { id: 'chapter-empty', index: 2, title: '空章', pov: 'hero', status: 'draft' });
  await outline.save('project', fixtureOutline());
  const binding = createSceneOutlineBindingService(text, outline, root);
  const initial = await binding.read('project');
  await binding.save('project', { sceneId: 'scene-a', detailBeatId: 'card-a', expectedFingerprint: initial.fingerprint });
  return { root, text, outline, binding, service: createOutlineGenerationScopeService({ text, outline, binding }) };
}

describe('I133 OutlineGenerationScopeService', () => {
  it('resolves act, beat, bound-chapter, and all in stable order with page bounds', async () => {
    const { service } = await realFixture();
    const act = await service.resolve('project', { kind: 'act', actId: 'act-a' });
    expect(act.targets.map((target) => target.beatId)).toEqual(['beat-a', 'beat-empty']);
    expect(act.targets[0].actIndex).toBe(0);
    expect(act.readiness).toBe('fill-missing-only');
    expect(act.mutationBudget).toMatchObject({ maxNewDetailBeats: 8, allowExistingReplacement: false, allowReorder: false, allowScopeExpansion: false });
    expect(act.protectedSet).toMatchObject({ actIds: ['act-a'], beatIds: ['beat-a', 'beat-empty'], detailBeatIds: ['card-a', 'card-a2'], outsideScopeWritable: false });
    expect(act.targets[0].cards[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const beat = await service.resolve('project', { kind: 'outline-beat', beatId: 'beat-a' });
    expect(beat.targets.map((target) => target.beatId)).toEqual(['beat-a']);
    expect(beat.readiness).toBe('requires-explicit-regeneration');

    const chapter = await service.resolve('project', { kind: 'bound-chapter', chapterId: 'chapter-a' });
    expect(chapter.targets.map((target) => target.beatId)).toEqual(['beat-a']);
    expect(chapter.targets[0].cards.map((card) => card.detailBeatId)).toEqual(['card-a']);

    const allPage = await service.resolve('project', { kind: 'all', page: { offset: 1, limit: 1 } });
    expect(allPage.targets.map((target) => target.beatId)).toEqual(['beat-empty']);
    expect(allPage.page).toMatchObject({ offset: 1, limit: 1, nextOffset: 2, totalTargetBeatCount: 3, totalTargetDetailBeatCount: 3 });
    expect(allPage.readiness).toBe('can-generate');
  });

  it('fails closed before any generation/write for unknown, unbound, empty, unavailable, cross-project, and stale owners', async () => {
    const { text, outline, binding, service } = await realFixture();
    await expect(service.resolve('project', { kind: 'act', actId: 'missing-act' })).rejects.toThrow(/Unknown outline act/);
    await expect(service.resolve('project', { kind: 'outline-beat', beatId: 'missing-beat' })).rejects.toThrow(/Unknown outline beat/);
    await expect(service.resolve('project', { kind: 'bound-chapter', chapterId: 'missing-chapter' })).rejects.toThrow(/Unknown chapter/);
    await expect(service.resolve('project', { kind: 'bound-chapter', chapterId: 'chapter-empty' })).resolves.toMatchObject({ readiness: 'cannot-generate', blockReason: 'chapter-unbound' });

    const emptyOutline: Outline = { ...fixtureOutline(), acts: [] };
    const emptyFingerprint = outlineContentFingerprint(emptyOutline);
    const emptyService = createOutlineGenerationScopeService({
      text: { listChapters: async () => [] },
      outline: { readiness: async () => 'ready' as const, read: async () => emptyOutline, contentFingerprint: async () => emptyFingerprint },
      binding: { read: async () => ({ manual: [], effective: [], fingerprint: 'a'.repeat(64) }) },
    });
    await expect(emptyService.resolve('project', { kind: 'all' })).resolves.toMatchObject({ readiness: 'cannot-generate', blockReason: 'empty-scope' });

    const unavailable = createOutlineGenerationScopeService({
      text: { listChapters: async () => [] },
      outline: { readiness: async () => 'uninitialized' as const, read: async () => { throw new Error('must not read'); }, contentFingerprint: async () => { throw new Error('must not fingerprint'); } },
      binding: { read: async () => ({ manual: [], effective: [], fingerprint: 'a'.repeat(64) }) },
    });
    await expect(unavailable.resolve('project', { kind: 'all' })).resolves.toMatchObject({ readiness: 'cannot-generate', blockReason: 'outline-unavailable' });

    const realOutline = await outline.read('project');
    const fingerprint = outlineContentFingerprint(realOutline);
    const crossProject = createOutlineGenerationScopeService({
      text: { listChapters: async () => [{ id: 'chapter-a', index: 1, title: '第一章', pov: 'hero', status: 'draft', scenes: [{ id: 'scene-a', index: 0, content: '', summary: '', beats: [], canonEvents: [], notes: '', branches: [] }] }] },
      outline: { readiness: async () => 'ready' as const, read: async () => realOutline, contentFingerprint: async () => fingerprint },
      binding: { read: async () => ({ manual: [], effective: [{ sceneId: 'scene-a', detailBeatId: 'card-a', chapterId: 'other-project', source: 'manual' as const }], fingerprint: 'a'.repeat(64) }) },
    });
    await expect(crossProject.resolve('project', { kind: 'bound-chapter', chapterId: 'chapter-a' })).resolves.toMatchObject({ readiness: 'cannot-generate', blockReason: 'cross-project-binding' });

    let fingerprints = 0;
    const stale = createOutlineGenerationScopeService({
      text,
      outline: { readiness: async () => 'ready' as const, read: async () => realOutline, contentFingerprint: async () => (++fingerprints === 1 ? fingerprint : 'b'.repeat(64)) },
      binding,
    });
    await expect(stale.resolve('project', { kind: 'all' })).resolves.toMatchObject({ readiness: 'cannot-generate', blockReason: 'stale-b5' });
  });
});
