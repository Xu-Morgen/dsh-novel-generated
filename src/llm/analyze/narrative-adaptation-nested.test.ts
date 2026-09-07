import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { narrativeAdaptationInputSchema, narrativeAdaptationOutputSchema } from '../../core/schema/narrative-adaptation.js';
import { buildNarrativeAdaptationPrompt, classifyNarrativeAdaptation } from './narrative-adaptation.js';

const corpus = JSON.parse(readFileSync(new URL('../../../samples/i200/cases.json', import.meta.url), 'utf8')) as {
  immutable: boolean; threshold: number; dev: string[]; heldOut: string[];
  input: unknown; output: unknown;
  cases: { id: string; mutation: string; accepted: boolean }[];
};

describe('I200 frozen nested adaptation corpus', () => {
  it('meets dev and held-out thresholds without relaxing the strict output boundary', async () => {
    expect(corpus.immutable).toBe(true);
    expect(corpus.threshold).toBe(1);
    const results = [];
    for (const sample of corpus.cases) {
      const input = narrativeAdaptationInputSchema.parse(corpus.input);
      const output = narrativeAdaptationOutputSchema.parse(corpus.output);
      const beat = output.outline.acts[0].beats[0];
      if (sample.mutation === 'social') Object.assign(beat, { conflictType: 'social' });
      if (sample.mutation === 'experience-conclusion') Object.assign(beat, { detailBeats: [{ pov: 'new-investigator', title: '线索', experience: '调查脚印', conclusion: '证人到访' }] });
      if (sample.mutation === 'provisionalName') Object.assign(output, { protagonistCandidate: { id: 'new-investigator', provisionalName: '林舟', role: '调查者', perspective: 'limited', initialKnown: [], hook: '线索', skillContext: '观察' } });
      if (sample.mutation === 'observedAt-paidAt') Object.assign(output.outline, { foreshadowing: [{ id: 'hint-one', item: '脚印', observedAt: 'act-one', paidAt: 'act-two', note: '到访', pov: 'new-investigator' }] });
      if (sample.mutation === 'existing') {
        input.narrativeIntent.protagonistId = input.narrativeIntent.protagonistCandidateId;
        delete input.narrativeIntent.protagonistCandidateId;
        delete output.protagonistCandidate;
      }
      const backend = { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(output) }; yield { type: 'finish' as const, reason: { kind: 'stop' as const } }; } };
      let accepted = false;
      try { await classifyNarrativeAdaptation(backend, input, { modelRef: 'test/model', credentialRef: 'test/key' }); accepted = true; } catch { /* Frozen negative cases must fail closed. */ }
      results.push({ id: sample.id, matched: accepted === sample.accepted });
      expect(accepted, sample.id).toBe(sample.accepted);
    }
    for (const split of [corpus.dev, corpus.heldOut]) {
      expect(results.filter(r => split.includes(r.id) && r.matched).length / split.length).toBeGreaterThanOrEqual(corpus.threshold);
    }
  });

  it('supplies the canonical nested schema to the model, including required candidate fields', () => {
    const prompt = buildNarrativeAdaptationPrompt(narrativeAdaptationInputSchema.parse(corpus.input));
    const schema = JSON.parse(prompt.split('\n').find(line => line.startsWith('{"$schema"'))!);
    const properties = schema.properties;
    expect(properties.protagonistCandidate.required).toEqual(['id', 'name', 'premise']);
    const beat = properties.outline.properties.acts.items.properties.beats.items.properties;
    expect(beat.conflictType.enum).toEqual(['internal', 'external', 'relational', 'world']);
    expect(beat.detailBeats.items.required).toEqual(['id', 'title', 'summary', 'pov', 'wordTarget', 'points', 'status']);
    expect(properties.outline.properties.foreshadowing.items.required).toEqual(['id', 'hint', 'payoff', 'status', 'knownBy']);
    expect(properties.protagonistCandidate.additionalProperties).toBe(false);
    expect(beat.detailBeats.items.additionalProperties).toBe(false);
  });
});
