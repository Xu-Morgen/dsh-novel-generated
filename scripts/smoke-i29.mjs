import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfirmationGate } from '../lib/core/confirm/index.js';
import { WorldRepository } from '../lib/core/worldview/index.js';
import { applyAcceptedB2WorldviewSupersedeOperations, parseB2WorldviewFromNarrative, proposeB2WorldviewSupersedeOperations } from '../lib/llm/parse/worldview.js';

const root = await mkdtemp(join(tmpdir(), 'novel-i29-smoke-'));
const current = [{ id: 'north-kingdom', version: 1, kind: 'faction', title: '北境王国', content: '北境由延续千年的王国统治。', keywords: ['北境'], triggerMode: 'keyword', weight: 3, parent: null, mutable: true, status: 'active', supersededBy: null }];
try {
  const repository = new WorldRepository(join(root, 'worldview'));
  await repository.open();
  await repository.create(current[0]);
  const backend = { async *stream() { yield JSON.stringify({ ops: [{ op: 'supersede', targetId: 'north-kingdom', replacement: { id: 'fallen-north-kingdom', kind: 'faction', title: '北境废墟', content: '北境王国已在战役后覆灭。', keywords: ['北境', '废墟'], triggerMode: 'keyword', weight: 3, parent: null, mutable: true }, confidence: 'high' }] }); } };
  const output = await parseB2WorldviewFromNarrative(backend, { prose: '王国覆灭。', current }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });
  const gate = await ConfirmationGate.open(root);
  const proposal = await proposeB2WorldviewSupersedeOperations(gate, 'i29-supersede', current, output);
  await assert.rejects(() => applyAcceptedB2WorldviewSupersedeOperations(gate, proposal.id, repository), /requires accepted/);
  assert.equal((await repository.read('north-kingdom')).status, 'active');
  await gate.accept(proposal.id);
  const applied = await applyAcceptedB2WorldviewSupersedeOperations(gate, proposal.id, repository);
  assert.equal(applied[0].superseded.status, 'rewritten');
  assert.equal(applied[0].superseded.supersededBy, 'fallen-north-kingdom');
  assert.equal((await repository.read('fallen-north-kingdom')).status, 'active');
  console.log('I29 smoke passed: B2 supersede remains pending until I11 acceptance, then WorldRepository retains rewritten history');
} finally {
  await rm(root, { recursive: true, force: true });
}
