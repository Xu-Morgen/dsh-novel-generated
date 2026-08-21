import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KnowledgeRepository } from '../lib/core/knowledge/index.js';
import { filterKnowledge } from '../lib/core/knowledge/filter.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i18-'));
try {
  const repository = new KnowledgeRepository(root);
  await repository.open();
  await repository.saveAll([
    {
      id: 'harbor-secret', version: 1, fact: 'The lighthouse is a signal tower.', kind: 'secret', holders: ['mira'],
      revealPlan: { revealTo: ['lin'], revealAt: 'act-2' }, status: 'hidden',
    },
  ], [
    { characterId: 'mira', knows: ['harbor-secret'] },
    { characterId: 'lin', knows: [] },
  ]);
  const document = await repository.read();
  const mira = filterKnowledge('mira', document.entries, document.states);
  const lin = filterKnowledge('lin', document.entries, document.states);
  if (mira.entries.length !== 1 || lin.entries.length !== 0) throw new Error('POV knowledge filter smoke failed');
  console.log('I18 smoke passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
