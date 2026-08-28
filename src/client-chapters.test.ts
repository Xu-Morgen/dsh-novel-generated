/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：C5 正文 —— 章节/场景只读导航与
 * 正文编辑 + 可选 reparse（I60 / I61）。
 */


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);

describe('I60 C5 章节/场景只读导航 (R13-1)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const chaptersTree = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'div').find((node) => node.props?.['data-novel-chapter-tree'] !== undefined);
  const sceneList = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'div').find((node) => node.props?.['data-novel-chapter-scenes'] !== undefined);
  const bodyPane = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'div').find((node) => node.props?.['data-novel-scene-body'] !== undefined);
  const paragraphs = (tree: FakeNode): string[] =>
    collect(tree, 'p').filter((node) => node.props?.['className'] === 'nv-chapters__paragraph').map((node) => String(node.children?.[0] ?? ''));

  const CHAPTER_LIST = [
    { id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft', sceneCount: 2 },
    { id: 'chapter-2', index: 2, title: '第二章', pov: 'lin', status: 'draft', sceneCount: 1 },
  ];
  const CHAPTER_1_READ = {
    ok: true,
    value: {
      id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft',
      scenes: [
        { id: 'scene-1', index: 0, summary: '相遇' },
        { id: 'scene-2', index: 1, summary: '分别' },
      ],
    },
  };
  const SCENE_1_READ = {
    ok: true,
    value: {
      chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'lin' },
      scene: { id: 'scene-1', index: 0, summary: '相遇', content: '第一段。\n\n第二段。', beats: [], canonEvents: [], notes: '' },
    },
  };
  const SCENE_2_READ = {
    ok: true,
    value: {
      chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'lin' },
      scene: { id: 'scene-2', index: 1, summary: '分别', content: '第三段。', beats: [], canonEvents: [], notes: '' },
    },
  };

  it('写作组新增「正文」视图；章节树/场景列表/正文按 Host 只读投影渲染', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => CHAPTER_LIST,
      chapterRead: async (_projectId, chapterId) => (chapterId === 'chapter-1' ? CHAPTER_1_READ : { ok: true, value: { id: chapterId, index: 2, title: '第二章', pov: 'lin', status: 'draft', scenes: [] } }),
      sceneRead: async (_projectId, _chapterId, sceneId) => (sceneId === 'scene-1' ? SCENE_1_READ : SCENE_2_READ),
    });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const chaptersButton = navButton(render(), 'chapters');
    expect(chaptersButton, '正文 nav button').toBeDefined();
    (chaptersButton?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    expect(tree.props?.['data-novel-route']).toBe('chapters');
    expect(collect(tree, 'section').some((n) => n.props?.['data-novel-chapters-panel'] !== undefined)).toBe(true);
    // 章节树（按 Host 返回顺序）与场景列空态（未选章节）。
    const chapterItems = collect(tree, 'button').filter((n) => n.props?.['data-novel-chapter-item'] !== undefined);
    expect(chapterItems.map((n) => n.props?.['data-novel-chapter-item'])).toEqual(['chapter-1', 'chapter-2']);
    expect(collect(sceneList(tree) ?? ({} as FakeNode), 'p').map((node) => String(node.children?.[0] ?? ''))).toContain('选择左侧章节查看场景。');
    // 选择第一章 → chapterRead → 场景列表 + 自动读取首个场景（sceneRead）。
    (chapterItems[0]?.props?.onClick as () => void)();
    await flush();
    const tree2 = render();
    const sceneItems = collect(tree2, 'button').filter((n) => n.props?.['data-novel-scene-item'] !== undefined);
    expect(sceneItems.map((n) => n.props?.['data-novel-scene-item'])).toEqual(['scene-1', 'scene-2']);
    // 正文：首个场景自动选中并按空行拆段渲染（只经 sceneRead 投影）。
    expect(paragraphs(tree2)).toEqual(['第一段。', '第二段。']);
    // 切换场景 → 正文更新。
    (sceneItems[1]?.props?.onClick as () => void)();
    await flush();
    expect(paragraphs(render())).toEqual(['第三段。']);
  });

  it('空章：章节树显示 0 场景章节，场景列与正文区显示空态而不崩溃', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => [{ id: 'chapter-empty', index: 1, title: '空章', pov: 'lin', status: 'draft', sceneCount: 0 }],
      chapterRead: async () => ({ ok: true, value: { id: 'chapter-empty', index: 1, title: '空章', pov: 'lin', status: 'draft', scenes: [] } }),
      sceneRead: async () => { throw new Error('不应读取空章场景'); },
    });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-chapter-item'] === 'chapter-empty')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    // 场景列与正文区各有一个 data-novel-chapters-empty 空态。
    const empties = collect(tree, 'p').filter((n) => n.props?.['data-novel-chapters-empty'] !== undefined);
    expect(empties.length).toBeGreaterThanOrEqual(2);
    expect(collect(tree, 'button').some((n) => n.props?.['data-novel-scene-item'] !== undefined)).toBe(false);
  });

  it('错误态：章节读取失败显示错误与重试，重试成功后恢复场景列表与正文', async () => {
    let failChapter = true;
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => CHAPTER_LIST,
      chapterRead: async (_projectId, chapterId) => {
        if (failChapter) throw new Error('章节文档损坏');
        return chapterId === 'chapter-1' ? CHAPTER_1_READ : { ok: true, value: { id: chapterId, index: 2, title: '第二章', pov: 'lin', status: 'draft', scenes: [] } };
      },
      sceneRead: async (_projectId, _chapterId, sceneId) => (sceneId === 'scene-1' ? SCENE_1_READ : SCENE_2_READ),
    });
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-chapter-item'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((n) => n.props?.['data-novel-chapters-error'] !== undefined)).toBe(true);
    // 重试（Host 已恢复）→ 场景列表与正文出现，错误态消失。
    failChapter = false;
    (collect(render(), 'button').find((n) => n.props?.['data-novel-chapters-retry'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    expect(collect(tree, 'div').some((n) => n.props?.['data-novel-chapters-error'] !== undefined)).toBe(false);
    expect(collect(tree, 'button').filter((n) => n.props?.['data-novel-scene-item'] !== undefined).length).toBe(2);
    expect(paragraphs(tree)).toEqual(['第一段。', '第二段。']);
  });

  it('正文视图是稳定视图：重复点击保持原位（不回退默认层视图）', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const button = navButton(render(), 'chapters');
    (button?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('chapters');
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('chapters');
    expect(chaptersTree(render())).toBeDefined();
    expect(bodyPane(render())).toBeDefined();
  });
});

describe('I61 C5 正文编辑与可选 reparse (R13-2)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const sceneTextarea = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'textarea').find((node) => node.props?.['data-novel-scene-text'] !== undefined);
  const byAnchor = (tree: FakeNode, anchor: string): FakeNode | undefined => {
    const found = collect(tree, 'button').find((node) => node.props?.[anchor] !== undefined)
      ?? collect(tree, 'p').find((node) => node.props?.[anchor] !== undefined)
      ?? collect(tree, 'div').find((node) => node.props?.[anchor] !== undefined);
    return found;
  };

  const CHAPTER_LIST = [
    { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', sceneCount: 2 },
    { id: 'chapter-2', index: 2, title: '第二章', pov: 'mira', status: 'draft', sceneCount: 1 },
  ];
  const SCENE_1 = { id: 'scene-1', index: 0, summary: '相遇', content: 'prefix TARGET suffix', beats: [], canonEvents: [], notes: '' };
  const SCENE_2 = { id: 'scene-2', index: 1, summary: '分别', content: '另一段正文', beats: [], canonEvents: [], notes: '' };
  const READ_1 = { ok: true, value: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '相遇' }, { id: 'scene-2', index: 1, summary: '分别' }] } };
  const READ_2 = { ok: true, value: { id: 'chapter-2', index: 2, title: '第二章', pov: 'mira', status: 'draft', scenes: [] } };

  /** 打开正文视图并选中 chapter-1/scene-1（自动装载正文）。 */
  async function openScene(overrides: WorkspaceOverrides): Promise<{ registrations: ReturnType<typeof mount>['registrations']; render: () => FakeNode }> {
    const m = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => CHAPTER_LIST,
      chapterRead: async (_projectId, chapterId) => (chapterId === 'chapter-1' ? READ_1 : READ_2),
      sceneRead: async (_projectId, _chapterId, sceneId) => ({ ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira' }, scene: sceneId === 'scene-1' ? SCENE_1 : SCENE_2 } }),
      ...overrides,
    });
    await flush();
    const render = () => m.registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-scene-item'] === 'scene-1')).toBe(true);
    return { registrations: m.registrations, render };
  }

  it('编辑模式：单一连续范围 diff 保存，sceneEdit 携带精确 range/replacement/baseHash，exact round-trip', async () => {
    const calls: Array<{ range: unknown; replacement: string; baseHash: string }> = [];
    const { render } = await openScene({
      sceneEdit: async (_p, _c, _s, range, replacement, baseHash) => {
        calls.push({ range, replacement, baseHash: baseHash ?? '' });
        return { ok: true, value: { scene: { ...SCENE_1, content: 'prefix replacement suffix' }, evidence: { before: 'before', after: 'after', unchangedPrefix: 'prefix ', unchangedSuffix: ' suffix' } } };
      },
    });
    // 默认只读正文 + 「编辑正文」入口（I60 阅读语义保留）。
    expect(collect(render(), 'p').some((node) => node.props?.['className'] === 'nv-chapters__paragraph')).toBe(true);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    const textarea = sceneTextarea(render());
    expect(textarea, '编辑模式 textarea').toBeDefined();
    // 修改草稿 → 单一范围 diff（TARGET → replacement，范围外不变）。
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'prefix replacement suffix' } });
    await flush();
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-scene-range'] === 'single')).toBe(true);
    // 保存修改 → 只写 C5：精确 range/replacement + 装载时 baseHash（测试桩 64 个零）。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].range).toEqual({ start: 7, end: 13 });
    expect(calls[0].replacement).toBe('replacement');
    expect(calls[0].baseHash).toBe('0'.repeat(64));
    // 保存状态：已保存；草稿不再 dirty（re-save 按钮禁用）。
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-save-state'] === 'saved')).toBe(true);
    expect((collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save'] !== undefined)?.props as { disabled?: boolean }).disabled).toBe(true);
  });

  it('保存并重解析：propose 携带 baseHash → 提案面板 → 确认后 sceneReparseAccept 走 fan-out，完成态', async () => {
    const proposed: Array<{ range: unknown; replacement: string; baseHash: string }> = [];
    const accepted: Array<{ range: unknown; replacement: string; proposalId: string; baseHash: string }> = [];
    const { render } = await openScene({
      sceneReparsePropose: async (_p, _c, _s, range, replacement, baseHash) => {
        proposed.push({ range, replacement, baseHash: baseHash ?? '' });
        return { ok: true, value: { proposalId: 'scene-reparse-abc', status: 'pending' } };
      },
      sceneReparseAccept: async (_p, _c, _s, range, replacement, proposalId, baseHash) => {
        accepted.push({ range, replacement, proposalId, baseHash: baseHash ?? '' });
        return { ok: true, value: { status: 'written', scene: { ...SCENE_1, content: 'prefix parsed suffix' }, layers: ['c2', 'c1', 'c3', 'c4', 'b2'] } };
      },
    });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    const textarea = sceneTextarea(render());
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'prefix parsed suffix' } });
    await flush();
    // 保存并重解析 → propose（不写层）。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save-reparse'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(proposed).toHaveLength(1);
    expect(proposed[0].range).toEqual({ start: 7, end: 13 });
    expect(proposed[0].replacement).toBe('parsed');
    expect(proposed[0].baseHash).toBe('0'.repeat(64));
    // 提案面板 + 草稿锁定（textarea disabled）。
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-scene-reparse-proposed'] !== undefined)).toBe(true);
    expect((sceneTextarea(render())?.props as { disabled?: boolean }).disabled).toBe(true);
    // 确认重解析 → accept 使用冻结的 range/replacement + proposalId + baseHash。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-reparse-accept'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toEqual({ range: { start: 7, end: 13 }, replacement: 'parsed', proposalId: 'scene-reparse-abc', baseHash: '0'.repeat(64) });
    // 完成态：显示已同步层；保存按钮因 dirty=false 禁用。
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-scene-reparse-done'] !== undefined)).toBe(true);
  });

  it('拒绝 reparse：sceneReparseReject 被调用，面板进入 rejected 态（结构层由 Host 保证不变）', async () => {
    const rejected: string[] = [];
    const { render } = await openScene({
      sceneReparsePropose: async () => ({ ok: true, value: { proposalId: 'scene-reparse-abc', status: 'pending' } }),
      sceneReparseReject: async (_p, proposalId) => { rejected.push(proposalId); return { ok: true, value: { proposalId, status: 'rejected' } }; },
    });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (sceneTextarea(render())?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'prefix parsed suffix' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save-reparse'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-reparse-reject'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(rejected).toEqual(['scene-reparse-abc']);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-scene-reparse-rejected'] !== undefined)).toBe(true);
    // 拒绝后草稿仍 dirty（未保存），可继续仅保存正文。
    expect((collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save'] !== undefined)?.props as { disabled?: boolean }).disabled).toBe(false);
  });

  it('脏文本保护：未保存草稿切换场景先弹确认条；放弃后离开，取消则停留', async () => {
    let sceneReads = 0;
    const { render } = await openScene({
      sceneRead: async (_p, _c, sceneId) => { sceneReads += 1; return { ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira' }, scene: sceneId === 'scene-1' ? SCENE_1 : SCENE_2 } }; },
    });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (sceneTextarea(render())?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'prefix DIRTY suffix' } });
    await flush();
    const readsBefore = sceneReads;
    // 切换到 scene-2 → 脏文本确认条，且不发起读取。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-item'] === 'scene-2')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-scene-leave'] !== undefined)).toBe(true);
    expect(sceneReads).toBe(readsBefore);
    // 取消 → 停留当前场景。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-leave-cancel'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-scene-leave'] !== undefined)).toBe(false);
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-scene-item'] === 'scene-1' && String(node.props?.['className'] ?? '').includes('is-active'))).toBe(true);
    // 再次切换并放弃 → 真正读取 scene-2。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-item'] === 'scene-2')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-discard'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(sceneReads).toBeGreaterThan(readsBefore);
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-scene-item'] === 'scene-2' && String(node.props?.['className'] ?? '').includes('is-active'))).toBe(true);
  });

  it('保存修改重复点击至多一次 Remote（I59 防重复提交语义）', async () => {
    let editCalls = 0;
    const { render } = await openScene({
      sceneEdit: async () => { editCalls += 1; return { ok: true, value: { scene: { ...SCENE_1, content: 'prefix replacement suffix' }, evidence: { before: 'b', after: 'a', unchangedPrefix: 'prefix ', unchangedSuffix: ' suffix' } } }; },
    });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (sceneTextarea(render())?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'prefix replacement suffix' } });
    await flush();
    const saveButton = collect(render(), 'button').find((node) => node.props?.['data-novel-scene-save'] !== undefined);
    (saveButton?.props?.onClick as () => void)();
    (saveButton?.props?.onClick as () => void)();
    await flush();
    expect(editCalls).toBe(1);
  });
});
