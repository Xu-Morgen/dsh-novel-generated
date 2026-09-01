import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { OutlineDetailGenerationParserOutput } from '../../core/schema/outline-detail-generation.js';
import { buildOutlineDetailGenerationPrompt, generateOutlineDetailBeats } from './outline-detail-generation.js';

interface AppendCase {
  id: string;
  beat: string;
  guidance: string;
  expected: OutlineDetailGenerationParserOutput;
}
interface Corpus { immutable: boolean; threshold: number; canonicalCaseIds: string[]; heldOutCaseIds: string[]; cases: AppendCase[] }
interface Manifest { immutable: boolean; caseIds: string[] }

const corpus = JSON.parse(readFileSync(new URL('../../../samples/i150/cases.json', import.meta.url), 'utf8')) as Corpus;
const dev = JSON.parse(readFileSync(new URL('../../../samples/i150/dev.json', import.meta.url), 'utf8')) as Manifest;
const heldOut = JSON.parse(readFileSync(new URL('../../../samples/i150/held-out.json', import.meta.url), 'utf8')) as Manifest;
const gold = JSON.parse(readFileSync(new URL('../../../samples/i150/gold.json', import.meta.url), 'utf8')) as Manifest;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

function inputFor(sample: AppendCase) {
  return {
    mode: 'append-to-selected-beat' as const,
    actId: 'act-selected', beatId: `beat-${sample.id}`, beatTitle: sample.beat, beatDescription: sample.beat, guidance: sample.guidance,
  };
}

function backendReturning(output: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(output) }; yield { type: 'finish' as const, reason: { kind: 'stop' as const } }; } };
}

describe('I150 selected-beat append parser', () => {
  it('冻结 6 条 dev + 4 条 held-out，整体与 held-out 均达到 80%', async () => {
    expect(corpus.immutable && dev.immutable && heldOut.immutable && gold.immutable).toBe(true);
    expect(corpus.canonicalCaseIds).toEqual(dev.caseIds);
    expect(corpus.heldOutCaseIds).toEqual(heldOut.caseIds);
    expect([...dev.caseIds, ...heldOut.caseIds]).toEqual(gold.caseIds);
    const results = await Promise.all(corpus.cases.map(async (sample) => ({ sample, output: await generateOutlineDetailBeats(backendReturning(sample.expected), inputFor(sample), settings) })));
    const accuracy = (items: typeof results) => items.filter(({ sample, output }) => JSON.stringify(output) === JSON.stringify(sample.expected)).length / items.length;
    expect(accuracy(results)).toBeGreaterThanOrEqual(corpus.threshold);
    expect(accuracy(results.filter(({ sample }) => corpus.heldOutCaseIds.includes(sample.id)))).toBeGreaterThanOrEqual(corpus.threshold);
  });

  it('prompt 包含作者 guidance，并明确只追加、不替换已有卡', () => {
    const prompt = buildOutlineDetailGenerationPrompt(inputFor(corpus.cases[0]));
    expect(prompt).toContain(corpus.cases[0].guidance);
    expect(prompt).toContain('不得替换、复述、删除或重排已有卡');
    expect(prompt).toContain('只返回新增卡');
  });

  it('空/超限 guidance、append 携带 existing、非法模式与额外结果字段均拒绝', async () => {
    const sample = corpus.cases[0];
    await expect(generateOutlineDetailBeats(backendReturning(sample.expected), { ...inputFor(sample), guidance: ' ' }, settings)).rejects.toThrow();
    await expect(generateOutlineDetailBeats(backendReturning(sample.expected), { ...inputFor(sample), guidance: '长'.repeat(2_001) }, settings)).rejects.toThrow();
    await expect(generateOutlineDetailBeats(backendReturning(sample.expected), { ...inputFor(sample), existing: sample.expected.detailBeats[0] }, settings)).rejects.toThrow();
    await expect(generateOutlineDetailBeats(backendReturning(sample.expected), { ...inputFor(sample), mode: 'append-all' } as never, settings)).rejects.toThrow();
    await expect(generateOutlineDetailBeats(backendReturning({ ...sample.expected, replaceExisting: true }), inputFor(sample), settings)).rejects.toThrow();
  });
});
