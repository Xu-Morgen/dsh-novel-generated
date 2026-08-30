/**
 * I95 按面板拆分（计划 §18 I95）：I71 全局搜索与上下文追踪 UI (R14-6)
 */
/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：后置写作能力面板 —— 候选审阅 /
 * 审校中心 / 生成队列 / 知情揭示 / 规则文风 / 进度灵感 / 导入导出 / 搜索追踪 /
 * 写作进度 / 剧情时间线（I63–I72 / 方案 A）。
 */


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';
import { QUEUE_POLL_INTERVAL_MS } from './client/ops/queue.js';

afterEach(cleanupClientTestEnv);

describe('I71 全局搜索与上下文追踪 UI (R14-6)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const searchPanelOf = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-search-panel'] !== undefined);
  const searchMessage = (render: () => FakeNode): string =>
    String((collect(render(), 'p').find((n) => n.props?.['data-novel-search-message'] !== undefined)?.children?.[0] ?? ''));

  const STATS = {
    indexExists: true, builtAt: '2026-01-01T00:00:00.000Z',
    counts: { text: 2, characters: 1, worldview: 1, outline: 1, canon: 1, knowledge: 2 },
    totalEntries: 8,
  };
  const TEXT_HIT = {
    layer: 'text', id: 'scene-1', title: '旧灯塔 · 场景 1', preview: '米拉推开旧灯塔的门。',
    nav: { kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-1' }, score: 3, matched: 'title',
  };

  it('关键词搜索：输入 → Remote 提交（含可选 POV）→ 有界命中列表渲染', async () => {
    const calls: Array<{ query: string; pov?: string }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        search: {
          search: async (_projectId, query, pov) => {
            calls.push({ query, pov });
            return { ok: true, value: { query, ...(pov !== undefined && pov !== '' ? { pov } : {}), total: 1, hits: [TEXT_HIT] } };
          },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'search')?.props?.onClick as () => void)();
    await flush();
    expect(searchPanelOf(render())?.props?.['data-novel-search-state']).toBe('idle');
    const queryInput = () => collect(render(), 'input').find((n) => n.props?.['data-novel-search-input'] !== undefined);
    (queryInput()?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: '海图' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(calls).toEqual([{ query: '海图', pov: undefined }]);
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-search-result-count'] !== undefined)?.children?.[0] ?? '')).toContain('命中 1 条');
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-search-hit'] === 'text:scene-1')).toBe(true);
    // POV 过滤透传（Host 在查询时用 live C3 knows 过滤，Client 零领域过滤）。
    (collect(render(), 'input').find((n) => n.props?.['data-novel-search-pov'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'mira' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(calls[1]).toEqual({ query: '海图', pov: 'mira' });
  });

  it('索引生命周期：重建 → 统计可见；删除 → 未构建提示（派生视图可删除重建，非第二真相）', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        search: {
          build: async () => ({ ok: true, value: STATS }),
          drop: async () => ({ ok: true, value: { indexExists: false, counts: { text: 0, characters: 0, worldview: 0, outline: 0, canon: 0, knowledge: 0 }, totalEntries: 0 } }),
          stats: async () => ({ ok: true, value: STATS }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'search')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-rebuild'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-search-stats'] !== undefined)?.children?.[0] ?? '')).toContain('共 8 条');
    expect(searchMessage(render)).toContain('重建派生索引');
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-drop'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(searchMessage(render)).toContain('已删除派生索引');
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-search-stats'] !== undefined)?.children?.[0] ?? '')).toContain('未构建');
  });

  it('结果跳转：正文命中 → 正文视图并打开对应场景（脏文本保护复用）', async () => {
    let chapterReads = 0;
    let sceneReads = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        chapterList: async () => [{ id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', sceneCount: 1 }],
        chapterRead: async () => { chapterReads += 1; return { ok: true, value: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '进入灯塔' }] } }; },
        sceneRead: async () => { sceneReads += 1; return { ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira' }, scene: { id: 'scene-1', index: 0, summary: '进入灯塔', content: '米拉推开旧灯塔的门。', beats: [], canonEvents: [], notes: '' } } }; },
      },
      {
        search: { search: async () => ({ ok: true, value: { query: '米拉', total: 1, hits: [TEXT_HIT] } }) },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'search')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'input').find((n) => n.props?.['data-novel-search-input'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: '米拉' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-jump'] === 'text')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('chapters');
    expect(chapterReads).toBeGreaterThanOrEqual(1);
    expect(sceneReads).toBeGreaterThanOrEqual(1);
    expect(collect(render(), 'p').some((n) => String(n.children?.[0] ?? '').includes('米拉推开旧灯塔的门。'))).toBe(true);
  });

  it('候选审阅展示生成注入解释（trace 层/触发/预算摘要，不泄露 secret 内容）', async () => {
    const traceReview = {
      ok: true,
      value: {
        candidateId: 'cand-1', intent: 'continue',
        target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-next' },
        text: '米拉在码头找到铜钥匙。', diff: { kind: 'new-scene' },
        validation: { status: 'pass', violations: [] },
        trace: {
          intent: 'continue', pov: 'mira',
          navigation: { actId: 'act-1', beatId: 'beat-1', title: '午夜灯塔' },
          sections: [
            { id: 'rules', characterCount: 60, budget: 4000, truncated: false },
            { id: 'worldview', characterCount: 40, budget: 3000, truncated: false },
          ],
          triggers: [{ entryId: 'north-harbor', title: '北港', matchedKeywords: ['北港'] }],
          totals: { characterCount: 100, budget: 24000, truncatedSectionCount: 0 },
          rewritePromptCharacters: 0, knowledgeVisibleCount: 1,
        },
      },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        chapterList: async () => [{ id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', sceneCount: 0 }],
        chapterRead: async () => ({ ok: true, value: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', scenes: [] } }),
        sceneRead: async () => { throw new Error('unused'); },
      },
      {
        writing: {
          proposeAt: async () => ({ ok: true, value: { candidate: { id: 'cand-1', intent: 'continue', target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-next' }, prompt: 'p', text: '米拉在码头找到铜钥匙。', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' } } }),
          preview: async () => traceReview,
          adjudicate: async () => { throw new Error('unused'); },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-candidate-propose-continue'] === '')?.props?.onClick as () => void)();
    await flush();
    const trace = collect(render(), 'details').find((n) => n.props?.['data-novel-candidate-trace'] !== undefined);
    expect(trace).toBeDefined();
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-candidate-trace-intent'] !== undefined)?.children?.[0] ?? '')).toContain('POV mira');
    const sections = collect(render(), 'li').filter((n) => n.props?.['data-novel-candidate-trace-section'] !== undefined);
    expect(sections.map((n) => n.props?.['data-novel-candidate-trace-section'])).toEqual(['rules', 'worldview']);
    expect(String(collect(render(), 'li').find((n) => n.props?.['data-novel-candidate-trace-trigger'] === 'north-harbor')?.children?.[0] ?? '')).toContain('北港');
    // 负测：trace 渲染不含知识事实/重写指令等 secret 内容。
    expect(JSON.stringify(collect(render(), 'details').map((n) => n.props))).not.toContain('北港海底沉睡着');
  });
})
