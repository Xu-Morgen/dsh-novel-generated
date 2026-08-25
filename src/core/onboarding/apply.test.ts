import { describe, expect, it } from 'vitest';
import { topologicalWorldviewOrder, referenceIdSets, collectAcceptedLayers, APPLY_ORDER } from './apply.js';
import type { OnboardingWorldview } from '../schema/onboarding.js';

const w = (id: string, parent: string | null = null): OnboardingWorldview =>
  ({ id, kind: 'geography', title: id, content: '内容', keywords: [], triggerMode: 'keyword', weight: 1, parent, mutable: true });

describe('I53 onboarding apply core', () => {
  it('orders B2 parent-first with a stable tiebreak', () => {
    const candidates = [w('child', 'parent'), w('parent'), w('grandchild', 'child'), w('sibling')];
    const order = topologicalWorldviewOrder(candidates, new Set());
    // Every parent must precede its child.
    const index = new Map(order.map((id, i) => [id, i]));
    expect(index.get('parent')!).toBeLessThan(index.get('child')!);
    expect(index.get('child')!).toBeLessThan(index.get('grandchild')!);
  });

  it('accepts parents that already exist in the project', () => {
    const order = topologicalWorldviewOrder([w('new-child', 'existing-parent')], new Set(['existing-parent']));
    expect(order).toEqual(['new-child']);
  });

  it('fails closed on a missing parent', () => {
    expect(() => topologicalWorldviewOrder([w('orphan', 'missing')], new Set())).toThrow(/missing/);
  });

  it('fails closed on a parent cycle', () => {
    expect(() => topologicalWorldviewOrder([w('a', 'b'), w('b', 'a')], new Set())).toThrow(/cycle/);
  });

  it('applies the fixed B3→B2→B5→C2→C4→C1 order', () => {
    expect(APPLY_ORDER).toEqual(['characters', 'worldview', 'outline', 'state', 'canon', 'relationship']);
  });

  it('collects accepted layers in apply order and computes character reference ids', () => {
    const accepted = {
      characters: { layer: 'characters' as const, proposalId: 'p1', confidence: 'high' as const, candidates: [{ id: 'mira' }] },
    };
    expect(collectAcceptedLayers({ characters: accepted.characters })).toEqual(['characters']);
  });

  it('merges existing character ids with accepted B3 ids in reference sets', () => {
    const { characterIds } = referenceIdSets(
      { characters: { layer: 'characters', proposalId: 'p', confidence: 'medium', candidates: [{ id: 'mira' }, { id: 'bin' }] } },
      { characters: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] }, worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] }, outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] }, relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] }, state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] }, canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] } },
      new Set(['existing']),
    );
    expect(characterIds.has('mira')).toBe(true);
    expect(characterIds.has('bin')).toBe(true);
    expect(characterIds.has('existing')).toBe(true);
  });
});
