import { describe, expect, it } from 'vitest';
import type { CanonEventView } from '../../core/canon/index.js';
import type { StructuralPreviewLayerBaseline, StructuralPreviewPlan, StructuralPreviewPrepareInput } from './structural-preview-plan.js';
import { replayStructuralPreviewPlan } from './landing-saga.js';
import {
  assertStructuralPreviewPlanFresh,
  prepareStructuralPreviewPlan,
  structuralPreviewFingerprint,
  STRUCTURAL_PREVIEW_MAX_OPERATIONS,
} from './structural-preview-plan.js';

const createdAt = '2026-08-31T00:00:00.000Z';
const sourceHash = '1'.repeat(64);
const noOutlineBaseline = { kind: 'no-outline-baseline' as const };

function fixtureInput(): StructuralPreviewPrepareInput {
  const c2 = {
    id: 'state-root', version: 1, seq: 0, storyTime: 'day-1',
    scene: { location: 'gate', timeOfDay: 'morning', weather: 'clear', season: 'spring', atmosphere: 'quiet' },
    characters: [{
      characterId: 'hero', location: 'gate', alive: true, health: 'well', mood: 'calm', inventory: [],
      condition: 'fine', currentGoal: 'enter', flags: {},
    }],
  };
  const c1 = [{
    id: 'rel-a', version: 1, from: 'hero', to: 'rival', type: 'rivalry' as const, affinity: 0,
    trust: 10, status: 'active', milestones: [], knownTo: [],
  }];
  const c3 = {
    entries: [{
      id: 'secret-a', version: 1, fact: 'The gate is sealed.', kind: 'secret' as const, holders: [],
      revealPlan: { revealTo: ['rival'], revealAt: 'later' }, status: 'hidden' as const,
    }],
    states: [{ characterId: 'rival', knows: [] }],
  };
  const c4: CanonEventView[] = [];
  const b2 = [{
    id: 'world-a', version: 1, kind: 'concept' as const, title: 'Gate', content: 'An old gate.', keywords: [],
    triggerMode: 'constant' as const, weight: 1, parent: null, mutable: true, status: 'active' as const, supersededBy: null,
  }];
  const snapshots: StructuralPreviewLayerBaseline[] = [
    { layer: 'c2', snapshot: c2, fingerprint: structuralPreviewFingerprint(c2) },
    { layer: 'c1', snapshot: c1, fingerprint: structuralPreviewFingerprint(c1) },
    { layer: 'c3', snapshot: c3, fingerprint: structuralPreviewFingerprint(c3) },
    { layer: 'c4', snapshot: c4, fingerprint: structuralPreviewFingerprint(c4) },
    { layer: 'b2', snapshot: b2, fingerprint: structuralPreviewFingerprint(b2) },
  ];
  return {
    planId: 'plan-a', projectId: 'project-a', candidateId: 'candidate-a', sourceHash,
    generationBaseline: noOutlineBaseline,
    layerBaselines: snapshots,
    parserOutputs: {
      c2: { ops: [{ op: 'modify', target: 'scene', field: 'location', action: 'set', value: 'harbor', confidence: 'high' }] },
      c1: { ops: [{ op: 'modify', targetId: 'rel-a', field: 'trust', action: 'set', value: 20, confidence: 'high' }] },
      c3: { ops: [{ op: 'advance', targetId: 'secret-a', addHolders: ['rival'], status: 'partially-revealed', confidence: 'high' }] },
      c4: { ops: [{ op: 'append', event: {
        id: 'canon-a', storyTime: 'day-1', kind: 'event', summary: 'The gate opens.', detail: '', participants: [],
        location: 'gate', consequences: [], affectedLayers: [],
      }, confidence: 'medium' }] },
      b2: { ops: [{ op: 'supersede', targetId: 'world-a', replacement: {
        id: 'world-b', kind: 'concept', title: 'Gate', content: 'A newly described old gate.', keywords: [],
        triggerMode: 'constant', weight: 1, parent: null, mutable: true,
      }, confidence: 'high' }] },
    },
    createdAt,
  };
}

function freshnessOf(plan: StructuralPreviewPlan) {
  return {
    sourceHash: plan.sourceHash,
    generationBaseline: plan.generationBaseline,
    layerFingerprints: Object.fromEntries(plan.layerBaselines.map((baseline) => [baseline.layer, baseline.fingerprint])) as {
      c2: string; c1: string; c3: string; c4: string; b2: string;
    },
  };
}

describe('I109 StructuralPreviewPlan', () => {
  it('freezes all five parser projections and produces deterministic bounded changes', () => {
    const first = prepareStructuralPreviewPlan(fixtureInput());
    const second = prepareStructuralPreviewPlan(fixtureInput());

    expect(first.changes).toEqual(second.changes);
    expect(first.changes.map((change) => `${change.layer}:${change.kind}`)).toEqual([
      'c2:update', 'c2:update', 'c1:update', 'c3:update', 'c3:update', 'c4:add', 'b2:update', 'b2:add',
    ]);
    expect(first.changes.every((change) => change.beforeHash !== undefined || change.afterHash !== undefined)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.parserOutputs.c2)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/repository|service|writer|prose/);
    assertStructuralPreviewPlanFresh(first, freshnessOf(first));
  });

  it('rejects stale owners before the landing-saga consumer can write', async () => {
    const plan = prepareStructuralPreviewPlan(fixtureInput());
    const calls: string[] = [];
    const writers = {
      c2: async () => { calls.push('c2'); }, c1: async () => { calls.push('c1'); },
      c3: async () => { calls.push('c3'); }, c4: async () => { calls.push('c4'); }, b2: async () => { calls.push('b2'); },
    };
    await expect(replayStructuralPreviewPlan(plan, { ...freshnessOf(plan), sourceHash: '2'.repeat(64) }, writers)).rejects.toThrow(/stale/);
    expect(calls).toEqual([]);
    const changes = await replayStructuralPreviewPlan(plan, freshnessOf(plan), writers);
    expect(calls).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']);
    expect(changes).toEqual(plan.changes);
  });

  it('rejects duplicate entities, incorrect fingerprints, extra fields, and oversized output', () => {
    const input = fixtureInput();
    const c1 = input.layerBaselines.find((baseline) => baseline.layer === 'c1');
    if (!c1 || c1.layer !== 'c1') throw new Error('missing c1 fixture');
    const duplicateSnapshot = [...c1.snapshot, c1.snapshot[0]];
    const duplicateBaselines = input.layerBaselines.map((baseline) => baseline.layer === 'c1'
      ? { ...baseline, snapshot: duplicateSnapshot, fingerprint: structuralPreviewFingerprint(duplicateSnapshot) }
      : baseline);
    expect(() => prepareStructuralPreviewPlan({ ...input, layerBaselines: duplicateBaselines })).toThrow(/Duplicate relationship/);

    const badFingerprint = input.layerBaselines.map((baseline) => baseline.layer === 'c2'
      ? { ...baseline, fingerprint: 'f'.repeat(64) } : baseline);
    expect(() => prepareStructuralPreviewPlan({ ...input, layerBaselines: badFingerprint })).toThrow(/fingerprint mismatch/);

    const extra = { ...input, parserOutputs: { ...input.parserOutputs, c2: { ...input.parserOutputs.c2, extra: true } } } as never;
    expect(() => prepareStructuralPreviewPlan(extra)).toThrow();

    const tooMany = { ...input, parserOutputs: {
      ...input.parserOutputs,
      c2: { ops: Array.from({ length: STRUCTURAL_PREVIEW_MAX_OPERATIONS + 1 }, () => input.parserOutputs.c2.ops[0]) },
    } };
    expect(() => prepareStructuralPreviewPlan(tooMany)).toThrow(/Too big|too_big|maximum/);
  });
});
