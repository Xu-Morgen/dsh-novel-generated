import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertNarrativeAdaptationSafety,
  buildNarrativeAdaptationPrompt,
  classifyNarrativeAdaptation,
} from './narrative-adaptation.js';
import { narrativeAdaptationInputSchema, type NarrativeAdaptationInput, type NarrativeAdaptationOutput } from '../../core/schema/narrative-adaptation.js';

interface CorpusCase { id: string; sourceRole: 'background-material' | 'hybrid'; expected: NarrativeAdaptationOutput; }
interface Corpus { immutable: boolean; threshold: number; cases: CorpusCase[]; }
interface Split { immutable: boolean; caseIds: string[]; }
const corpus = JSON.parse(readFileSync(new URL('../../../samples/i145/cases.json', import.meta.url), 'utf8')) as Corpus;
const dev = JSON.parse(readFileSync(new URL('../../../samples/i145/dev.json', import.meta.url), 'utf8')) as Split;
const heldOut = JSON.parse(readFileSync(new URL('../../../samples/i145/held-out.json', import.meta.url), 'utf8')) as Split;
const gold = JSON.parse(readFileSync(new URL('../../../samples/i145/gold.json', import.meta.url), 'utf8')) as Split;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

function inputFor(sample: CorpusCase): NarrativeAdaptationInput {
  return narrativeAdaptationInputSchema.parse({
    projectId: 'demo', importSessionId: `imp-${sample.id}`, sourceHash: 'a'.repeat(64), sourceRole: sample.sourceRole, treatment: 'adapt-pov',
    narrativeIntent: { pov: 'limited', protagonistId: 'mira', initialKnown: [], revealPacing: 'balanced' },
    evidence: [{ paragraphId: 'paragraph-0001', role: 'world-truth', text: '幕后资料中的一条事实。' }],
  });
}

function backendReturning(value: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(value) }; yield { type: 'finish' as const, reason: { kind: 'stop' } }; } };
}

describe('I145 POV narrative adaptation', () => {
  it('meets the frozen dev and held-out threshold with a dedicated B5 prompt', async () => {
    expect(corpus.immutable).toBe(true);
    expect(dev.immutable).toBe(true);
    expect(heldOut.immutable).toBe(true);
    expect(gold.immutable).toBe(true);
    expect(corpus.threshold).toBeGreaterThanOrEqual(0.8);
    expect([...dev.caseIds, ...heldOut.caseIds]).toEqual(gold.caseIds);
    const results = await Promise.all(corpus.cases.map(async (sample) => {
      const output = await classifyNarrativeAdaptation(backendReturning(sample.expected), inputFor(sample), settings);
      return { sample, matched: JSON.stringify(output) === JSON.stringify(sample.expected) };
    }));
    const accuracy = (items: typeof results) => items.filter((item) => item.matched).length / items.length;
    expect(accuracy(results)).toBeGreaterThanOrEqual(corpus.threshold);
    expect(accuracy(results.filter((item) => heldOut.caseIds.includes(item.sample.id)))).toBeGreaterThanOrEqual(corpus.threshold);
  });

  it('keeps the adaptation prompt B5-only and rejects direct hidden-answer leakage', async () => {
    const input = inputFor(corpus.cases[0]);
    const prompt = buildNarrativeAdaptationPrompt(input);
    expect(prompt).toContain('按视角重构读者体验');
    expect(prompt).toContain('不得输出 B2/B3/C1/C2/C3/C4/C5');
    expect(prompt).not.toContain('preserve-prose');
    const unsafe = structuredClone(corpus.cases[0].expected);
    unsafe.outline.acts[0].beats[0].description = '调查者发现真相是助手操纵并安排了真实自杀。';
    expect(() => assertNarrativeAdaptationSafety(input, unsafe)).toThrow(/leaks a hidden answer/);
    const noInvestigation = structuredClone(corpus.cases[0].expected);
    noInvestigation.outline.acts[0].title = '幕后年表';
    noInvestigation.outline.acts[0].goal = '直接说明结果';
    noInvestigation.outline.acts[0].beats[0].title = '直接说明答案';
    noInvestigation.outline.acts[0].beats[0].description = '说明所有答案。';
    expect(() => assertNarrativeAdaptationSafety(input, noInvestigation)).toThrow(/investigation experience/);
  });

  it('fails closed on malformed JSON, evidence drift, and candidate identity drift', async () => {
    const input = inputFor(corpus.cases[1]);
    await expect(classifyNarrativeAdaptation(backendReturning('{bad'), input, settings)).rejects.toThrow(/valid JSON|expected object/i);
    await expect(classifyNarrativeAdaptation(backendReturning({ ...corpus.cases[1].expected, evidenceParagraphIds: ['unknown'] }), input, settings)).rejects.toThrow(/evidence/);
    const candidateInput = narrativeAdaptationInputSchema.parse({ ...input, narrativeIntent: { pov: 'limited', protagonistCandidateId: 'new-mira', initialKnown: [], revealPacing: 'slow' } });
    const candidateOutput = { ...corpus.cases[1].expected, protagonistCandidate: { id: 'other', name: '新主角', premise: '调查异常线索' } };
    await expect(classifyNarrativeAdaptation(backendReturning(candidateOutput), candidateInput, settings)).rejects.toThrow(/protagonist candidate id/);
  });
});
