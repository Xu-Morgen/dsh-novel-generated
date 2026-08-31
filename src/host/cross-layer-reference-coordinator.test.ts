import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createCanonService } from './canon-service.js';
import { createCharacterService } from './character-service.js';
import { createCrossLayerReferenceCoordinator, createReferenceChangeSet } from './cross-layer-reference-coordinator.js';
import { createKnowledgeService } from './knowledge-service.js';
import { createRelationshipService } from './relationship-service.js';
import { CROSS_LAYER_REFERENCE_MATRIX, assertReferenceMatrix } from '../core/schema/reference-coordination.js';

const roots: string[] = [];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'novel-i115-reference-'));
  roots.push(root);
  const projectId = 'demo';
  const characters = createCharacterService(root);
  const relationship = createRelationshipService(root);
  const knowledge = createKnowledgeService(root);
  const canon = createCanonService(root);
  await characters.open(projectId);
  for (const [id, kind] of [['mira', 'protagonist'], ['lin', 'supporting']] as const) {
    await characters.create(projectId, {
      id, version: 1, name: id, aliases: [], kind, personality: '', background: '', motivation: '', goals: [], flaws: [],
      abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
    });
  }
  await relationship.open(projectId);
  await relationship.saveAll(projectId, [{
    id: 'r-mira-lin', version: 1, from: 'mira', to: 'lin', type: 'friendship', affinity: 70, trust: 80,
    status: 'close', milestones: [], knownTo: ['mira'],
  }]);
  await knowledge.open(projectId);
  await knowledge.saveAll(projectId, [{
    id: 'secret-key', version: 1, fact: '钥匙在码头。', kind: 'secret', holders: [],
    revealPlan: { revealTo: ['lin'], revealAt: 'dawn' }, status: 'hidden',
  }], [{ characterId: 'mira', knows: [] }, { characterId: 'lin', knows: [] }]);
  await canon.open(projectId);

  let authorized = true;
  const coordinator = createCrossLayerReferenceCoordinator({
    characters,
    relationship,
    knowledge,
    canon,
    isAuthorized: async () => authorized,
  });
  return { root, projectId, characters, relationship, knowledge, canon, coordinator, setAuthorized: (value: boolean) => { authorized = value; } };
}

function accepted(candidateId = 'candidate-1') {
  return { kind: 'candidate-accept' as const, candidateId, status: 'accepted' as const };
}

describe('I115 CrossLayerReferenceCoordinator', () => {
  it('freezes the field matrix and applies one accepted cross-owner outcome exactly once', async () => {
    assertReferenceMatrix();
    expect(CROSS_LAYER_REFERENCE_MATRIX.filter((entry) => entry.disposition === 'forbidden-automatic')).not.toHaveLength(0);
    const { projectId, coordinator, canon, relationship, knowledge } = await setup();
    const before = await coordinator.snapshot(projectId);
    const nextRelationships = [
      ...before.relationships.map((item) => ({
        ...item, version: 2, affinity: 5, trust: 10, status: 'strained', milestones: ['evt-1'],
      })),
      { id: 'r-lin-mira', version: 1, from: 'lin', to: 'mira', type: 'allegiance' as const, affinity: -10, trust: 20, status: 'new', milestones: [], knownTo: [] },
    ];
    const nextKnowledge = {
      entries: before.knowledge.entries.map((entry) => ({
        ...entry, version: 2, holders: ['lin'], revealPlan: { ...entry.revealPlan, revealTo: [] }, status: 'partially-revealed' as const,
      })),
      states: before.knowledge.states.map((state) => state.characterId === 'lin' ? { ...state, knows: ['secret-key'] } : state),
    };
    const changeSet = createReferenceChangeSet(before, {
      operationId: 'reference-1', authorization: accepted(), relationships: nextRelationships,
      knowledge: nextKnowledge,
      canonAppends: [{ id: 'evt-1', storyTime: 'dawn', kind: 'event', summary: '找到钥匙', detail: '米拉找到钥匙。', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: ['c3'] }],
    });

    await expect(coordinator.apply(changeSet)).resolves.toMatchObject({ status: 'applied', changedOwners: ['c1', 'c3', 'c4'] });
    await expect(coordinator.apply(changeSet)).resolves.toMatchObject({ status: 'already-applied', changedOwners: [] });
    expect((await relationship.read(projectId))[0]).toMatchObject({ version: 2, affinity: 5, trust: 10 });
    expect((await knowledge.read(projectId)).entries[0]).toMatchObject({ version: 2, status: 'partially-revealed' });
    expect(canon.query(projectId).map((event) => event.id)).toEqual(['evt-1']);
  });

  it('rejects unauthorized, stale, unknown/cross-project and non-monotonic changes before writing', async () => {
    const { projectId, coordinator, relationship, setAuthorized } = await setup();
    const before = await coordinator.snapshot(projectId);
    const valid = createReferenceChangeSet(before, {
      operationId: 'reference-gated', authorization: accepted('candidate-gated'), relationships: before.relationships,
      knowledge: before.knowledge, canonAppends: [],
    });
    setAuthorized(false);
    await expect(coordinator.apply(valid)).rejects.toThrow(/not authorized/);
    expect(await relationship.read(projectId)).toEqual(before.relationships);

    setAuthorized(true);
    const unknown = createReferenceChangeSet(before, {
      operationId: 'reference-unknown', authorization: accepted('candidate-unknown'),
      relationships: [{ ...before.relationships[0], from: 'foreign-character' }], knowledge: before.knowledge, canonAppends: [],
    });
    await expect(coordinator.apply(unknown)).rejects.toThrow(/unknown or cross-project/i);
    expect(await relationship.read(projectId)).toEqual(before.relationships);

    const advance = createReferenceChangeSet(before, {
      operationId: 'reference-advance-before-negative', authorization: accepted('candidate-advance'),
      relationships: before.relationships, knowledge: {
        entries: before.knowledge.entries.map((entry) => ({ ...entry, version: 2, holders: ['lin'], revealPlan: { ...entry.revealPlan, revealTo: [] }, status: 'partially-revealed' as const })),
        states: before.knowledge.states.map((state) => state.characterId === 'lin' ? { ...state, knows: ['secret-key'] } : state),
      }, canonAppends: [],
    });
    await coordinator.apply(advance);
    const afterApply = await coordinator.snapshot(projectId);
    const removedHolder = {
      entries: afterApply.knowledge.entries.map((entry) => ({ ...entry, holders: [], revealPlan: { ...entry.revealPlan } })),
      states: afterApply.knowledge.states,
    };
    const nonMonotonic = createReferenceChangeSet(afterApply, {
      operationId: 'reference-regress', authorization: accepted('candidate-regress'), relationships: afterApply.relationships,
      knowledge: removedHolder, canonAppends: [],
    });
    await expect(coordinator.apply(nonMonotonic)).rejects.toThrow(/holder|mismatch|forgotten/i);

    const stale = createReferenceChangeSet(before, {
      operationId: 'reference-stale', authorization: accepted('candidate-stale'),
      relationships: before.relationships.map((item) => ({ ...item, version: 3, trust: 20, status: 'distant' })),
      knowledge: {
        entries: before.knowledge.entries.map((entry) => ({ ...entry, version: 2, holders: ['lin'], revealPlan: { ...entry.revealPlan, revealTo: [] }, status: 'partially-revealed' as const })),
        states: before.knowledge.states.map((state) => state.characterId === 'lin' ? { ...state, knows: ['secret-key'] } : state),
      }, canonAppends: [],
    });
    await relationship.saveAll(projectId, [{ ...before.relationships[0], version: 2, trust: 30, status: 'outside-change' }]);
    await expect(coordinator.apply(stale)).rejects.toThrow(/stale c1/i);
  });

  it('compensates an earlier owner when a later owner rejects and preserves relationship version-chain semantics', async () => {
    const { projectId, coordinator, characters, relationship, knowledge, canon } = await setup();
    const before = await coordinator.snapshot(projectId);
    const failingKnowledge = {
      read: knowledge.read.bind(knowledge),
      saveAll: async () => { throw new Error('injected C3 failure'); },
      restoreForCompensation: knowledge.restoreForCompensation.bind(knowledge),
    };
    const failing = createCrossLayerReferenceCoordinator({
      characters,
      relationship,
      knowledge: failingKnowledge,
      canon,
      isAuthorized: async () => true,
    });
    const changeSet = createReferenceChangeSet(before, {
      operationId: 'reference-compensate', authorization: accepted(),
      relationships: before.relationships.map((item) => ({ ...item, version: 2, affinity: -30, trust: 1, status: 'broken' })),
      knowledge: {
        entries: before.knowledge.entries.map((entry) => ({ ...entry, version: 2, holders: ['lin'], revealPlan: { ...entry.revealPlan, revealTo: [] }, status: 'partially-revealed' as const })),
        states: before.knowledge.states.map((state) => state.characterId === 'lin' ? { ...state, knows: ['secret-key'] } : state),
      }, canonAppends: [],
    });
    await expect(failing.apply(changeSet)).rejects.toThrow(/compensated/);
    expect(await relationship.read(projectId)).toEqual(before.relationships);
    expect((await relationship.read(projectId))[0].version).toBe(1);
  });
});
