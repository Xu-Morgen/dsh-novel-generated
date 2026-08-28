/**
 * I95 按面板拆分（计划 §18 I95）：I56 six-layer adjudication correctness (R12-3)
 */
/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：六层初始化闭环 —— DOCX/空白作品入口、
 * 分析失败、逐层裁决、进度/取消/重试/应用刷新（I52 / I53 / I56 / I57）。
 */


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);
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
