import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { narrativeAdaptationInputSchema, narrativeAdaptationOutputSchema } from '../../core/schema/narrative-adaptation.js';
import { narrativeRevealInputSchema, narrativeRevealOutputSchema } from '../../core/schema/narrative-reveal.js';
import { classifyNarrativeAdaptation } from './narrative-adaptation.js';
import { buildNarrativeRevealPrompt, planNarrativeReveal } from './narrative-reveal.js';
import { applyReferenceRepair } from './narrative-repair.js';
import { LLM_BACKEND_MARKER, type GenerationRequest } from '../port/index.js';

const settings = { modelRef: 'test/model', credentialRef: 'test/key' };
const base = JSON.parse(readFileSync('samples/i200/cases.json', 'utf8'));
it('renders reveal examples with actual character, evidence and beat ids instead of placeholder aliases', () => {
  const input = narrativeRevealInputSchema.parse({ ...base.input, b5CandidateId: 'candidate', characterIds: ['new-investigator'], b5Anchors: [{ id: 'b7', actId: 'act-3', beatId: 'b7', label: '调查' }] });
  const prompt = buildNarrativeRevealPrompt(input);
  const example = JSON.parse(prompt.split('\n').find(line => line.startsWith('{"confidence"'))!);
  expect(example.entries[0].revealPlan).toEqual({ revealTo: ['new-investigator'], revealAt: 'b7' });
  expect(example.states).toEqual([{ characterId: 'new-investigator', knows: [] }]);
  expect(example.entries[0].evidenceParagraphIds).toEqual(['paragraph-0001']);
});
it('I203 frozen reference repair dev/held-out corpus reaches 1.0 without narrative edits', async () => {
  const corpus = JSON.parse(readFileSync('samples/i203/cases.json', 'utf8'));
  expect(corpus.immutable).toBe(true); expect(corpus.threshold).toBe(1);
  const results = new Map<string, boolean>();
  for (const sample of corpus.cases) {
    const input = narrativeAdaptationInputSchema.parse(base.input);
    const original = narrativeAdaptationOutputSchema.parse(base.output);
    original.outline.acts[0].beats[0].charactersInvolved = ['archivist'];
    const invalid = structuredClone(original); invalid.outline.acts[0].beats[0].charactersInvolved = ['alias'];
    const revealInput = narrativeRevealInputSchema.parse({ ...input, b5CandidateId: 'candidate', characterIds: ['archivist', 'new-investigator'], b5Anchors: [{ id: 'b7', actId: 'act-3', beatId: 'b7', label: '调查线索' }] });
    const reveal = narrativeRevealOutputSchema.parse({ confidence: 'high', entries: [{ id: 'secret-one', fact: '档案有第二个版本', kind: 'secret', holders: ['archivist'], revealPlan: { revealTo: ['new-investigator'], revealAt: 'b7' }, status: 'hidden', evidenceParagraphIds: ['paragraph-0001'] }], states: [{ characterId: 'archivist', knows: ['secret-one'] }, { characterId: 'new-investigator', knows: [] }], rationale: '先调查再揭示' });
    const badReveal = structuredClone(reveal);
    if (sample.mutation === 'anchor') badReveal.entries[0].revealPlan.revealAt = 'act-3-beat-7';
    if (sample.mutation === 'state') badReveal.states[0].characterId = 'alias';
    let calls = 0; const progress: number[] = [];
    const backend = { [LLM_BACKEND_MARKER]: true as const, async *stream(request: GenerationRequest) {
      calls++;
      if (calls === 1) { yield JSON.stringify(sample.stage === 'adaptation' ? invalid : badReveal); return; }
      const line = request.prompt.split('\n').find(line => line.startsWith('校验错误：'))!;
      const issues = JSON.parse(line.slice('校验错误：'.length));
      const replacements = issues.map((issue: { path: (string | number)[]; code: string; actual: string }) => ({ path: issue.path, value: issue.code === 'unknown-anchor' ? 'b7' : 'archivist' }));
      if (sample.mutation === 'narrative-patch') replacements[0].path = ['outline', 'logline'];
      if (sample.mutation === 'unknown-value' || sample.mutation === 'unchanged') replacements[0].value = 'alias';
      yield JSON.stringify({ replacements });
    } };
    let accepted = false; let actualOutput: unknown;
    try {
      const output = sample.stage === 'adaptation'
        ? await classifyNarrativeAdaptation(backend, input, settings, undefined, { characters: [{ id: 'archivist', name: '档案管理员' }], onRepair: attempt => progress.push(attempt) })
        : await planNarrativeReveal(backend, revealInput, settings, undefined, { onRepair: attempt => progress.push(attempt) });
      accepted = true; actualOutput = output;
    } catch { /* Frozen negative patches must fail closed. */ }
    expect(accepted, sample.id).toBe(sample.accepted); expect(calls).toBe(sample.accepted ? 2 : 3); expect(progress).toEqual(sample.accepted ? [1] : [1, 2]);
    if (accepted) expect(actualOutput).toEqual(sample.stage === 'adaptation' ? original : reveal);
    results.set(sample.id, accepted === sample.accepted);
  }
  for (const split of [corpus.dev, corpus.heldOut] as string[][]) expect(split.filter(id => results.get(id)).length / split.length).toBeGreaterThanOrEqual(corpus.threshold);
});

it('retries malformed JSON only within the current stage and propagates cancellation without further calls', async () => {
  const input = narrativeAdaptationInputSchema.parse(base.input); let calls = 0;
  const backend = { [LLM_BACKEND_MARKER]: true as const, async *stream() { calls++; yield calls === 1 ? '{broken' : JSON.stringify(base.output); } };
  expect(await classifyNarrativeAdaptation(backend, input, settings, undefined, { characters: [] })).toEqual(base.output); expect(calls).toBe(2);
  const controller = new AbortController(); calls = 0;
  await expect(classifyNarrativeAdaptation(backend, input, settings, controller.signal, { characters: [], onRepair: () => controller.abort() })).rejects.toThrow(/cancel/i);
  expect(calls).toBe(1);
});

it('rejects duplicate, prototype and stale patch paths without touching the source', () => {
  const source = { id: 'bad', content: 'original' }; const issue = { path: ['id'], code: 'unknown-character' as const, actual: 'bad', allowed: ['good'] };
  expect(() => applyReferenceRepair(source, [issue], { replacements: [{ path: ['id'], value: 'good' }, { path: ['id'], value: 'good' }] })).toThrow();
  expect(() => applyReferenceRepair(source, [{ ...issue, path: ['__proto__'] }], { replacements: [{ path: ['__proto__'], value: 'good' }] })).toThrow();
  expect(() => applyReferenceRepair(source, [{ ...issue, actual: 'stale' }], { replacements: [{ path: ['id'], value: 'good' }] })).toThrow();
  expect(source).toEqual({ id: 'bad', content: 'original' });
});
