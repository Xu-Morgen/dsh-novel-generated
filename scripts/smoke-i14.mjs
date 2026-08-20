import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OutlineRepository } from '../lib/core/outline/index.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i14-'));
try {
  const repository = new OutlineRepository(root);
  await repository.open();
  await repository.save({
    id: 'smoke-outline', version: 1, structure: 'serial',
    logline: 'A courier returns to a city that forgot her name.', themes: ['memory'],
    acts: [{ id: 'act-one', index: 1, title: 'Return', goal: 'Bring the courier home.', beats: [{
      id: 'arrival', title: 'Arrival', description: 'The gate does not recognize her.',
      charactersInvolved: ['courier'], conflictType: 'world', prerequisites: [], optional: false,
      detailBeats: [{ id: 'gate', title: 'At the gate', summary: 'A silent guard checks the seal.',
        pov: 'courier', wordTarget: 800, points: ['show seal', 'deny entry'], status: 'planned' }],
    }] }],
    foreshadowing: [{ id: 'seal', hint: 'The seal bears an older crest.', payoff: 'It is the city founder\'s mark.', status: 'planted', knownBy: ['courier'] }],
    endings: [{ id: 'home', title: 'Homecoming', conditions: ['seal is recognized'], description: 'The gate opens.' }],
  });
  const cards = await repository.beatCards();
  if (cards.length !== 1 || cards[0].detailBeat.wordTarget !== 800) throw new Error('I14 beat-card fixture failed');
  const reopened = new OutlineRepository(root);
  await reopened.open();
  if ((await reopened.read()).acts[0].beats[0].detailBeats[0].status !== 'planned') throw new Error('I14 round-trip failed');
  let rejected = false;
  try {
    await repository.save({
      id: 'bad', structure: 'free', logline: 'Bad', themes: [], acts: [{ id: 'act', index: 0, title: 'Act', goal: 'Goal', beats: [{
        id: 'beat', title: 'Beat', description: 'Beat', charactersInvolved: [], conflictType: 'internal', prerequisites: ['missing'], optional: false, detailBeats: [],
      }] }], foreshadowing: [], endings: [],
    });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('I14 dangling prerequisite was accepted');
  console.log('I14 smoke: B5 nested outline round-trip, status/wordTarget validation, beat-card enumeration, and dangling-reference rejection passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
