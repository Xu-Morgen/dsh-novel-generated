/**
 * I95 按面板拆分；I153 将目录层 DOCX 路径迁移到首次受控来源审阅。
 */
/**
 * 空白创建仍直接打开；DOCX 新作品必须先确认来源语义，不能再隐式启动旧六层分析。
 */


import { afterEach, describe, expect, it } from 'vitest';
import { cleanupClientTestEnv, collect, FakeFileReader, flush, mount, READY_MODEL, type FakeNode } from './client/test-harness.js';

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
        projectList: async () => [{ id: 'untitled', name: '已有中文作品' }],
        projectCreate: async (input) => {
          const parsed = input as { projectId: string; name: string };
          if (parsed.projectId === 'untitled') throw new Error('Project already exists: untitled');
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
    expect(created).toEqual([{ projectId: 'untitled-u1', name: '续作' }]);
    expect(opened).toEqual(['untitled-u1']);
    // I153：停在浏览态，但先显示来源语义审阅，不得启动旧六层审阅。
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeDefined();
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-directory-review'] === '')).toBe(true);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-import-interpretation-review'] === '')).toBe(true);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '')).toBe(false);
    // 创作台 body 未渲染（无任务导航），来源确认后才进入后续作者流程。
    expect(collect(render(), 'nav')).toHaveLength(0);
  });
});
