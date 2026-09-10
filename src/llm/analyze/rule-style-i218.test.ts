import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ruleKindSchema, ruleScopeSchema } from '../../core/schema/rules.js';
import { ruleStyleFailureMessage } from '../../host/rule-style-failure.js';
import { buildRuleStyleImportPrompt, parseRuleStyleImportCandidate, RULE_STYLE_IMPORT_PROMPT_EXAMPLE } from './rule-style-import-initialization.js';

const samples = JSON.parse(readFileSync('samples/rule-style-i218.json', 'utf8')) as { threshold: number; cases: { id: string; split: string; kinds: string[]; valid: boolean }[] };

describe('I218 frozen rule/style format regression', () => {
  it.each(['dev', 'held-out'])('%s meets the frozen acceptance threshold', (split) => {
    const cases = samples.cases.filter(sample => sample.split === split);
    let correct = 0;
    for (const sample of cases) {
      const candidate = JSON.parse(RULE_STYLE_IMPORT_PROMPT_EXAMPLE);
      candidate.rules = sample.kinds.map((kind, index) => ({ ...candidate.rules[0], id: `rule-${index}`, kind }));
      let valid = true;
      try { parseRuleStyleImportCandidate(JSON.stringify(candidate)); } catch (error) {
        valid = false;
        expect(ruleStyleFailureMessage(error)).toContain('kind');
        expect(ruleStyleFailureMessage(error).length).toBeLessThanOrEqual(4000);
        if (sample.id === 'held-out-invalid') expect((error as Error).message.length).toBeGreaterThan(4000);
      }
      if (valid === sample.valid) correct += 1;
    }
    expect(cases.length).toBeGreaterThan(0);
    expect(correct / cases.length).toBeGreaterThanOrEqual(samples.threshold);
  });

  it('injects every canonical scope and kind without broadening the schema', () => {
    const prompt = buildRuleStyleImportPrompt({ sourceText: 'fixture', intent: { sourceRole: 'idea', treatment: 'expand-outline' } });
    for (const value of [...ruleScopeSchema.options, ...ruleKindSchema.options]) expect(prompt).toContain(value);
    expect(ruleKindSchema.safeParse('character').success).toBe(false);
  });

  it('bounds non-schema errors and hides rejected values in schema diagnostics', () => {
    expect(ruleStyleFailureMessage(new Error('x'.repeat(9000))).length).toBeLessThanOrEqual(4000);
    const candidate = JSON.parse(RULE_STYLE_IMPORT_PROMPT_EXAMPLE);
    candidate.rules[0].kind = 'private-rejected-value';
    try { parseRuleStyleImportCandidate(JSON.stringify(candidate)); throw new Error('expected rejection'); } catch (error) {
      expect(ruleStyleFailureMessage(error)).not.toContain('private-rejected-value');
      expect(ruleStyleFailureMessage(error)).toContain('kind');
    }
  });
});
