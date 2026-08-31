import { describe, expect, it } from 'vitest';
import { createNextSceneContextBuilder, type NextSceneContextDeps } from './writing-context.js';
import type { NovelTimelineService } from './timeline-service.js';
import { assembleStoryContext } from '../core/pipeline/index.js';
import { registerContextSerializers } from '../core/assemble/serializers.js';
import { ContextAssembler } from '../core/assemble/index.js';
import { textContentHash } from '../core/text/index.js';
import type { Chapter } from '../core/schema/text.js';

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

function contextChapter(id: string, index: number, scenes: Chapter['scenes']): Chapter {
  return { id, index, title: id, pov: 'mira', status: 'draft', scenes };
}

function contextScene(id: string, index: number, content: string, branches: Chapter['scenes'][number]['branches'] = []): Chapter['scenes'][number] {
  return { id, index, content, summary: id, beats: [], canonEvents: [], notes: '', branches };
}

function currentBaseline(overrides: Record<string, unknown> = {}) {
  return {
    baselineId: 'baseline-current', projectId: 'demo', chapterId: 'chapter-2', sceneId: 'scene-target', detailBeatId: 'detail-1',
    b5ContentFingerprint: 'a'.repeat(64), bindingFingerprint: 'b'.repeat(64),
    sceneCard: { actId: 'act-1', beatId: 'beat-1', beatTitle: '午夜旧灯塔', detailBeat: { id: 'detail-1', title: '发现海图', summary: '发现海图', pov: 'mira', wordTarget: 20, points: ['海图'], status: 'writing' as const } },
    revision: 2, authoringBase: { content: 'draft-before-author-save', sourceHash: textContentHash('') }, status: 'current' as const,
    generatedCandidateIds: [], createdAt: '2026-08-31T00:00:00.000Z', ...overrides,
  };
}

describe('I121 逐章上下文循环', () => {
  it('按 chapter.index → scene.index 选择目标前的作者正文，chosen 分支可见且旧草稿/未来场景不可见', async () => {
    const chosen = contextScene('scene-two-b', 1, '作者保存后的当前正文', [
      { id: 'branch-old', label: '旧草稿', content: '旧草稿不应进入 prompt', chosen: false },
      { id: 'branch-current', label: '当前版本', content: '作者保存后的当前正文', chosen: true },
    ]);
    const chapters = [
      contextChapter('chapter-2', 2, [
        contextScene('scene-target', 2, ''),
        chosen,
        contextScene('scene-two-a', 0, '第二章第一场'),
        contextScene('scene-future', 3, '目标之后的正文'),
      ]),
      contextChapter('chapter-1', 1, [contextScene('scene-one', 0, '第一章正文')]),
    ];
    const deps = stubDeps({
      text: { listChapters: async () => chapters } as unknown as NextSceneContextDeps['text'],
      textFingerprint: async () => 'c'.repeat(64),
      sceneOutlineBinding: { read: async () => ({ manual: [], effective: [{ sceneId: 'scene-target', detailBeatId: 'detail-1', chapterId: 'chapter-2', source: 'manual' as const }], fingerprint: 'b'.repeat(64) }) },
      outlineGenerationBaseline: { current: async (_projectId, input) => {
        expect(input).toEqual({ chapterId: 'chapter-2', sceneId: 'scene-target', detailBeatId: 'detail-1' });
        return { baseline: currentBaseline(), freshness: 'fresh' as const, staleReasons: [] };
      } },
    });
    const context = await createNextSceneContextBuilder(deps).context('demo');
    const prompt = assembleStoryContext(registerContextSerializers(new ContextAssembler()), context.sources).prompt;
    const history = context.sources.history.recentScenes.map((scene) => scene.id);
    expect(history).toEqual(['scene-one', 'scene-two-a', 'scene-two-b']);
    expect(prompt.indexOf('第一章正文')).toBeLessThan(prompt.indexOf('第二章第一场'));
    expect(prompt.indexOf('第二章第一场')).toBeLessThan(prompt.indexOf('作者保存后的当前正文'));
    expect(prompt).toContain('作者保存后的当前正文');
    expect(prompt).not.toContain('draft-before-author-save');
    expect(prompt).not.toContain('旧草稿不应进入 prompt');
    expect(prompt).not.toContain('目标之后的正文');
    expect(context.provenance.baseline).toMatchObject({ baselineId: 'baseline-current', sourceHash: textContentHash('') });
    expect(context.provenance.history.map((entry) => entry.chapterIndex)).toEqual([1, 2, 2]);
    expect(context.trace.sections.some((section) => section.id === 'history')).toBe(true);
  });

  it('当前 baseline stale 时 fail closed，不让旧基线继续生成', async () => {
    const deps = stubDeps({
      text: { listChapters: async () => [contextChapter('chapter-2', 2, [contextScene('scene-target', 0, '')])] } as unknown as NextSceneContextDeps['text'],
      sceneOutlineBinding: { read: async () => ({ manual: [], effective: [{ sceneId: 'scene-target', detailBeatId: 'detail-1', chapterId: 'chapter-2', source: 'manual' as const }], fingerprint: 'b'.repeat(64) }) },
      outlineGenerationBaseline: { current: async () => ({ baseline: currentBaseline({ b5ContentFingerprint: 'd'.repeat(64) }), freshness: 'stale' as const, staleReasons: ['b5-changed' as const] }) },
    });
    await expect(createNextSceneContextBuilder(deps).context('demo')).rejects.toThrow('Stale outline generation baseline for context: b5-changed');
  });

  it('生产式 I121 owner 缺失 baseline 时拒绝，不退回 caller 自建 history', async () => {
    const deps = stubDeps({
      text: { listChapters: async () => [contextChapter('chapter-1', 1, [contextScene('scene-1', 0, '不会被消费')])] } as unknown as NextSceneContextDeps['text'],
      sceneOutlineBinding: { read: async () => ({ manual: [], effective: [{ sceneId: 'scene-1', detailBeatId: 'detail-1', chapterId: 'chapter-1', source: 'manual' as const }], fingerprint: 'b'.repeat(64) }) },
      outlineGenerationBaseline: { current: async () => ({ baseline: null, freshness: 'none' as const, staleReasons: [] }) },
    });
    await expect(createNextSceneContextBuilder(deps).context('demo')).rejects.toThrow('No current outline generation baseline for detail beat: detail-1');
  });

  it('正文在上下文装配期间被保存时拒绝混合快照', async () => {
    let fingerprintReads = 0;
    const deps = stubDeps({
      textFingerprint: async () => fingerprintReads++ === 0 ? 'c'.repeat(64) : 'd'.repeat(64),
    });
    await expect(createNextSceneContextBuilder(deps).context('demo')).rejects.toThrow('Text changed during context assembly');
  });
});
