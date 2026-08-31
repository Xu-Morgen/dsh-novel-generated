/**
 * I95 按面板拆分（计划 §18 I95）：I67 规则与文风控制面 UI (R14-2)
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

describe('I67 规则与文风控制面 UI (R14-2)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const panel = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-rule-style-panel'] !== undefined);
  const openRuleStyle = (render: () => FakeNode): void => {
    (navButton(render(), 'ruleStyle')?.props?.onClick as () => void)();
  };
  const refresh = (render: () => FakeNode): void => {
    (collect(render(), 'button').find((n) => n.props?.['data-novel-rule-style-refresh'] === '')?.props?.onClick as () => void)();
  };
  const messageOf = (tree: FakeNode): string =>
    String((collect(tree, 'p').find((n) => n.props?.['data-novel-rule-style-message'] !== undefined)?.children?.[0] ?? ''));

  const RULES = [
    {
      id: 'harbor-seal', version: 2, scope: 'global', kind: 'physics', statement: '海港封印不可破。',
      priority: 7, immutable: true, examples: [], active: true,
    },
    {
      id: 'monologue', version: 1, scope: 'character', kind: 'genre', statement: '英雄不多话。',
      priority: 3, immutable: false, examples: ['决战独白'], active: false,
    },
  ];
  const PROJECTION = { projectId: 'fixture-project', rules: RULES, style: null };
  const STYLE = {
    id: 'global-style', version: 1, name: '雾港 noir', person: 'third-limited', tense: 'past', povScope: 'single',
    tone: '克制', proseStyle: '精确', chapterFormat: '场景断行', dialogueConventions: '中文引号', forbidden: ['突然之间'],
  };
  const baseStub = (overrides: Partial<{ list: (projectId: string) => Promise<unknown>; readRule: (projectId: string, ruleId: string) => Promise<unknown>; createRule: (projectId: string, input: unknown) => Promise<unknown>; updateRule: (projectId: string, ruleId: string, patch: unknown) => Promise<unknown>; saveStyle: (projectId: string, input: unknown) => Promise<unknown> }> = {}) => ({
    list: overrides.list ?? (async () => ({ ok: true, value: PROJECTION })),
    readRule: overrides.readRule ?? (async () => { throw new Error('未注入 readRule'); }),
    createRule: overrides.createRule ?? (async () => { throw new Error('未注入 createRule'); }),
    updateRule: overrides.updateRule ?? (async () => { throw new Error('未注入 updateRule'); }),
    readStyle: async () => { throw new Error('未注入 readStyle'); },
    saveStyle: overrides.saveStyle ?? (async () => { throw new Error('未注入 saveStyle'); }),
  });

  it('刷新后规则列表展示优先级/中文枚举徽标/immutable 停用徽标，风格未初始化提示（R14-2 中文枚举）', async () => {
    const lists: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      { ruleStyle: baseStub({ list: async (projectId) => { lists.push(projectId); return { ok: true, value: PROJECTION }; } }) },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openRuleStyle(render);
    await flush();
    expect(panel(render())?.props?.['data-novel-rule-style-state']).toBe('idle');
    refresh(render);
    await flush();
    expect(lists).toEqual(['fixture-project']);
    expect(panel(render())?.props?.['data-novel-rule-style-state']).toBe('ready');
    // 规则列表：优先级徽标、statement、中文 scope/kind、immutable/停用徽标（顺序 = Host 投影排序）。
    const items = collect(render(), 'li').filter((n) => n.props?.['data-novel-rule-item'] !== undefined);
    expect(items.map((n) => n.props?.['data-novel-rule-item'])).toEqual(['harbor-seal', 'monologue']);
    expect(items.map((n) => String((collect(n, 'span').find((c) => c.props?.['data-novel-rule-priority'] !== undefined)?.children?.[0] ?? '')))).toEqual(['7', '3']);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-rule-scope'] === 'global' && String((n.children?.[0] ?? '')) === '全局')).toBe(true);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-rule-kind'] === 'physics' && String((n.children?.[0] ?? '')) === '物理')).toBe(true);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-rule-scope'] === 'character' && String((n.children?.[0] ?? '')) === '角色')).toBe(true);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-rule-immutable'] !== undefined)).toBe(true);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-rule-active'] !== undefined)).toBe(true);
    // 中文人称/时态/POV 下拉选项 + 未初始化提示。
    expect(collect(render(), 'p').some((n) => n.props?.['data-novel-style-uninitialized'] !== undefined)).toBe(true);
    const personOptions = collect(render(), 'select').find((n) => n.props?.['data-novel-style-person'] !== undefined);
    expect(personOptions).toBeDefined();
  });

  it('新建规则：表单收集受控值 → createRule Remote payload 精确断言（Client 无领域校验）', async () => {
    const created: unknown[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        ruleStyle: baseStub({
          createRule: async (projectId, input) => {
            created.push(input);
            return { ok: true, value: { ...(input as object), id: (input as { id: string }).id, version: 1 } };
          },
          list: async () => ({ ok: true, value: PROJECTION }),
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openRuleStyle(render);
    await flush();
    refresh(render);
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-rule-new'] === '')?.props?.onClick as () => void)();
    await flush();
    // 填表单：id / statement / scope / kind / priority / immutable / active / examples。
    const input = (selector: string): ((value: string) => void) =>
      (value: string) => (collect(render(), 'input').find((n) => n.props?.[selector] !== undefined)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    const textarea = (selector: string): ((value: string) => void) =>
      (value: string) => (collect(render(), 'textarea').find((n) => n.props?.[selector] !== undefined)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    const select = (selector: string): ((value: string) => void) =>
      (value: string) => (collect(render(), 'select').find((n) => n.props?.[selector] !== undefined)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    input('data-novel-rule-edit-id')('harbor-seal-2');
    textarea('data-novel-rule-edit-statement')('第二道封印。');
    select('data-novel-rule-edit-scope')('location');
    select('data-novel-rule-edit-kind')('taboo');
    input('data-novel-rule-edit-priority')('80');
    // immutable / active 复选框（fake React onChange 无参）。
    (collect(render(), 'input').find((n) => n.props?.['data-novel-rule-edit-immutable'] !== undefined)?.props?.onChange as () => void)();
    (collect(render(), 'input').find((n) => n.props?.['data-novel-rule-edit-active'] !== undefined)?.props?.onChange as () => void)();
    textarea('data-novel-rule-edit-examples')('海图显字');
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-rule-save'] === '')?.props?.onClick as () => void)();
    await flush();
    // Client 只提交受控值（无领域 fallback：不本地校验、不补默认）。
    expect(created).toEqual([{
      id: 'harbor-seal-2', scope: 'location', kind: 'taboo', statement: '第二道封印。',
      priority: 80, immutable: true, active: false, examples: ['海图显字'],
    }]);
    expect(messageOf(render())).toContain('已保存规则「harbor-seal-2」（v1）');
  });

  it('编辑既有规则：readRule 拉详情填充表单 → updateRule payload；Host 拒绝（immutable）展示错误且面板不 brick', async () => {
    const read: string[] = [];
    const updated: unknown[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        ruleStyle: baseStub({
          readRule: async (projectId, ruleId) => {
            read.push(ruleId);
            const rule = RULES.find((item) => item.id === ruleId);
            if (!rule) throw new Error(`Unknown rule: ${ruleId}`);
            return { ok: true, value: rule };
          },
          updateRule: async (projectId, ruleId, patch) => {
            updated.push({ ruleId, patch });
            throw new Error('Immutable rule cannot be updated: harbor-seal');
          },
          list: async () => ({ ok: true, value: PROJECTION }),
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openRuleStyle(render);
    await flush();
    refresh(render);
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-rule-edit'] === 'harbor-seal')?.props?.onClick as () => void)();
    await flush();
    expect(read).toEqual(['harbor-seal']);
    // 表单回填既有值（优先级字符串化、statement、immutable 勾选）。
    expect(String((collect(render(), 'input').find((n) => n.props?.['data-novel-rule-edit-priority'] !== undefined)?.props?.value ?? ''))).toBe('7');
    expect((collect(render(), 'textarea').find((n) => n.props?.['data-novel-rule-edit-statement'] !== undefined)?.props?.value)).toBe('海港封印不可破。');
    // 修改优先级并保存 → updateRule 收到 patch（不含 id/version —— Host 持有）。
    (collect(render(), 'input').find((n) => n.props?.['data-novel-rule-edit-priority'] !== undefined)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '9' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-rule-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(updated).toEqual([{
      ruleId: 'harbor-seal',
      patch: { scope: 'global', kind: 'physics', statement: '海港封印不可破。', priority: 9, immutable: true, examples: [], active: true },
    }]);
    // Host 拒绝消息展示，面板保持 ready（不 brick）。
    expect(panel(render())?.props?.['data-novel-rule-style-state']).toBe('ready');
    expect(messageOf(render())).toContain('操作未完成，请重试');
  });

  it('风格档案：填写表单保存 → saveStyle payload 不含 id（Host 管理 id）；Host 拒绝消息展示', async () => {
    const saved: unknown[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        ruleStyle: baseStub({
          list: async () => ({ ok: true, value: PROJECTION }),
          saveStyle: async (projectId, input) => {
            saved.push(input);
            return { ok: true, value: { ...(input as object), id: 'global-style', version: 1 } };
          },
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openRuleStyle(render);
    await flush();
    refresh(render);
    await flush();
    const input = (selector: string): ((value: string) => void) =>
      (value: string) => (collect(render(), 'input').find((n) => n.props?.[selector] !== undefined)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    const textarea = (selector: string): ((value: string) => void) =>
      (value: string) => (collect(render(), 'textarea').find((n) => n.props?.[selector] !== undefined)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    const select = (selector: string): ((value: string) => void) =>
      (value: string) => (collect(render(), 'select').find((n) => n.props?.[selector] !== undefined)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    input('data-novel-style-name')('雾港 noir');
    select('data-novel-style-person')('third-limited');
    select('data-novel-style-tense')('past');
    select('data-novel-style-pov')('single');
    input('data-novel-style-tone')('克制');
    textarea('data-novel-style-prose')('精确');
    textarea('data-novel-style-format')('场景断行');
    textarea('data-novel-style-dialogue')('中文引号');
    textarea('data-novel-style-forbidden')('突然之间\n命运的齿轮');
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-style-save'] === '')?.props?.onClick as () => void)();
    await flush();
    // Client 提交最小受控值：不含 id/version（Host 管理稳定 id，R14-2 无领域 fallback）。
    expect(saved).toEqual([{
      name: '雾港 noir', person: 'third-limited', tense: 'past', povScope: 'single',
      tone: '克制', proseStyle: '精确', chapterFormat: '场景断行', dialogueConventions: '中文引号',
      forbidden: ['突然之间', '命运的齿轮'],
    }]);
    expect(messageOf(render())).toContain('已保存风格档案「雾港 noir」（v1，id global-style）');
  });

  it('Host 拒绝（非法枚举/越界优先级）时错误消息展示且面板不 brick', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        ruleStyle: baseStub({
          createRule: async () => { throw new Error('规则优先级必须在 1–100 之间（收到 0）'); },
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openRuleStyle(render);
    await flush();
    refresh(render);
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-rule-new'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-rule-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(panel(render())?.props?.['data-novel-rule-style-state']).toBe('ready');
    expect(messageOf(render())).toContain('规则优先级必须在 1–100 之间');
  });
})
