import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { collectCandidate } from '../llm/port/index.js';
import type { PolishMode } from '../core/candidate/index.js';
import { buildPolishPrompt, polishModePreset } from './polish.js';

interface PolishSample {
  id: string;
  mode: PolishMode;
  source: string;
  instruction: string;
  expected: string;
}

interface PolishCorpus {
  immutable: boolean;
  threshold: number;
  modes: PolishMode[];
  canonicalCaseIds: string[];
  heldOutCaseIds: string[];
  cases: PolishSample[];
}

interface SplitManifest { immutable: boolean; caseIds: string[]; }
interface GoldManifest { immutable: boolean; caseIds: string[]; }

const corpus = JSON.parse(readFileSync(new URL('../../samples/i123/cases.json', import.meta.url), 'utf8')) as PolishCorpus;
const dev = JSON.parse(readFileSync(new URL('../../samples/i123/dev.json', import.meta.url), 'utf8')) as SplitManifest;
const heldOut = JSON.parse(readFileSync(new URL('../../samples/i123/held-out.json', import.meta.url), 'utf8')) as SplitManifest;
const gold = JSON.parse(readFileSync(new URL('../../samples/i123/gold.json', import.meta.url), 'utf8')) as GoldManifest;
const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };

/** Fake backend returns frozen gold text only after consuming the mode-bearing prompt. */
function fakeBackend(expected: string) {
  return {
    async *stream() {
      yield { text: expected };
      yield { done: true };
    },
  };
}

async function runSample(sample: PolishSample) {
  const prompt = buildPolishPrompt(sample.mode, sample.instruction);
  const output = await collectCandidate(fakeBackend(sample.expected), { prompt, settings });
  return { prompt, output };
}

describe('I123 章节润色三模式 prompt 与冻结样本', () => {
  it('dev/held-out/gold 不可变，整体与每模式准确率均达到阈值', async () => {
    expect(corpus.immutable).toBe(true);
    expect(dev.immutable).toBe(true);
    expect(heldOut.immutable).toBe(true);
    expect(gold.immutable).toBe(true);
    expect(corpus.cases).toHaveLength(12);
    expect(corpus.canonicalCaseIds).toEqual(dev.caseIds);
    expect(corpus.heldOutCaseIds).toEqual(heldOut.caseIds);
    expect([...dev.caseIds, ...heldOut.caseIds]).toEqual(gold.caseIds);
    expect(corpus.threshold).toBeGreaterThanOrEqual(0.8);
    expect(corpus.modes).toEqual(['language', 'condense', 'expand']);

    const results = await Promise.all(corpus.cases.map(async (sample) => ({ sample, ...(await runSample(sample)) })));
    const accuracy = (items: typeof results) => items.filter(({ sample, output }) => output.text === sample.expected).length / items.length;
    expect(accuracy(results)).toBeGreaterThanOrEqual(corpus.threshold);
    expect(accuracy(results.filter(({ sample }) => heldOut.caseIds.includes(sample.id)))).toBeGreaterThanOrEqual(corpus.threshold);
    for (const mode of corpus.modes) {
      const modeResults = results.filter(({ sample }) => sample.mode === mode);
      expect(modeResults).toHaveLength(4);
      expect(accuracy(modeResults)).toBeGreaterThanOrEqual(corpus.threshold);
    }
  });

  it('三种 mode 生成不同且有边界的 prompt preset，非法 mode 与空指令 fail closed', () => {
    const prompts = corpus.modes.map((mode) => buildPolishPrompt(mode, '保持故事事实不变。'));
    expect(new Set(prompts).size).toBe(3);
    expect(prompts[0]).toContain('改善用词、语序、节奏和标点');
    expect(prompts[1]).toContain('删除重复、赘述和无效铺陈');
    expect(prompts[2]).toContain('补充有限的动作、感官或环境细节');
    expect(polishModePreset('language')).not.toBe(polishModePreset('condense'));
    expect(() => buildPolishPrompt('language', '   ')).toThrow(/non-empty/);
    expect(() => Reflect.apply(buildPolishPrompt, undefined, ['unknown', 'x'])).toThrow(/Unknown polish mode/);
  });
});
