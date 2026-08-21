import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeLeakDetectorPrompt,
  detectKnowledgeLeakHardConstraints,
  knowledgeLeakDetectionInputSchema,
  parseKnowledgeLeakDetectorOutput,
} from './knowledge.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const expectedViolationSchema = z.object({
  kind: z.literal('knowledge-leak'),
  severity: z.literal('hard'),
  message: z.string().trim().min(1),
  references: z.array(z.string().trim().min(1)).min(1),
}).strict();
const sampleCaseSchema = knowledgeLeakDetectionInputSchema.extend({
  id: z.string().trim().min(1),
  expected: z.array(expectedViolationSchema),
});
const sampleCorpusSchema = z.object({
  iteration: z.literal('I22'),
  immutable: z.literal(true),
  threshold: z.number(),
  canonicalCaseIds: z.array(z.string()),
  heldOutCaseIds: z.array(z.string()),
  cases: z.array(sampleCaseSchema).min(15),
}).passthrough();

async function loadCorpus() {
  const text = await readFile(resolve(process.cwd(), 'samples/i22/cases.json'), 'utf8');
  return sampleCorpusSchema.parse(JSON.parse(text));
}

function backendReturning(response: unknown, seen?: string[]) {
  return {
    async *stream(request: { prompt: string }) {
      seen?.push(request.prompt);
      yield JSON.stringify(response);
    },
  };
}

function detectionInput() {
  return {
    prose: '米拉知道北港暗门只能在退潮时开启。', pov: 'mira',
    entries: [
      { id: 'known-route', version: 1, fact: '仓库有一条逃生路线。', kind: 'plotpoint' as const, holders: ['mira', 'lin'], revealPlan: { revealTo: [], revealAt: 'now' }, status: 'revealed' as const },
      { id: 'secret-gate', version: 1, fact: '北港暗门只能在退潮时开启。', kind: 'secret' as const, holders: ['lin'], revealPlan: { revealTo: ['mira'], revealAt: 'act-2' }, status: 'hidden' as const },
    ],
    states: [{ characterId: 'mira', knows: ['known-route'] }, { characterId: 'lin', knows: ['known-route', 'secret-gate'] }],
  };
}

describe('I22 POV knowledge-leak hard-constraint detector', () => {
  it('derives the permitted POV context through I18 filtering and keeps C3 graph internals out of the prompt', () => {
    const prompt = buildKnowledgeLeakDetectorPrompt(detectionInput());
    expect(prompt).toContain('"id":"known-route"');
    expect(prompt).toContain('"id":"secret-gate"');
    expect(prompt).toContain('POV 已知事实');
    expect(prompt).toContain('受保护的未知事实');
    expect(prompt).not.toContain('"holders"');
    expect(prompt).not.toContain('"knows"');
    expect(prompt).not.toContain('"revealPlan"');
    expect(prompt).toContain('不得检查规则、正史、关系、风格、大纲或任何软约束');
  });

  it('returns hard knowledge leaks and delegates the reject decision to I20', async () => {
    const seen: string[] = [];
    const result = await detectKnowledgeLeakHardConstraints(backendReturning({
      violations: [{ kind: 'knowledge-leak', severity: 'hard', message: '米拉知晓了暗门秘密。', references: ['secret-gate'] }],
    }, seen), detectionInput(), settings);
    expect(result.adjudication.status).toBe('reject');
    expect(result.violations[0]).toMatchObject({ kind: 'knowledge-leak', severity: 'hard' });
    expect(seen).toHaveLength(1);
  });

  it('fails closed for malformed JSON, non-hard findings, unknown references, POV-visible references, and unavailable LLM', async () => {
    expect(() => parseKnowledgeLeakDetectorOutput('not json')).toThrow(/valid JSON/);
    expect(() => parseKnowledgeLeakDetectorOutput('{"violations":[{"kind":"knowledge-leak","severity":"soft","message":"x","references":["secret-gate"]}]}')).toThrow();
    expect(() => parseKnowledgeLeakDetectorOutput('{"violations":[],"extra":true}')).toThrow();
    await expect(detectKnowledgeLeakHardConstraints(
      backendReturning({ violations: [{ kind: 'knowledge-leak', severity: 'hard', message: '凭空秘密。', references: ['missing-secret'] }] }),
      detectionInput(), settings,
    )).rejects.toThrow(/unknown or POV-visible/);
    await expect(detectKnowledgeLeakHardConstraints(
      backendReturning({ violations: [{ kind: 'knowledge-leak', severity: 'hard', message: '已知路线不构成泄漏。', references: ['known-route'] }] }),
      detectionInput(), settings,
    )).rejects.toThrow(/unknown or POV-visible/);
    await expect(detectKnowledgeLeakHardConstraints(undefined, detectionInput(), settings)).rejects.toThrow(/unavailable/);
  });

  it('regresses the frozen 15-case corpus, including its held-out subset', async () => {
    const corpus = await loadCorpus();
    const results: Array<{ id: string; matched: boolean; canonical: boolean; heldOut: boolean }> = [];
    for (const sample of corpus.cases) {
      const result = await detectKnowledgeLeakHardConstraints(
        backendReturning({ violations: sample.expected }),
        { prose: sample.prose, pov: sample.pov, entries: sample.entries, states: sample.states },
        settings,
      );
      const matched = JSON.stringify(result.violations) === JSON.stringify(sample.expected)
        && result.adjudication.status === (sample.expected.length > 0 ? 'reject' : 'pass');
      results.push({
        id: sample.id,
        matched,
        canonical: corpus.canonicalCaseIds.includes(sample.id),
        heldOut: corpus.heldOutCaseIds.includes(sample.id),
      });
    }
    const accuracy = results.filter((result) => result.matched).length / results.length;
    const canonical = results.filter((result) => result.canonical);
    const heldOut = results.filter((result) => result.heldOut);
    expect(results).toHaveLength(15);
    expect(accuracy).toBeGreaterThanOrEqual(corpus.threshold);
    expect(canonical).toHaveLength(5);
    expect(canonical.every((result) => result.matched)).toBe(true);
    expect(heldOut).toHaveLength(5);
    expect(heldOut.every((result) => result.matched)).toBe(true);
    expect(new Set(corpus.canonicalCaseIds).size).toBe(corpus.canonicalCaseIds.length);
    expect(new Set(corpus.heldOutCaseIds).size).toBe(corpus.heldOutCaseIds.length);
    expect(corpus.heldOutCaseIds.every((id) => !corpus.canonicalCaseIds.includes(id))).toBe(true);
    expect(corpus.canonicalCaseIds.concat(corpus.heldOutCaseIds).every((id) => results.some((result) => result.id === id))).toBe(true);
  });
});
