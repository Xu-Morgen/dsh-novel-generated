import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RelationshipRepository } from '../lib/core/relationship/index.js';
import { ContextAssembler } from '../lib/core/assemble/index.js';
import { registerContextSerializers } from '../lib/core/assemble/serializers.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i16-'));
try {
  const repository = new RelationshipRepository(root);
  await repository.open();
  await repository.saveAll([
    { id: 'mira-lin', version: 1, from: 'mira', to: 'lin', type: 'friendship', affinity: 35, trust: 70, status: 'uneasy alliance', milestones: ['meeting'], knownTo: ['mira'] },
    { id: 'outside', version: 1, from: 'mira', to: 'other', type: 'rivalry', affinity: -30, trust: 10, status: 'unknown', milestones: [], knownTo: [] },
  ]);
  const relationships = await repository.read();
  const assembler = registerContextSerializers(new ContextAssembler());
  const result = assembler.assemble({
    macros: { user: 'Author', pov: 'Mira' },
    sources: {
      rules: [{ rule: { id: 'rule', version: 1, scope: 'global', kind: 'physics', statement: 'Be consistent.', priority: 1, immutable: false, examples: [], active: true }, scope: 'global', priority: 1, immutable: false }],
      style: { profile: { id: 'style', version: 1, name: 'plain', person: 'third-limited', tense: 'past', povScope: 'single', tone: 'plain', proseStyle: 'plain', chapterFormat: 'plain', dialogueConventions: 'plain', forbidden: [] }, forbidden: [] },
      characters: [], worldview: [], relationships: { relationships, characterIds: ['mira', 'lin'] },
      state: { id: 'state', version: 1, seq: 0, storyTime: 'now', scene: { location: 'room', timeOfDay: 'day', weather: 'clear', season: 'summer', atmosphere: 'calm' }, characters: [] },
    },
  });
  if (!result.prompt.includes('mira-lin') || result.prompt.includes('outside')) throw new Error('I16 relationship summary filtering failed');
  console.log('I16 smoke: relationship persistence, bounds, and related-pair summary injection passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
