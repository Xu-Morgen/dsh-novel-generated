import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfirmationGate } from '../lib/core/confirm/index.js';
import { RelationshipRepository } from '../lib/core/relationship/index.js';
import { applyC1RelationshipOperations, parseC1RelationshipsFromNarrative, proposeLowConfidenceC1RelationshipOperations } from '../lib/llm/parse/relationship.js';

const root = await mkdtemp(join(tmpdir(), 'novel-i27-smoke-'));
try {
  const repository = new RelationshipRepository(join(root, 'relationships'));
  await repository.open();
  const backend = { async *stream() { yield JSON.stringify({ ops: [{ op: 'create', relationship: { id: 'lin-mira', from: 'lin', to: 'mira', type: 'friendship', affinity: 40, trust: 65, status: 'new allies', milestones: ['evt-watch'], knownTo: ['lin', 'mira'] }, confidence: 'high' }] }); } };
  const output = await parseC1RelationshipsFromNarrative(backend, { prose: '林舟与米拉结为盟友。', current: [] }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });
  const applied = await applyC1RelationshipOperations(repository, [], output);
  assert.equal(applied[0].trust, 65);
  assert.deepEqual((await repository.read())[0].knownTo, ['lin', 'mira']);

  const gate = await ConfirmationGate.open(root);
  const low = { ops: [{ op: 'modify', targetId: 'lin-mira', field: 'status', action: 'set', value: 'possible distance', confidence: 'low' }] };
  await assert.rejects(() => applyC1RelationshipOperations(repository, applied, low), /require ConfirmationGate/);
  const proposal = await proposeLowConfidenceC1RelationshipOperations(gate, 'i27-low-proposal', applied, low);
  assert.equal(proposal.status, 'pending');
  await gate.reject(proposal.id);
  assert.equal((await repository.read())[0].status, 'new allies');
  console.log('I27 smoke passed: strict C1 parser ops reach RelationshipRepository; low confidence remains pending and C1 knownTo stays C1-only publicity');
} finally {
  await rm(root, { recursive: true, force: true });
}
