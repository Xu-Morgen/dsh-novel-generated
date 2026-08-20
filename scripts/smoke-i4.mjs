import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateEngine } from '../lib/core/state/index.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i4-'));
try {
  const initial = {
    id: 'smoke', version: 1, storyTime: 'day 1',
    scene: { location: 'gate', timeOfDay: 'dawn', weather: 'clear', season: 'spring', atmosphere: 'quiet' },
    characters: [{ characterId: 'lin', location: 'gate', alive: true, health: 'well', mood: 'calm', inventory: [], condition: '', currentGoal: 'wait', flags: {} }],
  };
  const engine = await StateEngine.open(join(root, 'state'), initial);
  await engine.transaction((draft) => { draft.scene.location = 'square'; });
  await engine.transaction((draft) => { draft.characters[0].mood = 'alert'; });
  const rolled = await engine.rollback(1);
  if (rolled.seq !== 3 || rolled.scene.location !== 'square' || rolled.characters[0].mood !== 'calm') throw new Error('I4 rollback smoke failed');
  const diff = engine.diff(0, 1);
  if (diff.changes.length !== 1 || diff.changes[0].path !== 'scene.location') throw new Error('I4 diff smoke failed');
  console.log('I4 smoke: StateEngine transaction, rollback, and diff passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
