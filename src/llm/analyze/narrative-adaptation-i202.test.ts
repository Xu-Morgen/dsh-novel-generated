import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { narrativeAdaptationInputSchema, narrativeAdaptationOutputSchema } from '../../core/schema/narrative-adaptation.js';
import { buildNarrativeAdaptationPrompt, classifyNarrativeAdaptation } from './narrative-adaptation.js';
import { LLM_BACKEND_MARKER } from '../port/index.js';

it('I202 frozen compact dev/held-out corpus meets threshold without relaxing canonical validation', async () => {
  const corpus = JSON.parse(readFileSync('samples/i202/cases.json', 'utf8'));
  const base = JSON.parse(readFileSync(corpus.baseCorpus, 'utf8'));
  expect(corpus.immutable).toBe(true); expect(corpus.threshold).toBe(1);
  const results = new Map<string, boolean>();
  for (const sample of corpus.cases) {
    const input = narrativeAdaptationInputSchema.parse(base.input);
    const output = narrativeAdaptationOutputSchema.parse(base.output);
    output.outline.acts.forEach(act => act.beats.forEach(beat => { beat.detailBeats = []; }));
    if (sample.mutation === 'existing') { input.narrativeIntent.protagonistId = input.narrativeIntent.protagonistCandidateId; delete input.narrativeIntent.protagonistCandidateId; delete output.protagonistCandidate; }
    if (sample.mutation === 'invalid-conflict') Object.assign(output.outline.acts[0].beats[0], { conflictType: 'social' });
    const raw: Record<string, unknown> = { ...output };
    if (sample.mutation === 'missing-outline') delete raw.outline;
    if (sample.mutation === 'missing-rationale') delete raw.rationale;
    if (sample.mutation === 'missing-evidence') delete raw.evidenceParagraphIds;
    let accepted = false;
    try { await classifyNarrativeAdaptation({ [LLM_BACKEND_MARKER]: true, async *stream() { yield JSON.stringify(raw); } }, input, { modelRef: 'test/model', credentialRef: 'test/key' }); accepted = true; } catch { /* Frozen negatives must fail. */ }
    results.set(sample.id, accepted === sample.accepted);
    expect(accepted, sample.id).toBe(sample.accepted);
  }
  for (const split of [corpus.dev, corpus.heldOut] as string[][]) expect(split.filter(id => results.get(id)).length / split.length).toBeGreaterThanOrEqual(corpus.threshold);
  const prompt = buildNarrativeAdaptationPrompt(narrativeAdaptationInputSchema.parse(base.input));
  expect(prompt).toContain('detailBeats 必须输出 []');
  expect(prompt).toContain('每幕最多 3 个核心节拍');
});
