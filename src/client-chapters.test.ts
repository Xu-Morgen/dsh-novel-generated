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

  it('I106 章节管理：真实状态机串接管理 Remote，删除在 impact→proposal→apply 后重读树', async () => {
    const impact = {
      kind: 'scene', chapterId: 'chapter-1', sceneId: 'scene-1', sceneCount: 1, branchCount: 0, proseCharacters: 8,
      sources: [{ sceneId: 'scene-1', sourceHash: 'a'.repeat(64), branches: [] }], projectFingerprint: 'a'.repeat(64), targetFingerprint: 'b'.repeat(64),
      bindings: [], activeQueue: [], activeCandidates: [], historicalReferences: [], opaqueHistoryCount: 0, blockers: [], impactFingerprint: 'c'.repeat(64),
    };
    let listReads = 0;
    const m = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => { listReads += 1; return CHAPTER_LIST; },
      chapterRead: async () => CHAPTER_1_READ,
      sceneRead: async () => SCENE_1_READ,
    }, {
      textMutation: { fingerprint: async () => ({ fingerprint: 'a'.repeat(64) }) },
      sceneOutlineBinding: { read: async () => ({ manual: [], effective: [], fingerprint: 'd'.repeat(64) }) },
      textDeletion: {
        impact: async () => ({ status: 'ready', impact }),
        propose: async () => ({ status: 'pending', proposalId: 'delete-1', impact }),
        apply: async () => ({ status: 'deleted', proposalId: 'delete-1', fingerprint: 'e'.repeat(64) }),
        reject: async () => ({ status: 'rejected', proposalId: 'delete-1' }),
      },
    });
    await flush();
    const render = () => m.registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    // I107：章节管理退居 materials 互斥模式，进入后才激活其 Remote 读取。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'materials')?.props?.onClick as () => void)();
    await flush();
    const deleteButton = collect(render(), 'button').find((node) => node.props?.['data-novel-scene-delete'] === 'scene-1');
    (deleteButton?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-deletion-impact'] !== undefined)).toBe(true);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-deletion-propose'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-deletion-pending'] !== undefined)).toBe(true);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-deletion-apply'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-deletion-state'] === 'done')).toBe(true);
    expect(listReads).toBeGreaterThan(0);
  });

  it('I107 章节区四种模式互斥：隐藏面板零读取，导航世代丢弃旧候选，草稿与键盘焦点行为保持确定', async () => {
    let aggregateReads = 0;
    let fingerprintReads = 0;
    let bindingReads = 0;
    let previewReads = 0;
    let resolvePropose: ((value: unknown) => void) | undefined;
    const m = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => CHAPTER_LIST,
      chapterRead: async () => CHAPTER_1_READ,
      sceneRead: async (_projectId, _chapterId, sceneId) => (sceneId === 'scene-1' ? SCENE_1_READ : SCENE_2_READ),
    }, {
      branch: {
        aggregate: async () => {
          aggregateReads += 1;
          return { projectId: 'fixture-project', chapters: [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '相遇', versionMode: 'branched', branches: [{ id: 'branch-1', label: '初稿', chosen: true, charCount: 8, hash: 'a'.repeat(64) }] }] }] };
        },
      },
      writing: {
        proposeAt: async () => new Promise((resolve) => { resolvePropose = resolve; }),
        preview: async () => {
          previewReads += 1;
          return { candidateId: 'candidate-old', intent: 'continue', text: '旧候选', target: { chapterId: 'chapter-1', sceneId: 'scene-1' }, diff: { kind: 'new-scene' }, validation: { status: 'pass', violations: [] }, trace: undefined };
        },
      },
      textMutation: { fingerprint: async () => { fingerprintReads += 1; return { fingerprint: 'a'.repeat(64) }; } },
      sceneOutlineBinding: { read: async () => { bindingReads += 1; return { manual: [], effective: [], fingerprint: 'b'.repeat(64) }; } },
    });
    await flush();
    const render = () => m.registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();

    const mode = (name: string): FakeNode | undefined => collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === name);
    const modePanel = () => collect(render(), 'div').find((node) => node.props?.['data-novel-chapter-mode-panel'] !== undefined);
    const visiblePanelCount = () => collect(render(), 'div').filter((node) => node.props?.['data-novel-chapter-mode-panel'] !== undefined).length;
    expect(modePanel()?.props?.['data-novel-chapter-mode-panel']).toBe('writing');
    expect(visiblePanelCount()).toBe(1);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-candidate-panel'] !== undefined)).toBe(false);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-branch-panel'] !== undefined)).toBe(false);
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-chapter-management'] !== undefined)).toBe(false);
    expect(aggregateReads).toBe(0);
    expect(fingerprintReads).toBe(0);
    expect(bindingReads).toBe(0);

    (mode('candidate')?.props?.onClick as () => void)();
    await flush();
    expect(modePanel()?.props?.['data-novel-chapter-mode-panel']).toBe('candidate');
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-candidate-panel'] !== undefined)).toBe(true);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-branch-panel'] !== undefined)).toBe(false);
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-chapter-management'] !== undefined)).toBe(false);
    expect(aggregateReads).toBe(0);
    expect(fingerprintReads).toBe(0);
    expect(bindingReads).toBe(0);

    (collect(render(), 'button').find((node) => node.props?.['data-novel-candidate-propose-continue'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    const sceneTwo = collect(render(), 'button').find((node) => node.props?.['data-novel-scene-item'] === 'scene-2');
    (sceneTwo?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').find((node) => node.props?.['data-novel-candidate-panel'] !== undefined)?.props?.['data-novel-candidate-state']).toBe('idle');
    resolvePropose?.({ ok: true, value: { candidate: { id: 'candidate-old' } } });
    await flush();
    expect(previewReads).toBe(1);
    expect(collect(render(), 'section').find((node) => node.props?.['data-novel-candidate-panel'] !== undefined)?.props?.['data-novel-candidate-state']).toBe('idle');

    (mode('versions')?.props?.onClick as () => void)();
    await flush();
    expect(modePanel()?.props?.['data-novel-chapter-mode-panel']).toBe('versions');
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-version-panel'] !== undefined)).toBe(true);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-candidate-panel'] !== undefined)).toBe(false);
    expect(aggregateReads).toBe(1);
    (mode('writing')?.props?.onClick as () => void)();
    await flush();
    (mode('versions')?.props?.onClick as () => void)();
    await flush();
    expect(aggregateReads).toBe(1);

    (mode('materials')?.props?.onClick as () => void)();
    await flush();
    expect(modePanel()?.props?.['data-novel-chapter-mode-panel']).toBe('materials');
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-chapter-management'] !== undefined)).toBe(true);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-branch-panel'] !== undefined)).toBe(false);
    expect(fingerprintReads).toBe(1);
    expect(bindingReads).toBe(1);

    (mode('writing')?.props?.onClick as () => void)();
    await flush();
    (mode('writing')?.props?.onKeyDown as (event: { key: string; preventDefault(): void }) => void)({ key: 'ArrowRight', preventDefault() {} });
    await flush();
    expect(modePanel()?.props?.['data-novel-chapter-mode-panel']).toBe('candidate');
    (mode('candidate')?.props?.onKeyDown as (event: { key: string; preventDefault(): void }) => void)({ key: 'Home', preventDefault() {} });
    await flush();
    expect(modePanel()?.props?.['data-novel-chapter-mode-panel']).toBe('writing');
    (collect(render(), 'button').find((node) => node.props?.['data-novel-scene-edit'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    const textarea = collect(render(), 'textarea').find((node) => node.props?.['data-novel-scene-text'] !== undefined);
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '保留中的未保存稿' } });
    await flush();
    (mode('candidate')?.props?.onClick as () => void)();
    await flush();
    (mode('writing')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'textarea').find((node) => node.props?.['data-novel-scene-text'] !== undefined)?.props?.value).toBe('保留中的未保存稿');
  });

  it('I131 versions 模式：一次聚合树、按需 diff、fresh 切换重载当前场景，陈旧响应不写入', async () => {
    let aggregateReads = 0;
    let sceneReads = 0;
    const diffCalls: unknown[][] = [];
    const chooseCalls: unknown[][] = [];
    let currentContent = '当前正文';
    let currentTree = {
      projectId: 'fixture-project',
      chapters: [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft', scenes: [
        { id: 'scene-1', index: 0, summary: '相遇', versionMode: 'branched' as const, branches: [
          { id: 'branch-old', label: '旧稿', chosen: true, charCount: 4, hash: 'a'.repeat(64) },
          { id: 'branch-new', label: '新稿', chosen: false, charCount: 4, hash: 'b'.repeat(64) },
        ] },
        { id: 'scene-2', index: 1, summary: '分别', versionMode: 'implicit-single' as const, branches: [] },
      ] }],
    };
    const m = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft', sceneCount: 2 }],
      chapterRead: async () => ({ id: 'chapter-1', index: 1, title: '第一章', pov: 'lin', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '相遇' }, { id: 'scene-2', index: 1, summary: '分别' }] }),
      sceneRead: async () => { sceneReads += 1; return { chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'lin' }, scene: { id: 'scene-1', index: 0, summary: '相遇', content: currentContent, beats: [], canonEvents: [], notes: '' } }; },
    }, {
      branch: {
        aggregate: async () => { aggregateReads += 1; return structuredClone(currentTree); },
        diff: async (...args) => { diffCalls.push(args); return { from: { id: 'branch-new', label: '新稿', chosen: false, content: '新正文' }, to: { id: 'branch-old', label: '旧稿', chosen: true, content: '旧正文' }, lines: [{ kind: 'del' as const, text: '旧正文' }, { kind: 'add' as const, text: '新正文' }] }; },
        chooseFresh: async (...args) => {
          chooseCalls.push(args);
          if (chooseCalls.length > 1) throw new Error('Stale branch source');
          currentContent = '新正文';
          const scene = currentTree.chapters[0].scenes[0];
          scene.branches = scene.branches.map((branch) => ({ ...branch, chosen: branch.id === 'branch-new' }));
          return { branches: scene.branches, content: currentContent };
        },
      },
    });
    await flush();
    const render = () => m.registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-view'] === 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'versions')?.props?.onClick as () => void)();
    await flush();

    const versionPanel = () => collect(render(), 'section').find((node) => node.props?.['data-novel-version-panel'] !== undefined);
    const branchItem = (id: string) => collect(versionPanel() ?? {}, 'li').find((node) => node.props?.['data-novel-version-branch'] === id);
    expect(aggregateReads).toBe(1);
    expect(collect(versionPanel() ?? {}, 'article').map((node) => node.props?.['data-novel-version-chapter'])).toEqual(['chapter-1']);
    expect(collect(versionPanel() ?? {}, 'li').filter((node) => node.props?.['data-novel-version-scene'] !== undefined).map((node) => node.props?.['data-novel-version-scene'])).toEqual(['scene-1', 'scene-2']);
    expect(collect(versionPanel() ?? {}, 'p').some((node) => node.props?.['data-novel-version-implicit'] !== undefined)).toBe(true);
    expect(JSON.stringify(versionPanel())).not.toContain('旧正文');
    expect(JSON.stringify(versionPanel())).not.toContain('新正文');

    const newBranchButtons = collect(branchItem('branch-new') ?? {}, 'button');
    (newBranchButtons.find((node) => node.props?.['data-novel-version-diff'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(diffCalls).toEqual([['fixture-project', 'chapter-1', 'scene-1', 'branch-new', undefined]]);
    expect(collect(versionPanel() ?? {}, 'div').some((node) => node.props?.['data-novel-version-diff-view'] !== undefined)).toBe(true);
    expect(aggregateReads).toBe(1);

    (collect(branchItem('branch-new') ?? {}, 'button').find((node) => node.props?.['data-novel-version-choose'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(chooseCalls).toEqual([['fixture-project', 'chapter-1', 'scene-1', 'branch-new', 'a'.repeat(64)]]);
    expect(aggregateReads).toBe(2);
    expect(sceneReads).toBe(2);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'writing')?.props?.onClick as () => void)();
    await flush();
    expect(paragraphs(render())).toContain('新正文');
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'versions')?.props?.onClick as () => void)();
    await flush();

    (collect(branchItem('branch-old') ?? {}, 'button').find((node) => node.props?.['data-novel-version-choose'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(chooseCalls).toHaveLength(2);
    expect(sceneReads).toBe(2);
    expect(aggregateReads).toBe(2);
    expect(collect(versionPanel() ?? {}, 'p').some((node) => node.children?.[0] === '内容已发生变化，请刷新后再试。')).toBe(true);
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

describe('I114 正文变化与细纲调和 Client 消费 (R18-11d)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);

  const BEFORE = { id: 'detail-2', title: '旧标题', summary: '旧摘要', pov: 'mira', wordTarget: 500, points: ['旧点'], status: 'planned' };
  const AFTER = { ...BEFORE, title: '改道后的标题', summary: '改道后的摘要', wordTarget: 700, points: ['新路线'] };
  const PLAN = {
    planId: 'reconcile-plan-1', projectId: 'fixture-project', reportId: 'impact-1', baselineId: 'baseline-1',
    baselineSourceHash: 'a'.repeat(64), finalSourceHash: 'b'.repeat(64), b5ContentFingerprint: 'c'.repeat(64),
    bindingFingerprint: 'd'.repeat(64), reportClassification: 'plot-direction', revision: 1, status: 'ready',
    createdAt: '2026-08-31T00:00:00.000Z', updatedAt: '2026-08-31T00:00:00.000Z',
    items: [{
      detailBeatId: 'detail-2', actId: 'act-1', beatId: 'beat-1', position: 0, before: BEFORE, after: AFTER,
      diff: { changedFields: ['title', 'summary', 'wordTarget', 'points'], before: { title: BEFORE.title, summary: BEFORE.summary, pov: BEFORE.pov, wordTarget: BEFORE.wordTarget, points: BEFORE.points }, after: { title: AFTER.title, summary: AFTER.summary, pov: AFTER.pov, wordTarget: AFTER.wordTarget, points: AFTER.points } },
      evidence: [{ sourceHash: 'b'.repeat(64), beforeRange: { start: 0, end: 4 }, afterRange: { start: 0, end: 6 }, beforeQuote: '旧文', afterQuote: '新文' }],
      allowedChoices: ['keep', 'ai', 'manual', 'pending'], choice: 'pending', rationale: '正文改变了路线。',
    }],
  };

  it('materials 模式读取 Host 计划、逐卡裁决并经同一 reconciliation namespace 提交 Gate 输入', async () => {
    let proposed: unknown;
    const m = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', sceneCount: 1 }],
      chapterRead: async () => ({ ok: true, value: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '路线变化' }] } }),
      sceneRead: async () => ({ ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira' }, scene: { id: 'scene-1', index: 0, summary: '路线变化', content: '正文', beats: [], canonEvents: [], notes: '' } } }),
    }, {
      textMutation: { fingerprint: async () => ({ fingerprint: 'e'.repeat(64) }) },
      sceneOutlineBinding: { read: async () => ({ manual: [], effective: [], fingerprint: 'f'.repeat(64) }) },
      outlineReconciliation: {
        read: async (_projectId, planId) => planId === PLAN.planId ? PLAN : (() => { throw new Error('unknown plan'); })(),
        propose: async (_projectId, input) => { proposed = input; return { projectId: 'fixture-project', planId: PLAN.planId, proposalId: 'proposal-1', status: 'pending', decisions: [{ detailBeatId: 'detail-2', choice: 'ai' }] }; },
      },
    });
    await flush();
    const render = () => m.registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'materials')?.props?.onClick as () => void)();
    await flush();
    const planInput = collect(render(), 'input').find((node) => node.props?.['data-novel-management-input'] === 'reconciliation-plan-id');
    (planInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: PLAN.planId } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-reconciliation-read'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-reconciliation-summary'] !== undefined)).toBe(true);
    expect(collect(render(), 'article').find((node) => node.props?.['data-novel-reconciliation-card'] === 'detail-2')).toBeDefined();
    expect(collect(render(), 'button').filter((node) => node.props?.['data-novel-reconciliation-choice'] !== undefined)).toHaveLength(4);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-reconciliation-choice'] === 'ai')?.props?.onClick as () => void)();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-reconciliation-propose'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(proposed).toEqual({ planId: PLAN.planId, decisions: [{ detailBeatId: 'detail-2', choice: 'ai' }] });
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-reconciliation-state'] === 'pending')).toBe(true);
  });
});

describe('I136 一次确认式定稿 Client 主路径 (R18-13b)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const plan = {
    planId: 'finalization-plan-1', projectId: 'fixture-project', candidateId: 'candidate-1', chapterId: 'chapter-1', sceneId: 'scene-1',
    draftSourceHash: 'a'.repeat(64), finalSourceHash: 'a'.repeat(64), generationBaseline: { kind: 'no-outline-baseline' },
    layerFingerprints: { c2: 'a'.repeat(64), c1: 'b'.repeat(64), c3: 'c'.repeat(64), c4: 'd'.repeat(64), b2: 'e'.repeat(64) },
    layerChanges: [{ layer: 'c1', kind: 'update', entityType: 'relationship', entityId: 'relationship-1', beforeHash: 'b'.repeat(64), afterHash: 'c'.repeat(64), changedFields: ['affinity'] }],
    references: { deterministic: [], semanticCandidates: [], forbiddenAutomatic: [] },
    reconciliation: { status: 'none', items: [] },
    completion: { current: { detailBeatId: null, status: 'unchanged' }, next: { status: 'deferred', reason: 'application-owned-by-i136' } },
    degradedReasons: ['no-generation-baseline'], createdAt: '2026-08-31T00:00:00.000Z',
  };

  it('候选接受为草稿后，正文区只开放一次确认式定稿入口', async () => {
    const calls: string[] = [];
    const m = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }), {
      chapterList: async () => [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', sceneCount: 1 }],
      chapterRead: async () => ({ ok: true, value: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '开场' }] } }),
      sceneRead: async () => ({ ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira' }, scene: { id: 'scene-1', index: 0, summary: '开场', content: '原文', beats: [], canonEvents: [], notes: '' } } }),
    }, {
      writing: {
        proposeAt: async () => ({ candidate: { id: 'candidate-1' } }),
        preview: async () => ({ candidateId: 'candidate-1', intent: 'continue', target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) }, text: '候选正文', diff: { kind: 'new-scene' }, validation: { status: 'pass', violations: [] }, trace: undefined }),
        previewLayers: async () => ({ candidateId: 'candidate-1', sourceHash: 'a'.repeat(64), generationBaseline: { kind: 'no-outline-baseline' }, changes: [], validation: { status: 'pass', violations: [] } }),
        adoptDraft: async () => ({ projectId: 'fixture-project', candidateId: 'candidate-1', chapterId: 'chapter-1', sceneId: 'scene-1', status: 'adopted', sourceHash: 'a'.repeat(64), projectFingerprint: 'b'.repeat(64) }),
        prepareFinalizationPlan: async () => { calls.push('prepare'); return plan; },
        proposeFinalization: async () => { calls.push('propose'); return { projectId: 'fixture-project', planId: plan.planId, proposalId: 'proposal-1', operationId: 'operation-1', status: 'pending' }; },
        acceptFinalization: async () => { calls.push('accept'); return { projectId: 'fixture-project', planId: plan.planId, proposalId: 'proposal-1', operationId: 'operation-1', status: 'needs-target', reason: 'no-generation-baseline', appliedStages: [] }; },
        rejectFinalization: async () => { calls.push('reject'); return { projectId: 'fixture-project', planId: plan.planId, proposalId: 'proposal-1', operationId: 'operation-1', status: 'rejected' }; },
      },
    });
    await flush();
    const render = () => m.registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'candidate')?.props?.onClick as () => void)();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-candidate-propose-continue'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-candidate-adopt-draft'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'writing')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-finalization-prepare'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').find((node) => node.props?.['data-novel-finalization'] !== undefined)?.props?.['data-novel-finalization-state']).toBe('ready');
    (collect(render(), 'button').find((node) => node.props?.['data-novel-finalization-propose'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(calls).toEqual(['prepare', 'propose']);
    expect(collect(render(), 'button').filter((node) => node.props?.['data-novel-finalization-accept'] !== undefined)).toHaveLength(1);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-finalization-accept'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    expect(calls).toEqual(['prepare', 'propose', 'accept']);
    expect(collect(render(), 'section').find((node) => node.props?.['data-novel-finalization'] !== undefined)?.props?.['data-novel-finalization-state']).toBe('needs-target');
  });
});
