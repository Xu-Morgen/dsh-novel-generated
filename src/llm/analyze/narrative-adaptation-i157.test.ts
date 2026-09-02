import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { narrativeAdaptationInputSchema, type NarrativeAdaptationOutput, type NarrativeAdaptationSourceRole } from '../../core/schema/narrative-adaptation.js';
import { assertNarrativeAdaptationSafety, buildNarrativeAdaptationPrompt, classifyNarrativeAdaptation } from './narrative-adaptation.js';

interface Case {
  readonly id: string;
  readonly sourceRole: NarrativeAdaptationSourceRole;
  readonly evidence: string;
  readonly expected: NarrativeAdaptationOutput;
}
interface Corpus { readonly immutable: boolean; readonly threshold: number; readonly cases: readonly Case[]; }
interface Split { readonly immutable: boolean; readonly caseIds: readonly string[]; }

const corpus = JSON.parse(readFileSync(new URL('../../../samples/i157/cases.json', import.meta.url), 'utf8')) as Corpus;
const dev = JSON.parse(readFileSync(new URL('../../../samples/i157/dev.json', import.meta.url), 'utf8')) as Split;
const heldOut = JSON.parse(readFileSync(new URL('../../../samples/i157/held-out.json', import.meta.url), 'utf8')) as Split;
const gold = JSON.parse(readFileSync(new URL('../../../samples/i157/gold.json', import.meta.url), 'utf8')) as Split;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

function inputFor(sample: Case) {
  return narrativeAdaptationInputSchema.parse({
    projectId: 'demo',
    importSessionId: `imp-${sample.id}`,
    sourceHash: 'a'.repeat(64),
    sourceRole: sample.sourceRole,
    treatment: 'adapt-pov',
    narrativeIntent: { pov: 'limited', protagonistCandidateId: 'imported-protagonist', initialKnown: [], revealPacing: 'balanced' },
    evidence: [{ paragraphId: 'paragraph-0001', role: 'plot-plan', text: sample.evidence }],
  });
}

function backendReturning(value: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(value) }; yield { type: 'finish' as const, reason: { kind: 'stop' } }; } };
}

describe('I157 source protagonist semantics', () => {
  it('meets the frozen dev and held-out threshold for idea/background/hybrid protagonist generation', async () => {
    expect(corpus.immutable && dev.immutable && heldOut.immutable && gold.immutable).toBe(true);
    expect([...dev.caseIds, ...heldOut.caseIds]).toEqual(gold.caseIds);
    const results = await Promise.all(corpus.cases.map(async (sample) => ({
      id: sample.id,
      matched: JSON.stringify(await classifyNarrativeAdaptation(backendReturning(sample.expected), inputFor(sample), settings)) === JSON.stringify(sample.expected),
    })));
    const accuracy = (ids: readonly string[]) => results.filter((result) => ids.includes(result.id) && result.matched).length / ids.length;
    expect(accuracy(dev.caseIds)).toBeGreaterThanOrEqual(corpus.threshold);
    expect(accuracy(heldOut.caseIds)).toBeGreaterThanOrEqual(corpus.threshold);
  });

  it('requires the proposed protagonist and an actual B5 reference to it', () => {
    const sample = corpus.cases[0];
    const input = inputFor(sample);
    expect(buildNarrativeAdaptationPrompt(input)).toContain('必须提议 id 为 imported-protagonist');
    expect(() => assertNarrativeAdaptationSafety(input, { ...sample.expected, protagonistCandidate: undefined })).toThrow(/protagonist candidate id/);
    const disconnected = structuredClone(sample.expected);
    disconnected.outline.acts[0].beats[0].charactersInvolved = [];
    expect(() => assertNarrativeAdaptationSafety(input, disconnected)).toThrow(/must be used/);
  });
});
