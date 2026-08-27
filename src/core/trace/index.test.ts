import { describe, expect, it } from 'vitest';
import { registerContextSerializers } from '../assemble/serializers.js';
import { ContextAssembler, i12ContextBudget, i13ContextBudget, type ContextAssemblySection } from '../assemble/index.js';
import { assembleStoryContext, i19ContextBudget, type StoryGenerationSources } from '../pipeline/index.js';
import type { DetailBeat } from '../schema/outline.js';
import type { OutlineNavigation } from '../schema/outline-progress.js';
import type { FilteredKnowledge } from '../knowledge/filter.js';
import { buildContextTrace } from './index.js';

/**
 * I71 生成注入解释（context trace）—— 确定性模块回归（design §14.10 / R14-6）。
 *
 * 验收覆盖：
 * - trace 与 ContextAssembler 实际选择一致：用与生成路径相同的注册器/组装器
 *   重组装，逐层 characterCount/budget/truncated 与直接组装结果逐项相等；
 * - 触发原因：世界观命中条目 + 触发文本中实际命中的关键词；
 * - secret 负测：trace 不含 prompt/事实文本/非 POV 可见 C3 内容（只报条数）；
 * - scene-card / rewrite 无结构层注入时如实报告 sections 为空。
 */

const navigation: OutlineNavigation = {
  actId: 'act-1', beatId: 'beat-1', title: '午夜灯塔', description: 'd',
  prerequisites: [], prerequisitesMet: true, instruction: 'i', deviationIds: [],
};

const REWRITE_PROMPT = '更有悬念，缩短到 300 字。';

const card: DetailBeat = {
  id: 'detail-1', title: '发现海图', summary: '米拉发现半张海图。', pov: 'mira',
  wordTarget: 500, points: ['海图指向北港'], status: 'planned',
};

const knowledge: FilteredKnowledge = {
  pov: 'mira',
  entries: [
    { id: 'know-1', version: 1, fact: '北港海底沉睡着旧城。', kind: 'secret', holders: ['mira'], revealPlan: { revealTo: [], revealAt: '第三幕' }, status: 'hidden' },
  ],
  state: { characterId: 'mira', knows: ['know-1'] },
};

function sources(triggerText: string): StoryGenerationSources {
  return {
    context: {
      macros: { user: '作者', pov: 'mira' },
      sources: {
        rules: [{ rule: { id: 'r1', version: 1, scope: 'global', kind: 'taboo', statement: '不得提前揭示结局。', priority: 10, immutable: true, active: true, examples: [] }, scope: 'global', priority: 10, immutable: true }],
        style: { profile: { id: 's1', version: 1, name: '默认', person: 'third-limited', tense: 'past', povScope: 'single', tone: '冷静', proseStyle: '简洁', chapterFormat: '章节体', dialogueConventions: '少引号', forbidden: [] }, forbidden: [] },
        characters: [
          { character: { id: 'mira', version: 1, name: '米拉', aliases: [], kind: 'pov', personality: '', background: '北港渔家女。', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }, name: '米拉', kind: 'pov', pov: true },
        ],
        worldview: [
          { entry: { id: 'north-harbor', version: 1, kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港', '内海'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null }, entryId: 'north-harbor', ancestors: [], level: 0 },
        ],
        relationships: { relationships: [], characterIds: ['mira'] },
        state: { id: 'state-1', version: 1, seq: 0, storyTime: '', scene: { location: '旧灯塔', timeOfDay: '', weather: '', season: '', atmosphere: '' }, characters: [] },
      },
    },
    navigation,
    knowledge,
    canon: [
      { id: 'event-1', seq: 0, storyTime: '第一夜', kind: 'event', summary: '米拉进入旧灯塔', detail: '', participants: ['mira'], location: '旧灯塔', consequences: [], affectedLayers: ['c5'], immutable: true, supersededBy: null },
    ],
    history: { recentScenes: [], historicalSummaries: [] },
  };
}

describe('I71 context trace', () => {
  it('matches the ContextAssembler actual selection section by section', () => {
    const triggerText = '海图指向北港';
    const source = sources(triggerText);
    // 参考：与生成路径完全相同的确定性组装。
    const assembler = registerContextSerializers(new ContextAssembler());
    const reference = assembleStoryContext(assembler, source);
    const trace = buildContextTrace({ intent: 'continue', pov: 'mira', sources: source, triggerText, navigation, card });
    expect(trace.intent).toBe('continue');
    expect(trace.pov).toBe('mira');
    // 注入层集合一致。
    expect(trace.sections.map((section) => section.id)).toEqual(reference.sections.map((section) => section.id));
    // 逐层字符数/预算/截断与组装结果一致（ContextAssembler 实际选择）。
    for (let index = 0; index < reference.sections.length; index += 1) {
      const actual = reference.sections[index];
      const reported = trace.sections[index];
      expect(reported.characterCount).toBe(actual.characterCount);
      expect(reported.truncated).toBe(actual.truncated);
      expect(reported.budget).toBe(budgetOf(actual));
    }
    expect(trace.totals.characterCount).toBe(reference.characterCount);
    expect(trace.totals.budget).toBe(i19ContextBudget.totalCharacters);
  });

  it('records worldview trigger reasons with matched keywords from the trigger text', () => {
    const triggerText = '场景卡：海图指向北港，米拉出发。';
    const trace = buildContextTrace({ intent: 'continue', pov: 'mira', sources: sources(triggerText), triggerText, navigation, card });
    expect(trace.triggers).toHaveLength(1);
    const trigger = trace.triggers[0];
    expect(trigger.entryId).toBe('north-harbor');
    expect(trigger.matchedKeywords).toContain('北港');
    expect(trigger.matchedKeywords).not.toContain('内海');
    // 触发关键词确定性排序。
    expect(trigger.matchedKeywords).toEqual([...trigger.matchedKeywords].sort());
  });

  it('never leaks prompt text, fact text, or non-visible C3 content', () => {
    const triggerText = '海图指向北港';
    const trace = buildContextTrace({ intent: 'continue', pov: 'mira', sources: sources(triggerText), triggerText, navigation, card });
    const json = JSON.stringify(trace);
    // 不出现知识事实/prompt/正文/完整对象。
    expect(json).not.toContain('北港海底沉睡着旧城');
    expect(json).not.toContain('你是长篇小说');
    expect(json).not.toContain('半张海图');
    // knowledge 只报可见条数，不出现条目 id/fact。
    expect(trace.knowledgeVisibleCount).toBe(1);
    expect(json).not.toContain('know-1');
    expect(json).not.toContain('secret');
  });

  it('reports scene-card and rewrite honestly as zero structural-layer injection', () => {
    const sceneCardTrace = buildContextTrace({ intent: 'scene-card', pov: 'mira', navigation, card });
    expect(sceneCardTrace.sections).toEqual([]);
    expect(sceneCardTrace.triggers).toEqual([]);
    expect(sceneCardTrace.totals.characterCount).toBe(0);
    expect(sceneCardTrace.sceneCard).toEqual({ title: '发现海图', pov: 'mira', wordTarget: 500 });
    expect(sceneCardTrace.navigation?.title).toBe('午夜灯塔');

    const rewriteTrace = buildContextTrace({ intent: 'rewrite', rewritePrompt: REWRITE_PROMPT });
    expect(rewriteTrace.sections).toEqual([]);
    expect(rewriteTrace.rewritePromptCharacters).toBe(REWRITE_PROMPT.length);
    expect(rewriteTrace.pov).toBe('');
    expect(JSON.stringify(rewriteTrace)).not.toContain('更有悬念');
  });

  it('fails closed when generate/continue lack sources', () => {
    expect(() => buildContextTrace({ intent: 'continue', pov: 'mira' })).toThrow(/requires sources/);
  });
});

function budgetOf(section: ContextAssemblySection | { readonly id: 'outline' | 'knowledge' | 'canon' | 'history' }): number {
  if (section.id === 'rules' || section.id === 'style') return i12ContextBudget.sectionCharacters[section.id];
  if (section.id === 'characters' || section.id === 'worldview' || section.id === 'relationships' || section.id === 'state') {
    return i13ContextBudget.sectionCharacters[section.id];
  }
  return i19ContextBudget.sectionCharacters[section.id as 'outline' | 'knowledge' | 'canon' | 'history'];
}
