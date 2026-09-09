import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { outlineDetailGenerationParserInputSchema } from '../../core/schema/outline-detail-generation.js';
import { generateOutlineDetailBeats } from './outline-detail-generation.js';

const corpus = JSON.parse(readFileSync(new URL('../../../samples/i210/cases.json', import.meta.url), 'utf8'));

it('I210 frozen dev/held-out pass scope context through fake backend without relaxing output', async () => {
  expect(corpus.immutable).toBe(true); expect(corpus.threshold).toBe(1);
  const scores: { split: string; passed: boolean }[] = [];
  for (const sample of corpus.cases) {
    const fields = { title: sample.title, summary: '保留事实，不重复已发生的情节。', pov: 'hero', wordTarget: 500, points: ['第一要点', '第二要点'] };
    const scopeCards = [{ actId: 'act', beatId: 'beat-old', position: 2, detailBeat: { ...fields, id: 'saved', status: sample.status } }];
    const input = outlineDetailGenerationParserInputSchema.parse({ mode: sample.mode, actId: 'act', beatId: 'beat', beatTitle: '后续', beatDescription: '继续调查', scopeCards,
      ...(sample.mode === 'append-to-selected-beat' ? { guidance: '推进新的情节' } : {}), ...(sample.mode === 'regenerate-existing' ? { existing: fields } : {}) });
    const expected = { detailBeats: [{ ...fields, title: '后续新卡' }], rationale: '衔接已有卡' };
    let carried = false;
    const output = await generateOutlineDetailBeats({ async *stream(request) {
      const line = request.prompt.split('\n').find(line => line.startsWith('当前生成范围已保存场景卡：'))!;
      expect(JSON.parse(line.slice('当前生成范围已保存场景卡：'.length))).toEqual(scopeCards);
      expect(request.prompt).toContain('只读参考');
      carried = true;
      yield { type: 'text-delta', text: JSON.stringify(expected) }; yield { type: 'finish', reason: { kind: 'stop' } };
    } }, input, { modelRef: 'fake', credentialRef: 'test' });
    scores.push({ split: sample.split, passed: carried && JSON.stringify(output) === JSON.stringify(expected) });
    expect(outlineDetailGenerationParserInputSchema.safeParse({ ...input, scopeCards: [{ ...scopeCards[0], extra: true }] }).success).toBe(false);
    expect(outlineDetailGenerationParserInputSchema.safeParse({ ...input, scopeCards: [{ ...scopeCards[0], position: -1 }] }).success).toBe(false);
  }
  for (const split of ['dev', 'held-out']) {
    const subset = scores.filter(score => score.split === split);
    expect(subset).toHaveLength(2);
    expect(subset.filter(score => score.passed).length / subset.length).toBeGreaterThanOrEqual(corpus.threshold);
  }
});
