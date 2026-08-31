import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertReferenceCorrectionOutput,
  classifyReferenceCorrection,
} from './reference-correction.js';
import type { ReferenceCorrectionParserInput, ReferenceCorrectionParserOutput } from '../../core/schema/reference-correction.js';

interface CorpusCase {
  id: string;
  instruction: string;
  markedTargets: ReferenceCorrectionParserInput['markedTargets'];
  expected: ReferenceCorrectionParserOutput;
}

interface Corpus {
  immutable: boolean;
  threshold: number;
  canonicalCaseIds: string[];
  heldOutCaseIds: string[];
  cases: CorpusCase[];
}

interface SplitManifest { immutable: boolean; caseIds: string[]; }
interface GoldManifest { immutable: boolean; caseIds: string[]; }

const corpus = JSON.parse(readFileSync(new URL('../../../samples/i118/cases.json', import.meta.url), 'utf8')) as Corpus;
const dev = JSON.parse(readFileSync(new URL('../../../samples/i118/dev.json', import.meta.url), 'utf8')) as SplitManifest;
const heldOut = JSON.parse(readFileSync(new URL('../../../samples/i118/held-out.json', import.meta.url), 'utf8')) as SplitManifest;
const gold = JSON.parse(readFileSync(new URL('../../../samples/i118/gold.json', import.meta.url), 'utf8')) as GoldManifest;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

function backendReturning(output: unknown) {
  return {
    async *stream() {
      yield { type: 'text-delta' as const, text: JSON.stringify(output) };
      yield { type: 'finish' as const, reason: { kind: 'stop' } };
    },
  };
}

function parserInput(sample: CorpusCase): ReferenceCorrectionParserInput {
  return {
    instruction: sample.instruction,
    markedTargets: sample.markedTargets,
    relationships: [{ id: 'rel-mira-lynn', version: 1, from: 'char-mira', to: 'char-lynn', type: 'friendship', affinity: 20, trust: 50, status: '普通', milestones: [], knownTo: ['char-mira'] }],
    knowledge: {
      entries: [{ id: 'secret-map', version: 1, fact: '北港有一张旧地图', kind: 'secret', holders: ['char-mira'], revealPlan: { revealTo: ['char-lynn'], revealAt: 'chapter-3' }, status: 'hidden' }],
      states: [{ characterId: 'char-mira', knows: ['secret-map'] }, { characterId: 'char-lynn', knows: [] }],
    },
    canon: [],
  };
}

function expectedOutput(sample: CorpusCase): ReferenceCorrectionParserOutput {
  return { ...sample.expected, rationale: `frozen-${sample.id}` };
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

describe('I118 ReferenceCorrection parser', () => {
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
      const output = await classifyReferenceCorrection(backendReturning(expectedOutput(sample)), parserInput(sample), settings);
      return { sample, output };
    }));
    const matches = (items: typeof results) => items.filter(({ sample, output }) =>
      stable(output.operations) === stable(sample.expected.operations)).length / items.length;
    expect(matches(results)).toBeGreaterThanOrEqual(corpus.threshold);
    expect(matches(results.filter(({ sample }) => corpus.heldOutCaseIds.includes(sample.id)))).toBeGreaterThanOrEqual(corpus.threshold);
  });

  it('严格拒绝额外字段、未知标记目标、错误 action 与 C4 目标漂移', async () => {
    const sample = corpus.cases.find((item) => item.id === 'c1-status')!;
    const input = parserInput(sample);
    const base = expectedOutput(sample);
    await expect(classifyReferenceCorrection(backendReturning({ ...base, extra: true }), input, settings)).rejects.toThrow();
    await expect(classifyReferenceCorrection(backendReturning({ ...base, operations: [{ ...base.operations[0], entityId: 'unknown-rel' }] }), input, settings)).rejects.toThrow(/unmarked/);

    const c3 = corpus.cases.find((item) => item.id === 'c3-holder')!;
    await expect(classifyReferenceCorrection(backendReturning({ ...expectedOutput(c3), operations: [{ ...expectedOutput(c3).operations[0], action: 'set', value: ['char-lynn'] }] }), parserInput(c3), settings)).rejects.toThrow(/holders must use add/);

    const c4 = corpus.cases.find((item) => item.id === 'c4-append')!;
    const c4Output = expectedOutput(c4);
    const c4Operation = c4Output.operations.find((operation) => operation.owner === 'c4')!;
    await expect(classifyReferenceCorrection(backendReturning({ ...c4Output, operations: [{ ...c4Operation, value: { ...c4Operation.value, id: 'other-event' } }] }), parserInput(c4), settings)).rejects.toThrow(/match/);
  });

  it('输入标记目标本身必须来自受支持的 I116 审计字段', () => {
    const sample = corpus.cases.find((item) => item.id === 'c1-status')!;
    const input = { ...parserInput(sample), markedTargets: [{ ...sample.markedTargets[0], field: 'forbidden-field' }] };
    expect(() => assertReferenceCorrectionOutput(input, expectedOutput(sample))).toThrow(/I116 audit field/);
  });
});
