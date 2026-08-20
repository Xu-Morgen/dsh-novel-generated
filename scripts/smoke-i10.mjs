import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StyleRepository } from '../lib/core/style/index.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i10-'));
try {
  const repository = new StyleRepository(root);
  await repository.open();
  await repository.save({
    id: 'harbor-style', name: 'Harbor noir', person: 'third-limited', tense: 'past', povScope: 'single',
    tone: 'restrained and salt-stained', proseStyle: 'precise sensory detail',
    chapterFormat: 'scene break with a location dateline',
    dialogueConventions: 'Use Chinese quotation marks; avoid redundant dialogue tags.',
    forbidden: ['突然之间', '命运的齿轮'],
  });

  const reopened = new StyleRepository(root);
  await reopened.open();
  const segment = await reopened.constantSegment();
  if (segment.profile.person !== 'third-limited' || segment.profile.tense !== 'past') {
    throw new Error('StyleProfile narrative settings did not round-trip');
  }
  if ((await reopened.forbiddenExpressions()).join(',') !== '突然之间,命运的齿轮') {
    throw new Error('Forbidden-expression query did not round-trip');
  }

  let rejected = false;
  try {
    await reopened.save({ ...segment.profile, id: 'invalid-style', povScope: 'everywhere' });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('Illegal povScope was accepted');

  console.log('I10 smoke: StyleProfile round-trip, constant segment, forbidden-expression query, and illegal-value rejection passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
