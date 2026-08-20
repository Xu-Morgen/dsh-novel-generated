import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { RelationshipRepository, relationshipSummary } from './index.js';
import type { RelationshipInput } from '../schema/relationship.js';

function relationship(id: string, over: Partial<RelationshipInput> = {}): RelationshipInput {
  return {
    id,
    version: 1,
    from: 'mira',
    to: 'lin',
    type: 'friendship',
    affinity: 30,
    trust: 60,
    status: 'uneasy alliance',
    milestones: ['meeting-1'],
    knownTo: ['mira'],
    ...over,
  };
}

describe('I16 RelationshipRepository', () => {
  it('round-trips values and replaces one relationship atomically', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i16-'));
    try {
      const repository = new RelationshipRepository(root);
      await repository.open();
      await repository.save(relationship('mira-lin'));
      await repository.save(relationship('mira-lin', { trust: 75, status: 'trusted' }));
      await repository.save(relationship('lin-mira', { from: 'lin', to: 'mira', type: 'rivalry', affinity: -20 }));
      expect(await repository.read()).toEqual([
        relationship('mira-lin', { trust: 75, status: 'trusted' }),
        relationship('lin-mira', { from: 'lin', to: 'mira', type: 'rivalry', affinity: -20 }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects invalid endpoints, values, duplicate ids, and duplicate publicity entries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i16-negative-'));
    try {
      const repository = new RelationshipRepository(root);
      await repository.open();
      await expect(repository.save(relationship('self', { from: 'mira', to: 'mira' }))).rejects.toThrow(/endpoints/);
      await expect(repository.save(relationship('bad-affinity', { affinity: 101 }))).rejects.toThrow();
      await expect(repository.saveAll([relationship('same'), relationship('same', { status: 'duplicate' })])).rejects.toThrow(/Duplicate relationship/);
      await expect(repository.save(relationship('known-twice', { knownTo: ['mira', 'mira'] }))).rejects.toThrow(/knownTo/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('summarizes only complete scene pairs in stable id order', () => {
    const all = [
      { ...relationship('z', { from: 'lin', to: 'mira' }), version: 1 },
      { ...relationship('a'), version: 1 },
      { ...relationship('outside', { from: 'mira', to: 'other' }), version: 1 },
    ];
    expect(relationshipSummary({ relationships: all, characterIds: ['mira', 'lin'] }).map((item) => item.relationship.id))
      .toEqual(['a', 'z']);
  });
});
