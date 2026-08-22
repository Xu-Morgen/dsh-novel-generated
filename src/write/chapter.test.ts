import { describe, expect, it } from 'vitest';
import { buildChapterWritingPrompt, reportWordTarget, assertCompleteProse } from './chapter.js';

const card = { id: 'card', title: '推门', summary: '进入旧港。', pov: 'mira', wordTarget: 100, points: ['发现钥匙'], status: 'writing' as const };
const navigation = { actId: 'act', beatId: 'beat', title: '旧港', description: '进入。', prerequisites: [], prerequisitesMet: true, instruction: '完成进入。', deviationIds: [] };

describe('I43 chapter writing contract', () => {
  it('renders the scene card and soft target without a hard length instruction', () => {
    const prompt = buildChapterWritingPrompt(card, navigation);
    expect(prompt).toContain('目标字数: 100');
    expect(prompt).toContain('软引导');
    expect(prompt).toContain('发现钥匙');
    expect(prompt).not.toContain('必须达到 100');
  });

  it('reports target error while keeping the signal advisory', () => {
    expect(reportWordTarget(100, 'a'.repeat(70))).toMatchObject({ actual: 70, errorRatio: 0.3, withinControlBand: true });
    expect(reportWordTarget(100, 'a'.repeat(10)).withinControlBand).toBe(false);
  });

  it('rejects empty prose but does not impose a word-count gate', () => {
    expect(() => assertCompleteProse('  ')).toThrow('non-empty');
    expect(() => assertCompleteProse('short')).not.toThrow();
  });
});
