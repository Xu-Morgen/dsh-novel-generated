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
describe('I153 DOCX new-work controlled-import entry from an empty root', () => {
  it('creates and opens a project, exposes source/protagonist choices, then starts I151 only after confirmation', async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
    const created: Array<{ projectId: string; name: string }> = [];
    const opened: string[] = [];
    const sourceSessions: unknown[] = [];
    const ruleStyleBegins: unknown[] = [];
    let onboardingBegins = 0;
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
      {
        openProjectId: null,
        onboardingAnalyzer: {
          begin: async () => { onboardingBegins += 1; return { onboardingSessionId: 'legacy-six-layer' }; },
          status: async () => 'running',
        },
        importInterpretation: {
          create: async (input) => {
            sourceSessions.push(input);
            return { ...(input as Record<string, unknown>), importSessionId: 'import-first', status: 'draft', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
          },
          read: async () => undefined,
          confirm: async (input) => ({ ...(input as Record<string, unknown>), status: 'confirmed', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }),
          discard: async (input) => ({ ...(input as Record<string, unknown>), status: 'discarded', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }),
        },
        ruleStyleImportInitialization: {
          begin: async (input) => {
            ruleStyleBegins.push(input);
            return { ...(input as Record<string, unknown>), status: 'succeeded', candidate: { rules: [], style: { id: 'style-imported', name: '导入文风', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制', proseStyle: '紧贴角色', chapterFormat: '按节点分章', dialogueConventions: '对白简洁', forbidden: [] } }, candidateFingerprint: 'c'.repeat(64), createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
          },
          status: async (input) => ({ ...(input as Record<string, unknown>), status: 'succeeded', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }),
          result: async (input) => input,
          propose: async (input) => input,
          accept: async (input) => input,
          reject: async (input) => input,
          cancel: async (input) => input,
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const input = collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '');
    expect(input).toBeDefined();
    (input?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File([new Uint8Array([1, 2, 3])], 'my book.docx')] as unknown as FileList } });
    await flush();

    // 目录层上传必须自动新建并打开作品，但不得先走旧六层分析。
    expect(created).toEqual([{ projectId: 'my-book-u1', name: 'my book' }]);
    expect(opened).toEqual(['my-book-u1']);
    expect(render().props?.['data-novel-project-open']).toBe('my-book-u1');
    expect(onboardingBegins).toBe(0);
    expect(sourceSessions).toHaveLength(1);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-import-interpretation-review'] === '')).toBe(true);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-upload-result'] !== undefined)).toBe(true);

    // 背景资料/已有正文两个来源选项必须在真实上传路径可达。
    const optionValues = collect(render(), 'option').map((node) => node.props?.value);
    expect(optionValues).toContain('background-material');
    expect(optionValues).toContain('existing-prose');
    expect(ruleStyleBegins).toHaveLength(0);

    const select = (attribute: string, value: string) => {
      const node = collect(render(), 'select').find((candidate) => candidate.props?.[attribute] !== undefined);
      (node?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    };
    select('data-novel-import-interpretation-source-role', 'background-material');
    select('data-novel-import-interpretation-treatment', 'adapt-pov');
    const protagonist = collect(render(), 'select').find((node) => node.props?.['data-novel-import-interpretation-protagonist-source'] !== undefined);
    expect(protagonist).toBeDefined();
    expect(protagonist?.props?.value).toBe('generate');
    expect(JSON.stringify(protagonist)).toContain('由 AI 创建并串联新主角');
    expect(collect(render(), 'input').some((node) => String(node.props?.['aria-label']).includes('主角 ID'))).toBe(false);
    expect(collect(render(), 'textarea').some((node) => String(node.props?.['aria-label']).includes('初始已知'))).toBe(false);
    const acceptParagraph = collect(render(), 'button').find((node) => node.props?.['data-novel-import-interpretation-accept'] === 'paragraph-0001');
    (acceptParagraph?.props?.onClick as () => void)();

    const confirm = collect(render(), 'button').find((node) => node.props?.['data-novel-import-interpretation-confirm'] === '');
    expect(confirm?.props?.disabled).toBe(false);
    (confirm?.props?.onClick as () => void)();
    await flush();
    expect(ruleStyleBegins).toHaveLength(1);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-rule-style-import'] === '')).toBe(true);
  });

  it('I157 retries a failed session create with source evidence and every author choice intact', async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
    const sourceCreates: unknown[] = [];
    let onboardingBegins = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [],
        projectCreate: async (input) => ({ id: (input as { projectId: string }).projectId, name: 'retry book' }),
        projectOpen: async () => ({}),
        uploadStart: async () => ({ uploadId: 'u-retry', chunkSize: 65536, nextIndex: 0 }),
        uploadChunk: async () => ({ nextIndex: 1, received: 1 }),
        uploadFinalize: async () => ({ sourceHash: 'd'.repeat(64), fileName: 'retry.docx', text: '保留来源证据', chunks: [{ index: 0, text: '保留来源证据', startOffset: 2, endOffset: 8 }] }),
      },
      {
        openProjectId: null,
        onboardingAnalyzer: {
          begin: async () => { onboardingBegins += 1; return { onboardingSessionId: 'must-not-start' }; },
          status: async () => 'running',
        },
        importInterpretation: {
          create: async (input) => {
            sourceCreates.push(structuredClone(input));
            if (sourceCreates.length === 1) throw new Error('EPERM: operation not permitted, rename session.tmp');
            return { ...(input as Record<string, unknown>), importSessionId: 'import-recovered', status: 'draft', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
          },
          read: async (input) => input,
          confirm: async (input) => input,
          discard: async (input) => input,
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const upload = collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '');
    (upload?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File([new Uint8Array([1])], 'retry.docx')] as unknown as FileList } });
    await flush();

    const retry = collect(render(), 'button').find((node) => node.props?.['data-novel-import-interpretation-retry'] === '');
    expect(retry).toBeDefined();
    expect(JSON.stringify(render())).toContain('来源审阅会话未建立，请重试。');
    expect(JSON.stringify(render())).toContain('EPERM: operation not permitted');
    const select = (attribute: string, value: string) => {
      const node = collect(render(), 'select').find((candidate) => candidate.props?.[attribute] !== undefined);
      (node?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    };
    select('data-novel-import-interpretation-source-role', 'hybrid');
    select('data-novel-import-interpretation-treatment', 'adapt-pov');
    const pacing = collect(render(), 'select').find((node) => node.props?.['aria-label'] === '揭示节奏');
    (pacing?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'fast' } });
    const retryAfterChoices = collect(render(), 'button').find((node) => node.props?.['data-novel-import-interpretation-retry'] === '');
    (retryAfterChoices?.props?.onClick as () => void)();
    await flush();

    expect(sourceCreates).toHaveLength(2);
    expect(sourceCreates[1]).toMatchObject({
      projectId: 'retry-u-retry',
      sourceHash: 'd'.repeat(64),
      intent: {
        sourceRole: 'hybrid',
        treatment: 'adapt-pov',
        narrativeIntent: { pov: 'limited', protagonistCandidateId: 'imported-protagonist-dddddddddddd', initialKnown: [], revealPacing: 'fast' },
      },
      paragraphDecisions: [{ paragraphId: 'paragraph-0001', decision: 'pending', summary: '保留来源证据' }],
    });
    expect(onboardingBegins).toBe(0);
    expect(collect(render(), 'section').find((node) => node.props?.['data-novel-import-interpretation-review'] === '')?.props?.['data-novel-import-interpretation-status']).toBe('succeeded');
    expect(collect(render(), 'select').find((node) => node.props?.['data-novel-import-interpretation-source-role'] !== undefined)?.props?.value).toBe('hybrid');
    expect(collect(render(), 'select').find((node) => node.props?.['data-novel-import-interpretation-treatment'] !== undefined)?.props?.value).toBe('adapt-pov');
    expect(collect(render(), 'select').find((node) => node.props?.['aria-label'] === '揭示节奏')?.props?.value).toBe('fast');
  });

  it('I156 retries analysis on the established session without creating another checkpoint', async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
    let sourceCreates = 0;
    const analysisBegins: unknown[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [],
        projectCreate: async (input) => ({ id: (input as { projectId: string }).projectId, name: 'analysis retry' }),
        projectOpen: async () => ({}),
        uploadStart: async () => ({ uploadId: 'u-analysis', chunkSize: 65536, nextIndex: 0 }),
        uploadChunk: async () => ({ nextIndex: 1, received: 1 }),
        uploadFinalize: async () => ({ sourceHash: 'e'.repeat(64), fileName: 'analysis.docx', text: '分析来源', chunks: [{ index: 0, text: '分析来源', startOffset: 0, endOffset: 4 }] }),
      },
      {
        openProjectId: null,
        importInterpretation: {
          create: async (input) => {
            sourceCreates += 1;
            return { ...(input as Record<string, unknown>), importSessionId: 'import-analysis-retry', status: 'draft', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
          },
          read: async (input) => input,
          confirm: async (input) => input,
          discard: async (input) => input,
        },
        importInterpretationAnalysis: {
          begin: async (input) => {
            analysisBegins.push(structuredClone(input));
            if (analysisBegins.length === 1) throw new Error('provider timeout');
            return input;
          },
          status: async (input) => ({ ...(input as Record<string, unknown>), status: 'succeeded' }),
          cancel: async (input) => input,
          result: async (input) => ({ ...(input as Record<string, unknown>), output: { sourceRole: 'idea', confidence: 'high', evidenceParagraphIds: ['paragraph-0001'], paragraphs: [{ paragraphId: 'paragraph-0001', role: 'plot-plan', confidence: 'high', evidence: 'fixture' }], rationale: 'fixture' } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const upload = collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '');
    (upload?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File([new Uint8Array([1])], 'analysis.docx')] as unknown as FileList } });
    await flush();
    const retry = collect(render(), 'button').find((node) => node.props?.['data-novel-import-interpretation-retry'] === '');
    expect(retry).toBeDefined();
    (retry?.props?.onClick as () => void)();
    await flush();

    expect(sourceCreates).toBe(1);
    expect(analysisBegins).toHaveLength(2);
    expect(analysisBegins[1]).toEqual(analysisBegins[0]);
    expect(collect(render(), 'section').find((node) => node.props?.['data-novel-import-interpretation-review'] === '')?.props?.['data-novel-import-interpretation-status']).toBe('succeeded');
  });

  it('I162 discards stale suggestions, reanalyzes author segmentation once, and confirms final roles', async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
    const source = '幕后真相。\n\n作者指令。';
    const creates: unknown[] = [];
    const discards: unknown[] = [];
    const analysisBegins: Array<{ paragraphs: Array<{ paragraphId: string; text: string }> }> = [];
    const confirms: unknown[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [],
        projectCreate: async (input) => ({ id: (input as { projectId: string }).projectId, name: 'segmented' }),
        projectOpen: async () => ({}),
        uploadStart: async () => ({ uploadId: 'u-segment', chunkSize: 65536, nextIndex: 0 }),
        uploadChunk: async () => ({ nextIndex: 1, received: 1 }),
        uploadFinalize: async () => ({ sourceHash: 'f'.repeat(64), fileName: 'segment.docx', text: source, chunks: [{ index: 0, text: source, startOffset: 0, endOffset: source.length }] }),
      },
      {
        openProjectId: null,
        importInterpretation: {
          create: async (input) => {
            creates.push(structuredClone(input));
            return { ...(input as Record<string, unknown>), importSessionId: `import-segment-${creates.length}`, status: 'draft', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() };
          },
          read: async (input) => input,
          confirm: async (input) => { confirms.push(structuredClone(input)); return { ...(input as Record<string, unknown>), status: 'confirmed', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }; },
          discard: async (input) => { discards.push(structuredClone(input)); return { ...(input as Record<string, unknown>), intent: { sourceRole: 'idea', treatment: 'expand-outline' }, paragraphDecisions: [], status: 'discarded', createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString() }; },
        },
        importInterpretationAnalysis: {
          begin: async (input) => { analysisBegins.push(structuredClone(input) as never); return input; },
          status: async (input) => ({ ...(input as Record<string, unknown>), status: 'succeeded' }),
          cancel: async (input) => input,
          result: async (input) => {
            const paragraphs = analysisBegins.at(-1)?.paragraphs ?? [];
            return { ...(input as Record<string, unknown>), output: {
              sourceRole: paragraphs.length === 1 ? 'background-material' : 'hybrid', confidence: 'high', evidenceParagraphIds: paragraphs.map((paragraph) => paragraph.paragraphId),
              paragraphs: paragraphs.map((paragraph, index) => ({ paragraphId: paragraph.paragraphId, role: index === 0 ? 'world-truth' : 'author-instruction', confidence: 'high', evidence: 'fixture' })), rationale: 'fixture',
            } };
          },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const upload = collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '');
    (upload?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File([new Uint8Array([1])], 'segment.docx')] as unknown as FileList } });
    await flush();

    const reviewTree = render();
    const sourceArea = collect(reviewTree, 'textarea').find((node) => node.props?.['data-novel-import-interpretation-segment-text'] === 'paragraph-0001');
    (sourceArea?.props?.onSelect as (event: { target: { selectionStart: number } }) => void)({ target: { selectionStart: '幕后真相。\n\n'.length } });
    const split = collect(reviewTree, 'button').find((node) => node.props?.['data-novel-import-interpretation-split'] === 'paragraph-0001');
    (split?.props?.onClick as () => void)();
    await flush();

    expect(creates).toHaveLength(2);
    expect(discards).toEqual([{ projectId: 'segment-u-segment', importSessionId: 'import-segment-1', sourceHash: 'f'.repeat(64) }]);
    expect(analysisBegins).toHaveLength(2);
    expect(analysisBegins[1].paragraphs.map((paragraph) => paragraph.text)).toEqual(['幕后真相。', '作者指令。']);
    expect(collect(render(), 'article').filter((node) => node.props?.['data-novel-import-interpretation-paragraph'] !== undefined)).toHaveLength(2);
    expect(JSON.stringify(render())).toContain('仅作为创作约束保留');

    const select = (attribute: string, value: string) => {
      const node = collect(render(), 'select').find((candidate) => candidate.props?.[attribute] !== undefined);
      (node?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    };
    select('data-novel-import-interpretation-source-role', 'hybrid');
    select('data-novel-import-interpretation-treatment', 'expand-outline');
    const secondRole = collect(render(), 'select').find((node) => node.props?.['data-novel-import-interpretation-paragraph-role'] === 'paragraph-0002');
    (secondRole?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'presentation-note' } });
    for (const accept of collect(render(), 'button').filter((node) => node.props?.['data-novel-import-interpretation-accept'] !== undefined)) (accept.props?.onClick as () => void)();
    const confirm = collect(render(), 'button').find((node) => node.props?.['data-novel-import-interpretation-confirm'] === '');
    (confirm?.props?.onClick as () => void)();
    await flush();
    expect(confirms).toHaveLength(1);
    expect(confirms[0]).toMatchObject({ paragraphDecisions: [
      { paragraphId: 'paragraph-0001', decision: 'accepted', role: 'world-truth', summary: '幕后真相。' },
      { paragraphId: 'paragraph-0002', decision: 'edited', role: 'presentation-note', summary: '作者指令。' },
    ] });
  });

  it('fails closed before creating a source session when Host chunks have no ranges', async () => {
    (globalThis as unknown as { FileReader: unknown }).FileReader = FakeFileReader;
    let sourceCreates = 0;
    let ruleStyleBegins = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [],
        projectCreate: async (input) => ({ id: (input as { projectId: string }).projectId, name: 'broken ranges' }),
        projectOpen: async () => ({}),
        uploadStart: async () => ({ uploadId: 'u-invalid', chunkSize: 65536, nextIndex: 0 }),
        uploadChunk: async () => ({ nextIndex: 1, received: 1 }),
        uploadFinalize: async () => ({ sourceHash: 'b'.repeat(64), fileName: 'broken.docx', text: '缺少范围', chunks: [{ text: '缺少范围' }] }),
      },
      {
        openProjectId: null,
        importInterpretation: {
          create: async () => { sourceCreates += 1; throw new Error('must not create'); },
          read: async () => undefined,
          confirm: async (input) => input,
          discard: async (input) => input,
        },
        ruleStyleImportInitialization: {
          begin: async (input) => { ruleStyleBegins += 1; return input; },
          status: async (input) => input,
          result: async (input) => input,
          propose: async (input) => input,
          accept: async (input) => input,
          reject: async (input) => input,
          cancel: async (input) => input,
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const input = collect(render(), 'input').find((node) => node.props?.['data-novel-upload-input'] === '');
    (input?.props?.onChange as (event: { target: { files: FileList | null } }) => void)({ target: { files: [new File([new Uint8Array([1])], 'broken.docx')] as unknown as FileList } });
    await flush();

    expect(sourceCreates).toBe(0);
    expect(ruleStyleBegins).toBe(0);
    expect(collect(render(), 'p').some((node) => String(node.children?.[0] ?? '').includes('来源段落范围不可用'))).toBe(true);
  });
});
