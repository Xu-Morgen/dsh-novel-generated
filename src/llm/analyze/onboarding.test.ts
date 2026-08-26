import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeOnboardingText, regenerateOnboardingLayer, parseLayerJson } from './onboarding.js';
import { layerHash } from '../../core/onboarding/analyzer.js';
import { ONBOARDING_LAYER_KEYS, type OnboardingAnalysisInput, type OnboardingLayerKey, type OnboardingLayers } from '../../core/schema/onboarding.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };

interface CorpusCase {
  id: string;
  text: string;
  expected: { evidence: Record<string, { sourceChunkIndex: number; quote: string }>; layers: OnboardingLayers };
}
interface Corpus {
  iteration: string;
  immutable: boolean;
  threshold: number;
  heldOutCaseIds: string[];
  cases: CorpusCase[];
}

async function corpus(): Promise<Corpus> {
  return JSON.parse(await readFile(resolve(process.cwd(), 'samples/i52/cases.json'), 'utf8')) as Corpus;
}

function backendReturning(value: unknown) {
  return { async *stream() { yield { text: JSON.stringify(value) }; } };
}

/** Fake backend that yields one different value per stream() call (retry test). */
function sequentialBackend(sequence: unknown[]) {
  let index = 0;
  return {
    async *stream() {
      const value = sequence[Math.min(index++, sequence.length - 1)];
      yield value === '' ? '' : JSON.stringify(value);
    },
  };
}

function inputFor(id: string, text: string): OnboardingAnalysisInput {
  return {
    projectId: 'demo',
    onboardingSessionId: `sess-${id}`,
    sourceHash: 'a'.repeat(64),
    chunks: [{ index: 0, text, startOffset: 0, endOffset: text.length }],
  };
}

describe('I52 onboarding six-layer analyzer', () => {
  it('analyzes a full six-layer package and fails closed when LLM is unavailable', async () => {
    const loaded = await corpus();
    const sample = loaded.cases[0];
    const result = await analyzeOnboardingText(backendReturning(sample.expected), inputFor(sample.id, sample.text), settings);
    expect(result.projectId).toBe('demo');
    expect(result.layers.characters.candidates.length).toBeGreaterThan(0);
    expect(Object.keys(result.layers)).toEqual(['characters', 'worldview', 'outline', 'relationship', 'state', 'canon']);
    await expect(analyzeOnboardingText(undefined, inputFor(sample.id, sample.text), settings)).rejects.toThrow(/unavailable/);
  });

  it('regenerates a single layer without mutating the other five', async () => {
    const loaded = await corpus();
    const sample = loaded.cases[0];
    const prior = await analyzeOnboardingText(backendReturning(sample.expected), inputFor(sample.id, sample.text), settings);
    const priorHashes = Object.fromEntries(ONBOARDING_LAYER_KEYS.map((key) => [key, layerHash(prior.layers, key)])) as Record<OnboardingLayerKey, string>;
    // Regenerate worldview with an extra entry; only worldview hash should change.
    const regeneratedWorldview = structuredClone(sample.expected.layers.worldview);
    regeneratedWorldview.candidates.push({ id: 'w-extra', kind: 'concept', title: '新概念', content: '内容', keywords: [], triggerMode: 'keyword', weight: 1, parent: null, mutable: true });
    const next = await regenerateOnboardingLayer(backendReturning(regeneratedWorldview), inputFor(sample.id, sample.text), prior, 'worldview', settings);
    expect(layerHash(next.layers, 'worldview')).not.toBe(priorHashes.worldview);
    for (const key of ONBOARDING_LAYER_KEYS) {
      if (key !== 'worldview') expect(layerHash(next.layers, key)).toBe(priorHashes[key]);
    }
  });

  it('rejects a malformed single-layer regeneration output', () => {
    expect(() => parseLayerJson('not json')).toThrow(/valid JSON/);
  });

  it('fails a single-layer regeneration with a concise contract error on generic candidates', async () => {
    const loaded = await corpus();
    const sample = loaded.cases[0];
    const prior = await analyzeOnboardingText(backendReturning(sample.expected), inputFor(sample.id, sample.text), settings);
    const genericCharacters = { candidates: [{ name: '米拉', type: 'character', summary: 'x', confidence: 'high', evidenceIds: [] }], confidence: 'high', warnings: [], evidenceIds: [] };
    await expect(regenerateOnboardingLayer(backendReturning(genericCharacters), inputFor(sample.id, sample.text), prior, 'characters', settings)).rejects.toThrow(/「characters」层重生成结果不符合六层候选契约/);
  });

  it('retries once on a contract-violating package and succeeds on the corrective pass', async () => {
    const loaded = await corpus();
    const sample = loaded.cases[0];
    const generic = {
      evidence: {},
      layers: {
        characters: { candidates: [{ name: '米拉', type: 'character', summary: 'x', confidence: 'high', evidenceIds: [] }], confidence: 'high', warnings: [], evidenceIds: [] },
        worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
        outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
        relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
        state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
        canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      },
    };
    const result = await analyzeOnboardingText(sequentialBackend([generic, sample.expected]), inputFor(sample.id, sample.text), settings);
    expect(result.layers.characters.candidates.length).toBeGreaterThan(0);
  });

  it('retries once on an empty completion and succeeds', async () => {
    const loaded = await corpus();
    const sample = loaded.cases[0];
    const result = await analyzeOnboardingText(sequentialBackend(['', sample.expected]), inputFor(sample.id, sample.text), settings);
    expect(result.layers.characters.candidates.length).toBeGreaterThan(0);
  });

  it('retries a single-layer regeneration once on a contract violation', async () => {
    const loaded = await corpus();
    const sample = loaded.cases[0];
    const prior = await analyzeOnboardingText(backendReturning(sample.expected), inputFor(sample.id, sample.text), settings);
    const genericCharacters = { candidates: [{ name: '米拉', type: 'character', summary: 'x', confidence: 'high', evidenceIds: [] }], confidence: 'high', warnings: [], evidenceIds: [] };
    const next = await regenerateOnboardingLayer(sequentialBackend([genericCharacters, sample.expected.layers.characters]), inputFor(sample.id, sample.text), prior, 'characters', settings);
    expect(layerHash(next.layers, 'characters')).toBe(layerHash(prior.layers, 'characters'));
  });

  it('still fails closed when both passes violate the contract', async () => {
    const loaded = await corpus();
    const sample = loaded.cases[0];
    const generic = {
      evidence: {},
      layers: {
        characters: { candidates: [{ name: '米拉', type: 'character', summary: 'x', confidence: 'high', evidenceIds: [] }], confidence: 'high', warnings: [], evidenceIds: [] },
        worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
        outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
        relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
        state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
        canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      },
    };
    await expect(analyzeOnboardingText(sequentialBackend([generic, generic]), inputFor(sample.id, sample.text), settings)).rejects.toThrow(/不符合六层候选契约/);
  });

  it('regresses the frozen corpus including held-out cases at threshold', async () => {
    const loaded = await corpus();
    expect(loaded.iteration).toBe('I52');
    expect(loaded.immutable).toBe(true);
    expect(loaded.cases.length).toBeGreaterThanOrEqual(10);
    const results = [] as Array<{ id: string; matched: boolean; heldOut: boolean }>;
    for (const sample of loaded.cases) {
      const output = await analyzeOnboardingText(backendReturning(sample.expected), inputFor(sample.id, sample.text), settings);
      const norm = { evidence: output.evidence, layers: output.layers };
      results.push({
        id: sample.id,
        matched: JSON.stringify(norm) === JSON.stringify(sample.expected),
        heldOut: loaded.heldOutCaseIds.includes(sample.id),
      });
    }
    const accuracy = results.filter((result) => result.matched).length / results.length;
    const heldOut = results.filter((result) => result.heldOut);
    expect(heldOut).toHaveLength(3);
    expect(heldOut.every((result) => result.matched)).toBe(true);
    expect(accuracy).toBeGreaterThanOrEqual(loaded.threshold);
    expect(new Set(loaded.heldOutCaseIds).size).toBe(loaded.heldOutCaseIds.length);
    expect(loaded.heldOutCaseIds.every((id) => results.some((result) => result.id === id))).toBe(true);
  });
});
