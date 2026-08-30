import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { stableSceneId } from '../core/queue/task.js';
import { SCENE_OUTLINE_BINDING_LIMIT } from '../core/schema/scene-outline-binding.js';
import type { OutlineBeatCard } from '../core/schema/outline.js';
import type { Chapter } from '../core/schema/text.js';
import { createOutlineService, type NovelOutlineService } from './outline-service.js';
import { SceneOutlineBindingRepository } from './scene-outline-binding-repository.js';
import { createSceneOutlineBindingService } from './scene-outline-binding-service.js';
import { createTextService } from './text-service.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-binding-service-'));
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
  await text.createChapter('project', { id: 'chapter-a', index: 1, title: 'A', pov: 'hero', status: 'draft' });
  await text.createChapter('project', { id: 'chapter-b', index: 2, title: 'B', pov: 'hero', status: 'draft' });
  await text.appendScene('project', 'chapter-a', { id: stableSceneId('act-a', 'beat-a', 'card-a'), content: '', summary: '', beats: [], canonEvents: [], notes: '' });
  await text.appendScene('project', 'chapter-a', { id: 'manual-scene', content: '', summary: '', beats: [], canonEvents: [], notes: '' });
  await text.appendScene('project', 'chapter-a', { id: stableSceneId('act-a', 'beat-a', 'card-d'), content: '', summary: '', beats: [], canonEvents: [], notes: '' });
  await outline.save('project', {
    id: 'outline', structure: 'free', logline: 'Bindings.', themes: [], foreshadowing: [], endings: [],
    acts: [{ id: 'act-a', index: 0, title: 'Act', goal: 'Bind.', beats: [{
      id: 'beat-a', title: 'Beat', description: 'Bind cards.', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false,
      detailBeats: ['card-a', 'card-b', 'card-c'].map((id) => ({ id, title: id, summary: id, pov: 'hero', wordTarget: 100, points: [], status: 'planned' as const })),
    }] }],
  });
  return { root, text, outline, service: createSceneOutlineBindingService(text, outline, root) };
}

describe('I105 SceneOutlineBinding service', () => {
  it('requires free save targets, rebinds without displacement, and resumes a default after unbind', async () => {
    const { outline, service } = await realFixture();
    const initial = await service.read('project');
    expect(initial.manual).toEqual([]);
    expect(initial.effective).toEqual([{
      sceneId: stableSceneId('act-a', 'beat-a', 'card-a'), detailBeatId: 'card-a', chapterId: 'chapter-a', source: 'default',
    }]);
    await expect(service.save('project', {
      sceneId: stableSceneId('act-a', 'beat-a', 'card-a'), detailBeatId: 'card-a', expectedFingerprint: initial.fingerprint,
    })).rejects.toThrow(/already bound/);

    const overrideSceneId = stableSceneId('act-a', 'beat-a', 'card-d');
    const bound = await service.save('project', { sceneId: overrideSceneId, detailBeatId: 'card-b', expectedFingerprint: initial.fingerprint });
    expect(bound.manual).toEqual([{ sceneId: overrideSceneId, detailBeatId: 'card-b' }]);
    const rebound = await service.rebind('project', { sceneId: overrideSceneId, detailBeatId: 'card-b', nextDetailBeatId: 'card-c', expectedFingerprint: bound.fingerprint });
    expect(rebound.effective.find((entry) => entry.sceneId === overrideSceneId)?.detailBeatId).toBe('card-c');
    const impact = await service.impact('project', { kind: 'chapter', chapterId: 'chapter-a' });
    expect(impact.bindings).toHaveLength(2);
    expect(impact.fingerprint).toBe(rebound.fingerprint);

    const currentOutline = await outline.read('project');
    const beat = currentOutline.acts[0].beats[0];
    await outline.save('project', {
      ...currentOutline,
      acts: [{ ...currentOutline.acts[0], beats: [{
        ...beat,
        detailBeats: [...beat.detailBeats, { id: 'card-d', title: 'card-d', summary: 'card-d', pov: 'hero', wordTarget: 100, points: [], status: 'planned' }],
      }] }],
    });
    const unbound = await service.unbind('project', { sceneId: overrideSceneId, detailBeatId: 'card-c', expectedFingerprint: rebound.fingerprint });
    expect(unbound.manual).toEqual([]);
    expect(unbound.effective.find((entry) => entry.detailBeatId === 'card-d')).toEqual({
      sceneId: overrideSceneId, detailBeatId: 'card-d', chapterId: 'chapter-a', source: 'default',
    });
    await expect(service.unbind('project', { sceneId: overrideSceneId, detailBeatId: 'card-c', expectedFingerprint: unbound.fingerprint })).rejects.toThrow(/does not exist/);
  });

  it('resolves queue batches atomically: selected default target, manual actual chapter, occupied completion, and collision negatives', async () => {
    const { root, service } = await realFixture();
    const defaultTarget = await service.resolveQueueTargets('project', 'chapter-b', ['card-c']);
    expect(defaultTarget).toHaveLength(1);
    expect(defaultTarget[0]).toMatchObject({ chapterId: 'chapter-b', sceneId: stableSceneId('act-a', 'beat-a', 'card-c'), source: 'default', occupied: false });
    expect(defaultTarget[0].targetSnapshot.detailBeatId).toBe('card-c');

    const occupiedDefault = await service.resolveQueueTargets('project', 'chapter-b', ['card-a']);
    expect(occupiedDefault[0]).toMatchObject({ chapterId: 'chapter-a', sceneId: stableSceneId('act-a', 'beat-a', 'card-a'), source: 'default', occupied: true });
    expect(occupiedDefault[0].targetSnapshot.chapterId).toBe('chapter-a');

    const initial = await service.read('project');
    await service.save('project', { sceneId: 'manual-scene', detailBeatId: 'card-b', expectedFingerprint: initial.fingerprint });
    const manualTarget = await service.resolveQueueTargets('project', 'chapter-b', ['card-b']);
    expect(manualTarget[0]).toMatchObject({ chapterId: 'chapter-a', sceneId: 'manual-scene', source: 'manual', occupied: true });
    expect(manualTarget[0].targetSnapshot.chapterId).toBe('chapter-a');
    await expect(service.resolveQueueTargets('project', 'missing-chapter', ['card-c'])).rejects.toThrow(/Unknown chapter/);
    await expect(service.resolveQueueTargets('project', 'chapter-a', ['missing-card'])).rejects.toThrow(/Unknown scene cards/);
    await expect(service.resolveQueueTargets('project', 'chapter-a', ['card-c', 'missing-card'])).rejects.toThrow(/Unknown scene cards/);

    const repository = new SceneOutlineBindingRepository(join(root, 'project'));
    const stored = await repository.read();
    await repository.mutate(stored.fingerprint, () => [{ sceneId: stableSceneId('act-a', 'beat-a', 'card-a'), detailBeatId: 'card-b' }]);
    await expect(service.resolveQueueTargets('project', 'chapter-a', ['card-c'])).rejects.toThrow(/Manual\/default binding collision/);
  });

  it('rejects an over-limit candidate before write and preserves the readable document fingerprint', async () => {
    const root = await temporaryRoot();
    const cards: OutlineBeatCard[] = Array.from({ length: SCENE_OUTLINE_BINDING_LIMIT }, (_, index) => {
      const id = `card-${index}`;
      return {
        actId: 'act-a', beatId: 'beat-a', beatTitle: 'Beat',
        detailBeat: { id, title: id, summary: id, pov: 'hero', wordTarget: 1, points: [], status: 'planned' },
      };
    });
    const scenes: Chapter['scenes'] = cards.map((card, index) => ({
      id: stableSceneId(card.actId, card.beatId, card.detailBeat.id), index,
      content: '', summary: '', beats: [], canonEvents: [], notes: '', branches: [],
    }));
    scenes.push({ id: 'free-scene', index: scenes.length, content: '', summary: '', beats: [], canonEvents: [], notes: '', branches: [] });
    const chapters: Chapter[] = [{ id: 'chapter-a', index: 1, title: 'A', pov: 'hero', status: 'draft', scenes }];
    const service = createSceneOutlineBindingService(
      { listChapters: async () => chapters, projectFingerprint: async () => '1'.repeat(64) },
      { contentFingerprint: async () => '2'.repeat(64), beatCards: async () => [...cards, {
        actId: 'act-a', beatId: 'beat-a', beatTitle: 'Beat',
        detailBeat: { id: 'free-card', title: 'Free', summary: 'Free', pov: 'hero', wordTarget: 1, points: [], status: 'planned' },
      }] },
      root,
    );
    const repository = new SceneOutlineBindingRepository(join(root, 'project'));
    const initial = await service.read('project');
    const storedBefore = await repository.read();
    expect(initial.effective).toHaveLength(SCENE_OUTLINE_BINDING_LIMIT);

    await expect(service.save('project', {
      sceneId: 'free-scene', detailBeatId: 'free-card', expectedFingerprint: initial.fingerprint,
    })).rejects.toThrow(`Binding projection exceeds limit: ${SCENE_OUTLINE_BINDING_LIMIT}`);

    const storedAfter = await repository.read();
    const readableAfter = await service.read('project');
    expect(storedAfter).toEqual(storedBefore);
    expect(readableAfter.fingerprint).toBe(initial.fingerprint);
    expect(readableAfter.manual).toEqual([]);
    expect(readableAfter.effective).toHaveLength(SCENE_OUTLINE_BINDING_LIMIT);
  });

  it('evicts only a rejected repository-open promise so the next call can reopen', async () => {
    const root = await temporaryRoot();
    let factoryCalls = 0;
    const service = createSceneOutlineBindingService(
      { listChapters: async () => [], projectFingerprint: async () => '1'.repeat(64) },
      { beatCards: async () => [], contentFingerprint: async () => '2'.repeat(64) },
      root,
      {
        repositoryFactory(directory) {
          factoryCalls += 1;
          const repository = new SceneOutlineBindingRepository(directory);
          if (factoryCalls === 1) repository.open = async () => { throw new Error('injected open failure'); };
          return repository;
        },
      },
    );

    await expect(service.read('project')).rejects.toThrow('injected open failure');
    await expect(service.read('project')).resolves.toMatchObject({ manual: [], effective: [] });
    expect(factoryCalls).toBe(2);
  });

  it('queue batch capture rejects owner changes before returning any targets', async () => {
    const root = await temporaryRoot();
    let outlineReads = 0;
    const service = createSceneOutlineBindingService(
      {
        listChapters: async () => [{ id: 'chapter-a', index: 1, title: 'A', pov: 'hero', status: 'draft', scenes: [] }],
        projectFingerprint: async () => '1'.repeat(64),
      },
      {
        readiness: async () => 'ready',
        contentFingerprint: async () => (++outlineReads === 1 ? '2' : '3').repeat(64),
        beatCards: async () => [{
          actId: 'act-a', beatId: 'beat-a', beatTitle: 'Beat',
          detailBeat: { id: 'card-a', title: 'Card', summary: 'Card', pov: 'hero', wordTarget: 1, points: [], status: 'planned' },
        }],
      },
      root,
    );
    await expect(service.resolveQueueTargets('project', 'chapter-a', ['card-a']))
      .rejects.toThrow(/owners changed during batch resolution/);
  });

  it('candidate target capture rejects owner changes between validation reads', async () => {
    const root = await temporaryRoot();
    let outlineReads = 0;
    const service = createSceneOutlineBindingService(
      {
        listChapters: async () => [{ id: 'chapter-a', index: 1, title: 'A', pov: 'hero', status: 'draft', scenes: [] }],
        projectFingerprint: async () => '1'.repeat(64),
      },
      {
        contentFingerprint: async () => (++outlineReads === 1 ? '2' : '3').repeat(64),
        beatCards: async () => [{
          actId: 'act-a', beatId: 'beat-a', beatTitle: 'Beat',
          detailBeat: { id: 'card-a', title: 'Card', summary: 'Card', pov: 'hero', wordTarget: 1, points: [], status: 'planned' },
        }],
      },
      root,
    );
    await expect(service.captureCandidateTarget('project', { chapterId: 'chapter-a', sceneId: 'new-scene' }, 'card-a'))
      .rejects.toThrow(/owners changed during capture/);
  });

  it('fails closed for occupied, stale, unknown, cross-project, dangling, and ambiguous references', async () => {
    const { root, text, outline, service } = await realFixture();
    const initial = await service.read('project');
    await expect(service.save('project', { sceneId: 'manual-scene', detailBeatId: 'card-a', expectedFingerprint: initial.fingerprint })).rejects.toThrow(/already bound/);
    await expect(service.save('project', { sceneId: 'missing-scene', detailBeatId: 'card-b', expectedFingerprint: initial.fingerprint })).rejects.toThrow(/Unknown scene/);

    await text.open('other-project');
    await outline.open('other-project');
    await text.createChapter('other-project', { id: 'chapter-other', index: 1, title: 'Other', pov: 'hero', status: 'draft' });
    await text.appendScene('other-project', 'chapter-other', { id: 'other-scene', content: '', summary: '', beats: [], canonEvents: [], notes: '' });
    await outline.save('other-project', {
      id: 'outline-other', structure: 'free', logline: 'Other.', themes: [], foreshadowing: [], endings: [],
      acts: [{ id: 'act-other', index: 0, title: 'Other', goal: 'Other.', beats: [{
        id: 'beat-other', title: 'Other', description: 'Other.', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false,
        detailBeats: [{ id: 'card-other', title: 'Other', summary: 'Other.', pov: 'hero', wordTarget: 100, points: [], status: 'planned' }],
      }] }],
    });
    await expect(service.save('project', { sceneId: 'other-scene', detailBeatId: 'card-b', expectedFingerprint: initial.fingerprint })).rejects.toThrow(/Unknown scene/);
    await expect(service.save('project', { sceneId: 'manual-scene', detailBeatId: 'card-other', expectedFingerprint: initial.fingerprint })).rejects.toThrow(/Unknown detail beat/);

    const saved = await service.save('project', { sceneId: 'manual-scene', detailBeatId: 'card-b', expectedFingerprint: initial.fingerprint });
    await expect(service.rebind('project', { sceneId: 'manual-scene', detailBeatId: 'card-b', nextDetailBeatId: 'card-a', expectedFingerprint: saved.fingerprint })).rejects.toThrow(/already bound/);
    await expect(service.unbind('project', { sceneId: 'manual-scene', detailBeatId: 'card-b', expectedFingerprint: initial.fingerprint })).rejects.toThrow(/Stale binding fingerprint/);

    const repository = new SceneOutlineBindingRepository(join(root, 'project'));
    await repository.mutate(saved.fingerprint, () => [{ sceneId: 'deleted-scene', detailBeatId: 'card-b' }]);
    await expect(service.read('project')).rejects.toThrow(/Unknown bound scene/);

    const duplicateOutline: Pick<NovelOutlineService, 'beatCards' | 'contentFingerprint'> = {
      contentFingerprint: async () => '2'.repeat(64),
      async beatCards() {
        const detailBeat = { id: 'duplicate', title: 'D', summary: 'D', pov: 'hero', wordTarget: 1, points: [], status: 'planned' as const };
        return [
          { actId: 'act-a', beatId: 'beat-a', beatTitle: 'A', detailBeat },
          { actId: 'act-b', beatId: 'beat-b', beatTitle: 'B', detailBeat },
        ];
      },
    };
    const ambiguous = createSceneOutlineBindingService({ listChapters: async () => [], projectFingerprint: async () => '1'.repeat(64) }, duplicateOutline, root);
    await expect(ambiguous.read('project')).rejects.toThrow(/Ambiguous detail beat id/);
  });
});
