import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RuleRepository } from '../lib/core/rules/index.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i7-'));
try {
  const repository = new RuleRepository(root);
  await repository.open();
  await repository.create({
    id: 'hard-rule', scope: 'global', kind: 'taboo', statement: 'No resurrection.',
    priority: 100, immutable: true, examples: ['A dead king stays dead.'], active: true,
  });
  await repository.create({
    id: 'soft-global', scope: 'global', kind: 'genre', statement: 'Tone stays hopeful.',
    priority: 10, immutable: false, examples: [], active: true,
  });
  await repository.create({
    id: 'soft-inactive', scope: 'character', kind: 'permission', statement: 'The chosen may lie.',
    priority: 50, immutable: false, examples: [], active: false,
  });

  const reopened = new RuleRepository(root);
  await reopened.open();
  const loaded = await reopened.read('hard-rule');
  if (loaded.priority !== 100 || !loaded.immutable || loaded.statement !== 'No resurrection.') {
    throw new Error('B1 rule did not round-trip all fields');
  }
  const active = await reopened.listActive();
  if (active.map((item) => item.rule.id).join(',') !== 'hard-rule,soft-global') {
    throw new Error('Active rules are not priority-ordered or not filtered');
  }
  const immutableRefs = await reopened.query({ immutable: true });
  if (immutableRefs.length !== 1 || immutableRefs[0].id !== 'hard-rule') {
    throw new Error('Immutable query is wrong');
  }

  let rejected = false;
  try {
    await reopened.create({ id: 'bad', scope: 'nonsense', kind: 'physics', statement: 'x', priority: 0, immutable: false, examples: [], active: true });
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('Illegal scope was accepted');

  console.log('I7 smoke: rule round-trip, priority/immutable/scope queries, active consumer fixture, and illegal-value rejection passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
