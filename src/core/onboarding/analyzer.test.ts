import { describe, expect, it } from 'vitest';
import {
  assertFreeText,
  assertOnboardingOutput,
  byteLength,
  layerHash,
  layerHashes,
  parseOnboardingOutput,
  reduceOnboardingResult,
  FREE_TEXT_MAX_BYTES,
} from './analyzer.js';
import { ONBOARDING_LAYER_KEYS, type OnboardingAnalysisOutput, type OnboardingLayers } from '../schema/onboarding.js';

function emptyLayers(): OnboardingLayers {
  return {
    characters: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  };
}

function output(overrides: Partial<OnboardingAnalysisOutput> = {}): OnboardingAnalysisOutput {
  return {
    evidence: { e1: { sourceChunkIndex: 0, quote: '原文' } },
    layers: emptyLayers(),
    ...overrides,
  };
}

const session = { projectId: 'demo', onboardingSessionId: 'sess-1', sourceHash: 'a'.repeat(64) };

describe('I52 onboarding analyzer core', () => {
  it('normalizes free text and rejects empty/NUL/oversized before the LLM', () => {
    expect(assertFreeText('  你好\r\n世界  ')).toBe('你好\n世界');
    expect(() => assertFreeText('   ')).toThrow(/empty/);
    expect(() => assertFreeText('a\u0000b')).toThrow(/NUL/);
    expect(() => assertFreeText('x'.repeat(FREE_TEXT_MAX_BYTES + 1))).toThrow(/2 MiB/);
    expect(byteLength('中文')).toBe(6);
  });

  it('parses a strict JSON envelope and rejects markdown/extra fields', () => {
    const good = output();
    expect(parseOnboardingOutput(JSON.stringify(good))).toEqual(good);
    expect(() => parseOnboardingOutput('```json\n{"evidence":{},"layers":{}}')).toThrow(/valid JSON/);
    expect(() => parseOnboardingOutput(JSON.stringify({ ...good, extra: 1 }))).toThrow();
  });

  it('rejects unreachable evidence ids and cross-layer id collisions', () => {
    const unreachable = output();
    (unreachable.layers.characters as { evidenceIds: string[] }).evidenceIds = ['missing'];
    expect(() => assertOnboardingOutput(unreachable)).toThrow(/Unknown evidence/);

    const collision = output();
    collision.layers.characters.candidates = [{ id: 'dup', name: '角色', aliases: [], kind: 'protagonist', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }];
    collision.layers.worldview.candidates = [{ id: 'dup', kind: 'concept', title: '概念', content: '内容', keywords: [], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }];
    expect(() => assertOnboardingOutput(collision)).toThrow(/collides across layers/);
  });

  it('rejects non-empty B3 forward refs and any C3/items/factions/globalFlags leakage', () => {
    const badArc = output();
    badArc.layers.characters.candidates = [{ id: 'a', name: '角色', aliases: [], kind: 'protagonist', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: ['不该有'] }, relationships: [], knowledgeIds: [] }];
    expect(() => assertOnboardingOutput(badArc)).toThrow(/arc.keyBeats must be empty/);

    const badRel = output();
    badRel.layers.characters.candidates = [{ id: 'b', name: '角色', aliases: [], kind: 'protagonist', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: ['other'], knowledgeIds: [] }];
    expect(() => assertOnboardingOutput(badRel)).toThrow(/must not infer relationships/);
  });

  it('reduces a bound result and fingerprints each layer deterministically', () => {
    const reduced = reduceOnboardingResult(session, output());
    expect(reduced.projectId).toBe('demo');
    expect(reduced.onboardingSessionId).toBe('sess-1');
    expect(reduced.sourceHash).toBe('a'.repeat(64));
    expect(Object.keys(reduced.layers)).toEqual(ONBOARDING_LAYER_KEYS);
    const hashes = layerHashes(reduced.layers);
    for (const key of ONBOARDING_LAYER_KEYS) {
      expect(hashes[key]).toBe(layerHash(reduced.layers, key));
    }
    // Isolation: mutating one layer changes only its own hash.
    const mutated = structuredClone(reduced.layers);
    mutated.worldview.candidates = [{ id: 'w', kind: 'concept', title: '新', content: '内容', keywords: [], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }];
    const mutatedHashes = layerHashes(mutated);
    expect(mutatedHashes.worldview).not.toBe(hashes.worldview);
    for (const key of ONBOARDING_LAYER_KEYS) {
      if (key !== 'worldview') expect(mutatedHashes[key]).toBe(hashes[key]);
    }
  });
});
