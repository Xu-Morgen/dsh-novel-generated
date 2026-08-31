/**
 * I95 按面板拆分（计划 §18 I95）：I63 候选审阅与生成后裁决 UI (R13-4)
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

describe('I63 候选审阅与生成后裁决 UI (R13-4)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const candidatePanel = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-candidate-panel'] !== undefined);

  const CHAPTER_WORKSPACE = {
    chapterList: async () => [{ id: 'chapter-main', index: 1, title: '第一章', pov: 'mira', status: 'draft', sceneCount: 0 }],
    chapterRead: async () => ({ ok: true, value: { id: 'chapter-main', index: 1, title: '第一章', pov: 'mira', status: 'draft', scenes: [] } }),
    sceneRead: async () => ({ ok: true, value: { chapter: { id: 'chapter-main', index: 1, title: '第一章', pov: 'mira' }, scene: { id: '', index: 0, summary: '', content: '', beats: [], canonEvents: [], notes: '' } } }),
  };

  const REVIEW = {
    ok: true,
    value: {
      candidateId: 'cand-1',
      intent: 'continue',
      target: { projectId: 'fixture-project', chapterId: 'chapter-main', sceneId: 'scene-next' },
      text: '米拉在码头找到铜钥匙。',
      diff: { kind: 'new-scene' },
      validation: { status: 'pass', violations: [] },
      // I71：preview 携带注入解释（层/触发/预算摘要；不泄露 secret 内容）。
      trace: {
        intent: 'continue', pov: 'mira',
        navigation: { actId: 'act-1', beatId: 'beat-1', title: '午夜灯塔' },
        sections: [
          { id: 'rules', characterCount: 60, budget: 4000, truncated: false },
          { id: 'worldview', characterCount: 40, budget: 3000, truncated: false },
        ],
        triggers: [{ entryId: 'north-harbor', title: '北港', matchedKeywords: ['北港'] }],
        totals: { characterCount: 100, budget: 24000, truncatedSectionCount: 0 },
        rewritePromptCharacters: 0, knowledgeVisibleCount: 1,
      },
    },
  };

  it('续写候选生成后先展示正文/diff/校验结果（ready），接受为草稿才写入 C5；双击幂等', async () => {
    const proposes: Array<{ projectId: string; input: { intent: string; chapterId: string; sceneId: string } }> = [];
    const adjudicates: string[] = [];
    const adoptions: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      CHAPTER_WORKSPACE,
      {
        writing: {
          proposeAt: async (projectId, input) => { proposes.push({ projectId, input }); return { ok: true, value: { candidate: { id: 'cand-1', intent: 'continue', target: { projectId, chapterId: 'chapter-main', sceneId: 'scene-next' }, prompt: 'p', text: '米拉在码头找到铜钥匙。', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' } } }; },
          preview: async (candidateId) => { expect(candidateId).toBe('cand-1'); return REVIEW; },
          adoptDraft: async (candidateId) => { adoptions.push(candidateId); return { ok: true, value: { projectId: 'fixture-project', candidateId, chapterId: 'chapter-main', sceneId: 'scene-next', status: 'adopted', sourceHash: 'a'.repeat(64), projectFingerprint: 'b'.repeat(64) } }; },
          adjudicate: async (candidateId, decision) => { adjudicates.push(`${candidateId}:${decision}`); return { ok: true, value: { status: 'written', candidateId, scene: { chapterId: 'chapter-main', sceneId: 'scene-next', index: 0, content: '米拉在码头找到铜钥匙。' }, layers: ['c2', 'c1', 'c3', 'c4', 'b2'] } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-main')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'candidate')?.props?.onClick as () => void)();
    await flush();

    // idle：发起入口可用，无裁决按钮。
    let panel = candidatePanel(render());
    expect(panel?.props?.['data-novel-candidate-state']).toBe('idle');
    expect(collect(render(), 'button').some((n) => n.props?.['data-novel-candidate-accept'] === '')).toBe(false);

    // 续写 → propose → preview → ready（正文 + diff + 校验结果可见）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-candidate-propose-continue'] === '')?.props?.onClick as () => void)();
    await flush();
    panel = candidatePanel(render());
    expect(proposes).toHaveLength(1);
    expect(proposes[0]).toMatchObject({ projectId: 'fixture-project', input: { intent: 'continue', chapterId: 'chapter-main' } });
    expect(proposes[0].input.sceneId).toMatch(/^scene-/);
    expect(panel?.props?.['data-novel-candidate-state']).toBe('ready');
    expect(collect(render(), 'p').some((n) => String(n.children?.[0] ?? '').includes('米拉在码头找到铜钥匙。'))).toBe(true);
    expect(collect(render(), 'p').some((n) => n.props?.['data-novel-candidate-diff'] === 'new-scene' && String(n.children?.[0] ?? '').includes('追加到当前选中的位置'))).toBe(true);
    expect(collect(render(), 'div').some((n) => n.props?.['data-novel-candidate-validation'] === 'pass')).toBe(true);

    // 双击接受为草稿：至多一次 adoptDraft（inflight 幂等）；成功后显示完成态。
    const accept = () => collect(render(), 'button').find((n) => n.props?.['data-novel-candidate-accept'] === '');
    (accept()?.props?.onClick as () => void)();
    (accept()?.props?.onClick as () => void)();
    await flush();
    expect(adoptions).toEqual(['cand-1']);
    expect(adjudicates).toEqual([]);
    // I107：接受后重读章节会清理旧候选 target；模式徽标随之清除并回到 idle。
    expect(candidatePanel(render())?.props?.['data-novel-candidate-state']).toBe('idle');
  });

  it('reject 零写：显示完成态且不再展示候选正文', async () => {
    const adjudicates: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      CHAPTER_WORKSPACE,
      {
        writing: {
          proposeAt: async () => ({ ok: true, value: { candidate: { id: 'cand-2', intent: 'continue', target: { projectId: 'fixture-project', chapterId: 'chapter-main', sceneId: 'scene-next' }, prompt: 'p', text: '文本', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' } } }),
          preview: async (candidateId) => ({ ok: true, value: { ...REVIEW.value, candidateId } }),
          adjudicate: async (candidateId, decision) => { adjudicates.push(`${candidateId}:${decision}`); return { ok: true, value: { status: 'rejected', candidateId } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-main')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'candidate')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-candidate-propose-continue'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-candidate-reject'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(adjudicates).toEqual(['cand-2:reject']);
    const panel = candidatePanel(render());
    expect(panel?.props?.['data-novel-candidate-state']).toBe('done');
    expect(collect(render(), 'div').some((n) => n.props?.['data-novel-candidate-review'] !== undefined)).toBe(false);
  });

  it('I105 未选择章节时本地报错且不调用 proposeAt', async () => {
    let calls = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      CHAPTER_WORKSPACE,
      {
        writing: {
          proposeAt: async () => { calls += 1; throw new Error('must not call'); },
          preview: async () => REVIEW,
          adjudicate: async () => ({ ok: true, value: { status: 'rejected', candidateId: 'unused' } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'candidate')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-candidate-propose-continue'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(calls).toBe(0);
    expect(candidatePanel(render())?.props?.['data-novel-candidate-state']).toBe('error');
    expect(collect(render(), 'p').some((node) => String(node.children?.[0] ?? '').includes('请先选择目标章节'))).toBe(true);
  });

  it('重写裁决展示后继候选审阅（旧候选被 Host superseded，Client 直接审阅后继）', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      CHAPTER_WORKSPACE,
      {
        writing: {
          proposeAt: async () => ({ ok: true, value: { candidate: { id: 'cand-3', intent: 'continue', target: { projectId: 'fixture-project', chapterId: 'chapter-main', sceneId: 'scene-next' }, prompt: 'p', text: '文本', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' } } }),
          preview: async (candidateId) => ({ ok: true, value: { ...REVIEW.value, candidateId } }),
          adjudicate: async (candidateId, decision) => ({ ok: true, value: { status: 'rewritten', candidateId, superseded: candidateId, candidate: { id: 'cand-3-r1', intent: 'continue', target: { projectId: 'fixture-project', chapterId: 'chapter-main', sceneId: 'scene-next' }, prompt: 'p', text: '后继文本', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' } } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-item'] === 'chapter-main')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-chapter-mode'] === 'candidate')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-candidate-propose-continue'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-candidate-rewrite'] === '')?.props?.onClick as () => void)();
    await flush();
    // 后继候选立即进入 ready 审阅（面板展示新候选 id）。
    const panel = candidatePanel(render());
    expect(panel?.props?.['data-novel-candidate-state']).toBe('ready');
    expect(collect(render(), 'span').some((n) => String(n.children?.[0] ?? '') === 'cand-3-r1')).toBe(true);
  });
})
