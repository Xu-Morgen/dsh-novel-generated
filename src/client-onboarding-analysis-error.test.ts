/**
 * I95 按面板拆分（计划 §18 I95）：I52 analysis failure surfaces a readable error in the review panel
 */
/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：六层初始化闭环 —— DOCX/空白作品入口、
 * 分析失败、逐层裁决、进度/取消/重试/应用刷新（I52 / I53 / I56 / I57）。
 */


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);
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
