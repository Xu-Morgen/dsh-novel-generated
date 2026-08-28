/**
 * I95 按面板拆分（计划 §18 I95）：方案 A 剧情时间线面板 UI（design §8 相关角色对）
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

describe('方案 A 剧情时间线面板 UI（design §8 相关角色对）', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);

  it('未自建时展示空态并可从大纲生成骨架，随后列出有序节点并保存作者安排', async () => {
    const saveCalls: Array<{ projectId: string; input: unknown }> = [];
    const TIMELINE = {
      id: 'fixture-project', version: 1, currentNodeId: null,
      nodes: [
        { id: 'node-0', order: 0, label: '第一幕 · 午夜旧灯塔 · 发现海图', reveals: [], relationships: [] },
        { id: 'node-1', order: 1, label: '第一幕 · 钟楼对峙', reveals: [], relationships: [] },
      ],
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        timeline: {
          read: async () => null,
          ensureFromOutline: async () => TIMELINE,
          setCurrentNode: async () => TIMELINE,
          save: async (projectId, input) => { saveCalls.push({ projectId, input }); return input; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'timeline')?.props?.onClick as () => void)();
    await flush();

    // 空态：未自建 → 提示 + 一键自建按钮。
    expect(collect(render(), 'p').some((n) => n.props?.['data-novel-timeline-empty'] !== undefined)).toBe(true);
    ((collect(render(), 'button').find((n) => n.props?.['data-novel-timeline-ensure'] === '')?.props?.onClick as () => void))();
    await flush();

    // 自建后列出有序节点（order 顺序），选中第一个节点。
    expect(collect(render(), 'button').filter((n) => n.props?.['data-novel-timeline-node'] !== undefined).map((n) => n.props?.['data-novel-timeline-node'])).toEqual(['node-0', 'node-1']);
    const first = collect(render(), 'button').find((n) => n.props?.['data-novel-timeline-node'] === 'node-0') as FakeNode;
    (first.props?.onClick as () => void)();
    await flush();

    // 保存作者安排 → 只经 novelTimeline.save，且输入是完整时间线文档。
    const saveButton = collect(render(), 'button').find((n) => n.props?.['data-novel-timeline-save'] === '') as FakeNode;
    expect(saveButton).toBeDefined();
    (saveButton.props?.onClick as () => void)();
    await flush();
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].projectId).toBe('fixture-project');
    expect((saveCalls[0].input as { nodes: unknown[] }).nodes).toHaveLength(2);
  });

  it('时间线已自建时直接列出节点；手动设当前节点经 setCurrentNode', async () => {
    const currentCalls: Array<{ projectId: string; nodeId: string | null }> = [];
    const TIMELINE = {
      id: 'fixture-project', version: 1, currentNodeId: null,
      nodes: [{ id: 'node-0', order: 0, label: '第一幕 · 初见', reveals: [], relationships: [] }],
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        timeline: {
          read: async () => TIMELINE,
          ensureFromOutline: async () => { throw new Error('不应自建：已存在'); },
          setCurrentNode: async (projectId, nodeId) => { currentCalls.push({ projectId, nodeId }); return { ...TIMELINE, currentNodeId: nodeId }; },
          save: async () => { throw new Error('不应保存'); },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'timeline')?.props?.onClick as () => void)();
    await flush();

    // 初始 idle：点击「刷新」装载已自建的时间线。
    ((collect(render(), 'button').find((n) => n.props?.['data-novel-timeline-refresh'] === '')?.props?.onClick as () => void))();
    await flush();

    expect(collect(render(), 'button').filter((n) => n.props?.['data-novel-timeline-node'] !== undefined)).toHaveLength(1);
    ((collect(render(), 'button').find((n) => n.props?.['data-novel-timeline-set-current'] === 'node-0')?.props?.onClick as () => void))();
    await flush();
    expect(currentCalls).toEqual([{ projectId: 'fixture-project', nodeId: 'node-0' }]);
  });
})
