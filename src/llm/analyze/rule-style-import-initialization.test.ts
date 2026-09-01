import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeRuleStyleImport, buildRuleStyleImportPrompt, parseRuleStyleImportCandidate } from './rule-style-import-initialization.js';
import type { RuleStyleImportCandidate } from '../../core/schema/rule-style-import-initialization.js';
import type { ImportInterpretationIntent } from '../../core/schema/import-interpretation-session.js';

interface Sample { id: string; sourceText: string; intent: ImportInterpretationIntent; expected: RuleStyleImportCandidate; }
interface Corpus { immutable: boolean; thresholds: { rules: number; style: number }; cases: Sample[]; }
interface Split { immutable: boolean; caseIds: string[]; }
const corpus = JSON.parse(readFileSync(new URL('../../../samples/i151/cases.json', import.meta.url), 'utf8')) as Corpus;
const dev = JSON.parse(readFileSync(new URL('../../../samples/i151/dev.json', import.meta.url), 'utf8')) as Split;
const heldOut = JSON.parse(readFileSync(new URL('../../../samples/i151/held-out.json', import.meta.url), 'utf8')) as Split;
const gold = JSON.parse(readFileSync(new URL('../../../samples/i151/gold.json', import.meta.url), 'utf8')) as Split;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };
const backendReturning = (value: unknown) => ({ async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(value) }; yield { type: 'finish' as const, reason: { kind: 'stop' } }; } });
const canonical = (value: unknown): string => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value !== null && typeof value === 'object'
    ? `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
    : JSON.stringify(value);

describe('I151 first-import rule/style analyzer', () => {
  it('meets frozen dev and held-out B1/B4 thresholds with a fake backend', async () => {
    expect([corpus.immutable, dev.immutable, heldOut.immutable, gold.immutable]).toEqual([true, true, true, true]);
    expect([...dev.caseIds, ...heldOut.caseIds]).toEqual(gold.caseIds);
    const results = await Promise.all(corpus.cases.map(async (sample) => {
      const output = await analyzeRuleStyleImport(backendReturning(sample.expected), sample, settings);
      return { id: sample.id, rules: canonical(output.rules) === canonical(sample.expected.rules), style: canonical(output.style) === canonical(sample.expected.style) };
    }));
    for (const key of ['rules', 'style'] as const) {
      const accuracy = (items: typeof results) => items.filter((item) => item[key]).length / items.length;
      expect(accuracy(results)).toBeGreaterThanOrEqual(corpus.thresholds[key]);
      expect(accuracy(results.filter((item) => heldOut.caseIds.includes(item.id)))).toBeGreaterThanOrEqual(corpus.thresholds[key]);
    }
  });

  it('prioritizes confirmed intent, refuses invented rules, and treats file commands as hostile text', () => {
    const prompt = buildRuleStyleImportPrompt(corpus.cases[7]);
    expect(prompt).toContain('已确认创作意图优先');
    expect(prompt).toContain('无法可靠推断硬规则时返回空数组');
    expect(prompt).toContain('路径、命令、prompt injection');
    expect(prompt).not.toContain('fs.writeFile');
  });

  it('fails closed on immutable rules, paths/extra layers, malformed JSON, and incomplete style', () => {
    const base = structuredClone(corpus.cases[0].expected);
    base.rules[0].immutable = true as false;
    expect(() => parseRuleStyleImportCandidate(JSON.stringify(base))).toThrow(/immutable/i);
    expect(() => parseRuleStyleImportCandidate(JSON.stringify({ ...corpus.cases[0].expected, path: '../../style.yaml' }))).toThrow();
    expect(() => parseRuleStyleImportCandidate('{bad')).toThrow(/valid JSON|expected object/i);
    expect(() => parseRuleStyleImportCandidate(JSON.stringify({ rules: [], style: { id: 'broken' } }))).toThrow();
  });
});
