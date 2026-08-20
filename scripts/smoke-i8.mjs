import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorldRepository } from '../lib/core/worldview/index.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i8-'));
try {
  const repository = new WorldRepository(root);
  await repository.open();
  await repository.create({
    id: 'continent', kind: 'geography', title: 'The Continent',
    content: 'A single vast landmass.', keywords: [], triggerMode: 'constant',
    weight: 0, parent: null, mutable: false, status: 'active', supersededBy: null,
  });
  await repository.create({
    id: 'kingdom', kind: 'geography', title: 'The Kingdom',
    content: 'A realm of iron.', keywords: [], triggerMode: 'constant',
    weight: 1, parent: 'continent', mutable: false, status: 'active', supersededBy: null,
  });
  await repository.create({
    id: 'capital', kind: 'geography', title: 'The Capital',
    content: 'Seat of the crown.', keywords: ['capital', 'crown'], triggerMode: 'keyword',
    weight: 2, parent: 'kingdom', mutable: true, status: 'active', supersededBy: null,
  });

  const reopened = new WorldRepository(root);
  await reopened.open();
  const hits = await reopened.matchTriggers(['they marched on the capital'], []);
  const hitIds = hits.map((hit) => hit.entryId);
  if (hitIds.join(',') !== 'capital,continent,kingdom') {
    throw new Error(`Trigger matching / parent ancestry wrong: ${hitIds.join(',')}`);
  }
  const capital = hits.find((hit) => hit.entryId === 'capital');
  if (!capital || capital.ancestors.join(',') !== 'continent,kingdom') {
    throw new Error('Parent chain order is wrong');
  }

  await reopened.rewrite('capital', {
    id: 'fallen-capital', kind: 'geography', title: 'The Fallen Capital',
    content: 'Burned during the war.', keywords: ['capital', 'crown'], triggerMode: 'keyword',
    weight: 2, parent: 'kingdom', mutable: true, status: 'active', supersededBy: null,
  });
  const old = await reopened.read('capital');
  if (old.status !== 'rewritten' || old.supersededBy !== 'fallen-capital') {
    throw new Error('Rewrite did not mark the superseded entry');
  }
  const replacement = await reopened.read('fallen-capital');
  if (replacement.status !== 'active' || replacement.supersededBy !== null) {
    throw new Error('Replacement entry status is wrong');
  }

  let rejected = false;
  try {
    await reopened.create({ id: 'bad', kind: 'nonsense', title: 'x', content: 'y', keywords: [], triggerMode: 'constant', weight: 0, parent: null, mutable: false, status: 'active', supersededBy: null });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('Illegal kind was accepted');

  console.log('I8 smoke: WorldEntry round-trip, hierarchy traversal, trigger matching, immutable rewrite, and illegal-value rejection passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
