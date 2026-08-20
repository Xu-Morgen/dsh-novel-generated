import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CharacterRepository } from '../lib/core/characters/index.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i9-'));
try {
  const repository = new CharacterRepository(root);
  await repository.open();
  await repository.create({
    id: 'mara', name: 'Mara', aliases: ['the Wind'], kind: 'protagonist',
    personality: 'Quiet and watchful.', background: 'Fisher who lost her boat.',
    motivation: 'Take back her name.', goals: ['clear her debt'],
    flaws: ['withdrawn'], abilities: ['navigation'],
    speechStyle: 'short sentences', staticTraits: ['stubborn'],
    arc: { startingPoint: 'nameless deckhand', desiredEnd: 'trusted captain', keyBeats: ['take the helm'] },
    relationships: [], knowledgeIds: [],
  });
  await repository.create({
    id: 'otto', name: 'Otto', aliases: [], kind: 'extra',
    personality: 'Boisterous.', background: 'A dockhand.',
    motivation: 'A warm meal.', goals: [],
    flaws: [], abilities: [],
    speechStyle: 'loud', staticTraits: [],
    arc: { startingPoint: 'dockhand', desiredEnd: 'dockhand', keyBeats: [] },
    relationships: [], knowledgeIds: [],
  });

  const reopened = new CharacterRepository(root);
  await reopened.open();
  const mara = await reopened.read('mara');
  if (mara.arc.keyBeats.join(',') !== 'take the helm') {
    throw new Error(`Arc keyBeats wrong: ${mara.arc.keyBeats.join(',')}`);
  }

  const scene = await reopened.listForScene(['otto', 'mara']);
  if (scene.map((view) => view.name).join(',') !== 'Mara,Otto') {
    throw new Error(`Scene character filtering wrong: ${scene.map((view) => view.name).join(',')}`);
  }

  let rejected = false;
  try {
    await reopened.create({ ...mara, id: 'bad-kind', kind: 'nonsense' });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('Illegal kind was accepted');

  console.log('I9 smoke: CharacterCore/arc/keyBeats round-trip, scene-character filtering, and illegal-value rejection passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
