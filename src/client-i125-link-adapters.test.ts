import { afterEach, describe, expect, it } from 'vitest';
import { contextLinkButton, entityContextLink, textContextLink } from './client/link-adapters.js';
import { cleanupClientTestEnv, collect, fakeReact, flush, mount, READY_MODEL, type FakeNode } from './client/test-harness.js';
import { createRouterOps } from './client/ops/router.js';
import { freshWorkbenchState } from './client/store/index.js';

afterEach(cleanupClientTestEnv);

const CHARACTER = {
  id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '见习测绘师',
  motivation: '追查守夜人', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
  arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
};
const RELATIONSHIP = { id: 'rel-mira-lin', from: 'mira', to: 'lin', type: 'friendship', affinity: 20, trust: 40, status: 'active', milestones: [], knownTo: [] };
const OUTLINE = {
  id: 'outline', structure: 'three-act', logline: '米拉追查灯塔秘密', themes: [],
  acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '开局', beats: [{
    id: 'beat-1', title: '发现', description: '发现海图', charactersInvolved: ['mira'], conflictType: 'external',
    prerequisites: [], optional: false, detailBeats: [{ id: 'card-1', title: '旧灯塔', summary: '进入灯塔', pov: 'mira', wordTarget: 500, points: [], status: 'planned' }],
  }] }], foreshadowing: [], endings: [],
};
const KNOWLEDGE = {
  projectId: 'fixture-project', entries: [{
    id: 'fact-1', fact: '北港藏着一张海图', kind: 'secret', status: 'hidden', holders: ['mira'],
    revealPlan: { revealTo: [], revealAt: '' }, povHint: '当前 POV：米拉',
  }],
  characters: [{ characterId: 'mira', name: '米拉', knows: ['fact-1'] }],
  summary: { total: 1, hidden: 1, partiallyRevealed: 0, revealed: 0, withPlan: 0 },
};
const REVIEW = {
  projectId: 'fixture-project', scannedAt: '2026-08-31T00:00:00.000Z',
  issues: [{ id: 'issue-1', category: 'knowledge', severity: 'soft', kind: 'knowledge-leak', message: '知情边界提示', references: ['fact-1'], location: { chapterId: 'chapter-1', sceneId: 'scene-1' }, status: 'open' }],
  summary: { total: 1, hard: 0, soft: 1, byCategory: { rule: 0, canon: 0, knowledge: 1, relationship: 0, style: 0 } },
};
const TIMELINE = {
  id: 'fixture-project', version: 1, currentNodeId: null,
  nodes: [{ id: 'node-1', order: 0, label: '发现海图', reveals: [], relationships: [] }],
};

const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
  collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
const contextButton = (tree: FakeNode, source: string): FakeNode | undefined =>
  collect(tree, 'button').find((node) => node.props?.['data-novel-context-link-source'] === source);

describe('I125 七类链接来源与目标适配', () => {
  it('所有来源 adapter 只构造严格链接，并把打开动作交给 Router sink', () => {
    const opened: unknown[] = [];
    const sink = { open: (link: unknown) => opened.push(link) };
    const cases = [
      ['character', entityContextLink('book', 'character', 'mira')],
      ['relationship', entityContextLink('book', 'relationship', 'rel-1')],
      ['knowledge', entityContextLink('book', 'knowledge', 'fact-1')],
      ['review', entityContextLink('book', 'review', 'issue-1')],
      ['timeline', entityContextLink('book', 'timeline', 'node-1')],
      ['scene-card', entityContextLink('book', 'scene-card', 'card-1')],
      ['review-text', textContextLink('book', 'chapter-1', 'scene-1')],
    ] as const;
    const h = (tag: string, props?: Record<string, unknown> | null, ...children: unknown[]) => fakeReact.createElement(tag, props ?? null, ...children);
    const buttons = cases.map(([source, link]) => contextLinkButton(h, `定位 ${source}`, source, link, sink) as FakeNode);
    expect(buttons.map((button) => button.props?.['data-novel-context-link-source'])).toEqual(cases.map(([source]) => source));
    expect(buttons.every((button) => button.props?.['aria-label'] !== undefined)).toBe(true);
    buttons.forEach((button) => (button.props?.onClick as () => void)());
    expect(opened).toEqual(cases.map(([, link]) => link));
    expect(contextLinkButton(h, '无 Router 时不渲染', 'missing', entityContextLink('book', 'character', 'mira'), undefined)).toBeNull();
  });

  it('角色入口：Host projection → Router → 角色选中，并可返回保留选择', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), { characterList: async () => [CHARACTER] });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'characters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-character-id'] === 'mira')?.props?.onClick as () => void)();
    await flush();
    (contextButton(render(), 'character')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('characters');
    expect(collect(render(), 'button').find((node) => node.props?.['data-novel-character-id'] === 'mira')?.props?.className).toContain('is-active');
    (collect(render(), 'button').find((node) => node.props?.['data-novel-router-back'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('characters');
    expect(render().props?.['data-novel-router-error']).toBeUndefined();
  });

  it('关系入口：Host projection → Router → 关系选中', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      characterList: async () => [CHARACTER], relationshipRead: async () => [RELATIONSHIP],
    });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'relationship')?.props?.onClick as () => void)();
    await flush();
    const link = contextButton(render(), 'relationship');
    expect(link).toBeDefined();
    (link?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('relationship');
    expect(collect(render(), 'button').find((node) => node.props?.['data-novel-relationship-id'] === RELATIONSHIP.id)?.props?.className).toContain('is-active');
  });

  it('负向：Host projection 不含目标时 Router fail-closed，不切换当前视图', () => {
    const state = freshWorkbenchState();
    state.activeView = 'characters';
    const errors: unknown[] = [];
    const router = createRouterOps({
      snapshot: state,
      act: { routerPatch: (patch: unknown) => errors.push(patch) } as never,
      projectId: 'book',
      isActive: () => true,
      beginOp: () => true,
      endOp: () => undefined,
      queuePoll: { start: () => undefined, stop: () => undefined } as never,
    }, {}, { focus: () => false });
    router.open({ projectId: 'book', kind: 'relationship', entityId: 'missing-rel' });
    expect(errors).toEqual([{ error: { code: 'unknown-target', message: '目标实体不存在或已不在当前作品中' } }]);
  });

  it('知情入口：事实 projection → 知情事实选中；同目标跳转不会切换成取消选中', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {}, {
      knowledge: { list: async () => ({ ok: true, value: KNOWLEDGE }), pending: async () => ({ ok: true, value: [] }) },
    });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'knowledge')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-knowledge-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-knowledge-fact-action'] === 'fact-1')?.props?.onClick as () => void)();
    await flush();
    (contextButton(render(), 'knowledge')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('knowledge');
    expect(collect(render(), 'li').find((node) => node.props?.['data-novel-knowledge-fact'] === 'fact-1')?.props?.className).toContain('is-selected');
  });

  it('审校入口：正文定位经 Router 打开章节场景，返回恢复审校选择', async () => {
    let sceneReads = 0;
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => [{ id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', sceneCount: 1 }],
      chapterRead: async () => ({ ok: true, value: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '进入' }] } }),
      sceneRead: async () => { sceneReads += 1; return { ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira' }, scene: { id: 'scene-1', index: 0, summary: '进入', content: '正文', beats: [], canonEvents: [], notes: '' } } }; },
    }, { review: { scan: async () => ({ ok: true, value: REVIEW }), records: async () => ({ ok: true, value: [] }) } });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'review')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'input').find((node) => node.props?.['data-novel-review-select'] === 'issue-1')?.props?.onChange as () => void)();
    await flush();
    (contextButton(render(), 'review')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('chapters');
    expect(sceneReads).toBeGreaterThan(0);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-router-back'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('review');
    expect(collect(render(), 'input').find((node) => node.props?.['data-novel-review-select'] === 'issue-1')?.props?.checked).toBe(true);
  });

  it('时间线入口：节点 projection → 时间点选中', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {}, {
      timeline: { read: async () => ({ ok: true, value: TIMELINE }) },
    });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'timeline')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-timeline-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-timeline-node'] === 'node-1')?.props?.onClick as () => void)();
    await flush();
    (contextButton(render(), 'timeline')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('timeline');
    expect(collect(render(), 'button').find((node) => node.props?.['data-novel-timeline-node'] === 'node-1')?.props?.className).toContain('is-active');
  });

  it('搜索入口：命中投影仍经 Search → Router → 正文场景', async () => {
    const hit = { layer: 'text' as const, id: 'scene-1', title: '旧灯塔', preview: '进入', nav: { kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-1' }, score: 1, matched: 'title' as const };
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => [{ id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', sceneCount: 1 }],
      chapterRead: async () => ({ ok: true, value: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '进入' }] } }),
      sceneRead: async () => ({ ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira' }, scene: { id: 'scene-1', index: 0, summary: '进入', content: '正文', beats: [], canonEvents: [], notes: '' } } }),
    }, { search: { search: async () => ({ ok: true, value: { query: '进入', total: 1, hits: [hit] } }) } });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'search')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'input').find((node) => node.props?.['data-novel-search-input'] !== undefined)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '进入' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-search-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-search-jump'] === 'text')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('chapters');
  });

  it('场景卡入口：场景卡 projection → 大纲幕/节/卡选中', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), { outlineRead: async () => OUTLINE });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'outline')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-detail-card'] === 'card-1')?.props?.onClick as () => void)();
    await flush();
    (contextButton(render(), 'scene-card')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('outline');
    expect(collect(render(), 'button').find((node) => node.props?.['data-novel-detail-card'] === 'card-1')?.props?.className).toContain('is-active');
  });
});
