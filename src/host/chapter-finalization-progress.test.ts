import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOutlineService } from './outline-service.js';
import { createTextService } from './text-service.js';
import { createSceneOutlineBindingService } from './scene-outline-binding-service.js';
import { prepareChapterProgress, chapterProgressFresh } from './chapter-finalization-progress.js';

it('I217 completes only fully done owned beats, preserves B5, and rejects changed progress or bindings', async () => {
  const root = await mkdtemp(join(tmpdir(), 'i217-progress-'));
  try {
    const outline = createOutlineService(root);
    const text = createTextService(root);
    await outline.open('book'); await text.open('book');
    await text.createChapter('book', { id: 'chapter', index: 1, title: 'First', pov: 'hero', status: 'draft' });
    await text.appendScene('book', 'chapter', { id: 'scene', content: 'Saved prose.', summary: '', beats: [], canonEvents: [], notes: '' });
    await outline.save('book', { id: 'outline', structure: 'free', logline: 'Story', themes: [], foreshadowing: [], endings: [], acts: [{ id: 'act', index: 0, title: 'Act', goal: 'Goal', beats: [
      { id: 'beat', title: 'First', description: 'First', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'card', title: 'Card', summary: 'Card', pov: 'hero', wordTarget: 100, points: [], status: 'done' }] },
      { id: 'next-beat', title: 'Next', description: 'Next', charactersInvolved: [], conflictType: 'external', prerequisites: ['beat'], optional: false, detailBeats: [{ id: 'next-card', title: 'Next', summary: 'Next', pov: 'hero', wordTarget: 100, points: [], status: 'planned' }] },
    ] }] });
    await outline.saveProgress('book', { outlineId: 'outline', currentAct: 'act', currentBeat: 'beat', completedBeats: [], deviations: [], tensionLevel: 0 });
    const binding = createSceneOutlineBindingService(text, outline, root);
    await binding.save('book', { sceneId: 'scene', detailBeatId: 'card', expectedFingerprint: (await binding.read('book')).fingerprint });
    const owners = { outline, binding };
    const before = await outline.read('book');
    expect(await prepareChapterProgress(owners, 'book', 'chapter', [])).toBeNull();
    const plan = (await prepareChapterProgress(owners, 'book', 'chapter', ['scene']))!;
    expect(plan.after).toMatchObject({ completedBeats: ['beat'], currentBeat: 'next-beat' });
    expect(await outline.readProgress('book')).toEqual(plan.before);
    expect(await chapterProgressFresh(owners, 'book', plan, false)).toBe(true);
    await outline.saveProgress('book', plan.after);
    expect(await chapterProgressFresh(owners, 'book', plan, true)).toBe(true);
    expect(await chapterProgressFresh(owners, 'book', plan, false)).toBe(false);
    expect(await outline.read('book')).toEqual(before);
    await outline.saveProgress('book', { ...plan.after, tensionLevel: 50 });
    expect(await chapterProgressFresh(owners, 'book', plan, true)).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
