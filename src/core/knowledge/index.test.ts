import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { filterKnowledge } from './filter.js';
import { KnowledgeRepository } from './index.js';
import type { KnowledgeEntry, KnowledgeState } from '../schema/knowledge.js';
import { relationshipSchema } from '../schema/relationship.js';

const roots: string[] = [];
async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i18-'));
  roots.push(root);
  return root;
}
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function entry(id: string, holders: string[], over: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id,
    version: 1,
    fact: `${id} is true`,
    kind: 'secret',
    holders,
    revealPlan: { revealTo: ['mira', 'lin'].filter((character) => !holders.includes(character)), revealAt: 'act-2' },
    status: 'hidden',
    ...over,
  };
}

function state(characterId: string, knows: string[]): KnowledgeState { return { characterId, knows }; }

describe('I18 C3 knowledge and POV filter', () => {
  it('round-trips a validated holder/knows graph and gives each POV only its known facts', async () => {
    const repository = new KnowledgeRepository(await temporaryRoot());
    await repository.open();
    await repository.saveAll(
      [entry('harbor-secret', ['mira']), entry('lin-secret', ['lin'])],
      [state('mira', ['harbor-secret']), state('lin', ['lin-secret'])],
    );

    const document = await repository.read();
    expect(document.entries.map((item) => item.id)).toEqual(['harbor-secret', 'lin-secret']);
    expect(filterKnowledge('mira', document.entries, document.states).entries.map((item) => item.id)).toEqual(['harbor-secret']);
    expect(filterKnowledge('lin', document.entries, document.states).entries.map((item) => item.id)).toEqual(['lin-secret']);
  });

  it('rejects malformed graph edges, duplicates, and an unknown POV rather than widening knowledge', async () => {
    const repository = new KnowledgeRepository(await temporaryRoot());
    await repository.open();
    await expect(repository.saveAll([entry('secret', ['mira'])], [state('mira', [])]))
      .rejects.toThrow(/holder\/state mismatch/);
    await expect(repository.saveAll([entry('secret', ['mira'])], [state('mira', ['missing'])]))
      .rejects.toThrow(/Unknown knowledge entry reference/);
    await expect(repository.saveAll([entry('secret', ['mira', 'mira'])], [state('mira', ['secret'])]))
      .rejects.toThrow(/Duplicate knowledge reference/);
    expect(() => filterKnowledge('missing', [entry('secret', ['mira'])], [state('mira', ['secret'])]))
      .toThrow(/Knowledge state is missing/);
  });

  it('allows only additive holders/knows and forward revelation status changes', async () => {
    const repository = new KnowledgeRepository(await temporaryRoot());
    await repository.open();
    await repository.saveAll([entry('secret', ['mira'])], [state('mira', ['secret'])]);
    await repository.saveAll(
      [entry('secret', ['mira', 'lin'], { status: 'partially-revealed', version: 2, revealPlan: { revealTo: [], revealAt: 'act-2' } })],
      [state('mira', ['secret']), state('lin', ['secret'])],
    );
    await expect(repository.saveAll([entry('secret', ['lin'], { version: 3 })], [state('lin', ['secret'])]))
      .rejects.toThrow(/cannot be removed|cannot be deleted|cannot be forgotten/);
    await expect(repository.saveAll(
      [entry('secret', ['mira', 'lin'], { status: 'hidden', version: 3, revealPlan: { revealTo: [], revealAt: 'act-2' } })],
      [state('mira', ['secret']), state('lin', ['secret'])],
    )).rejects.toThrow(/status cannot regress/);
  });

  it('does not accept C1 relationship publicity as a C3 knowledge source', () => {
    const relationship = relationshipSchema.parse({
      id: 'mira-lin', version: 1, from: 'mira', to: 'lin', type: 'friendship', affinity: 1, trust: 1,
      status: 'public', milestones: [], knownTo: ['mira', 'lin'],
    });
    expect(relationship.knownTo).toEqual(['mira', 'lin']);
    const visible = filterKnowledge('lin', [entry('secret', ['mira'])], [state('mira', ['secret']), state('lin', [])]);
    expect(visible.entries).toEqual([]);
  });
});
