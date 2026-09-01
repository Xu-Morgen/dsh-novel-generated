import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertNarrativeRevealSafety,
  buildNarrativeRevealPrompt,
  planNarrativeReveal,
} from './narrative-reveal.js';
import {
  narrativeRevealInputSchema,
  type NarrativeRevealInput,
  type NarrativeRevealOutput,
} from '../../core/schema/narrative-reveal.js';

interface CorpusCase { id: string; sourceRole: 'background-material' | 'hybrid'; expected: NarrativeRevealOutput; }
interface Corpus { immutable: boolean; threshold: number; cases: CorpusCase[]; }
interface Split { immutable: boolean; caseIds: string[]; }
const corpus = JSON.parse(readFileSync(new URL('../../../samples/i146/cases.json', import.meta.url), 'utf8')) as Corpus;
const dev = JSON.parse(readFileSync(new URL('../../../samples/i146/dev.json', import.meta.url), 'utf8')) as Split;
const heldOut = JSON.parse(readFileSync(new URL('../../../samples/i146/held-out.json', import.meta.url), 'utf8')) as Split;
const gold = JSON.parse(readFileSync(new URL('../../../samples/i146/gold.json', import.meta.url), 'utf8')) as Split;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

function inputFor(sample: CorpusCase): NarrativeRevealInput {
  return narrativeRevealInputSchema.parse({
    projectId: 'demo', importSessionId: `imp-reveal-${sample.id}`, sourceHash: 'a'.repeat(64), sourceRole: sample.sourceRole, treatment: 'adapt-pov',
    narrativeIntent: { pov: 'limited', protagonistId: 'mira', initialKnown: [], revealPacing: 'balanced' },
    b5CandidateId: 'narrative-candidate-1',
    b5Anchors: [{ id: 'act-1-beat-1', actId: 'act-1', beatId: 'beat-1', label: '调查开始' }],
    characterIds: ['archivist', 'mira'],
    evidence: [{ paragraphId: 'paragraph-0001', role: 'world-truth', text: '幕后资料中的一条事实。' }],
  });
}

function backendReturning(value: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(value) }; yield { type: 'finish' as const, reason: { kind: 'stop' } }; } };
}

describe('I146 C3 narrative reveal planner', () => {
  it('meets the frozen dev and held-out threshold through the dedicated parser', async () => {
    expect(corpus.immutable).toBe(true);
    expect(dev.immutable).toBe(true);
    expect(heldOut.immutable).toBe(true);
    expect(gold.immutable).toBe(true);
    expect(corpus.threshold).toBeGreaterThanOrEqual(0.8);
    expect([...dev.caseIds, ...heldOut.caseIds]).toEqual(gold.caseIds);
    const results = await Promise.all(corpus.cases.map(async (sample) => {
      const output = await planNarrativeReveal(backendReturning(sample.expected), inputFor(sample), settings);
      return { sample, matched: JSON.stringify(output) === JSON.stringify(sample.expected) };
    }));
    const accuracy = (items: typeof results) => items.filter((item) => item.matched).length / items.length;
    expect(accuracy(results)).toBeGreaterThanOrEqual(corpus.threshold);
    expect(accuracy(results.filter((item) => heldOut.caseIds.includes(item.sample.id)))).toBeGreaterThanOrEqual(corpus.threshold);
  });

  it('binds reveal timing to B5, preserves holder/state symmetry, and keeps the POV protagonist ignorant', () => {
    const input = inputFor(corpus.cases[0]);
    const prompt = buildNarrativeRevealPrompt(input);
    expect(prompt).toContain('每个 revealAt 必须精确引用给定 B5 beat anchor');
    expect(prompt).toContain('holders 表示故事起点已知者');
    expect(prompt).not.toContain('writeFile');
    const unsafe = structuredClone(corpus.cases[0].expected);
    unsafe.entries[0].revealPlan.revealAt = 'unknown-anchor';
    expect(() => assertNarrativeRevealSafety(input, unsafe)).toThrow(/B5 reveal anchor/);
    const holderLeak = structuredClone(corpus.cases[0].expected);
    holderLeak.entries[0].holders = ['mira'];
    holderLeak.entries[0].revealPlan.revealTo = [];
    expect(() => assertNarrativeRevealSafety(input, holderLeak)).toThrow(/starts with hidden C3 fact/);
    const asymmetric = structuredClone(corpus.cases[0].expected);
    asymmetric.states[0].knows = [];
    expect(() => assertNarrativeRevealSafety(input, asymmetric)).toThrow(/holder\/state mismatch/);
    const targetLeak = structuredClone(corpus.cases[0].expected);
    targetLeak.entries[0].revealPlan.revealTo = ['archivist'];
    expect(() => assertNarrativeRevealSafety(input, targetLeak)).toThrow(/already a holder/);
  });

  it('fails closed on malformed JSON, unknown state ids, and unknown B5 references', async () => {
    const input = inputFor(corpus.cases[1]);
    await expect(planNarrativeReveal(backendReturning('{bad'), input, settings)).rejects.toThrow(/valid JSON|expected object/i);
    const unknownState = structuredClone(corpus.cases[1].expected);
    unknownState.states[0].knows = ['unknown-entry'];
    await expect(planNarrativeReveal(backendReturning(unknownState), input, settings)).rejects.toThrow(/Unknown C3 state entry/);
    const unknownAnchor = structuredClone(corpus.cases[1].expected);
    unknownAnchor.entries[0].revealPlan.revealAt = 'future-beat';
    await expect(planNarrativeReveal(backendReturning(unknownAnchor), input, settings)).rejects.toThrow(/B5 reveal anchor/);
  });
});
