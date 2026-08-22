import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfirmationGate } from '../lib/core/confirm/index.js';
import { OutlineRepository } from '../lib/core/outline/index.js';
import { WorldRepository } from '../lib/core/worldview/index.js';
import { applyAcceptedSplitCandidates, proposeSplitCandidates } from '../lib/llm/parse/split.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i38-'));
try {
  const outline = new OutlineRepository(root);
  const worldview = new WorldRepository(root);
  await outline.open();
  await worldview.open();
  const gate = await ConfirmationGate.open(root);
  const output = {
    candidates: [{
      id: 'outline-smoke', kind: 'outline', sourceChunkIndex: 0, confidence: 'low',
      value: { id: 'outline-smoke', structure: 'free', logline: '旅人追查港口秘密。', themes: ['选择'], acts: [], foreshadowing: [], endings: [],
      },
    }],
  };
  const input = { chunks: [{ index: 0, text: '港口故事' }] };
  const pending = await proposeSplitCandidates(gate, 'proposal-smoke', input, output);
  if (pending.status !== 'pending' || (await worldview.list()).length !== 0) throw new Error('I38 pending Gate assertion failed');
  await gate.accept('proposal-smoke');
  const applied = await applyAcceptedSplitCandidates(gate, 'proposal-smoke', outline, worldview);
  if (applied.outline?.id !== 'outline-smoke') throw new Error('I38 accepted outline assertion failed');
  console.log('I38 smoke: split candidates stay pending until Gate acceptance, then write B5 only');
} finally {
  await rm(root, { recursive: true, force: true });
}
