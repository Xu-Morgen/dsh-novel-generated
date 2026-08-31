import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTextChangeDelta, textChangeHash } from '../../core/text-change-impact/index.js';
import { textChangeDeltaSchema, type TextChangeClassification } from '../../core/schema/text-change-impact.js';
import { classifyTextChangeImpact, type TextChangeImpactParserInput } from './text-change-impact.js';

interface CorpusCase {
  id: string;
  before: string;
  after: string;
  expected: {
    classification: TextChangeClassification;
    pureFormatting: boolean;
    affectedDetailBeatIds: string[];
  };
}

interface Corpus {
  immutable: boolean;
  threshold: number;
  canonicalCaseIds: string[];
  heldOutCaseIds: string[];
  cases: CorpusCase[];
}

const corpus = JSON.parse(readFileSync(new URL('../../../samples/i112/cases.json', import.meta.url), 'utf8')) as Corpus;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

const futureCards = [
  { detailBeatId: 'detail-2', position: 1, title: '确认事实', summary: '确认正文中的关键事实。', pov: 'mira' },
  { detailBeatId: 'detail-3', position: 2, title: '改变同盟', summary: '改变人物之间的同盟。', pov: 'mira' },
  { detailBeatId: 'detail-4', position: 3, title: '踏上新路', summary: '沿新的方向继续行动。', pov: 'mira' },
];

function evidenceFor(input: TextChangeImpactParserInput) {
  return [{
    sourceHash: input.delta.afterHash,
    beforeRange: input.delta.beforeRange,
    afterRange: input.delta.afterRange,
    beforeQuote: input.delta.beforeQuote,
    afterQuote: input.delta.afterQuote,
  }];
}

function backendReturning(output: unknown) {
  return {
    async *stream() {
      yield { type: 'text-delta' as const, text: JSON.stringify(output) };
      yield { type: 'finish' as const, reason: { kind: 'stop' } };
    },
  };
}

function parserInput(sample: CorpusCase): TextChangeImpactParserInput {
  return { before: sample.before, after: sample.after, delta: buildTextChangeDelta(sample.before, sample.after), futureCards };
}

describe('I112 TextChangeImpact parser', () => {
  it('冻结 canonical/held-out 样本，整体与 held-out 准确率均达到阈值', async () => {
    expect(corpus.immutable).toBe(true);
    expect(corpus.cases).toHaveLength(12);
    expect(corpus.canonicalCaseIds).toHaveLength(8);
    expect(corpus.heldOutCaseIds).toHaveLength(4);
    expect(corpus.threshold).toBeGreaterThanOrEqual(0.8);

    const results = await Promise.all(corpus.cases.map(async (sample) => {
      const input = parserInput(sample);
      const output = await classifyTextChangeImpact(backendReturning({
        classification: sample.expected.classification,
        confidence: 'high',
        evidence: evidenceFor(input),
        affectedDetailBeatIds: sample.expected.affectedDetailBeatIds,
        rationale: `frozen-${sample.id}`,
      }), input, settings);
      return { sample, output };
    }));
    const accuracy = results.filter(({ sample, output }) => output.classification === sample.expected.classification
      && output.affectedDetailBeatIds.join(',') === sample.expected.affectedDetailBeatIds.join(',')).length / results.length;
    const heldOut = results.filter(({ sample }) => corpus.heldOutCaseIds.includes(sample.id));
    const heldOutAccuracy = heldOut.filter(({ sample, output }) => output.classification === sample.expected.classification
      && output.affectedDetailBeatIds.join(',') === sample.expected.affectedDetailBeatIds.join(',')).length / heldOut.length;
    expect(accuracy).toBeGreaterThanOrEqual(corpus.threshold);
    expect(heldOutAccuracy).toBeGreaterThanOrEqual(corpus.threshold);
    expect(results.every(({ sample, output }) => output.evidence[0].sourceHash === buildTextChangeDelta(sample.before, sample.after).afterHash)).toBe(true);
  });

  it('先做严格 JSON/证据/未来卡边界校验，非法模型结果 fail closed', async () => {
    const sample = corpus.cases.find((item) => item.id === 'fact-key')!;
    const input = parserInput(sample);
    const base = {
      classification: 'story-fact', confidence: 'high', evidence: evidenceFor(input),
      affectedDetailBeatIds: ['detail-2'], rationale: '事实发生变化',
    };
    await expect(classifyTextChangeImpact(backendReturning({ ...base, extra: true }), input, settings)).rejects.toThrow();
    await expect(classifyTextChangeImpact(backendReturning({ ...base, evidence: [{ ...base.evidence[0], afterQuote: '伪造证据' }] }), input, settings)).rejects.toThrow(/quote/);
    await expect(classifyTextChangeImpact(backendReturning({ ...base, evidence: [{ ...base.evidence[0], afterRange: { start: 0, end: input.after.length + 1 } }] }), input, settings)).rejects.toThrow(/exceeds/);
    await expect(classifyTextChangeImpact(backendReturning({ ...base, affectedDetailBeatIds: ['detail-1'] }), input, settings)).rejects.toThrow(/ineligible/);
    await expect(classifyTextChangeImpact(backendReturning({ ...base, classification: 'wording-only', affectedDetailBeatIds: ['detail-2'] }), input, settings)).rejects.toThrow(/wording-only/);
  });

  it('输入正文超过预算时在 LLM 调用前拒绝', async () => {
    const before = 'a'.repeat(200_001);
    const after = `${before}!`;
    const input = {
      before,
      after,
      delta: textChangeDeltaSchema.parse({
        beforeHash: textChangeHash(before), afterHash: textChangeHash(after), beforeLength: before.length, afterLength: after.length,
        beforeRange: { start: 0, end: 0 }, afterRange: { start: 0, end: 0 }, beforeQuote: '', afterQuote: '', pureFormatting: false,
      }),
      futureCards,
    };
    await expect(classifyTextChangeImpact(backendReturning({}), input, settings)).rejects.toThrow();
  });
});
