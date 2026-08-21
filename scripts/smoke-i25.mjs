import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfirmationGate } from '../lib/core/confirm/index.js';
import { StateEngine } from '../lib/core/state/index.js';
import { applyC2StateOperations, parseC2StateFromNarrative, proposeLowConfidenceC2StateOperations } from '../lib/llm/parse/state.js';

const root = await mkdtemp(join(tmpdir(), 'novel-i25-smoke-'));
try {
  const initial = { id: 'state', version: 1, storyTime: 'day 1', scene: { location: '码头', timeOfDay: 'dawn', weather: 'clear', season: 'spring', atmosphere: 'quiet' }, characters: [{ characterId: 'lin', location: '码头', alive: true, health: 'well', mood: 'calm', inventory: [], condition: '', currentGoal: 'wait', flags: {} }] };
  const engine = await StateEngine.open(join(root, 'state'), initial);
  const backend = { async *stream() { yield JSON.stringify({ ops: [{ op: 'modify', target: 'lin', field: 'location', action: 'set', value: '钟楼', confidence: 'high' }] }); } };
  const output = await parseC2StateFromNarrative(backend, { prose: '林舟来到钟楼。', state: engine.current() }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });
  const applied = await applyC2StateOperations(engine, output);
  assert.equal(applied.characters[0].location, '钟楼');
  const gate = await ConfirmationGate.open(root);
  const low = { ops: [{ op: 'modify', target: 'lin', field: 'flags', action: 'set', value: { key: 'sawBell', value: true }, confidence: 'low' }] };
  await assert.rejects(() => applyC2StateOperations(engine, low), /require ConfirmationGate/);
  const proposal = await proposeLowConfidenceC2StateOperations(gate, 'i25-low-proposal', engine.current(), low);
  assert.equal(proposal.status, 'pending');
  assert.equal(engine.current().characters[0].flags.sawBell, undefined);
  console.log('I25 smoke passed: strict C2 ops mechanically reach StateEngine; low confidence remains pending in I11 Gate');
} finally {
  await rm(root, { recursive: true, force: true });
}
