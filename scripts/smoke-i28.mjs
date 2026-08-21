import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfirmationGate } from '../lib/core/confirm/index.js';
import { KnowledgeRepository } from '../lib/core/knowledge/index.js';
import { applyC3KnowledgeOperations, parseC3KnowledgeFromNarrative, proposeLowConfidenceC3KnowledgeOperations } from '../lib/llm/parse/knowledge.js';

const root = await mkdtemp(join(tmpdir(), 'novel-i28-smoke-'));
const current = {
  entries: [{ id: 'harbor-secret', version: 1, fact: '暗门藏在灯塔地下。', kind: 'secret', holders: ['lin'], revealPlan: { revealTo: ['mira'], revealAt: '钟楼对峙后' }, status: 'hidden' }],
  states: [{ characterId: 'lin', knows: ['harbor-secret'] }, { characterId: 'mira', knows: [] }],
};
try {
  const repository = new KnowledgeRepository(join(root, 'knowledge'));
  await repository.open();
  await repository.saveAll(current.entries, current.states);
  const backend = { async *stream() { yield JSON.stringify({ ops: [{ op: 'advance', targetId: 'harbor-secret', addHolders: ['mira'], status: 'partially-revealed', confidence: 'high' }] }); } };
  const output = await parseC3KnowledgeFromNarrative(backend, { prose: '米拉看见了暗门。', ...current }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });
  const applied = await applyC3KnowledgeOperations(repository, current, output);
  assert.equal(applied.entries[0].status, 'partially-revealed');
  assert.deepEqual(applied.states.find((state) => state.characterId === 'mira').knows, ['harbor-secret']);

  const gate = await ConfirmationGate.open(root);
  const low = { ops: [{ op: 'advance', targetId: 'harbor-secret', addHolders: ['mira'], status: 'partially-revealed', confidence: 'low' }] };
  await assert.rejects(() => applyC3KnowledgeOperations(repository, current, low), /require ConfirmationGate/);
  const proposal = await proposeLowConfidenceC3KnowledgeOperations(gate, 'i28-low-proposal', current, low);
  assert.equal(proposal.status, 'pending');
  await gate.reject(proposal.id);
  assert.equal((await repository.read()).entries[0].status, 'partially-revealed');
  console.log('I28 smoke passed: strict C3 forward parser operations preserve holder/state consistency; low confidence remains pending');
} finally {
  await rm(root, { recursive: true, force: true });
}
