import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNarrativeImportPlanCoordinator, type NarrativeImportPlanOwners } from './narrative-import-plan-coordinator.js';
import type { ConfirmationProposalInput, ConfirmationRecord } from '../core/schema/confirm.js';
import { narrativeImportPlanInputSchema, type NarrativeImportPlanInput } from '../core/schema/narrative-import-plan.js';
import type { CharacterCore } from '../core/schema/characters.js';
import type { WorldEntry } from '../core/schema/worldview.js';
import type { Outline } from '../core/schema/outline.js';
import type { Relationship } from '../core/schema/relationship.js';
import type { WorldState } from '../core/schema/state.js';
import type { CanonEvent } from '../core/schema/canon.js';

const sourceHash = 'a'.repeat(64);
const character = (id: string, kind: CharacterCore['kind']): Omit<CharacterCore, 'version'> => ({
  id, name: id === 'mira' ? '米拉' : '档案员', aliases: [], kind, personality: '谨慎', background: '港口居民', motivation: '查明异常', goals: ['调查'], flaws: [], abilities: ['观察'], speechStyle: '简洁', staticTraits: [], arc: { startingPoint: '未知', desiredEnd: '求证', keyBeats: [] }, relationships: [], knowledgeIds: [],
});
const worldview: Omit<WorldEntry, 'version' | 'status' | 'supersededBy'> = { id: 'harbor', kind: 'geography', title: '港口', content: '一处公开港口。', keywords: ['港口'], triggerMode: 'keyword', weight: 1, parent: null, mutable: false };
const outline = { id: 'adapted-outline', structure: 'three-act' as const, logline: '调查者追踪异常线索', themes: ['记忆'], acts: [{ id: 'act-1', index: 0, title: '调查开始', goal: '找到线索', beats: [{ id: 'beat-1', title: '跟随线索', description: '调查者发现矛盾并作出暂时误判', charactersInvolved: ['mira'], conflictType: 'external' as const, prerequisites: [], optional: false, detailBeats: [] }] }], foreshadowing: [], endings: [] };
const state: Omit<WorldState, 'version' | 'seq'> = { id: 'state-start', storyTime: '故事开始', scene: { location: 'harbor', timeOfDay: 'morning', weather: 'clear', season: 'spring', atmosphere: 'quiet' }, characters: [{ characterId: 'mira', location: 'harbor', alive: true, health: 'well', mood: 'alert', inventory: [], condition: '正常', currentGoal: '调查', flags: {} }, { characterId: 'archivist', location: 'archive', alive: true, health: 'well', mood: 'calm', inventory: [], condition: '正常', currentGoal: '守密', flags: {} }] };
const knowledge = { candidateId: 'narrative-reveal-candidate-1', projectId: 'demo', importSessionId: 'import-1', sourceHash, sourceRole: 'background-material' as const, treatment: 'adapt-pov' as const, narrativeIntent: { pov: 'limited' as const, protagonistId: 'mira', initialKnown: [], revealPacing: 'balanced' as const }, b5CandidateId: 'narrative-candidate-1', confidence: 'high' as const, entries: [{ id: 'secret-ash', fact: '档案机制需要调查验证。', kind: 'secret' as const, holders: ['archivist'], revealPlan: { revealTo: ['mira'], revealAt: 'act-1-beat-1' }, status: 'hidden' as const, evidenceParagraphIds: ['paragraph-0001'] }], states: [{ characterId: 'archivist', knows: ['secret-ash'] }, { characterId: 'mira', knows: [] }], rationale: '先调查再揭示' };

function planInput(projectId = 'demo', importSessionId = 'import-1'): NarrativeImportPlanInput {
  return narrativeImportPlanInputSchema.parse({
    projectId, importSessionId, sourceHash, sourceRole: 'background-material', treatment: 'adapt-pov', narrativeIntent: knowledge.narrativeIntent,
    package: {
      characters: { candidates: [character('mira', 'protagonist'), character('archivist', 'supporting')], confidence: 'high', warnings: [], evidenceIds: ['paragraph-0001'] },
      worldview: { candidates: [worldview], confidence: 'high', warnings: [], evidenceIds: ['paragraph-0001'] },
      outline: { candidateId: 'narrative-candidate-1', projectId, importSessionId, sourceHash, sourceRole: 'background-material', treatment: 'adapt-pov', narrativeIntent: knowledge.narrativeIntent, confidence: 'high', evidenceParagraphIds: ['paragraph-0001'], outline, rationale: '先调查再揭示' },
      state: { candidates: [state], confidence: 'high', warnings: [], evidenceIds: ['paragraph-0001'] },
      canon: { candidates: [], confidence: 'medium', warnings: [], evidenceIds: [] },
      relationship: { candidates: [], confidence: 'medium', warnings: [], evidenceIds: [] },
      knowledge: { ...knowledge, projectId, importSessionId },
    },
  });
}

function createOwners(options: { nonEmpty?: boolean; failStateOnce?: boolean } = {}): { owners: NarrativeImportPlanOwners; calls: string[]; failState: { value: boolean } } {
  const calls: string[] = [];
  const failState = { value: options.failStateOnce === true };
  const records = new Map<string, ConfirmationRecord>();
  const storedCharacters: CharacterCore[] = options.nonEmpty ? [{ ...character('existing', 'supporting'), version: 1 }] : [];
  const storedWorldview: WorldEntry[] = [];
  let storedOutline: Outline | undefined;
  const owners = {
    characters: {
      async list() { return [...storedCharacters]; },
      async create(_projectId: string, input: Omit<CharacterCore, 'version'>) { calls.push('characters'); const result = { ...input, version: 1 }; storedCharacters.push(result); return result; },
      async open() {}, async read(_projectId: string, id: string) { const result = storedCharacters.find((item) => item.id === id); if (!result) throw new Error('missing character'); return { ...result }; }, async update() { throw new Error('unused'); }, async listByKind() { return []; }, async listForScene() { return []; },
    },
    worldview: {
      async list() { return [...storedWorldview]; }, async create(_projectId: string, input: Omit<WorldEntry, 'version'>) { calls.push('worldview'); const result = { ...input, version: 1, status: 'active' as const, supersededBy: null }; storedWorldview.push(result); return result; },
      async open() {}, async read(_projectId: string, id: string) { const result = storedWorldview.find((item) => item.id === id); if (!result) throw new Error('missing worldview'); return { ...result }; }, async rewrite() { throw new Error('unused'); }, async matchTriggers() { return []; },
    },
    outline: {
      async readiness() { return options.nonEmpty || storedOutline !== undefined ? 'ready' as const : 'uninitialized' as const; }, async save(_projectId: string, input: Omit<Outline, 'version'>) { calls.push('outline'); storedOutline = { ...input, version: 1 }; return storedOutline; },
      async open() {}, async read() { return storedOutline ?? { ...outline, version: 1 }; }, async contentFingerprint() { return 'empty'; }, async beatCards() { return []; }, async saveProgress() { throw new Error('unused'); }, async readProgress() { throw new Error('unused'); }, async navigate() { throw new Error('unused'); }, async recordDeviation() { throw new Error('unused'); }, async reconcileDeviation() { throw new Error('unused'); },
    },
    relationship: {
      async read() { return [] as Relationship[]; }, async save() { calls.push('relationship'); return {} as Relationship; }, async saveAll() { return []; }, async restoreForCompensation() {}, async open() {},
    },
    state: {
      current() { return { ...state, scene: { ...state.scene, timeOfDay: 'night' }, version: 1, seq: 0 }; }, async transaction(_projectId: string, mutator: (draft: WorldState) => void) { if (failState.value) { failState.value = false; throw new Error('injected state failure'); } calls.push('state'); const next = { ...state, version: 1, seq: 1 }; mutator(next); return next; }, async open() {}, snapshots() { return []; }, async rollback() { throw new Error('unused'); }, diff() { throw new Error('unused'); },
    },
    canon: {
      query() { return [] as CanonEvent[]; }, async append(_projectId: string, input: Omit<CanonEvent, 'seq' | 'immutable' | 'supersedes'>) { calls.push('canon'); return { ...input, seq: 0, immutable: true as const }; }, async appendBatch() { return []; }, async supersede() { throw new Error('unused'); }, async open() {},
    },
    knowledge: {
      async read() { return { entries: [], states: [] }; }, async saveAll() { calls.push('knowledge'); return { entries: [], states: [] }; }, async restoreForCompensation() {}, async open() {}, async saveEntry() { throw new Error('unused'); }, async forPov() { throw new Error('unused'); },
    },
    confirmation: {
      async open() {},
      async propose(_projectId: string, input: ConfirmationProposalInput) { const record = { ...input, version: 1 as const, status: 'pending' as const }; records.set(input.id, record); return record; },
      async accept(_projectId: string, id: string) { const current = records.get(id)!; const next = { ...current, status: 'accepted' as const }; records.set(id, next); return next; },
      async reject(_projectId: string, id: string) { const current = records.get(id)!; const next = { ...current, status: 'rejected' as const }; records.set(id, next); return next; },
      get(_projectId: string, id: string) { return records.get(id)!; }, pending() { return []; }, list() { return [...records.values()]; },
    },
  } as unknown as NarrativeImportPlanOwners;
  return { owners, calls, failState };
}

describe('I148 NarrativeImportPlanCoordinator', () => {
  it('uses one pending I11 proposal and performs no layer write before accept', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-import-plan-'));
    const { owners, calls } = createOwners();
    const coordinator = createNarrativeImportPlanCoordinator(root, owners);
    const proposed = await coordinator.propose(planInput());
    expect(proposed.status).toBe('pending');
    expect(proposed.committedStages).toEqual([]);
    expect(calls).toEqual([]);
    const reopened = createNarrativeImportPlanCoordinator(root, owners);
    expect(await reopened.read({ projectId: 'demo', importSessionId: 'import-1', sourceHash, planId: proposed.planId })).toMatchObject({ status: 'pending', confirmationId: proposed.confirmationId });
    const rejected = await coordinator.reject({ projectId: 'demo', importSessionId: 'import-1', sourceHash, planId: proposed.planId });
    expect(rejected.status).toBe('rejected');
    expect(calls).toEqual([]);
  });

  it('applies all stages once, checkpoints them, and makes repeated accept idempotent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-import-plan-'));
    const { owners, calls } = createOwners();
    const coordinator = createNarrativeImportPlanCoordinator(root, owners);
    const proposed = await coordinator.propose(planInput());
    const identity = { projectId: 'demo', importSessionId: 'import-1', sourceHash, planId: proposed.planId };
    const applied = await coordinator.accept(identity);
    expect(applied.status).toBe('applied');
    expect(applied.committedStages).toEqual(['characters', 'worldview', 'outline', 'state', 'canon', 'relationship', 'knowledge']);
    expect(calls).toEqual(['characters', 'characters', 'worldview', 'outline', 'state', 'knowledge']);
    expect(await coordinator.accept(identity)).toEqual(applied);
  });

  it('I157 includes an LLM-proposed protagonist in the unified B3 preview before confirmation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-import-plan-'));
    const { owners, calls } = createOwners();
    const base = planInput('idea-demo', 'idea-import');
    const candidateIntent = { pov: 'limited' as const, protagonistCandidateId: 'imported-protagonist', initialKnown: [], revealPacing: 'balanced' as const };
    const generated = narrativeImportPlanInputSchema.parse({
      ...base,
      sourceRole: 'idea',
      narrativeIntent: candidateIntent,
      package: {
        ...base.package,
        outline: {
          ...base.package.outline,
          projectId: 'idea-demo',
          importSessionId: 'idea-import',
          sourceRole: 'idea',
          narrativeIntent: candidateIntent,
          protagonistCandidate: { id: 'imported-protagonist', name: '新调查者', premise: '从一个异常线索进入故事' },
          outline: {
            ...base.package.outline.outline,
            acts: base.package.outline.outline.acts.map((act) => ({
              ...act,
              beats: act.beats.map((beat) => ({ ...beat, charactersInvolved: ['imported-protagonist'] })),
            })),
          },
        },
        knowledge: {
          ...base.package.knowledge,
          projectId: 'idea-demo',
          importSessionId: 'idea-import',
          sourceRole: 'idea',
          narrativeIntent: candidateIntent,
          entries: base.package.knowledge.entries.map((entry) => ({ ...entry, revealPlan: { ...entry.revealPlan, revealTo: ['imported-protagonist'] } })),
          states: [...base.package.knowledge.states, { characterId: 'imported-protagonist', knows: [] }],
        },
      },
    });
    const coordinator = createNarrativeImportPlanCoordinator(root, owners);
    const proposed = await coordinator.propose(generated);
    expect(proposed.status).toBe('pending');
    expect(proposed.package.characters.candidates[0]).toMatchObject({
      id: 'imported-protagonist',
      name: '新调查者',
      kind: 'protagonist',
      background: '从一个异常线索进入故事',
    });
    expect(calls).toEqual([]);
  });

  it('returns stale without confirmation/write for a non-empty target and recovers exact partial failure', async () => {
    const staleRoot = await mkdtemp(join(tmpdir(), 'novel-import-plan-'));
    const stale = createOwners({ nonEmpty: true });
    const staleCoordinator = createNarrativeImportPlanCoordinator(staleRoot, stale.owners);
    await expect(staleCoordinator.propose(planInput())).rejects.toThrow(/new empty project/);
    expect(stale.calls).toEqual([]);

    const partialRoot = await mkdtemp(join(tmpdir(), 'novel-import-plan-'));
    const partial = createOwners({ failStateOnce: true });
    const coordinator = createNarrativeImportPlanCoordinator(partialRoot, partial.owners);
    const proposed = await coordinator.propose(planInput('partial', 'import-partial'));
    const identity = { projectId: 'partial', importSessionId: 'import-partial', sourceHash, planId: proposed.planId };
    const failed = await coordinator.accept(identity);
    expect(failed.status).toBe('partial-failure');
    expect(failed.committedStages).toEqual(['characters', 'worldview', 'outline']);
    const recovered = await coordinator.recover(identity);
    expect(recovered.status).toBe('applied');
    expect(recovered.committedStages).toHaveLength(7);
  });
});
