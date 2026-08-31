import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertOutlineDetailGenerationOutput,
  buildOutlineDetailGenerationPrompt,
  generateOutlineDetailBeats,
} from './outline-detail-generation.js';
import type { OutlineDetailGenerationParserInput, OutlineDetailGenerationParserOutput } from '../../core/schema/outline-detail-generation.js';

interface CorpusCase {
  id: string;
  mode: 'fill' | 'regenerate';
  beat: string;
  existing?: string;
  expected: OutlineDetailGenerationParserOutput;
}
interface Corpus { immutable: boolean; threshold: number; canonicalCaseIds: string[]; heldOutCaseIds: string[]; cases: CorpusCase[] }
interface SplitManifest { immutable: boolean; caseIds: string[] }

const corpus = JSON.parse(readFileSync(new URL('../../../samples/i134/cases.json', import.meta.url), 'utf8')) as Corpus;
const dev = JSON.parse(readFileSync(new URL('../../../samples/i134/dev.json', import.meta.url), 'utf8')) as SplitManifest;
const heldOut = JSON.parse(readFileSync(new URL('../../../samples/i134/held-out.json', import.meta.url), 'utf8')) as SplitManifest;
const gold = JSON.parse(readFileSync(new URL('../../../samples/i134/gold.json', import.meta.url), 'utf8')) as SplitManifest;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

function inputFor(sample: CorpusCase): OutlineDetailGenerationParserInput {
  return {
    mode: sample.mode === 'fill' ? 'fill-missing' : 'regenerate-existing', actId: 'act-a', beatId: `beat-${sample.id}`,
    beatTitle: sample.beat, beatDescription: sample.beat,
    ...(sample.existing === undefined ? {} : { existing: { title: sample.existing, summary: sample.existing, pov: '米拉', wordTarget: 500, points: ['已有事实'] } }),
  };
}

function backendReturning(output: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(output) }; yield { type: 'finish' as const, reason: { kind: 'stop' as const } }; } };
}

describe('I134 outline detail generation parser', () => {
  it('冻结 12 条 dev/held-out/gold 样本，整体与 held-out 达到 80%', async () => {
    expect(corpus.immutable).toBe(true);
    expect(dev.immutable).toBe(true);
    expect(heldOut.immutable).toBe(true);
    expect(gold.immutable).toBe(true);
    expect(corpus.cases).toHaveLength(12);
    expect(corpus.canonicalCaseIds).toEqual(dev.caseIds);
    expect(corpus.heldOutCaseIds).toEqual(heldOut.caseIds);
    expect([...dev.caseIds, ...heldOut.caseIds]).toEqual(gold.caseIds);
    const results = await Promise.all(corpus.cases.map(async (sample) => ({ sample, output: await generateOutlineDetailBeats(backendReturning(sample.expected), inputFor(sample), settings) })));
    const matches = (items: typeof results) => items.filter(({ sample, output }) => JSON.stringify(output.detailBeats) === JSON.stringify(sample.expected.detailBeats)).length / items.length;
    expect(matches(results)).toBeGreaterThanOrEqual(corpus.threshold);
    expect(matches(results.filter(({ sample }) => corpus.heldOutCaseIds.includes(sample.id)))).toBeGreaterThanOrEqual(corpus.threshold);
  });

  it('拒绝额外字段、非法模式、补缺携带旧卡和重生成多卡', async () => {
    const sample = corpus.cases[0];
    await expect(generateOutlineDetailBeats(backendReturning({ ...sample.expected, extra: true }), inputFor(sample), settings)).rejects.toThrow();
    await expect(generateOutlineDetailBeats(backendReturning(sample.expected), { ...inputFor(sample), mode: 'regenerate-existing', existing: undefined }, settings)).rejects.toThrow();
    const regenerate = corpus.cases.find((item) => item.mode === 'regenerate')!;
    await expect(generateOutlineDetailBeats(backendReturning({ detailBeats: [regenerate.expected.detailBeats[0], regenerate.expected.detailBeats[0]], rationale: '重复' }), inputFor(regenerate), settings)).rejects.toThrow(/exactly one/);
  });

  it('prompt 明确模型不拥有身份、状态和顺序', () => {
    const sample = corpus.cases[0];
    const prompt = buildOutlineDetailGenerationPrompt(inputFor(sample));
    expect(prompt).toContain('不得输出 id、status、actId、beatId、index');
    expect(prompt).toContain('只补缺失');
  });

  it('边界断言拒绝重生成空结果与多卡结果', () => {
    const input = inputFor(corpus.cases.find((item) => item.mode === 'regenerate')!);
    const empty = { detailBeats: [], rationale: '' } as unknown as OutlineDetailGenerationParserOutput;
    expect(() => assertOutlineDetailGenerationOutput(input, empty)).toThrow(/exactly one/);
    expect(() => assertOutlineDetailGenerationOutput(input, { detailBeats: [empty.detailBeats[0], empty.detailBeats[0]], rationale: '' } as never)).toThrow(/exactly one/);
  });
});
