import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OutlineNavigator } from '../lib/core/outline/navigator.js';
import { OutlineProgressRepository } from '../lib/core/outline/progress.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i15-'));
try {
  const outline = {
    id: 'outline', version: 1, structure: 'free', logline: 'A test.', themes: [],
    acts: [{ id: 'act', index: 0, title: 'Act', goal: 'Goal', beats: [
      { id: 'first', title: 'First', description: 'Find the key.', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] },
      { id: 'second', title: 'Second', description: 'Open the door.', charactersInvolved: [], conflictType: 'world', prerequisites: ['first'], optional: false, detailBeats: [] },
    ] }], foreshadowing: [], endings: [],
  };
  const progress = { outlineId: 'outline', currentAct: 'act', currentBeat: 'first', completedBeats: [], deviations: [], tensionLevel: 10 };
  const repository = new OutlineProgressRepository(root);
  await repository.open();
  await repository.save(progress, outline);
  const navigation = new OutlineNavigator().navigate(outline, progress);
  if (navigation.beatId !== 'first' || !navigation.prerequisitesMet) throw new Error('I15 navigation fixture failed');
  await repository.save({ ...progress, completedBeats: ['first'], currentBeat: 'second' }, outline);
  if (new OutlineNavigator().navigate(outline, await repository.read(outline)).beatId !== 'second') throw new Error('I15 completion navigation failed');
  let rejected = false;
  try {
    await repository.save({ ...progress, currentBeat: 'missing' }, outline);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('I15 unknown beat was accepted');
  console.log('I15 smoke: C6 progress round-trip, prerequisite-aware navigation, and unknown-reference rejection passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
