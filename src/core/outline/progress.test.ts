import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OutlineNavigator } from './navigator.js';
import { OutlineProgressRepository, appendDeviation, reconcileDeviation } from './progress.js';
import type { Outline } from '../schema/outline.js';
import type { OutlineProgress } from '../schema/outline-progress.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i15-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const outline: Outline = {
  id: 'outline', version: 1, structure: 'free', logline: 'A test.', themes: [],
  acts: [{ id: 'act-one', index: 1, title: 'Act', goal: 'Goal', beats: [
    { id: 'first', title: 'First', description: 'Find the key.', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] },
    { id: 'second', title: 'Second', description: 'Open the door.', charactersInvolved: [], conflictType: 'world', prerequisites: ['first'], optional: false, detailBeats: [] },
    { id: 'optional', title: 'Optional', description: 'Notice the rain.', charactersInvolved: [], conflictType: 'internal', prerequisites: [], optional: true, detailBeats: [] },
  ] }], foreshadowing: [], endings: [],
};
const progress: OutlineProgress = { outlineId: 'outline', currentAct: 'act-one', currentBeat: 'first', completedBeats: [], deviations: [], tensionLevel: 20 };

describe('I15 C6 progress and navigator', () => {
  it('round-trips progress and navigates the first executable required beat', async () => {
    const repository = new OutlineProgressRepository(await temporaryRoot());
    await repository.open();
    await repository.save(progress, outline);
    const reopened = new OutlineProgressRepository((roots[0]));
    await reopened.open();
    expect(await reopened.read(outline)).toEqual(progress);
    expect(new OutlineNavigator().navigate(outline, progress)).toMatchObject({
      beatId: 'first', prerequisitesMet: true, instruction: expect.stringContaining('无前置条件'),
    });
  });

  it('does not navigate past an unmet prerequisite and reports deviations without changing B5', () => {
    const blocked = { ...progress, currentBeat: 'second', completedBeats: [] };
    expect(new OutlineNavigator().navigate(outline, blocked)).toMatchObject({ beatId: 'first', prerequisitesMet: true });
    const withDeviation = appendDeviation(progress, { id: 'drift-1', planned: 'Find the key', actual: 'Burn the map', reason: 'The guard attacked', reconciled: false });
    expect(withDeviation.deviations[0].reconciled).toBe(false);
    expect(reconcileDeviation(withDeviation, 'drift-1').deviations[0].reconciled).toBe(true);
    expect(outline.acts[0].beats[0].title).toBe('First');
  });

  it('rejects unknown progress references and duplicate deviations', async () => {
    const repository = new OutlineProgressRepository(await temporaryRoot());
    await repository.open();
    await expect(repository.save({ ...progress, currentBeat: 'missing' }, outline)).rejects.toThrow(/Unknown current beat/);
    const withDeviation = appendDeviation(progress, { id: 'drift-1', planned: 'A', actual: 'B', reason: 'C', reconciled: false });
    expect(() => appendDeviation(withDeviation, { id: 'drift-1', planned: 'A', actual: 'C', reason: 'D', reconciled: false })).toThrow();
    expect(() => reconcileDeviation(progress, 'missing')).toThrow(/Unknown deviation/);
  });
});
