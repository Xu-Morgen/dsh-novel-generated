/**
 * I95 按面板拆分（计划 §18 I95）：项目目录层新增小说作品（空白创建 + 文档导入，审阅提到项目目录）
 */
/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：六层初始化闭环 —— DOCX/空白作品入口、
 * 分析失败、逐层裁决、进度/取消/重试/应用刷新（I52 / I53 / I56 / I57）。
 */


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);
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
    // apply 成功：审阅消失、离开目录层、进入创作台并落到大纲阶段。
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '')).toBe(false);
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeUndefined();
    expect(render().props?.['data-novel-project-open']).toBe('untitled');
    expect(render().props?.['data-novel-route']).toBe('workflow');
    expect(collect(render(), 'li').some((node) => node.props?.['data-novel-workflow-stage'] === 'outline' && node.props?.['data-novel-workflow-stage-state'] === 'current')).toBe(true);
  });
});
