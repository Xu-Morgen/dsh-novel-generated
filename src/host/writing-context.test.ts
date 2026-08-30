import { describe, expect, it } from 'vitest';
import { createNextSceneContextBuilder, type NextSceneContextDeps } from './writing-context.js';
import type { NovelTimelineService } from './timeline-service.js';

/** 最小 stub 集：只实现 context() 装配用到的面（其余抛出，未触及即不调用）。 */
function stubDeps(overrides: Partial<NextSceneContextDeps>): NextSceneContextDeps {
  const character = (id: string, name: string) => ({ id, name, kind: 'extra' as const });
  return {
    outline: {
      contentFingerprint: async () => 'a'.repeat(64),
      navigate: async () => ({ actId: 'act-1', beatId: 'beat-1', title: '第一幕', description: '', prerequisites: [], prerequisitesMet: true, instruction: '继续写作', deviationIds: [] }),
      beatCards: async () => [{ actId: 'act-1', beatId: 'beat-1', beatTitle: '午夜旧灯塔', detailBeat: { id: 'detail-1', title: '发现海图', summary: '发现海图', pov: 'mira', wordTarget: 20, points: ['海图'], status: 'writing' as const } }],
    } as unknown as NextSceneContextDeps['outline'],
    characters: {
      list: async () => [character('mira', '米拉'), character('lin', '林')],
      listForScene: async (_projectId: string, ids: string[]) => ids.map((id) => {
        const core = {
          id, name: id === 'mira' ? '米拉' : '林', kind: 'extra' as const, aliases: [], personality: '', background: '', motivation: '',
          goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
          arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [], version: 1,
        };
        return { character: core, name: core.name, kind: core.kind, pov: false };
      }),
    } as unknown as NextSceneContextDeps['characters'],
    worldview: { list: async () => [], matchTriggers: async () => [] } as unknown as NextSceneContextDeps['worldview'],
    relationship: { read: async () => [
      { id: 'rel-early', version: 1, from: 'mira', to: 'lin', type: 'friendship', affinity: 10, trust: 20, status: '初识', milestones: [], knownTo: ['mira', 'lin'] },
      { id: 'rel-late', version: 1, from: 'mira', to: 'lin', type: 'rivalry', affinity: -30, trust: 10, status: '对峙', milestones: [], knownTo: ['mira'] },
    ] } as unknown as NextSceneContextDeps['relationship'],
    state: { current: async () => ({ id: 'state', version: 1, seq: 0, storyTime: '', scene: { location: '', timeOfDay: '', weather: '', season: '', atmosphere: '' }, characters: [] }) } as unknown as NextSceneContextDeps['state'],
    canon: { query: async () => [] } as unknown as NextSceneContextDeps['canon'],
    style: { constantSegment: async () => ({ profile: { id: 'style', version: 1, name: '默认', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] }, forbidden: [] }) } as unknown as NextSceneContextDeps['style'],
    rules: { listActive: async () => [{ rule: { id: 'rule-1', version: 1, scope: 'global', kind: 'physics', statement: '世界规则。', priority: 1, immutable: true, examples: [], active: true }, scope: 'global', priority: 1, immutable: true }] } as unknown as NextSceneContextDeps['rules'],
    knowledge: { forPov: async () => ({ pov: 'mira', entries: [], state: { characterId: 'mira', knows: [] } }), read: async () => ({ entries: [], states: [] }) } as unknown as NextSceneContextDeps['knowledge'],
    text: { listChapters: async () => [] } as unknown as NextSceneContextDeps['text'],
    workbenchSettings: { load: async () => ({ wordTarget: 500, askWhenThin: false }) },
    ...overrides,
  };
}

describe('host/writing-context 时间线关系注入（方案 A）', () => {
  it('时间线缺席 → 全量注入（兼容旧数据，行为不变）', async () => {
    const builder = createNextSceneContextBuilder(stubDeps({ timeline: undefined }));
    const context = await builder.context('demo');
    const injected = context.sources.context.sources.relationships!.relationships;
    expect(injected.map((item) => item.id)).toEqual(['rel-early', 'rel-late']);
  });

  it('时间线存在且当前节点已安排 rel-early → 只注入已建立关系，未安排关系保留', async () => {
    const timeline: NovelTimelineService = {
      read: async () => ({
        id: 'demo', version: 1, currentNodeId: null,
        nodes: [{ id: 'node-0', order: 0, label: '发现海图', beatId: 'beat-1', detailBeatId: 'detail-1', reveals: [], relationships: ['rel-early'] }],
      }),
      ensureFromOutline: async () => { throw new Error('unused'); },
      setCurrentNode: async () => { throw new Error('unused'); },
      save: async () => { throw new Error('unused'); },
    };
    const builder = createNextSceneContextBuilder(stubDeps({ timeline }));
    const context = await builder.context('demo');
    const injected = context.sources.context.sources.relationships!.relationships;
    // 当前卡 detail-1 锚定 node-0：rel-early 已建立 → 注入；rel-late 未安排 → 保留。
    expect(injected.map((item) => item.id)).toEqual(['rel-early', 'rel-late']);
  });

  it('手动选择当前节点到未来节点 → 只注入该节点之前已安排的关系', async () => {
    const timeline: NovelTimelineService = {
      read: async () => ({
        id: 'demo', version: 1, currentNodeId: 'node-1',
        nodes: [
          { id: 'node-0', order: 0, label: '发现海图', beatId: 'beat-1', detailBeatId: 'detail-1', reveals: [], relationships: ['rel-early'] },
          { id: 'node-1', order: 1, label: '钟楼对峙', beatId: 'beat-1', detailBeatId: 'detail-2', reveals: [], relationships: [] },
        ],
      }),
      ensureFromOutline: async () => { throw new Error('unused'); },
      setCurrentNode: async () => { throw new Error('unused'); },
      save: async () => { throw new Error('unused'); },
    };
    const builder = createNextSceneContextBuilder(stubDeps({ timeline }));
    const context = await builder.context('demo');
    const injected = context.sources.context.sources.relationships!.relationships;
    // 手动锚定 node-1（写作位置其实在 detail-1）：rel-early 已建立（order 0 < 1）→ 注入。
    expect(injected.map((item) => item.id)).toEqual(['rel-early', 'rel-late']);
  });
});
