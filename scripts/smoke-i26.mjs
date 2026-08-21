import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CanonLedger } from '../lib/core/canon/index.js';
import { ConfirmationGate } from '../lib/core/confirm/index.js';
import { applyC4CanonOperations, parseC4CanonFromNarrative, proposeC4CanonOperations } from '../lib/llm/parse/canon.js';

const root = await mkdtemp(join(tmpdir(), 'novel-i26-smoke-'));
try {
  const ledger = await CanonLedger.open(join(root, 'canon'));
  const backend = { async *stream() { yield JSON.stringify({ ops: [{ op: 'append', event: { id: 'evt-arrival', storyTime: 'day 1 dawn', kind: 'event', summary: '林舟抵达外城门', detail: '黎明时林舟抵达外城门。', participants: ['lin'], location: '外城门', consequences: [], affectedLayers: ['state'] }, confidence: 'high' }] }); } };
  const output = await parseC4CanonFromNarrative(backend, { prose: '黎明时，林舟抵达外城门。', canon: ledger.query() }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });
  const applied = await applyC4CanonOperations(ledger, output);
  assert.equal(applied[0].seq, 0);
  assert.equal(ledger.get(0).immutable, true);

  const gate = await ConfirmationGate.open(root);
  const low = { ops: [{ op: 'append', event: { id: 'evt-low', storyTime: 'day 1 dawn', kind: 'event', summary: '疑似目击', detail: '疑似目击。', participants: ['lin'], location: '外城门', consequences: [], affectedLayers: ['knowledge'] }, confidence: 'low' }] };
  await assert.rejects(() => applyC4CanonOperations(ledger, low), /require ConfirmationGate/);
  const proposal = await proposeC4CanonOperations(gate, 'i26-low-proposal', ledger.query(), low);
  assert.equal(proposal.status, 'pending');
  await gate.reject(proposal.id);
  assert.equal(ledger.count(), 1);
  console.log('I26 smoke passed: strict C4 append reaches CanonLedger; low-confidence proposal remains pending and rejection preserves the ledger');
} finally {
  await rm(root, { recursive: true, force: true });
}
