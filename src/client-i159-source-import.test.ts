import { afterEach, describe, expect, it } from 'vitest';
import { cleanupClientTestEnv, collect, FakeFileReader, flush, mount, READY_MODEL, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);

function sourceSession(input: unknown) {
  return { ...(input as Record<string, unknown>), importSessionId: 'source-i159', status: 'draft', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
}

describe('I159 来源导入唯一作者入口', () => {
  it('workflow 与 legacy route 都收敛到同一 source-import presenter，进阶导航不再公开旧六层入口', async () => {
    const { registrations } = mount(() => Promise.resolve({ ok: true, value: READY_MODEL }));
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const workflowImport = collect(render(), 'button').find((node) => node.props?.['data-novel-workflow-open-stage'] === 'import');
    (workflowImport?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('onboarding');
    expect(collect(render(), 'section').filter((node) => node.props?.['data-novel-source-import-entry'] === '')).toHaveLength(1);
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-onboarding-start'] !== undefined)).toBe(false);
    expect(collect(render(), 'button').some((node) => String(node.children).includes('六层初始化审阅'))).toBe(false);
  });

  it('pasted text is normalized by Host and enters source review before legacy analysis or I151', async () => {
    const normalized: unknown[] = [];
    const sourceCreates: unknown[] = [];
    let legacyBegins = 0;
    let initializationBegins = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        importExport: {
          normalizeSource: async (projectId: string, input: { text: string }) => {
            normalized.push({ projectId, ...input });
            return { projectId, fileName: 'pasted.txt', format: 'txt', text: '第一段\n\n第二段', sourceHash: 'b'.repeat(64), chunks: [
              { index: 0, text: '第一段', startOffset: 0, endOffset: 3 },
              { index: 1, text: '第二段', startOffset: 5, endOffset: 8 },
            ] };
          },
        } as never,
        onboardingAnalyzer: { begin: async () => { legacyBegins += 1; return { onboardingSessionId: 'legacy' }; } },
        importInterpretation: { create: async (input) => { sourceCreates.push(input); return sourceSession(input); } },
        ruleStyleImportInitialization: { begin: async (input) => { initializationBegins += 1; return input; } },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-workflow-open-stage'] === 'import')?.props?.onClick as () => void)();
    await flush();
    const text = collect(render(), 'textarea').find((node) => node.props?.['data-novel-source-import-text'] === '');
    (text?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '  第一段\n\n第二段  ' } });
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-source-import-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(normalized).toHaveLength(1);
    expect(sourceCreates).toHaveLength(1);
    expect(sourceCreates[0]).toMatchObject({ projectId: 'fixture-project', sourceHash: 'b'.repeat(64) });
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-import-interpretation-review'] === '')).toBe(true);
    expect(legacyBegins).toBe(0);
    expect(initializationBegins).toBe(0);
  });

  it('an opened empty work sends DOCX Host evidence to the same source review without legacy analysis', async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
    const sourceCreates: unknown[] = [];
    let legacyBegins = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        uploadFinalize: async () => ({ sourceHash: 'c'.repeat(64), fileName: 'empty.docx', text: '来源正文', chunks: [{ index: 0, text: '来源正文', startOffset: 0, endOffset: 4 }] }),
      },
      {
        onboardingAnalyzer: { begin: async () => { legacyBegins += 1; return { onboardingSessionId: 'legacy' }; } },
        importInterpretation: { create: async (input) => { sourceCreates.push(input); return sourceSession(input); } },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-workflow-open-stage'] === 'import')?.props?.onClick as () => void)();
    await flush();
    const upload = collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '');
    (upload?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File([new Uint8Array([1])], 'empty.docx')] as unknown as FileList } });
    await flush();
    expect(sourceCreates).toHaveLength(1);
    expect(sourceCreates[0]).toMatchObject({ sourceHash: 'c'.repeat(64) });
    expect(legacyBegins).toBe(0);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-import-interpretation-review'] === '')).toBe(true);
  });

  it('non-empty works fail closed before upload or normalization and direct authors to a separate work', async () => {
    let uploads = 0;
    let normalizations = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { characterList: async () => [{ id: 'hero', name: '已有角色' }], uploadStart: async () => { uploads += 1; return { uploadId: 'blocked', chunkSize: 65536, nextIndex: 0 }; } },
      { importExport: { normalizeSource: async () => { normalizations += 1; return {}; } } as never },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-workflow-open-stage'] === 'import')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').find((node) => node.props?.['data-novel-source-import-entry'] === '')?.props?.['data-novel-source-import-gate']).toBe('blocked');
    expect(JSON.stringify(render())).toContain('新建独立作品');
    expect(collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '')?.props?.disabled).toBe(true);
    expect(collect(render(), 'button').find((node) => node.props?.['data-novel-source-import-submit'] === '')?.props?.disabled).toBe(true);
    expect(uploads).toBe(0);
    expect(normalizations).toBe(0);
  });
});
