import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTextChangeDelta } from '../../core/text-change-impact/index.js';
import type { TextChangeImpactReport } from '../../core/schema/text-change-impact.js';
import { generateOutlineReconciliationSuggestions, type OutlineReconciliationParserInput } from './outline-reconciliation.js';

interface CorpusCase {
  id: string;
  category: string;
  detailBeatId: string;
  before: { title: string; summary: string; pov: string; wordTarget: number; points: string[] };
  expected: { title: string; summary: string; pov: string; wordTarget: number; points: string[] };
}
interface Corpus { immutable: boolean; threshold: number; canonicalCaseIds: string[]; heldOutCaseIds: string[]; cases: CorpusCase[] }

const corpus = JSON.parse(readFileSync(new URL('../../../samples/i113/cases.json', import.meta.url), 'utf8')) as Corpus;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

function reportFor(sample: CorpusCase): TextChangeImpactReport {
  const delta = buildTextChangeDelta('旧正文。', '新正文。');
  return {
    impactId: `impact-${sample.id}`, projectId: 'project', baselineId: 'baseline-1', chapterId: 'chapter-1', sceneId: 'scene-1',
    baselineSourceHash: delta.beforeHash, finalSourceHash: delta.afterHash, delta,
    classification: sample.category === 'plot-direction' ? 'plot-direction' : 'story-fact', confidence: 'high',
    evidence: [{ sourceHash: delta.afterHash, beforeRange: delta.beforeRange, afterRange: delta.afterRange, beforeQuote: delta.beforeQuote, afterQuote: delta.afterQuote }],
    eligibleFutureDetailBeatIds: [sample.detailBeatId], affectedDetailBeatIds: [sample.detailBeatId], rationale: '正文证据改变后续卡。', analyzedAt: '2026-08-31T00:00:00.000Z',
  };
}

function inputFor(sample: CorpusCase): OutlineReconciliationParserInput {
  return {
    report: reportFor(sample),
    cards: [{ ...sample.before, detailBeatId: sample.detailBeatId, actId: 'act-1', beatId: 'beat-1', position: 1, status: 'planned' }],
  };
}

function backendReturning(output: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(output) }; } };
}

describe('I113 OutlineReconciliation parser', () => {
  it('冻结 12 个调和样本，整体、held-out 与各分类准确率达到阈值', async () => {
    expect(corpus.immutable).toBe(true);
    expect(corpus.cases).toHaveLength(12);
    expect(corpus.canonicalCaseIds).toHaveLength(8);
    expect(corpus.heldOutCaseIds).toHaveLength(4);
    const results = await Promise.all(corpus.cases.map(async (sample) => {
      const input = inputFor(sample);
      const output = await generateOutlineReconciliationSuggestions(backendReturning({
        suggestions: [{ detailBeatId: sample.detailBeatId, ...sample.expected, rationale: `frozen-${sample.id}` }],
      }), input, settings);
      return { sample, output: output.suggestions[0] };
    }));
    const matches = (sample: CorpusCase, output: typeof results[number]['output']) => output !== undefined
      && JSON.stringify({ title: output.title, summary: output.summary, pov: output.pov, wordTarget: output.wordTarget, points: output.points }) === JSON.stringify(sample.expected);
    expect(results.filter(({ sample, output }) => matches(sample, output)).length / results.length).toBeGreaterThanOrEqual(corpus.threshold);
    const heldOut = results.filter(({ sample }) => corpus.heldOutCaseIds.includes(sample.id));
    expect(heldOut.filter(({ sample, output }) => matches(sample, output)).length / heldOut.length).toBeGreaterThanOrEqual(corpus.threshold);
    for (const category of ['story-fact', 'plot-direction', 'mixed']) {
      const group = results.filter(({ sample }) => sample.category === category);
      expect(group.filter(({ sample, output }) => matches(sample, output)).length / group.length).toBeGreaterThanOrEqual(corpus.threshold);
    }
  });

  it('拒绝未知/重复/乱序卡、额外身份字段与超限建议', async () => {
    const first = corpus.cases[0];
    const input = inputFor(first);
    const good = { detailBeatId: first.detailBeatId, ...first.expected, rationale: 'ok' };
    await expect(generateOutlineReconciliationSuggestions(backendReturning({ suggestions: [{ ...good, detailBeatId: 'detail-unknown' }] }), input, settings)).rejects.toThrow(/exactly/);
    await expect(generateOutlineReconciliationSuggestions(backendReturning({ suggestions: [{ ...good, id: 'detail-1' }] }), input, settings)).rejects.toThrow();
    await expect(generateOutlineReconciliationSuggestions(backendReturning({ suggestions: [{ ...good, summary: 'x'.repeat(1001) }] }), input, settings)).rejects.toThrow();
    const two = { ...input, cards: [input.cards[0], { ...input.cards[0], detailBeatId: 'detail-3', position: 2 }] };
    await expect(generateOutlineReconciliationSuggestions(backendReturning({ suggestions: [good] }), two, settings)).rejects.toThrow(/exactly/);
  });
});
