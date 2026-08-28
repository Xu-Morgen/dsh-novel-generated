/**
 * I95 按面板拆分（计划 §18 I95）：I69 导入导出与备份 UI (R14-4)
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

describe('I69 导入导出与备份 UI (R14-4)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const iePanel = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-import-export-panel'] !== undefined);
  const openIe = (render: () => FakeNode): void => {
    (navButton(render(), 'importExport')?.props?.onClick as () => void)();
  };
  const messageOf = (render: () => FakeNode): string =>
    String((collect(render(), 'p').find((n) => n.props?.['data-novel-ie-message'] !== undefined)?.children?.[0] ?? ''));

  const EXPORT_OUTCOME = {
    projectId: 'fixture-project', mode: 'full-project', exportedAt: '2025-01-01T00:00:00.000Z',
    fileName: 'fixture-project.full-project.2025-01-01.portable.json', fileCount: 7, content: '{"files":{}}',
  };

  it('导出项目包：Remote 返回下载载荷并反馈文件数（受控下载）', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      { importExport: { exportArchive: async () => ({ ok: true, value: EXPORT_OUTCOME }) } },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openIe(render);
    await flush();
    expect(iePanel(render())?.props?.['data-novel-import-export-state']).toBe('idle');
    (collect(render(), 'button').find((n) => n.props?.['data-novel-ie-export-archive'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(messageOf(render)).toContain('已导出 7 个文件');
    expect(messageOf(render)).toContain('fixture-project.full-project');
  });

  it('恢复 N-7 阻断：非空作品列出冲突层并说明，不静默合并', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      { importExport: { restore: async () => ({ ok: true, value: { status: 'blocked', reason: 'non-empty-project', layers: ['text', 'outline.yaml'] } }) } },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openIe(render);
    await flush();
    const input = collect(render(), 'input').find((n) => n.props?.['data-novel-ie-restore-file'] !== undefined);
    (input?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File(['{}'], 'backup.portable.json', { type: 'application/json' })] as unknown as FileList } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-ie-restore'] === '')?.props?.onClick as () => void)();
    await flush();
    const blocked = collect(render(), 'div').find((n) => n.props?.['data-novel-ie-restore-blocked'] !== undefined);
    expect(blocked).toBeDefined();
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-ie-restore-blocked-text'] !== undefined)?.children?.[0] ?? '')).toContain('text、outline.yaml');
  });

  it('导入预览：粘贴文本 → Host 归一化分块预览（零写反馈）', async () => {
    let previewInput: unknown;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        importExport: {
          importPreview: async (projectId, input) => {
            previewInput = input;
            return { ok: true, value: { projectId, fileName: input.fileName, format: input.format, text: input.text, chunks: [{ index: 0, text: input.text }] } };
          },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openIe(render);
    await flush();
    const textarea = collect(render(), 'textarea').find((n) => n.props?.['data-novel-ie-import-text'] !== undefined);
    (textarea?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '第一段\n\n第二段' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-ie-import-preview'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(previewInput).toMatchObject({ format: 'txt', text: '第一段\n\n第二段' });
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-ie-preview-text'] !== undefined)?.children?.[0] ?? '')).toContain('1 块');
    expect(messageOf(render)).toContain('零写');
  });
})
