import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertImportInterpretationCoverage,
  createImportInterpretationParagraphs,
  importInterpretationInputSchema,
  type ImportInterpretationInput,
} from '../../core/schema/import-interpretation-analysis.js';
import { buildSourceInterpretationPrompt, classifySourceInterpretation } from './import-interpretation.js';

interface CorpusCase {
  id: string;
  text: string;
  expected: Record<string, unknown>;
}
interface Corpus {
  immutable: boolean;
  threshold: number;
  cases: CorpusCase[];
  canonicalCaseIds: string[];
  heldOutCaseIds: string[];
}
interface Split { immutable: boolean; caseIds: string[] }

const corpus = JSON.parse(readFileSync(new URL('../../../samples/i143/cases.json', import.meta.url), 'utf8')) as Corpus;
const dev = JSON.parse(readFileSync(new URL('../../../samples/i143/dev.json', import.meta.url), 'utf8')) as Split;
const heldOut = JSON.parse(readFileSync(new URL('../../../samples/i143/held-out.json', import.meta.url), 'utf8')) as Split;
const gold = JSON.parse(readFileSync(new URL('../../../samples/i143/gold.json', import.meta.url), 'utf8')) as Split;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

function inputFor(sample: CorpusCase): ImportInterpretationInput {
  return importInterpretationInputSchema.parse({ projectId: 'demo', importSessionId: `imp-${sample.id}`, sourceHash: 'a'.repeat(64), paragraphs: createImportInterpretationParagraphs(sample.text) });
}

function backendReturning(value: unknown) {
  return { async *stream() { yield { type: 'text-delta' as const, text: JSON.stringify(value) }; yield { type: 'finish' as const, reason: { kind: 'stop' } }; } };
}

describe('I143 source interpretation classifier', () => {
  it('freezes dev/held-out/gold and meets the overall plus paragraph threshold', async () => {
    expect(corpus.immutable).toBe(true);
    expect(dev.immutable).toBe(true);
    expect(heldOut.immutable).toBe(true);
    expect(gold.immutable).toBe(true);
    expect(corpus.threshold).toBeGreaterThanOrEqual(0.8);
    expect(corpus.canonicalCaseIds).toEqual(dev.caseIds);
    expect(corpus.heldOutCaseIds).toEqual(heldOut.caseIds);
    expect([...dev.caseIds, ...heldOut.caseIds]).toEqual(gold.caseIds);
    const results = await Promise.all(corpus.cases.map(async (sample) => {
      const output = await classifySourceInterpretation(backendReturning(sample.expected), inputFor(sample), settings);
      const expected = JSON.stringify(sample.expected);
      return { sample, output, matched: JSON.stringify(output) === expected };
    }));
    const accuracy = (items: typeof results) => items.filter((item) => item.matched).length / items.length;
    expect(accuracy(results)).toBeGreaterThanOrEqual(corpus.threshold);
    expect(accuracy(results.filter((item) => corpus.heldOutCaseIds.includes(item.sample.id)))).toBeGreaterThanOrEqual(corpus.threshold);
  });

  it('rejects malformed JSON, unknown/repeated/missing paragraph ids and duplicate evidence', async () => {
    const input = inputFor(corpus.cases[0]);
    await expect(classifySourceInterpretation(backendReturning('{not-json}'), input, settings)).rejects.toThrow(/expected object|valid JSON/i);
    const expected = corpus.cases[0].expected as { paragraphs: Array<Record<string, unknown>>; evidenceParagraphIds: string[] };
    await expect(classifySourceInterpretation(backendReturning({ ...expected, paragraphs: [{ ...expected.paragraphs[0], paragraphId: 'unknown' }] }), input, settings)).rejects.toThrow(/cover every/);
    await expect(classifySourceInterpretation(backendReturning({ ...expected, paragraphs: [] }), input, settings)).rejects.toThrow();
    await expect(classifySourceInterpretation(backendReturning({ ...expected, evidenceParagraphIds: ['paragraph-0001', 'paragraph-0001'] }), input, settings)).rejects.toThrow(/unique/);
    expect(() => importInterpretationInputSchema.parse({ ...input, paragraphs: [input.paragraphs[0], { ...input.paragraphs[0], paragraphId: 'paragraph-0002', index: 1 }] })).toThrow(/overlap/);
  });

  it('keeps the prompt source-only and never accepts model offsets or writing fields', () => {
    const input = inputFor(corpus.cases.find((sample) => sample.id === 'author-instruction')!);
    const prompt = buildSourceInterpretationPrompt(input);
    expect(prompt).toContain('author-instruction');
    expect(prompt).toContain('presentation-note');
    expect(prompt).toContain('不得输出 treatment、POV');
    expect(prompt).not.toContain('preserve-prose');
    expect(() => assertImportInterpretationCoverage(input, {
      sourceRole: 'hybrid', confidence: 'high', evidenceParagraphIds: [],
      paragraphs: [{ paragraphId: input.paragraphs[0].paragraphId, role: 'prose', confidence: 'high', evidence: 'e' }], rationale: 'r',
    })).not.toThrow();
  });
});
