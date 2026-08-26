import { describe, expect, it } from 'vitest';
import {
  assertFreeText,
  assertOnboardingOutput,
  buildOnboardingPrompt,
  buildRegeneratePrompt,
  byteLength,
  layerHash,
  layerHashes,
  ONBOARDING_PROMPT_EXAMPLE,
  parseOnboardingOutput,
  reduceOnboardingResult,
  FREE_TEXT_MAX_BYTES,
} from './analyzer.js';
import { ONBOARDING_LAYER_KEYS, type OnboardingAnalysisInput, type OnboardingAnalysisOutput, type OnboardingLayers } from '../schema/onboarding.js';

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

const analysisInput: OnboardingAnalysisInput = {
  projectId: 'demo',
  onboardingSessionId: 'sess-1',
  sourceHash: 'a'.repeat(64),
  chunks: [{ index: 0, text: '北港位于内海西岸。米拉是一名测绘师。', startOffset: 0, endOffset: 21 }],
};

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

  it('embeds a schema-valid full six-layer example and per-layer contracts in the analysis prompt', () => {
    const prompt = buildOnboardingPrompt(analysisInput);
    // Concrete nested keys must be present (previously the example showed only
    // empty candidates, which let the model invent its own shape).
    expect(prompt).toContain('"triggerMode"');
    expect(prompt).toContain('"detailBeats"');
    expect(prompt).toContain('"arc"');
    expect(prompt).toContain('"storyTime"');
    // Outline nested shapes: the reported failure was string foreshadowing and
    // an invalid conflictType — both must be spelled out as objects/enums.
    expect(prompt).toContain('"payoff"');
    expect(prompt).toContain('"knownBy"');
    expect(prompt).toContain('"conditions"');
    expect(prompt).toContain('conflictType(internal|external|relational|world)');
    // Relationship numeric/id-reference rules: the reported failure was string
    // affinity/trust and a Chinese-phrase milestone.
    expect(prompt).toContain('affinity(整数,-100..100)');
    expect(prompt).toContain('ASCII 小写字母');
    expect(prompt).toMatch(/禁止中文、空格与自然语言短语/);
    expect(prompt).toMatch(/禁止.*(type|name|summary|confidence|evidenceIds)/);
    // The embedded example itself must be a valid I52 envelope, so the model
    // always sees a parseable reference shape (including foreshadowing/endings).
    const parsedExample = parseOnboardingOutput(JSON.stringify(ONBOARDING_PROMPT_EXAMPLE));
    expect(parsedExample.layers.characters.candidates[0].kind).toBe('protagonist');
    const exampleOutline = parsedExample.layers.outline.candidates[0];
    expect(exampleOutline.foreshadowing[0].status).toBe('planted');
    expect(exampleOutline.endings[0].conditions.length).toBeGreaterThan(0);
    const exampleRelationship = parsedExample.layers.relationship.candidates[0];
    expect(exampleRelationship.affinity).toBe(40);
    expect(exampleRelationship.trust).toBe(30);
    expect(exampleRelationship.from).toBe('mira');
    expect(exampleRelationship.to).toBe('laozhou');
  });

  it('embeds the exact target layer candidate example in regenerate prompts', () => {
    for (const layer of ONBOARDING_LAYER_KEYS) {
      const prompt = buildRegeneratePrompt(analysisInput, layer);
      expect(prompt).toContain('candidates');
      expect(prompt).toContain(JSON.stringify(ONBOARDING_PROMPT_EXAMPLE.layers[layer].candidates).slice(0, 40));
    }
  });

  it('reports a concise actionable error for a shape-collapsed generic model output', () => {
    // Regression fixture: the model ignored every per-layer contract and
    // produced generic {type,name,summary,confidence,evidenceIds} candidates.
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
    let caught: unknown;
    try {
      parseOnboardingOutput(JSON.stringify(generic));
      throw new Error('unreachable');
    } catch (error) {
      caught = error;
    }
    const message = (caught as Error).message;
    expect(message).toMatch(/不符合六层候选契约/);
    expect(message).toMatch(/请重试分析/);
    // The raw multi-hundred-line issue dump must not reach the user.
    expect(message.length).toBeLessThan(600);
    // Full diagnostics remain available server-side on `cause`.
    expect((caught as Error & { cause?: unknown }).cause).toBeDefined();
  });
});
