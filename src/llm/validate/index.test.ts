import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  buildRuleCanonDetectorPrompt,
  detectRuleAndCanonHardConstraints,
  parseRuleCanonDetectorOutput,
  ruleCanonDetectionInputSchema,
} from './index.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const expectedViolationSchema = z.object({
  kind: z.enum(['immutable-rule', 'canon-conflict']),
  severity: z.literal('hard'),
  message: z.string().trim().min(1),
  references: z.array(z.string().trim().min(1)).min(1),
}).strict();
const sampleCaseSchema = ruleCanonDetectionInputSchema.extend({
  id: z.string().trim().min(1),
  expected: z.array(expectedViolationSchema),
});
const sampleCorpusSchema = z.object({
  iteration: z.literal('I21'),
  immutable: z.literal(true),
  threshold: z.number(),
  canonicalCaseIds: z.array(z.string()),
  heldOutCaseIds: z.array(z.string()),
  cases: z.array(sampleCaseSchema).min(15),
}).passthrough();

async function loadCorpus() {
  const text = await readFile(resolve(process.cwd(), 'samples/i21/cases.json'), 'utf8');
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

describe('I21 rule/canon hard-constraint detector', () => {
  it('limits prompt context to active immutable rules and supplied canon', () => {
    const prompt = buildRuleCanonDetectorPrompt({
      prose: '米拉点燃油灯。',
      rules: [
        { id: 'hard', statement: '人类不能施放魔法。', immutable: true, active: true },
        { id: 'soft', statement: '守卫通常有四人。', immutable: false, active: true },
        { id: 'inactive', statement: '港口封锁。', immutable: true, active: false },
      ],
      canon: [{ id: 'canon-1', summary: '林舟死亡。', detail: '葬于旧桥。' }],
    });
    expect(prompt).toContain('"id":"hard"');
    expect(prompt).not.toContain('"id":"soft"');
    expect(prompt).not.toContain('"id":"inactive"');
    expect(prompt).toContain('"id":"canon-1"');
    expect(prompt).toContain('不得检查知情泄漏');
  });

  it('returns hard findings and delegates the reject decision to I20', async () => {
    const seen: string[] = [];
    const result = await detectRuleAndCanonHardConstraints(backendReturning({
      violations: [{ kind: 'immutable-rule', severity: 'hard', message: '违反禁魔规则。', references: ['rule-no-magic'] }],
    }, seen), {
      prose: '米拉施放火球。',
      rules: [{ id: 'rule-no-magic', statement: '人类不能施放魔法。', immutable: true, active: true }],
      canon: [],
    }, settings);
    expect(result.adjudication.status).toBe('reject');
    expect(result.violations[0]).toMatchObject({ kind: 'immutable-rule', severity: 'hard' });
    expect(seen).toHaveLength(1);
  });

  it('fails closed for malformed JSON, soft severity, unknown fields, and unavailable LLM', async () => {
    expect(() => parseRuleCanonDetectorOutput('not json')).toThrow(/valid JSON/);
    expect(() => parseRuleCanonDetectorOutput('{"violations":[{"kind":"canon-conflict","severity":"soft","message":"x","references":["canon-1"]}]}')).toThrow();
    expect(() => parseRuleCanonDetectorOutput('{"violations":[],"extra":true}')).toThrow();
    await expect(detectRuleAndCanonHardConstraints(
      backendReturning({ violations: [{ kind: 'canon-conflict', severity: 'hard', message: '凭空正史。', references: ['missing-canon'] }] }),
      { prose: '文本', rules: [], canon: [] },
      settings,
    )).rejects.toThrow(/undisclosed/);
    await expect(detectRuleAndCanonHardConstraints(undefined, { prose: '文本', rules: [], canon: [] }, settings))
      .rejects.toThrow(/unavailable/);
  });

  it('regresses the frozen 15-case corpus, including its held-out subset', async () => {
    const corpus = await loadCorpus();
    const results: Array<{ id: string; matched: boolean; canonical: boolean; heldOut: boolean }> = [];
    for (const sample of corpus.cases) {
      const result = await detectRuleAndCanonHardConstraints(
        backendReturning({ violations: sample.expected }),
        { prose: sample.prose, rules: sample.rules, canon: sample.canon },
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
