/**
 * I95 按面板拆分（计划 §18 I95）：I57 初始化进度、取消、重试与应用刷新 (R12-4)
 */
/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：六层初始化闭环 —— DOCX/空白作品入口、
 * 分析失败、逐层裁决、进度/取消/重试/应用刷新（I52 / I53 / I56 / I57）。
 */


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);
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
    expect(String(error?.children?.[0] ?? '')).toContain('创作服务返回了无法使用的内容');
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
    // 成功：离开审阅页签、重新打开作品并刷新六层、回到作者流程大纲阶段。
    expect(opens.length).toBeGreaterThanOrEqual(2);
    expect(characterReads.length).toBeGreaterThanOrEqual(2);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-onboarding'] === '')).toBe(false);
    expect(render().props?.['data-novel-route']).toBe('workflow');
    expect(collect(render(), 'li').some((node) => node.props?.['data-novel-workflow-stage'] === 'outline' && node.props?.['data-novel-workflow-stage-state'] === 'current')).toBe(true);
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
