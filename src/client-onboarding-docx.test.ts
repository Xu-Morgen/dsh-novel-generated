/**
 * I95 按面板拆分（计划 §18 I95）：I53 DOCX new-work entry from an empty root
 */
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
    expect(created).toEqual([{ projectId: 'my-book-u1', name: 'my book' }]);
    expect(opened).toEqual(['my-book-u1']);
    expect(render().props?.['data-novel-project-open']).toBe('my-book-u1');
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '')).toBe(true);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-upload-result'] !== undefined)).toBe(true);
  });
});
