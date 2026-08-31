import { afterEach, describe, expect, it } from 'vitest';
import { cleanupClientTestEnv, collect, flush, mount, READY_MODEL, type FakeNode } from './client/test-harness.js';
import { captureRoute, freshRouter, linkForRouteFocus, linkFromSearchHit, popRoute, pushRoute, routeForLink } from './client/router.js';
import { freshWorkbenchState } from './client/store/index.js';

afterEach(cleanupClientTestEnv);

const TEXT_HIT = {
  layer: 'text' as const, id: 'scene-2', title: '旧灯塔 · 场景 2', preview: '米拉看见海图。',
  nav: { kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-2' }, score: 3, matched: 'title' as const,
};

describe('I124 Client router/back-stack', () => {
  it('captures every source context field and pops one route at a time', () => {
    const state = freshWorkbenchState();
    state.activeView = 'search';
    state.chapters = { ...state.chapters, mode: 'candidate', selectedChapterId: 'chapter-1', selectedSceneId: 'scene-1' };
    state.search = { ...state.search, query: '海图', pov: 'mira', referenceKey: 'north-harbor' };
    const source = captureRoute('book', state);
    const target = routeForLink('book', { projectId: 'book', kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-2' });
    expect(target.ok).toBe(true);
    const pushed = pushRoute(freshRouter(), source, target.ok ? target.route : source);
    expect(pushed.backStack[0]).toEqual({
      projectId: 'book', view: 'search', mode: 'candidate',
      selection: { chapterId: 'chapter-1', sceneId: 'scene-1' },
      filter: { searchQuery: '海图', searchPov: 'mira', searchReferenceKey: 'north-harbor' },
    });
    const popped = popRoute(pushed);
    expect(popped.route).toEqual(source);
    expect(popped.state.backStack).toHaveLength(0);
  });

  it('adapts legacy SearchNavigation once at the router boundary and rejects malformed targets', () => {
    expect(linkFromSearchHit('book', TEXT_HIT)).toMatchObject({ ok: true, link: { kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-2' } });
    expect(linkFromSearchHit('book', { ...TEXT_HIT, nav: { kind: 'text', chapterId: 'chapter-1' } })).toMatchObject({ ok: false, error: { code: 'invalid-link' } });
    expect(routeForLink('book', { projectId: 'other', kind: 'character', entityId: 'mira' })).toMatchObject({ ok: false, error: { code: 'cross-project' } });
  });

  it('I128 preserves an exact text anchor through route/back-stack link conversion', () => {
    const anchor = { start: 2, end: 4, quote: '突然', sourceHash: 'a'.repeat(64) };
    const result = routeForLink('book', { projectId: 'book', kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-2', anchor });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.route.focus?.anchor).toEqual(anchor);
    expect(linkForRouteFocus(result.route)).toEqual({ projectId: 'book', kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-2', anchor });
  });

  it('runs the real Search → Router → Chapters consumer and restores search filters on back', async () => {
    let sceneReads = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        chapterList: async () => [{ id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', sceneCount: 2 }],
        chapterRead: async () => ({ ok: true, value: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '进入' }, { id: 'scene-2', index: 1, summary: '海图' }] } }),
        sceneRead: async (_projectId, _chapterId, sceneId) => { sceneReads += 1; return { ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira' }, scene: { id: sceneId, index: sceneId === 'scene-1' ? 0 : 1, summary: '海图', content: '米拉看见海图。', beats: [], canonEvents: [], notes: '' } } }; },
      },
      { search: { search: async () => ({ ok: true, value: { query: '海图', total: 1, hits: [TEXT_HIT] } }) } },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const nav = (view: string) => collect(render(), 'button').find((node) => node.props?.['data-novel-view'] === view);
    (nav('search')?.props?.onClick as () => void)();
    await flush();
    const input = collect(render(), 'input').find((node) => node.props?.['data-novel-search-input'] !== undefined);
    (input?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '海图' } });
    const pov = collect(render(), 'input').find((node) => node.props?.['data-novel-search-pov'] !== undefined);
    (pov?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'mira' } });
    const reference = collect(render(), 'input').find((node) => node.props?.['data-novel-search-ref-input'] !== undefined);
    (reference?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'north-harbor' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-search-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-search-jump'] === 'text')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('chapters');
    expect(sceneReads).toBeGreaterThan(0);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-router-back'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('search');
    expect((collect(render(), 'input').find((node) => node.props?.['data-novel-search-input'] !== undefined)?.props?.value)).toBe('海图');
    expect((collect(render(), 'input').find((node) => node.props?.['data-novel-search-pov'] !== undefined)?.props?.value)).toBe('mira');
    expect((collect(render(), 'input').find((node) => node.props?.['data-novel-search-ref-input'] !== undefined)?.props?.value)).toBe('north-harbor');
  });
});
