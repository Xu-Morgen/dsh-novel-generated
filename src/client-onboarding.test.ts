/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：六层初始化闭环 —— DOCX/空白作品入口、
 * 分析失败、逐层裁决、进度/取消/重试/应用刷新（I52 / I53 / I56 / I57）。
 */


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);

describe('I53 DOCX new-work entry from an empty root', () => {
  it('creates and opens a project from the uploaded document, then starts the six-layer review', async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
    const created: Array<{ projectId: string; name: string }> = [];
    const opened: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [],
        projectCreate: async (input) => {
          const parsed = input as { projectId: string; name: string };
          created.push(parsed);
          return { id: parsed.projectId, name: parsed.name };
        },
        projectOpen: async (id) => { opened.push(id); return {}; },
        uploadStart: async () => ({ uploadId: 'u1', chunkSize: 65536, nextIndex: 0 }),
        uploadChunk: async () => ({ nextIndex: 1, received: 1 }),
        uploadFinalize: async () => ({ sourceHash: 'a'.repeat(64), fileName: 'my book.docx', text: '第一段\n\n第二段', chunks: [{ index: 0, text: '第一段\n\n第二段', startOffset: 0, endOffset: 9 }] }),
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const input = collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '');
    expect(input).toBeDefined();
    (input?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File([new Uint8Array([1, 2, 3])], 'my book.docx')] as unknown as FileList } });
    await flush();

    // 空 root 上传必须自动新建并打开作品，再进入六层审阅（I53 三入口）。
    expect(created).toEqual([{ projectId: 'my-book', name: 'my book' }]);
    expect(opened).toEqual(['my-book']);
    expect(render().props?.['data-novel-project-open']).toBe('my-book');
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '')).toBe(true);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-upload-result'] !== undefined)).toBe(true);
  });
});

describe('项目目录层新增小说作品（空白创建 + 文档导入，审阅提到项目目录）', () => {
  const byData = (tree: FakeNode, attr: string, value: string): FakeNode | undefined => {
    let found: FakeNode | undefined;
    const visit = (current: unknown): void => {
      if (found || current == null || typeof current !== 'object') return;
      if (Array.isArray(current)) { for (const item of current) visit(item); return; }
      const n = current as FakeNode;
      if (n.props?.[attr] === value) { found = n; return; }
      for (const child of n.children ?? []) visit(child);
    };
    visit(tree);
    return found;
  };

  const UPLOAD_CHAIN = {
    uploadStart: async () => ({ uploadId: 'u1', chunkSize: 65536, nextIndex: 0 }),
    uploadChunk: async () => ({ nextIndex: 1, received: 1 }),
    uploadFinalize: async () => ({ sourceHash: 'a'.repeat(64), fileName: '续作.docx', text: '第一章内容', chunks: [{ index: 0, text: '第一章内容', startOffset: 0, endOffset: 5 }] }),
  };

  it('已有作品时项目目录层仍可直接空白创建，命名后进入创作台', async () => {
    const created: Array<{ projectId: string; name: string }> = [];
    const opened: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }],
        projectCreate: async (input) => {
          const parsed = input as { projectId: string; name: string };
          created.push(parsed);
          return { id: parsed.projectId, name: parsed.name };
        },
        projectOpen: async (id) => { opened.push(String(id)); return {}; },
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    // 目录层始终提供「新建小说作品」：空白创建 + 文档导入 + 既有列表并存。
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-project-create-section'] === '')).toBe(true);
    expect(collect(render(), 'ul').some((node) => node.props?.['data-novel-project-list'] === '')).toBe(true);
    const nameInput = collect(render(), 'input').find((node) => node.props?.['data-novel-project-name-input'] === '');
    expect(nameInput).toBeDefined();
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '长夜行' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-project-create'] === '')?.props?.onClick as () => void)();
    await flush();
    // 中文名 slug 为空 → projectId 回退 untitled；名称保留原名。
    expect(created).toEqual([{ projectId: 'untitled', name: '长夜行' }]);
    expect(opened).toEqual(['untitled']);
    // 空白创建直接进入创作台（工作台 body 渲染），不再停在目录层。
    expect(render().props?.['data-novel-project-open']).toBe('untitled');
    expect(collect(render(), 'nav')).toHaveLength(1);
  });

  it('空白创建名称留空时使用默认「未命名作品」', async () => {
    const created: Array<{ projectId: string; name: string }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [],
        projectCreate: async (input) => {
          const parsed = input as { projectId: string; name: string };
          created.push(parsed);
          return { id: parsed.projectId, name: parsed.name };
        },
        projectOpen: async () => ({}),
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-project-create'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(created).toEqual([{ projectId: 'untitled', name: '未命名作品' }]);
  });

  it('已有作品时项目目录层文档导入：上传 DOCX 新建独立作品，审阅在目录层展示（不进入创作台）', async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
    const created: Array<{ projectId: string; name: string }> = [];
    const opened: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [{ id: 'alpha', name: 'Alpha' }],
        projectCreate: async (input) => {
          const parsed = input as { projectId: string; name: string };
          created.push(parsed);
          return { id: parsed.projectId, name: parsed.name };
        },
        projectOpen: async (id) => { opened.push(String(id)); return {}; },
        ...UPLOAD_CHAIN,
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const input = collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '');
    expect(input).toBeDefined();
    (input?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File([new Uint8Array([1])], '续作.docx')] as unknown as FileList } });
    await flush();
    // 目录层上传 → 新建独立作品并打开（而不是把文档并入当前作品）。
    expect(created).toEqual([{ projectId: 'untitled', name: '续作' }]);
    expect(opened).toEqual(['untitled']);
    // 审阅部分提到项目目录：停在浏览态，六层审阅在目录层可见。
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeDefined();
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-directory-review'] === '')).toBe(true);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '')).toBe(true);
    // 创作台 body 未渲染（无任务导航），apply 成功后才进入创作台。
    expect(collect(render(), 'nav')).toHaveLength(0);
  });

  it('目录层审阅终态锁定并 apply 成功 → 离开目录层进入创作台角色层', async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [],
        projectCreate: async (input) => ({ id: (input as { projectId: string }).projectId, name: (input as { name: string }).name }),
        projectOpen: async (id) => ({ project: { id, name: '新书' }, layers: { characters: 'ready', worldview: 'ready', outline: 'ready', relationship: 'ready', state: 'ready', canon: 'ready' } }),
        ...UPLOAD_CHAIN,
      },
      {
        openProjectId: null,
        onboardingAnalyzer: analyzerStub(I56_LAYERS),
        onboarding: {
          adjudicate: async () => ({ id: 'proposal-1', status: 'accepted' }),
          finalApply: async () => ({ projectId: 'untitled', onboardingSessionId: 'sess-1', appliedLayers: ['characters'], skippedLayers: ['worldview', 'outline', 'relationship', 'state', 'canon'], blockedLayers: [], pendingLayers: [], retryable: false, errors: [] }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const input = collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '');
    (input?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File([new Uint8Array([1])], '新书.docx')] as unknown as FileList } });
    // 等待分析完成、审阅候选出现（与 openOnboardingReview 同款轮询窗口）。
    for (let round = 0; round < 20; round += 1) {
      await flush();
      if (collect(render(), 'button').some((node) => node.props?.['data-novel-onboarding-apply'] !== undefined)) break;
    }
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeDefined();
    // 六层终态：characters 接受，其余显式跳过 → apply 启用。
    const clickVerdict = (layer: string, decision: string) => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      (button?.props?.onClick as () => void)();
    };
    clickVerdict('characters', 'accept');
    await flush();
    for (const layer of ['worldview', 'outline', 'relationship', 'state', 'canon']) {
      clickVerdict(layer, 'skip');
      await flush();
    }
    const apply = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-apply'] === '');
    expect(apply?.props?.disabled).toBe(false);
    (apply?.props?.onClick as () => void)();
    await flush();
    // apply 成功：审阅消失、离开目录层、进入创作台并激活角色层。
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '')).toBe(false);
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeUndefined();
    expect(render().props?.['data-novel-project-open']).toBe('untitled');
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-layer-panel'] === 'characters' && node.props?.['data-novel-layer-state'] === 'ready')).toBe(true);
  });
});

describe('I52 analysis failure surfaces a readable error in the review panel', () => {
  it('shows the Host contract error when the first analysis is rejected', async () => {
    const contractError = '六层分析结果不符合六层候选契约（layers.characters.candidates.0.aliases: Invalid input: expected array, received undefined）。模型输出已被拒绝且未写入任何层；请重试分析，或在审阅页对不合格层执行整层重生成。';
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: {
          begin: async () => ({ onboardingSessionId: 'sess-1' }),
          status: async () => 'failed',
          result: async () => { throw new Error(contractError); },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    // 原文入口只在独立「六层初始化审阅」页签渲染，先切到该页签。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    // The entry's textarea/button share one render closure; use the same tree so
    // the typed source text is visible to the start handler.
    const tree = render();
    const textarea = collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');
    const start = collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
    expect(textarea).toBeDefined();
    expect(start).toBeDefined();
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
    (start?.props?.onClick as () => void)();
    await flush();
    // I57：失败经 status→result 链路落入 analysis 面板（可重试，不砖化）。
    const error = collect(render(), 'p').find((node) => node.props?.['data-novel-analysis-error'] !== undefined);
    expect(error).toBeDefined();
    expect(String(error?.children?.[0] ?? '')).toContain('不符合六层候选契约');
    // 失败后出现重试入口。
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-analysis-retry'] === '')).toBe(true);
  });

  it('shows the generated candidate content per layer before any verdict', async () => {
    const layers = {
      characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '见习测绘师', motivation: '追查守夜人', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
      worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: analyzerStub(layers),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    // 原文入口只在独立「六层初始化审阅」页签渲染，先切到该页签。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    const textarea = collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');
    const start = collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
    (start?.props?.onClick as () => void)();
    await flush();
    const value = collect(render(), 'span').find((node) => node.props?.['data-novel-onboarding-value'] === 'characters');
    expect(value).toBeDefined();
    expect(String(value?.children?.[0] ?? '')).toContain('米拉');
  });

  it('keeps the six-layer review on its own nav tab, never under layer tabs', async () => {
    const layers = {
      characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '见习测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
      worldview: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      state: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
      canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: analyzerStub(layers),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const navClick = (marker: Record<string, unknown>) => {
      const button = collect(render(), 'button').find((node) => Object.entries(marker).some(([k, v]) => node.props?.[k] === v));
      (button?.props?.onClick as (() => void) | undefined)?.();
    };
    const reviewVisible = () => collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '');
    // 默认（角色层）不应出现审阅。
    expect(reviewVisible()).toBe(false);
    // 切到审阅页签：分析自动开始 → 审阅出现。
    navClick({ 'data-novel-onboarding-nav': '' });
    await flush();
    const tree = render();
    const textarea = collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');
    const start = collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港。' } });
    (start?.props?.onClick as () => void)();
    await flush();
    expect(reviewVisible()).toBe(true);
    // 切到角色层：审阅必须消失。
    navClick({ 'data-novel-layer': 'characters' });
    await flush();
    expect(reviewVisible()).toBe(false);
    // 切回审阅页签：审阅恢复。
    navClick({ 'data-novel-onboarding-nav': '' });
    await flush();
    expect(reviewVisible()).toBe(true);
  });
});

describe('I56 six-layer adjudication correctness (R12-3)', () => {
  const baseMount = (onboarding: NonNullable<MountOptions['onboarding']>) => mount(
    () => Promise.resolve({ ok: true, value: READY_MODEL }),
    {},
    {
      onboardingAnalyzer: analyzerStub(I56_LAYERS),
      onboarding,
    },
  );

  it('修改后接受 opens a per-layer edit panel and submits the exact editedValue', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { registrations } = baseMount({
      adjudicate: async (input) => { calls.push(input as Record<string, unknown>); return { id: 'proposal-1', status: 'accepted' }; },
    });
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const clickVerdict = (layer: string, decision: string) => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      (button?.props?.onClick as () => void)();
    };
    clickVerdict('characters', 'edit');
    await flush();
    // 面板打开且预填当前候选 JSON。
    const editText = collect(render(), 'textarea').find((node) => node.props?.['data-novel-onboarding-edit-text'] === 'characters');
    expect(editText).toBeDefined();
    const editedLayer = {
      candidates: [{ ...(I56_LAYERS.characters.candidates[0] as { id: string }), personality: '大胆' }],
      confidence: 'high', warnings: [], evidenceIds: ['e1'],
    };
    (editText?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: JSON.stringify(editedLayer) } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-edit-confirm'] === 'characters')?.props?.onClick as () => void)();
    await flush();
    // Host 精确收到用户值（Remote payload 断言），且状态翻转为已修改并接受。
    expect(calls).toHaveLength(1);
    expect(calls[0].layer).toBe('characters');
    expect(calls[0].decision).toBe('edit');
    expect(calls[0].editedValue).toEqual(editedLayer);
    const status = collect(render(), 'span').find((node) => node.props?.['data-novel-onboarding-status'] === 'characters');
    expect(String(status?.children?.[0] ?? '')).toContain('已修改并接受');
  });

  it('非法 JSON 编辑值阻止提交且不调用 Remote', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { registrations } = baseMount({
      adjudicate: async (input) => { calls.push(input as Record<string, unknown>); return { id: 'proposal-1', status: 'accepted' }; },
    });
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const editButton = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === 'characters' && node.props?.['data-novel-onboarding-decision'] === 'edit');
    (editButton?.props?.onClick as () => void)();
    await flush();
    const editText = collect(render(), 'textarea').find((node) => node.props?.['data-novel-onboarding-edit-text'] === 'characters');
    (editText?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '{ 不是合法 JSON' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-edit-confirm'] === 'characters')?.props?.onClick as () => void)();
    await flush();
    expect(calls).toEqual([]);
    const error = collect(render(), 'p').find((node) => node.props?.['data-novel-onboarding-error'] !== undefined);
    expect(String(error?.children?.[0] ?? '')).toContain('不是合法 JSON');
  });

  it('打回重生成 opens a feedback panel and submits the user feedback', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { registrations } = baseMount({
      adjudicate: async (input) => { calls.push(input as Record<string, unknown>); return { id: 'proposal-2', status: 'pending' }; },
    });
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const regenButton = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === 'characters' && node.props?.['data-novel-onboarding-decision'] === 'regenerate');
    (regenButton?.props?.onClick as () => void)();
    await flush();
    const feedback = collect(render(), 'textarea').find((node) => node.props?.['data-novel-onboarding-feedback'] === 'characters');
    expect(feedback).toBeDefined();
    (feedback?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '角色缺少动机，请补充' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-regenerate-confirm'] === 'characters')?.props?.onClick as () => void)();
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].decision).toBe('regenerate');
    expect(calls[0].feedback).toBe('角色缺少动机，请补充');
    // 重生成后继仍 pending：状态提示待再次裁决。
    const status = collect(render(), 'span').find((node) => node.props?.['data-novel-onboarding-status'] === 'characters');
    expect(String(status?.children?.[0] ?? '')).toContain('已重生成');
  });

  it('apply 在六层全部进入终态前禁用，资格文案实时更新', async () => {
    const { registrations } = baseMount({
      adjudicate: async () => ({ id: 'proposal-1', status: 'accepted' }),
    });
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const apply = () => collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-apply'] === '');
    const eligibility = () => collect(render(), 'p').find((node) => node.props?.['data-novel-onboarding-eligibility'] !== undefined);
    expect(apply()?.props?.disabled).toBe(true);
    expect(String(eligibility()?.children?.[0] ?? '')).toContain('待 6 层');
    const clickVerdict = (layer: string, decision: string) => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      (button?.props?.onClick as () => void)();
    };
    clickVerdict('characters', 'accept');
    await flush();
    expect(String(eligibility()?.children?.[0] ?? '')).toContain('待 5 层');
    for (const layer of ['worldview', 'outline', 'relationship', 'state', 'canon']) {
      clickVerdict(layer, 'skip');
      await flush();
    }
    expect(apply()?.props?.disabled).toBe(false);
    expect(String(eligibility()?.children?.[0] ?? '')).toContain('已锁定');
  });

  it('空候选层禁用接受/修改后接受，仍可重生成与跳过；状态显示无候选', async () => {
    const { registrations } = baseMount({
      adjudicate: async () => ({ id: 'proposal-1', status: 'accepted' }),
    });
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const verdictDisabled = (layer: string, decision: string): boolean => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      return button?.props?.disabled === true;
    };
    expect(verdictDisabled('worldview', 'accept')).toBe(true);
    expect(verdictDisabled('worldview', 'edit')).toBe(true);
    expect(verdictDisabled('worldview', 'regenerate')).toBe(false);
    expect(verdictDisabled('worldview', 'skip')).toBe(false);
    expect(verdictDisabled('characters', 'accept')).toBe(false);
    const status = collect(render(), 'span').find((node) => node.props?.['data-novel-onboarding-status'] === 'worldview');
    expect(String(status?.children?.[0] ?? '')).toContain('无候选');
  });
});

describe('I57 初始化进度、取消、重试与应用刷新 (R12-4)', () => {
  const startButton = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-onboarding-start'] === '');
  const textareaOf = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'textarea').find((node) => node.props?.placeholder === '粘贴原文以生成六层候选');

  it('防重复 start：分析进行中再次点击不发起第二个 begin', async () => {
    const begins: Array<unknown> = [];
    const { registrations, overlayCleanups } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: {
          begin: async (input) => { begins.push(input); return { onboardingSessionId: 'sess-1' }; },
          status: async () => 'running',
          result: async () => ({}),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const clickStart = () => {
      const tree = render();
      (textareaOf(tree)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
      (startButton(tree)?.props?.onClick as () => void)();
    };
    clickStart();
    await flush();
    // 分析进行中（running）：按钮禁用 + 再次点击不产生第二个 begin（R12-4 防重复）。
    expect(startButton(render())?.props?.disabled).toBe(true);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-analysis-status'] === 'running')).toBe(true);
    clickStart();
    await flush();
    expect(begins).toHaveLength(1);
    // 清理轮询定时器，避免本测试残留的 running 轮询跨测试泄漏。
    overlayCleanups[0]();
    await flush();
  });

  it('busy/progress + 取消：取消调 Host cancel 且零层写入、零 apply', async () => {
    const cancels: string[] = [];
    let applies = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: {
          begin: async () => ({ onboardingSessionId: 'sess-1' }),
          status: async () => 'running',
          cancel: async (id) => { cancels.push(String(id)); },
        },
        onboarding: {
          finalApply: async () => { applies += 1; return { projectId: 'fixture-project', onboardingSessionId: 'sess-1', appliedLayers: [], skippedLayers: [], blockedLayers: [], pendingLayers: [], retryable: false, errors: [] }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    (textareaOf(tree)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
    (startButton(tree)?.props?.onClick as () => void)();
    await flush();
    // 分析进行中：busy 面板 + 取消按钮可见，未进入审阅（无候选值）。
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-analysis-cancel'] === '')).toBe(true);
    expect(collect(render(), 'span').some((node) => node.props?.['data-novel-onboarding-value'] !== undefined)).toBe(false);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-analysis-cancel'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(cancels).toEqual(['sess-1']);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-analysis-error'] !== undefined)).toBe(true);
    // 取消零层写入：无候选展示、无 apply、无终态门。
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-onboarding-apply'] === '' && node.props?.disabled !== true)).toBe(false);
    expect(applies).toBe(0);
  });

  it('错误可重试不砖化：失败显示可读错误，重试复用原文重新 begin 成功', async () => {
    const begins: Array<unknown> = [];
    let failed = true;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: {
          begin: async (input) => { begins.push(input); return { onboardingSessionId: 'sess-1' }; },
          status: async () => (failed ? 'failed' : 'succeeded'),
          result: async () => {
            if (failed) throw new Error('模型输出不符合六层候选契约（测试失败夹具）');
            return { projectId: 'fixture-project', onboardingSessionId: 'sess-1', sourceHash: 'a'.repeat(64), evidence: {}, layers: I56_LAYERS };
          },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const clickStart = () => {
      const tree = render();
      (textareaOf(tree)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
      (startButton(tree)?.props?.onClick as () => void)();
    };
    clickStart();
    await flush();
    // 失败：可读错误 + 重试按钮，UI 未砖化（按钮仍可用）。
    const error = collect(render(), 'p').find((node) => node.props?.['data-novel-analysis-error'] !== undefined);
    expect(String(error?.children?.[0] ?? '')).toContain('不符合六层候选契约');
    const retry = collect(render(), 'button').find((node) => node.props?.['data-novel-analysis-retry'] === '');
    expect(retry).toBeDefined();
    failed = false;
    (retry?.props?.onClick as () => void)();
    await flush();
    expect(begins).toHaveLength(2);
    // 重试成功后进入审阅（候选值可见）。
    expect(collect(render(), 'span').some((node) => node.props?.['data-novel-onboarding-value'] === 'characters')).toBe(true);
  });

  it('成功刷新六层：final apply 成功 → 重新 open 作品并刷新六层、激活创作台', async () => {
    const opens: string[] = [];
    const characterReads: string[] = [];
    let applies = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectOpen: async (id) => { opens.push(String(id)); return { project: { id, name: '夹具作品' }, layers: { characters: 'ready', worldview: 'ready', outline: 'ready', relationship: 'ready', state: 'ready', canon: 'ready' } }; },
        characterList: async () => { characterReads.push('list'); return []; },
      },
      {
        onboardingAnalyzer: analyzerStub(I56_LAYERS),
        onboarding: {
          adjudicate: async () => ({ id: 'proposal-1', status: 'accepted' }),
          finalApply: async () => {
            applies += 1;
            return { projectId: 'fixture-project', onboardingSessionId: 'sess-1', appliedLayers: ['characters'], skippedLayers: ['worldview', 'outline', 'relationship', 'state', 'canon'], blockedLayers: [], pendingLayers: [], retryable: false, errors: [] };
          },
        },
      },
    );
    await flush();
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const clickVerdict = (layer: string, decision: string) => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      (button?.props?.onClick as () => void)();
    };
    for (const layer of ['characters', 'worldview', 'outline', 'state', 'canon']) {
      clickVerdict(layer, 'accept');
      await flush();
    }
    clickVerdict('relationship', 'skip');
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-apply'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(applies).toBe(1);
    // 成功：离开审阅页签、重新打开作品并刷新六层、激活创作台。
    expect(opens.length).toBeGreaterThanOrEqual(2);
    expect(characterReads.length).toBeGreaterThanOrEqual(2);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '')).toBe(false);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-layer-panel'] === 'characters' && node.props?.['data-novel-layer-state'] === 'ready')).toBe(true);
  });

  it('partial retry：部分失败分层显示且重试只再次调用 finalApply', async () => {
    const applyCalls: Array<Record<string, unknown>> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: analyzerStub(I56_LAYERS),
        onboarding: {
          adjudicate: async () => ({ id: 'proposal-1', status: 'accepted' }),
          finalApply: async (input) => {
            applyCalls.push(input as Record<string, unknown>);
            if (applyCalls.length === 1) {
              return { projectId: 'fixture-project', onboardingSessionId: 'sess-1', appliedLayers: ['characters'], skippedLayers: [], blockedLayers: ['outline', 'state'], pendingLayers: [], retryable: true, errors: ['outline: blocked by an earlier failed prerequisite layer', 'state: blocked by an earlier failed prerequisite layer'] };
            }
            return { projectId: 'fixture-project', onboardingSessionId: 'sess-1', appliedLayers: ['characters', 'outline', 'state'], skippedLayers: [], blockedLayers: [], pendingLayers: [], retryable: false, errors: [] };
          },
        },
      },
    );
    await flush();
    const render = await openOnboardingReview(registrations, I56_LAYERS);
    const clickVerdict = (layer: string, decision: string) => {
      const button = collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-verdict'] === layer && node.props?.['data-novel-onboarding-decision'] === decision);
      (button?.props?.onClick as () => void)();
    };
    for (const layer of ['characters', 'worldview', 'outline', 'state', 'canon']) {
      clickVerdict(layer, 'accept');
      await flush();
    }
    clickVerdict('relationship', 'skip');
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-apply'] === '')?.props?.onClick as () => void)();
    await flush();
    // 分层显示：已应用/被阻断可读；重试按钮出现。
    const applied = collect(render(), 'dd').find((node) => node.props?.['data-novel-onboarding-applied'] !== undefined);
    expect(String(applied?.children?.[0] ?? '')).toContain('characters');
    const blockedText = ((): string => {
      const visit = (current: unknown): string => {
        if (current == null || typeof current !== 'object') return String(current);
        const n = current as FakeNode;
        return (n.children ?? []).map(visit).join('');
      };
      return visit(collect(render(), 'dl').find((node) => node.props?.['data-novel-onboarding-result'] === '') as unknown);
    })();
    expect(blockedText).toContain('outline');
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-onboarding-apply-retry'] === '')).toBe(true);
    // 重试：再次调用 finalApply（Host 幂等，只补未完成层）。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-apply-retry'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(applyCalls).toHaveLength(2);
    expect(applyCalls[1].onboardingSessionId).toBe('sess-1');
  });

  it('Fiber dispose 后分析轮询监听归零：卸载后不再查询 status', async () => {
    let statusCalls = 0;
    const { registrations, overlayCleanups } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        onboardingAnalyzer: {
          begin: async () => ({ onboardingSessionId: 'sess-1' }),
          status: async () => { statusCalls += 1; return 'running'; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-onboarding-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    (textareaOf(tree)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '北港位于内海西岸。' } });
    (startButton(tree)?.props?.onClick as () => void)();
    await flush();
    expect(statusCalls).toBeGreaterThanOrEqual(1);
    const before = statusCalls;
    overlayCleanups[0]();
    await flush();
    // 卸载清空轮询定时器：等待超过一个轮询间隔后 status 不再被调用（监听归零）。
    await new Promise((resolve) => { setTimeout(resolve, 900); });
    expect(statusCalls).toBe(before);
  });
});
