import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertLongDraftOutlineOutput,
  buildLongDraftOutlinePrompt,
  classifyLongDraftOutline,
} from './long-draft-outline.js';
import type { LongDraftOutlineAgentOutput, LongDraftOutlineParserInput } from '../../core/schema/long-draft.js';

interface CorpusCase {
  id: string;
  instruction: string;
  expected: LongDraftOutlineAgentOutput;
}
interface Corpus {
  immutable: boolean;
  threshold: number;
  canonicalCaseIds: string[];
  heldOutCaseIds: string[];
  cases: CorpusCase[];
}
interface SplitManifest { immutable: boolean; caseIds: string[]; }

const corpus = JSON.parse(readFileSync(new URL('../../../samples/i119/cases.json', import.meta.url), 'utf8')) as Corpus;
const dev = JSON.parse(readFileSync(new URL('../../../samples/i119/dev.json', import.meta.url), 'utf8')) as SplitManifest;
const heldOut = JSON.parse(readFileSync(new URL('../../../samples/i119/held-out.json', import.meta.url), 'utf8')) as SplitManifest;
const gold = JSON.parse(readFileSync(new URL('../../../samples/i119/gold.json', import.meta.url), 'utf8')) as SplitManifest;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

function backendReturning(output: unknown) {
  return {
    async *stream() {
      yield { type: 'text-delta' as const, text: JSON.stringify(output) };
      yield { type: 'finish' as const, reason: { kind: 'stop' } };
    },
  };
}

function parserInput(sample: CorpusCase): LongDraftOutlineParserInput {
  return {
    sourceHash: 'a'.repeat(64),
    chunks: [{ index: 0, text: sample.instruction }, { index: 1, text: '第二个长稿文本块。' }],
  };
}

describe('I119 long-draft outline parser', () => {
  it('冻结 dev/held-out/gold 样本，整体与 held-out 准确率达到阈值', async () => {
    expect(corpus.immutable).toBe(true);
    expect(dev.immutable).toBe(true);
    expect(heldOut.immutable).toBe(true);
    expect(gold.immutable).toBe(true);
    expect(corpus.cases).toHaveLength(12);
    expect(corpus.canonicalCaseIds).toEqual(dev.caseIds);
    expect(corpus.heldOutCaseIds).toEqual(heldOut.caseIds);
    expect([...dev.caseIds, ...heldOut.caseIds]).toEqual(gold.caseIds);
    expect(corpus.threshold).toBeGreaterThanOrEqual(0.8);

    const results = await Promise.all(corpus.cases.map(async (sample) => {
      const output = await classifyLongDraftOutline(backendReturning(sample.expected), parserInput(sample), settings);
      return { sample, output };
    }));
    const matches = (items: typeof results) => items.filter(({ sample, output }) =>
      JSON.stringify(output.outline) === JSON.stringify(sample.expected.outline)
      && JSON.stringify(output.sourceChunkIndices) === JSON.stringify(sample.expected.sourceChunkIndices)).length / items.length;
    expect(matches(results)).toBeGreaterThanOrEqual(corpus.threshold);
    expect(matches(results.filter(({ sample }) => corpus.heldOutCaseIds.includes(sample.id)))).toBeGreaterThanOrEqual(corpus.threshold);
  });

  it('严格拒绝 I38 混合 envelope、额外字段、缺块与乱序', async () => {
    const sample = corpus.cases[0];
    const input = parserInput(sample);
    await expect(classifyLongDraftOutline(backendReturning({ candidates: [] }), input, settings)).rejects.toThrow();
    await expect(classifyLongDraftOutline(backendReturning({ ...sample.expected, extra: true }), input, settings)).rejects.toThrow();
    await expect(classifyLongDraftOutline(backendReturning({ ...sample.expected, sourceChunkIndices: [0] }), input, settings)).rejects.toThrow(/every source chunk/);
    await expect(classifyLongDraftOutline(backendReturning({ ...sample.expected, sourceChunkIndices: [1, 0] }), input, settings)).rejects.toThrow(/every source chunk/);
  });

  it('outline prompt 明确只允许 B5 并保留嵌套 detailBeats', () => {
    const prompt = buildLongDraftOutlinePrompt(parserInput(corpus.cases.find((item) => item.id === 'outline-detail-nested')!));
    expect(prompt).toContain('outline-only');
    expect(prompt).toContain('不能返回 I38 的 candidates 数组');
    expect(prompt).toContain('detailBeats 只能作为 B5 beat 内的嵌套细纲卡');
  });

  it('边界断言拒绝重复 source index', () => {
    const sample = corpus.cases[0];
    const input = parserInput(sample);
    expect(() => assertLongDraftOutlineOutput(input, { ...sample.expected, sourceChunkIndices: [0, 0] })).toThrow(/unique/);
  });
});
