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

  const REVIEW = {
    ok: true,
    value: {
      candidateId: 'cand-1',
      intent: 'continue',
      target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-next' },
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

  it('续写候选生成后先展示正文/diff/校验结果（ready），accept 才提交裁决；双击幂等', async () => {
    const proposes: Array<{ projectId: string; input: unknown }> = [];
    const adjudicates: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        chapterList: async () => [{ id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', sceneCount: 0 }],
        chapterRead: async () => ({ ok: true, value: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft', scenes: [] } }),
        sceneRead: async () => ({ ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira' }, scene: { id: '', index: 0, summary: '', content: '', beats: [], canonEvents: [], notes: '' } } }),
      },
      {
        writing: {
          propose: async (projectId, input) => { proposes.push({ projectId, input }); return { ok: true, value: { candidate: { id: 'cand-1', intent: 'continue', target: { projectId, chapterId: 'chapter-1', sceneId: 'scene-next' }, prompt: 'p', text: '米拉在码头找到铜钥匙。', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' } } }; },
          preview: async (candidateId) => { expect(candidateId).toBe('cand-1'); return REVIEW; },
          adjudicate: async (candidateId, decision) => { adjudicates.push(`${candidateId}:${decision}`); return { ok: true, value: { status: 'written', candidateId, scene: { chapterId: 'chapter-1', sceneId: 'scene-next', index: 0, content: '米拉在码头找到铜钥匙。' }, layers: ['c2', 'c1', 'c3', 'c4', 'b2'] } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();

    // idle：发起入口可用，无裁决按钮。
    let panel = candidatePanel(render());
    expect(panel?.props?.['data-novel-candidate-state']).toBe('idle');
    expect(collect(render(), 'button').some((n) => n.props?.['data-novel-candidate-accept'] === '')).toBe(false);

    // 续写 → propose → preview → ready（正文 + diff + 校验结果可见）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-candidate-propose-continue'] === '')?.props?.onClick as () => void)();
    await flush();
    panel = candidatePanel(render());
    expect(proposes).toEqual([{ projectId: 'fixture-project', input: { intent: 'continue' } }]);
    expect(panel?.props?.['data-novel-candidate-state']).toBe('ready');
    expect(collect(render(), 'p').some((n) => String(n.children?.[0] ?? '').includes('米拉在码头找到铜钥匙。'))).toBe(true);
    expect(collect(render(), 'p').some((n) => n.props?.['data-novel-candidate-diff'] === 'new-scene')).toBe(true);
    expect(collect(render(), 'div').some((n) => n.props?.['data-novel-candidate-validation'] === 'pass')).toBe(true);

    // 双击接受：至多一次 adjudicate（inflight 幂等）；成功后显示完成态。
    const accept = () => collect(render(), 'button').find((n) => n.props?.['data-novel-candidate-accept'] === '');
    (accept()?.props?.onClick as () => void)();
    (accept()?.props?.onClick as () => void)();
    await flush();
    expect(adjudicates).toEqual(['cand-1:accept']);
    expect(candidatePanel(render())?.props?.['data-novel-candidate-state']).toBe('done');
  });

  it('reject 零写：显示完成态且不再展示候选正文', async () => {
    const adjudicates: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        writing: {
          propose: async () => ({ ok: true, value: { candidate: { id: 'cand-2', intent: 'continue', target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-next' }, prompt: 'p', text: '文本', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' } } }),
          preview: async (candidateId) => ({ ok: true, value: { ...REVIEW.value, candidateId } }),
          adjudicate: async (candidateId, decision) => { adjudicates.push(`${candidateId}:${decision}`); return { ok: true, value: { status: 'rejected', candidateId } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
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

  it('重写裁决展示后继候选审阅（旧候选被 Host superseded，Client 直接审阅后继）', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        writing: {
          propose: async () => ({ ok: true, value: { candidate: { id: 'cand-3', intent: 'continue', target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-next' }, prompt: 'p', text: '文本', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' } } }),
          preview: async (candidateId) => ({ ok: true, value: { ...REVIEW.value, candidateId } }),
          adjudicate: async (candidateId, decision) => ({ ok: true, value: { status: 'rewritten', candidateId, superseded: candidateId, candidate: { id: 'cand-3-r1', intent: 'continue', target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-next' }, prompt: 'p', text: '后继文本', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' } } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
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
});

describe('I64 一致性审校中心 UI (R13-5)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const reviewPanel = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-review-panel'] !== undefined);
  const issueNodes = (tree: FakeNode): FakeNode[] =>
    collect(tree, 'li').filter((node) => node.props?.['data-novel-review-issue'] !== undefined);
  const openReview = (render: () => FakeNode): void => {
    (navButton(render(), 'review')?.props?.onClick as () => void)();
  };

  const PROJECTION = {
    projectId: 'fixture-project',
    scannedAt: '2026-01-01T00:00:00.000Z',
    issues: [
      { id: 'iss-rule', category: 'rule', severity: 'hard', kind: 'immutable-rule', message: '正文违反不可变规则。', references: ['rule-1'], location: { chapterId: 'chapter-1', sceneId: 'scene-1' }, status: 'open' },
      { id: 'iss-canon', category: 'canon', severity: 'hard', kind: 'canon-conflict', message: '与正史矛盾。', references: ['evt-1'], location: { chapterId: 'chapter-1', sceneId: 'scene-1' }, status: 'open' },
      { id: 'iss-know', category: 'knowledge', severity: 'hard', kind: 'knowledge-leak', message: 'POV 知情泄漏。', references: ['k-1'], location: { chapterId: 'chapter-1', sceneId: 'scene-2' }, status: 'open' },
      { id: 'iss-rel', category: 'relationship', severity: 'soft', kind: 'relationship-drift', message: '关系数值漂移。', references: ['rel-1'], location: { chapterId: 'chapter-1', sceneId: 'scene-2' }, status: 'open' },
      { id: 'iss-style', category: 'style', severity: 'soft', kind: 'style-deviation', message: '风格偏离。', references: ['style-demo'], location: { chapterId: 'chapter-1', sceneId: 'scene-2' }, status: 'open' },
    ],
    summary: { total: 5, hard: 3, soft: 2, byCategory: { rule: 1, canon: 1, knowledge: 1, relationship: 1, style: 1 } },
  };
  const ISSUES_REFERENCE = [...PROJECTION.issues.map((issue) => ({ ...issue, references: [...issue.references], location: issue.location === undefined ? undefined : { ...issue.location } }))];

  it('刷新审校后展示五类问题（严重度/分类/引用/正文定位/状态均可追溯），ready 前无裁决按钮', async () => {
    const scans: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        review: {
          scan: async (projectId) => { scans.push(projectId); return { ok: true, value: PROJECTION }; },
          records: async () => ({ ok: true, value: [] }),
          adjudicate: async () => { throw new Error('不应在 ready 前裁决'); },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openReview(render);
    await flush();
    // idle：无问题列表、无裁决按钮。
    expect(reviewPanel(render())?.props?.['data-novel-review-state']).toBe('idle');
    expect(collect(render(), 'button').some((n) => n.props?.['data-novel-review-continue'] === '')).toBe(false);

    (collect(render(), 'button').find((n) => n.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(scans).toEqual(['fixture-project']);
    const panel = reviewPanel(render());
    expect(panel?.props?.['data-novel-review-state']).toBe('ready');
    // 汇总含硬/软与五类计数。
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-review-summary'] !== undefined)?.children?.[0] ?? ''))).toContain('共 5 项问题（硬 3 / 软 2）');
    // 五类问题逐一投影：严重度徽标、分类、消息、引用、正文定位、状态锚点。
    const issues = issueNodes(render());
    expect(issues.map((n) => n.props?.['data-novel-review-issue'])).toEqual(['iss-rule', 'iss-canon', 'iss-know', 'iss-rel', 'iss-style']);
    expect(issues.map((n) => n.props?.['data-novel-review-issue-severity'])).toEqual(['hard', 'hard', 'hard', 'soft', 'soft']);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-review-issue-category'] === 'relationship')).toBe(true);
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-review-issue-meta'] !== undefined)?.children?.[0] ?? ''))).toContain('定位：第 chapter-1 章 / 场景 scene-1');
    // 硬冲突存在 → 硬阻断提示可见。
    expect(collect(render(), 'p').some((n) => n.props?.['data-novel-review-hard-block'] !== undefined)).toBe(true);
  });

  it('过滤：按分类/严重度组合过滤，清除过滤复位', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        review: {
          scan: async () => ({ ok: true, value: PROJECTION }),
          records: async () => ({ ok: true, value: [] }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openReview(render);
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    const chip = (kind: string, value: string): FakeNode | undefined =>
      collect(render(), 'button').find((n) => n.props?.['data-novel-review-filter'] === `${kind}:${value}`);
    // 分类=关系 → 仅关系问题。
    (chip('categories', 'relationship')?.props?.onClick as () => void)();
    await flush();
    expect(issueNodes(render()).map((n) => n.props?.['data-novel-review-issue'])).toEqual(['iss-rel']);
    // 追加 严重度=hard → 组合后无命中（关系是 soft）。
    (chip('severities', 'hard')?.props?.onClick as () => void)();
    await flush();
    expect(issueNodes(render())).toHaveLength(0);
    expect(collect(render(), 'p').some((n) => n.props?.['data-novel-review-empty'] !== undefined)).toBe(true);
    // 清除过滤 → 五条全部回来。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-review-filter-clear'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(issueNodes(render())).toHaveLength(5);
  });

  it('软警告显式继续并记录：adjudicate 提交 issueIds，投影状态与审计记录刷新', async () => {
    const adjudicated: Array<{ decision: string; issueIds: string[] }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        review: {
          scan: async () => ({ ok: true, value: PROJECTION }),
          records: async () => ({ ok: true, value: [] }),
          adjudicate: async (projectId, input) => {
            adjudicated.push({ decision: input.decision, issueIds: [...input.issueIds] });
            const continued = ISSUES_REFERENCE.map((issue) => issue.id === 'iss-rel' ? { ...issue, status: 'continued' } : issue);
            return { ok: true, value: { projectId, decision: input.decision, applied: [...input.issueIds], duplicate: [], records: [{ projectId, issueId: 'iss-rel', decision: 'continue', decidedAt: '2026-01-01T00:00:00.000Z' }], projection: { ...PROJECTION, issues: continued } } };
          },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openReview(render);
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    // 勾选软问题 iss-rel。
    (collect(render(), 'input').find((n) => n.props?.['data-novel-review-select'] === 'iss-rel')?.props?.onChange as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-review-continue'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(adjudicated).toEqual([{ decision: 'continue', issueIds: ['iss-rel'] }]);
    // 投影状态刷新：iss-rel 已继续；审计记录可见。
    const rel = issueNodes(render()).find((n) => n.props?.['data-novel-review-issue'] === 'iss-rel');
    expect(rel).toBeDefined();
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-review-record'] === 'iss-rel')).toBe(true);
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-review-message'] !== undefined)?.children?.[0] ?? ''))).toContain('已记录 1 项「显式继续」');
  });

  it('硬冲突阻止继续：勾选硬问题后继续按钮禁用；请求重写仍可记录', async () => {
    const adjudicated: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        review: {
          scan: async () => ({ ok: true, value: PROJECTION }),
          records: async () => ({ ok: true, value: [] }),
          adjudicate: async (projectId, input) => {
            adjudicated.push(input.decision);
            const requested = ISSUES_REFERENCE.map((issue) => issue.id === 'iss-rule' ? { ...issue, status: 'rewrite-requested' } : issue);
            return { ok: true, value: { projectId, decision: input.decision, applied: [...input.issueIds], duplicate: [], records: [{ projectId, issueId: 'iss-rule', decision: 'rewrite-requested', decidedAt: '2026-01-01T00:00:00.000Z' }], projection: { ...PROJECTION, issues: requested } } };
          },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openReview(render);
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    // 勾选硬问题 iss-rule：继续禁用（硬冲突阻止继续/接受）。
    (collect(render(), 'input').find((n) => n.props?.['data-novel-review-select'] === 'iss-rule')?.props?.onChange as () => void)();
    await flush();
    const continueButton = () => collect(render(), 'button').find((n) => n.props?.['data-novel-review-continue'] === '');
    expect(continueButton()?.props?.['disabled']).toBe(true);
    // 请求重写仍可用（硬问题只能请求重写）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-review-rewrite'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(adjudicated).toEqual(['rewrite-requested']);
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-review-record'] === 'iss-rule')).toBe(true);
  });

  it('Host 拒绝硬冲突 continue 时展示错误信息，可重试；scan 失败进入 error 态', async () => {
    let scans = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        review: {
          scan: async () => { scans += 1; if (scans === 1) throw new Error('探测器失败：模型输出非法'); return { ok: true, value: PROJECTION }; },
          records: async () => ({ ok: true, value: [] }),
          adjudicate: async () => { throw new Error('硬冲突阻止继续/接受'); },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openReview(render);
    await flush();
    // 首次 scan 失败 → error 态 + 重试按钮。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(reviewPanel(render())?.props?.['data-novel-review-state']).toBe('error');
    const errorBlockNode = collect(render(), 'div').find((n) => n.props?.['data-novel-review-error'] !== undefined);
    expect(String(((errorBlockNode?.children?.[0] as FakeNode | undefined)?.children?.[0] ?? ''))).toContain('模型输出非法');
    // 重试成功 → ready。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-review-retry'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(reviewPanel(render())?.props?.['data-novel-review-state']).toBe('ready');
  });
});

describe('I65 生成队列 UI (R13-6)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const queuePanel = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-queue-panel'] !== undefined);
  const openQueue = (render: () => FakeNode): void => {
    (navButton(render(), 'queue')?.props?.onClick as () => void)();
  };

  const QUEUE_STATUS = {
    projectId: 'fixture-project',
    runState: 'completed',
    config: { wordBudget: 200, maxRetries: 1, stopOnSoftWarnings: false },
    consumedUnits: 20,
    updatedAt: '2026-01-01T00:00:00.000Z',
    error: null,
    tasks: [
      { id: 'qt-scene-a', sceneId: 'scene-a', chapterId: 'chapter-1', cardTitle: '发现海图', cardPov: 'mira', status: 'candidate-ready', candidateId: 'cand-1', attempts: 1, error: null, budgetUnits: 10, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'qt-scene-b', sceneId: 'scene-b', chapterId: 'chapter-1', cardTitle: '灯塔守夜', cardPov: 'mira', status: 'failed', candidateId: null, attempts: 1, error: 'backend exploded', budgetUnits: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ],
  };
  const CARDS = [
    { actId: 'act-1', beatId: 'beat-1', beatTitle: '午夜旧灯塔', detailBeat: { id: 'detail-1', title: '发现海图', summary: 's', pov: 'mira', wordTarget: 20, points: [], status: 'writing' } },
    { actId: 'act-1', beatId: 'beat-1', beatTitle: '午夜旧灯塔', detailBeat: { id: 'detail-2', title: '灯塔守夜', summary: 's', pov: 'mira', wordTarget: 20, points: [], status: 'writing' } },
  ];

  it('刷新队列后展示运行态/预算/任务列表；失败任务可重试；开始/暂停/取消按钮按 runState 可用', async () => {
    const starts: unknown[] = [];
    let retried: string | undefined;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { outlineBeatCards: async () => CARDS },
      {
        queue: {
          status: async () => ({ ok: true, value: QUEUE_STATUS }),
          start: async (projectId, input) => { starts.push({ projectId, input }); return { ok: true, value: QUEUE_STATUS }; },
          pause: async () => ({ ok: true, value: QUEUE_STATUS }),
          resume: async () => ({ ok: true, value: QUEUE_STATUS }),
          cancel: async () => ({ ok: true, value: QUEUE_STATUS }),
          retry: async (projectId, taskId) => { retried = taskId; return { ok: true, value: QUEUE_STATUS }; },
          cancelTask: async () => ({ ok: true, value: QUEUE_STATUS }),
          recover: async () => ({ ok: true, value: QUEUE_STATUS }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openQueue(render);
    await flush();
    // 刷新 → ready：运行态 + 预算 + 任务列表（待裁决 + 失败）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-queue-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(queuePanel(render())?.props?.['data-novel-queue-state']).toBe('ready');
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-queue-summary'] !== undefined)?.children?.[0] ?? ''))).toContain('已完成');
    expect(collect(render(), 'li').filter((n) => n.props?.['data-novel-queue-task'] !== undefined)).toHaveLength(2);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-queue-task-badge'] === 'candidate-ready')).toBe(true);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-queue-task-badge'] === 'failed')).toBe(true);
    // 场景卡勾选范围（B5 beatCards 投影）。
    expect(collect(render(), 'input').filter((n) => n.props?.['data-novel-queue-card-check'] !== undefined)).toHaveLength(2);
    // 失败任务重试按钮。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-queue-retry'] === 'qt-scene-b')?.props?.onClick as () => void)();
    await flush();
    expect(retried).toBe('qt-scene-b');
    // runState=completed 时：开始可用、暂停/继续/取消禁用。
    const startButton = () => collect(render(), 'button').find((n) => n.props?.['data-novel-queue-start'] !== undefined);
    expect(startButton()?.props?.disabled).toBe(false);
    expect(collect(render(), 'button').find((n) => n.props?.['data-novel-queue-pause'] !== undefined)?.props?.disabled).toBe(true);
    // 点击开始：携带勾选范围（默认全选）与配置草稿。
    (startButton()?.props?.onClick as () => void)();
    await flush();
    expect(starts).toHaveLength(1);
    const input = (starts[0] as { input: { cardIds?: string[]; maxRetries?: number; stopOnSoftWarnings?: boolean } }).input;
    expect(input.cardIds).toEqual(['detail-1', 'detail-2']);
  });

  it('队列 Remote 拒绝时显示错误态并可重试（不 brick 面板）', async () => {
    let calls = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { outlineBeatCards: async () => CARDS },
      {
        queue: {
          status: async () => { calls += 1; if (calls === 1) throw new Error('队列账本损坏：queue-journal.yaml 解析失败'); return { ok: true, value: QUEUE_STATUS }; },
          start: async () => ({ ok: true, value: QUEUE_STATUS }),
          pause: async () => ({ ok: true, value: QUEUE_STATUS }),
          resume: async () => ({ ok: true, value: QUEUE_STATUS }),
          cancel: async () => ({ ok: true, value: QUEUE_STATUS }),
          retry: async () => ({ ok: true, value: QUEUE_STATUS }),
          cancelTask: async () => ({ ok: true, value: QUEUE_STATUS }),
          recover: async () => ({ ok: true, value: QUEUE_STATUS }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openQueue(render);
    await flush();
    // 首次 status 失败 → error 态 + 可读错误。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-queue-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(queuePanel(render())?.props?.['data-novel-queue-state']).toBe('error');
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-queue-error-text'] !== undefined)?.children?.[0] ?? ''))).toContain('队列账本损坏');
    // 重试成功 → ready。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-queue-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(queuePanel(render())?.props?.['data-novel-queue-state']).toBe('ready');
  });

  it('I88：Fiber 卸载后队列轮询链归零（负向断言，review §3.3）', async () => {
    let statusCalls = 0;
    const RUNNING_STATUS = { ...QUEUE_STATUS, runState: 'running' as const };
    const { registrations, overlayCleanups } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { outlineBeatCards: async () => CARDS },
      {
        queue: {
          status: async () => { statusCalls += 1; return { ok: true, value: RUNNING_STATUS }; },
          start: async () => ({ ok: true, value: RUNNING_STATUS }),
          pause: async () => ({ ok: true, value: RUNNING_STATUS }),
          resume: async () => ({ ok: true, value: RUNNING_STATUS }),
          cancel: async () => ({ ok: true, value: RUNNING_STATUS }),
          retry: async () => ({ ok: true, value: RUNNING_STATUS }),
          cancelTask: async () => ({ ok: true, value: RUNNING_STATUS }),
          recover: async () => ({ ok: true, value: RUNNING_STATUS }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openQueue(render);
    await flush();
    // 刷新（running）→ 立即拉取一次并进入轮询（refresh 自身拉取 + 轮询控制器
    // 立即 tick 一次 = 2 次 status 调用）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-queue-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(statusCalls).toBe(2);
    // 卸载（等价 Fiber dispose）：disposer 停表 + isActive 翻转，轮询链必须归零。
    for (const cleanup of overlayCleanups.splice(0)) cleanup();
    await new Promise((resolve) => { setTimeout(resolve, QUEUE_POLL_INTERVAL_MS + 250); });
    expect(statusCalls).toBe(2);
  });
});

describe('I66 知情与揭示管理面 UI (R14-1)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const knowledgePanel = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-knowledge-panel'] !== undefined);
  const factNodes = (tree: FakeNode): FakeNode[] =>
    collect(tree, 'li').filter((node) => node.props?.['data-novel-knowledge-fact'] !== undefined);
  const openKnowledge = (render: () => FakeNode): void => {
    (navButton(render(), 'knowledge')?.props?.onClick as () => void)();
  };
  const refresh = (render: () => FakeNode): void => {
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-refresh'] === '')?.props?.onClick as () => void)();
  };

  const PROJECTION = {
    projectId: 'fixture-project',
    entries: [
      { id: 'k-1', fact: '灯塔守夜人失踪真相', kind: 'secret', status: 'hidden', holders: [], revealPlan: { revealTo: ['lin'], revealAt: '第三幕' }, povHint: 'POV 边界：尚无角色知晓；计划揭示 林（第三幕）。' },
      { id: 'k-2', fact: '铜钥匙能开旧箱', kind: 'plotpoint', status: 'partially-revealed', holders: ['mira'], revealPlan: { revealTo: [], revealAt: '第二幕' }, povHint: 'POV 边界：当前 米拉 知晓；生成注入只按角色 POV 过滤。' },
    ],
    characters: [
      { characterId: 'mira', name: '米拉', knows: ['k-2'] },
      { characterId: 'lin', name: '林', knows: [] },
    ],
    summary: { total: 2, hidden: 1, partiallyRevealed: 1, revealed: 0, withPlan: 1 },
  };
  const baseStub = (overrides: Partial<{ list: (projectId: string) => Promise<unknown>; pending: () => Promise<unknown>; propose: (projectId: string, input: unknown) => Promise<unknown>; accept: (projectId: string, proposalId: string) => Promise<unknown>; reject: (projectId: string, proposalId: string) => Promise<unknown> }> = {}) => ({
    list: overrides.list ?? (async () => ({ ok: true, value: PROJECTION })),
    pending: overrides.pending ?? (async () => ({ ok: true, value: [] })),
    propose: overrides.propose ?? (async () => { throw new Error('未注入 propose'); }),
    accept: overrides.accept ?? (async () => { throw new Error('未注入 accept'); }),
    reject: overrides.reject ?? (async () => { throw new Error('未注入 reject'); }),
    read: async () => { throw new Error('未注入 read'); },
  });

  it('刷新后事实视图展示事实（kind/status/holders/规划揭示/POV 边界提示）并可切到角色视图', async () => {
    const lists: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      { knowledge: baseStub({ list: async (projectId) => { lists.push(projectId); return { ok: true, value: PROJECTION }; } }) },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openKnowledge(render);
    await flush();
    expect(knowledgePanel(render())?.props?.['data-novel-knowledge-state']).toBe('idle');
    refresh(render);
    await flush();
    expect(lists).toEqual(['fixture-project']);
    const panel = knowledgePanel(render());
    expect(panel?.props?.['data-novel-knowledge-state']).toBe('ready');
    // 汇总含隐藏/部分揭示/已揭示/规划揭示。
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-knowledge-summary'] !== undefined)?.children?.[0] ?? ''))).toContain('共 2 条事实（隐藏 1 / 部分揭示 1 / 已揭示 0；1 条规划揭示）');
    // 事实视图（默认）：kind/status 徽标、holders、规划揭示、POV 边界提示。
    const facts = factNodes(render());
    expect(facts.map((n) => n.props?.['data-novel-knowledge-fact'])).toEqual(['k-1', 'k-2']);
    expect(facts.map((n) => n.props?.['data-novel-knowledge-fact-status'])).toEqual(['hidden', 'partially-revealed']);
    expect(collect(render(), 'span').some((n) => n.props?.['data-novel-knowledge-fact-kind'] === 'secret')).toBe(true);
    expect(collect(render(), 'p').some((n) => String(n.children?.[0] ?? '').includes('计划揭示：林（第三幕）'))).toBe(true);
    expect(collect(render(), 'p').some((n) => n.props?.['data-novel-knowledge-pov-hint'] !== undefined && String(n.children?.[0] ?? '').includes('POV 边界'))).toBe(true);
    // 切到角色视图：角色卡 + 已知事实数 + 空角色提示。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-view-tab'] === 'characters')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'div').some((n) => n.props?.['data-novel-knowledge-view'] === 'characters')).toBe(true);
    const characters = collect(render(), 'li').filter((n) => n.props?.['data-novel-knowledge-character'] !== undefined);
    expect(characters.map((n) => n.props?.['data-novel-knowledge-character'])).toEqual(['mira', 'lin']);
    expect(characters.map((n) => String((collect(n, 'span').find((c) => c.props?.['data-novel-knowledge-character-count'] !== undefined)?.children?.[0] ?? '')))).toEqual(['已知 1 条', '已知 0 条']);
    expect(collect(render(), 'p').some((n) => n.props?.['data-novel-knowledge-character-empty'] !== undefined)).toBe(true);
  });

  it('揭示提案：选中事实 → 勾选 holder → 发起 reveal 提案（pending，未确认零写）', async () => {
    const proposed: Array<{ kind: string; entryId: string; holders: string[]; status?: string }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        knowledge: baseStub({
          propose: async (projectId, input) => {
            const value = input as { kind: string; entryId: string; holders: string[]; status?: string };
            proposed.push(value);
            return { ok: true, value: { projectId, proposalId: 'kprop-1', kind: value.kind, status: 'pending', preview: { ...PROJECTION.entries[0], holders: value.holders, status: 'revealed', revealPlan: { revealTo: [], revealAt: '第二幕' }, povHint: 'POV 边界：当前 米拉 知晓；…' } } };
          },
          pending: async () => ({ ok: true, value: [{ proposalId: 'kprop-1', kind: 'reveal', entryId: 'k-1', holders: ['mira'], status: 'revealed', revealAt: '第二幕' }] }),
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openKnowledge(render);
    await flush();
    refresh(render);
    await flush();
    // 打开 k-1 的操作表单：holder 勾选只列尚未知情的角色（米拉、林）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-fact-action'] === 'k-1')?.props?.onClick as () => void)();
    await flush();
    const holderChecks = () => collect(render(), 'input').filter((n) => n.props?.['data-novel-knowledge-holder-check'] !== undefined);
    expect(holderChecks().map((n) => n.props?.['data-novel-knowledge-holder-check'])).toEqual(['mira', 'lin']);
    (collect(render(), 'input').find((n) => n.props?.['data-novel-knowledge-holder-check'] === 'mira')?.props?.onChange as () => void)();
    await flush();
    (collect(render(), 'select').find((n) => n.props?.['data-novel-knowledge-status'] !== undefined)?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'revealed' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-propose'] === 'reveal')?.props?.onClick as () => void)();
    await flush();
    expect(proposed).toEqual([{ kind: 'reveal', entryId: 'k-1', holders: ['mira'], status: 'revealed' }]);
    // 提案进入待确认列表（Gate pending；确认前 C3 零写由 Host 保证）。
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-knowledge-pending-item'] === 'kprop-1')).toBe(true);
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-knowledge-message'] !== undefined)?.children?.[0] ?? ''))).toContain('提案已提交待确认（kprop-1）');
  });

  it('确认应用：accept 提交 proposalId，投影刷新、pending 移除、已生效幂等提示', async () => {
    const accepted: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        knowledge: baseStub({
          pending: async () => ({ ok: true, value: [{ proposalId: 'kprop-1', kind: 'reveal', entryId: 'k-1', holders: ['mira'], status: 'revealed' }] }),
          accept: async (projectId, proposalId) => {
            accepted.push(proposalId);
            const applied = { ...PROJECTION, entries: [{
              ...PROJECTION.entries[0],
              holders: ['mira'],
              status: 'revealed',
              revealPlan: { revealTo: [], revealAt: '第二幕' },
              povHint: 'POV 边界：当前 米拉 知晓；…',
            }, PROJECTION.entries[1]] };
            return { ok: true, value: { projectId, proposalId, applied: true, projection: applied } };
          },
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openKnowledge(render);
    await flush();
    refresh(render);
    await flush();
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-knowledge-pending-item'] === 'kprop-1')).toBe(true);
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-accept'] === 'kprop-1')?.props?.onClick as () => void)();
    await flush();
    expect(accepted).toEqual(['kprop-1']);
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-knowledge-pending-item'] === 'kprop-1')).toBe(false);
    // 投影刷新：k-1 状态徽标变为 revealed。
    expect(factNodes(render()).find((n) => n.props?.['data-novel-knowledge-fact'] === 'k-1')?.props?.['data-novel-knowledge-fact-status']).toBe('revealed');
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-knowledge-message'] !== undefined)?.children?.[0] ?? ''))).toContain('已确认并应用');
  });

  it('拒绝提案：reject 提交 proposalId，pending 移除并提示 C3 零写', async () => {
    const rejected: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        knowledge: baseStub({
          pending: async () => ({ ok: true, value: [{ proposalId: 'kprop-2', kind: 'holder-add', entryId: 'k-2', holders: ['lin'] }] }),
          reject: async (projectId, proposalId) => { rejected.push(proposalId); return { ok: true, value: { projectId, proposalId, status: 'rejected' } }; },
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openKnowledge(render);
    await flush();
    refresh(render);
    await flush();
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-knowledge-pending-item'] === 'kprop-2')).toBe(true);
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-reject'] === 'kprop-2')?.props?.onClick as () => void)();
    await flush();
    expect(rejected).toEqual(['kprop-2']);
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-knowledge-pending-item'] === 'kprop-2')).toBe(false);
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-knowledge-message'] !== undefined)?.children?.[0] ?? ''))).toContain('已拒绝提案 kprop-2（C3 零写）');
  });

  it('Host 拒绝逆向 status 提案时展示错误信息且面板不 brick；已知情角色不出现在 holder 勾选', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        knowledge: baseStub({
          propose: async () => { throw new Error('Knowledge status cannot regress: k-1'); },
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openKnowledge(render);
    await flush();
    refresh(render);
    await flush();
    // 已知情 holder（k-2 已被米拉知晓）不出现在勾选列表。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-fact-action'] === 'k-2')?.props?.onClick as () => void)();
    await flush();
    const holderChecks = () => collect(render(), 'input').filter((n) => n.props?.['data-novel-knowledge-holder-check'] !== undefined);
    expect(holderChecks().map((n) => n.props?.['data-novel-knowledge-holder-check'])).toEqual(['lin']);
    // 发起提案被 Host 拒绝 → 错误信息展示（逆向 status 失败，R14-1）。
    (collect(render(), 'input').find((n) => n.props?.['data-novel-knowledge-holder-check'] === 'lin')?.props?.onChange as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-knowledge-propose'] === 'holder-add')?.props?.onClick as () => void)();
    await flush();
    expect(knowledgePanel(render())?.props?.['data-novel-knowledge-state']).toBe('ready');
    expect(String((collect(render(), 'p').find((n) => n.props?.['data-novel-knowledge-message'] !== undefined)?.children?.[0] ?? ''))).toContain('cannot regress');
  });
});

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
    expect(messageOf(render())).toContain('Immutable rule cannot be updated');
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
});

describe('I68 C6 进度与灵感落地 UI (R14-3)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const progressPanel = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-progress-panel'] !== undefined);
  const openProgress = (render: () => FakeNode): void => {
    (navButton(render(), 'progress')?.props?.onClick as () => void)();
  };
  const refresh = (render: () => FakeNode): void => {
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-refresh'] === '')?.props?.onClick as () => void)();
  };
  const messageOf = (render: () => FakeNode): string =>
    String((collect(render(), 'p').find((n) => n.props?.['data-novel-progress-message'] !== undefined)?.children?.[0] ?? ''));

  const DIRECTION_DAWN = {
    id: 'dawn', title: '黎明交易', premise: '以黎明交易换取封印。',
    changes: { logline: '米拉以黎明交易换取封印。', outlineNote: '米拉在黎明与守夜人交易。', progressNote: '新方向带来更紧的倒计时。' },
    rationale: '提高冲突强度。',
  };
  const DIRECTION_STORM = {
    id: 'storm', title: '风暴交易', premise: '在风暴中达成交易。',
    changes: { outlineNote: '米拉在风暴中交易。', progressNote: '天气迫使改道。' },
    rationale: '增加紧迫感。',
  };
  const PROJECTION = {
    outlineId: 'outline',
    acts: [{ id: 'act-one', index: 1, title: '第一幕', beats: [
      { id: 'first', title: '进入旧港', optional: false, completed: false, current: true, prerequisitesMet: true, doneScenes: 1, totalScenes: 2, sceneCards: [
        { id: 'scene-1', title: '雨夜入港', summary: '抵达旧港。', pov: 'mira', wordTarget: 800, status: 'done' },
        { id: 'scene-2', title: '守夜人', summary: '遇见守夜人。', pov: 'mira', wordTarget: 700, status: 'writing' },
      ] },
    ] }],
    currentAct: 'act-one',
    currentBeat: 'first',
    completedBeats: [],
    deviations: [{ id: 'drift-1', planned: '入港', actual: '绕行山道', reason: '封路', reconciled: false }],
    tensionLevel: 20,
    navigation: { actId: 'act-one', beatId: 'first', title: '进入旧港', description: '米拉找到入口。', prerequisites: [], prerequisitesMet: true, instruction: '完成进入旧港。', deviationIds: ['drift-1'] },
    consistency: { currentBeatCompleted: false, completedBeatsWithOpenScenes: [], navigationTargetAllScenesDone: false },
  };
  const AUDIT_RECORD = { proposalId: 'insp-dawn-1700000000000', status: 'accepted', direction: DIRECTION_DAWN };
  const baseStub = (overrides: Partial<{ projection: (projectId: string) => Promise<unknown>; pending: (projectId: string) => Promise<unknown>; audit: (projectId: string) => Promise<unknown>; inspire: (projectId: string, prompt?: string) => Promise<unknown>; select: (projectId: string, input: unknown) => Promise<unknown>; apply: (projectId: string, proposalId: string) => Promise<unknown>; reject: (projectId: string, proposalId: string) => Promise<unknown>; recordDeviation: (projectId: string, input: unknown) => Promise<unknown>; reconcileDeviation: (projectId: string, deviationId: string) => Promise<unknown> }> = {}) => ({
    projection: overrides.projection ?? (async () => ({ ok: true, value: PROJECTION })),
    pending: overrides.pending ?? (async () => ({ ok: true, value: { proposals: [] } })),
    audit: overrides.audit ?? (async () => ({ ok: true, value: { records: [] } })),
    inspire: overrides.inspire ?? (async () => ({ ok: true, value: { projectId: 'fixture-project', directions: [DIRECTION_DAWN, DIRECTION_STORM] } })),
    select: overrides.select ?? (async () => { throw new Error('未注入 select'); }),
    apply: overrides.apply ?? (async () => { throw new Error('未注入 apply'); }),
    reject: overrides.reject ?? (async () => { throw new Error('未注入 reject'); }),
    recordDeviation: overrides.recordDeviation ?? (async () => { throw new Error('未注入 recordDeviation'); }),
    reconcileDeviation: overrides.reconcileDeviation ?? (async () => { throw new Error('未注入 reconcileDeviation'); }),
  });

  it('装载投影：导航目标、完成状态、偏差与一致性（只读展示）', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      { progress: baseStub() },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openProgress(render);
    await flush();
    expect(progressPanel(render())?.props?.['data-novel-progress-state']).toBe('idle');
    refresh(render);
    await flush();
    const tree = render();
    expect(progressPanel(tree)?.props?.['data-novel-progress-state']).toBe('ready');
    expect(String((collect(tree, 'p').find((n) => n.props?.['data-novel-progress-nav-target'] !== undefined)?.children?.[0] ?? ''))).toContain('进入旧港');
    expect(String((collect(tree, 'p').find((n) => n.props?.['data-novel-progress-nav-meta'] !== undefined)?.children?.[0] ?? ''))).toContain('已完成节 0');
    const scenes = collect(tree, 'li').filter((n) => n.props?.['data-novel-progress-scene'] !== undefined);
    expect(scenes.map((n) => n.props?.['data-novel-progress-scene'])).toEqual(['scene-1', 'scene-2']);
    const sceneStatuses = collect(tree, 'span').filter((n) => n.props?.['data-novel-progress-scene-status'] !== undefined);
    expect(sceneStatuses.map((n) => n.props?.['data-novel-progress-scene-status'])).toEqual(['done', 'writing']);
    const deviations = collect(tree, 'li').filter((n) => n.props?.['data-novel-progress-deviation'] !== undefined);
    expect(deviations.map((n) => n.props?.['data-novel-progress-deviation'])).toEqual(['drift-1']);
    expect(collect(tree, 'div').some((n) => n.props?.['data-novel-progress-consistency'] !== undefined)).toBe(false);
  });

  it('灵感时刻 → 选定方向 → Gate 提案（pending；未确认不写）', async () => {
    let selected: unknown;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        progress: baseStub({
          select: async (projectId, input) => {
            selected = input;
            return { ok: true, value: { projectId, proposalId: 'insp-dawn-1700000000000', direction: (input as { direction: unknown }).direction, status: 'pending' } };
          },
          pending: async () => ({ ok: true, value: { proposals: [{ proposalId: 'insp-dawn-1700000000000', direction: DIRECTION_DAWN, status: 'pending' }] } }),
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openProgress(render);
    await flush();
    refresh(render);
    await flush();
    // 灵感时刻 → 两个方向出现（零写展示）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-inspire'] === '')?.props?.onClick as () => void)();
    await flush();
    const directions = collect(render(), 'li').filter((n) => n.props?.['data-novel-progress-direction'] !== undefined);
    expect(directions.map((n) => n.props?.['data-novel-progress-direction'])).toEqual(['dawn', 'storm']);
    // 未选定前没有「确认应用」按钮（不发起任何 Gate 提案）。
    expect(collect(render(), 'button').some((n) => n.props?.['data-novel-progress-propose'] === '')).toBe(false);
    expect(selected).toBeUndefined();
    // 选定方向 → 确认应用 → Gate 提案（pending 列表出现）。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-direction-select'] === 'dawn')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-propose'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(selected).toMatchObject({ direction: { id: 'dawn' } });
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-progress-pending-item'] === 'insp-dawn-1700000000000')).toBe(true);
    expect(messageOf(render)).toContain('已提交待确认');
  });

  it('确认应用 → 投影与审计更新；拒绝 → 零写并记录 rejected 审计', async () => {
    const projectionWithDeviation = {
      ...PROJECTION,
      deviations: [{ id: 'insp-dawn-1700000000000-deviation', planned: PROJECTION.navigation.description, actual: DIRECTION_DAWN.changes.outlineNote, reason: DIRECTION_DAWN.changes.progressNote, reconciled: false }],
      navigation: { ...PROJECTION.navigation, deviationIds: ['insp-dawn-1700000000000-deviation'] },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        progress: baseStub({
          apply: async (projectId, proposalId) => ({ ok: true, value: { projectId, proposalId, applied: true, projection: projectionWithDeviation, audit: [AUDIT_RECORD] } }),
          reject: async (projectId, proposalId) => ({ ok: true, value: { projectId, proposalId, status: 'rejected' } }),
          pending: async () => ({ ok: true, value: { proposals: [{ proposalId: 'insp-dawn-1700000000000', direction: DIRECTION_DAWN, status: 'pending' }] } }),
          audit: async () => ({ ok: true, value: { records: [AUDIT_RECORD] } }),
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openProgress(render);
    await flush();
    refresh(render);
    await flush();
    // 确认应用 → 偏差出现、待确认消失、审计记录可见。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-pending-accept'] === 'insp-dawn-1700000000000')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-progress-pending-item'] === 'insp-dawn-1700000000000')).toBe(false);
    expect(collect(render(), 'li').filter((n) => n.props?.['data-novel-progress-deviation'] !== undefined)).toHaveLength(1);
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-progress-audit-record'] === 'insp-dawn-1700000000000')).toBe(true);
    expect(messageOf(render)).toContain('已确认并应用');
  });

  it('记录偏差与调和：只写 C6（投影更新），消息反馈', async () => {
    let recorded: unknown;
    const projectionWithDeviation = { ...PROJECTION, deviations: [...PROJECTION.deviations, { id: 'dev-1', planned: 'A', actual: 'B', reason: 'C', reconciled: false }] };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        progress: baseStub({
          recordDeviation: async (projectId, input) => {
            recorded = input;
            return { ok: true, value: projectionWithDeviation };
          },
          reconcileDeviation: async () => ({ ok: true, value: projectionWithDeviation }),
        }),
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openProgress(render);
    await flush();
    refresh(render);
    await flush();
    const inputOf = (anchor: string): FakeNode | undefined => collect(render(), 'input').find((n) => n.props?.[anchor] !== undefined);
    (inputOf('data-novel-progress-deviation-planned')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'A' } });
    (inputOf('data-novel-progress-deviation-actual')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'B' } });
    (inputOf('data-novel-progress-deviation-reason')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'C' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-deviation-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(recorded).toMatchObject({ planned: 'A', actual: 'B', reason: 'C' });
    expect(messageOf(render)).toContain('偏差已记录');
    expect(collect(render(), 'li').filter((n) => n.props?.['data-novel-progress-deviation'] !== undefined)).toHaveLength(2);
    // 调和第一条偏差。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-progress-deviation-reconcile'] === 'drift-1')?.props?.onClick as () => void)();
    await flush();
    expect(messageOf(render)).toContain('已标记为调和');
  });
});

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
});

describe('I71 全局搜索与上下文追踪 UI (R14-6)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const searchPanelOf = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-search-panel'] !== undefined);
  const searchMessage = (render: () => FakeNode): string =>
    String((collect(render(), 'p').find((n) => n.props?.['data-novel-search-message'] !== undefined)?.children?.[0] ?? ''));

  const STATS = {
    indexExists: true, builtAt: '2026-01-01T00:00:00.000Z',
    counts: { text: 2, characters: 1, worldview: 1, outline: 1, canon: 1, knowledge: 2 },
    totalEntries: 8,
  };
  const TEXT_HIT = {
    layer: 'text', id: 'scene-1', title: '旧灯塔 · 场景 1', preview: '米拉推开旧灯塔的门。',
    nav: { kind: 'text', chapterId: 'chapter-1', sceneId: 'scene-1' }, score: 3, matched: 'title',
  };

  it('关键词搜索：输入 → Remote 提交（含可选 POV）→ 有界命中列表渲染', async () => {
    const calls: Array<{ query: string; pov?: string }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        search: {
          search: async (_projectId, query, pov) => {
            calls.push({ query, pov });
            return { ok: true, value: { query, ...(pov !== undefined && pov !== '' ? { pov } : {}), total: 1, hits: [TEXT_HIT] } };
          },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'search')?.props?.onClick as () => void)();
    await flush();
    expect(searchPanelOf(render())?.props?.['data-novel-search-state']).toBe('idle');
    const queryInput = () => collect(render(), 'input').find((n) => n.props?.['data-novel-search-input'] !== undefined);
    (queryInput()?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: '海图' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(calls).toEqual([{ query: '海图', pov: undefined }]);
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-search-result-count'] !== undefined)?.children?.[0] ?? '')).toContain('命中 1 条');
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-search-hit'] === 'text:scene-1')).toBe(true);
    // POV 过滤透传（Host 在查询时用 live C3 knows 过滤，Client 零领域过滤）。
    (collect(render(), 'input').find((n) => n.props?.['data-novel-search-pov'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'mira' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(calls[1]).toEqual({ query: '海图', pov: 'mira' });
  });

  it('索引生命周期：重建 → 统计可见；删除 → 未构建提示（派生视图可删除重建，非第二真相）', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        search: {
          build: async () => ({ ok: true, value: STATS }),
          drop: async () => ({ ok: true, value: { indexExists: false, counts: { text: 0, characters: 0, worldview: 0, outline: 0, canon: 0, knowledge: 0 }, totalEntries: 0 } }),
          stats: async () => ({ ok: true, value: STATS }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'search')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-rebuild'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-search-stats'] !== undefined)?.children?.[0] ?? '')).toContain('共 8 条');
    expect(searchMessage(render)).toContain('重建派生索引');
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-drop'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(searchMessage(render)).toContain('已删除派生索引');
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-search-stats'] !== undefined)?.children?.[0] ?? '')).toContain('未构建');
  });

  it('结果跳转：正文命中 → 正文视图并打开对应场景（脏文本保护复用）', async () => {
    let chapterReads = 0;
    let sceneReads = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        chapterList: async () => [{ id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', sceneCount: 1 }],
        chapterRead: async () => { chapterReads += 1; return { ok: true, value: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', scenes: [{ id: 'scene-1', index: 0, summary: '进入灯塔' }] } }; },
        sceneRead: async () => { sceneReads += 1; return { ok: true, value: { chapter: { id: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira' }, scene: { id: 'scene-1', index: 0, summary: '进入灯塔', content: '米拉推开旧灯塔的门。', beats: [], canonEvents: [], notes: '' } } }; },
      },
      {
        search: { search: async () => ({ ok: true, value: { query: '米拉', total: 1, hits: [TEXT_HIT] } }) },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'search')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'input').find((n) => n.props?.['data-novel-search-input'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: '米拉' } });
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-submit'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-search-jump'] === 'text')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-route']).toBe('chapters');
    expect(chapterReads).toBeGreaterThanOrEqual(1);
    expect(sceneReads).toBeGreaterThanOrEqual(1);
    expect(collect(render(), 'p').some((n) => String(n.children?.[0] ?? '').includes('米拉推开旧灯塔的门。'))).toBe(true);
  });

  it('候选审阅展示生成注入解释（trace 层/触发/预算摘要，不泄露 secret 内容）', async () => {
    const traceReview = {
      ok: true,
      value: {
        candidateId: 'cand-1', intent: 'continue',
        target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-next' },
        text: '米拉在码头找到铜钥匙。', diff: { kind: 'new-scene' },
        validation: { status: 'pass', violations: [] },
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
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        writing: {
          propose: async () => ({ ok: true, value: { candidate: { id: 'cand-1', intent: 'continue', target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-next' }, prompt: 'p', text: '米拉在码头找到铜钥匙。', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' } } }),
          preview: async () => traceReview,
          adjudicate: async () => { throw new Error('unused'); },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'chapters')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-candidate-propose-continue'] === '')?.props?.onClick as () => void)();
    await flush();
    const trace = collect(render(), 'details').find((n) => n.props?.['data-novel-candidate-trace'] !== undefined);
    expect(trace).toBeDefined();
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-candidate-trace-intent'] !== undefined)?.children?.[0] ?? '')).toContain('POV mira');
    const sections = collect(render(), 'li').filter((n) => n.props?.['data-novel-candidate-trace-section'] !== undefined);
    expect(sections.map((n) => n.props?.['data-novel-candidate-trace-section'])).toEqual(['rules', 'worldview']);
    expect(String(collect(render(), 'li').find((n) => n.props?.['data-novel-candidate-trace-trigger'] === 'north-harbor')?.children?.[0] ?? '')).toContain('北港');
    // 负测：trace 渲染不含知识事实/重写指令等 secret 内容。
    expect(JSON.stringify(collect(render(), 'details').map((n) => n.props))).not.toContain('北港海底沉睡着');
  });
});

describe('I72 写作进度面板 UI (R14-7)', () => {
  const navButton = (tree: FakeNode, view: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-view'] === view);
  const statisticsPanelOf = (tree: FakeNode): FakeNode | undefined =>
    collect(tree, 'section').find((node) => node.props?.['data-novel-statistics-panel'] !== undefined);
  const statisticsMessage = (render: () => FakeNode): string =>
    String((collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-message'] !== undefined)?.children?.[0] ?? ''));

  const STATS = {
    indexExists: true, builtAt: '2026-01-01T00:00:00.000Z',
    counts: { chapters: 1, scenes: 2, cards: 3, tasks: 2 },
  };
  const OVERVIEW = {
    empty: false, chapterCount: 1, sceneCount: 2, totalUnits: 22, totalChars: 49,
    cardCount: 3, totalWordTarget: 1200, cardWrittenUnits: 18, completionRatio: 18 / 1200,
    beatCount: 2, completedBeatCount: 1, beatCompletionRatio: 0.5, currentBeat: 'beat-1',
    cardStatusCounts: { planned: 1, writing: 1, done: 1 },
    povStats: [{ pov: 'mira', chapters: 1, scenes: 2, units: 22, chars: 49 }],
    cardPovStats: [{ pov: 'mira', cards: 2, wordTarget: 800 }, { pov: 'kai', cards: 1, wordTarget: 400 }],
    queue: { runState: 'paused', consumedUnits: 200, taskCounts: { queued: 0, running: 0, 'candidate-ready': 1, failed: 0, cancelled: 0, completed: 1 }, totalTasks: 2 },
    chapters: [{ chapterId: 'chapter-1', index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', sceneCount: 2, units: 22, chars: 49 }],
    acts: [{ id: 'act-1', index: 0, title: '开端', beats: [{ id: 'beat-1', title: '午夜灯塔' }, { id: 'beat-2', title: '码头' }] }],
  };
  const CARD = {
    actId: 'act-1', actIndex: 0, actTitle: '开端', beatId: 'beat-1', beatTitle: '午夜灯塔',
    cardId: 'detail-1', title: '发现海图', pov: 'mira', wordTarget: 500, status: 'done',
    sceneId: 'scene-abc', writtenUnits: 18, completionRatio: 18 / 500,
  };
  const TASK = {
    id: 'qt-detail-1', sceneId: 'scene-abc', chapterId: 'chapter-1', cardTitle: '发现海图', cardPov: 'mira',
    status: 'completed', attempts: 1, budgetUnits: 60, error: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  };

  it('概览：重建 → 统计计数/章节字数/目标完成度/场景卡状态/POV 分布/队列摘要渲染', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          rebuild: async () => ({ ok: true, value: STATS }),
          overview: async () => ({ ok: true, value: OVERVIEW }),
          sceneCards: async () => ({ ok: true, value: { total: 3, cards: [] } }),
          tasks: async () => ({ ok: true, value: { total: 2, tasks: [] } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    expect(statisticsPanelOf(render())?.props?.['data-novel-statistics-state']).toBe('idle');
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-rebuild'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-stats'] !== undefined)?.children?.[0] ?? '')).toContain('章节 1 · 场景 2 · 场景卡 3 · 任务 2');
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-totals'] !== undefined)?.children?.[0] ?? '')).toContain('共 22 字');
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-completion-text'] !== undefined)?.children?.[0] ?? '')).toContain('18 / 1200 字');
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-beat-completion-text'] !== undefined)?.children?.[0] ?? '')).toContain('1 / 2 节');
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-cards'] !== undefined)?.children?.[0] ?? '')).toContain('计划 1 · 写作中 1 · 已完成 1');
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-queue'] !== undefined)?.children?.[0] ?? '')).toContain('paused');
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-queue'] !== undefined)?.children?.[0] ?? '')).toContain('任务 2 个');
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-statistics-pov-row'] === 'mira')).toBe(true);
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-statistics-chapter'] === 'chapter-1')).toBe(true);
    expect(statisticsMessage(render)).toContain('重建派生统计');
  });

  it('空作品视图：empty 标记时明确提示统计为零，不显示假进度', async () => {
    const EMPTY = {
      empty: true, chapterCount: 0, sceneCount: 0, totalUnits: 0, totalChars: 0,
      cardCount: 0, totalWordTarget: 0, cardWrittenUnits: 0, completionRatio: 0,
      beatCount: 0, completedBeatCount: 0, beatCompletionRatio: 0, currentBeat: null,
      cardStatusCounts: { planned: 0, writing: 0, done: 0 },
      povStats: [], cardPovStats: [],
      queue: { runState: 'idle', consumedUnits: 0, taskCounts: { queued: 0, running: 0, 'candidate-ready': 0, failed: 0, cancelled: 0, completed: 0 }, totalTasks: 0 },
      chapters: [], acts: [],
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          rebuild: async () => ({ ok: true, value: { ...STATS, counts: { chapters: 0, scenes: 0, cards: 0, tasks: 0 } } }),
          overview: async () => ({ ok: true, value: EMPTY }),
          sceneCards: async () => ({ ok: true, value: { total: 0, cards: [] } }),
          tasks: async () => ({ ok: true, value: { total: 0, tasks: [] } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-rebuild'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-empty'] !== undefined)?.children?.[0] ?? '')).toContain('空作品视图');
    expect(String(collect(render(), 'div').find((n) => n.props?.['data-novel-statistics-empty'] !== undefined)?.children?.[0] ?? '')).toContain('统计为零');
    expect(statisticsPanelOf(render())?.props?.['data-novel-statistics-state']).toBe('ready');
  });

  it('场景卡筛选：幕/节/状态变化 → Remote 提交筛选并渲染有界结果', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          rebuild: async () => ({ ok: true, value: STATS }),
          overview: async () => ({ ok: true, value: OVERVIEW }),
          // I86：fake 按真实 wire 位置参数（descriptor 顺序）接收，重新聚合为
          // 筛选对象供既有断言使用（binder 语义由 src/remote-binder.test.ts 覆盖）。
          sceneCards: async (_projectId, actId, beatId, status, limit) => {
            calls.push({
              ...(actId !== undefined ? { actId } : {}),
              ...(beatId !== undefined ? { beatId } : {}),
              ...(status !== undefined ? { status } : {}),
              ...(limit !== undefined ? { limit } : {}),
            });
            return { ok: true, value: { total: 1, cards: [CARD] } };
          },
          tasks: async () => ({ ok: true, value: { total: 2, tasks: [] } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-rebuild'] === '')?.props?.onClick as () => void)();
    await flush();
    // 选幕 → 重置节并加载（只带 actId）。
    (collect(render(), 'select').find((n) => n.props?.['data-novel-statistics-card-act'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'act-1' } });
    await flush();
    expect(calls[calls.length - 1]).toEqual({ actId: 'act-1' });
    // 选节 → 叠加 beatId。
    (collect(render(), 'select').find((n) => n.props?.['data-novel-statistics-card-beat'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'beat-1' } });
    await flush();
    expect(calls[calls.length - 1]).toEqual({ actId: 'act-1', beatId: 'beat-1' });
    // 选状态 → 叠加 status。
    (collect(render(), 'select').find((n) => n.props?.['data-novel-statistics-card-status'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'done' } });
    await flush();
    expect(calls[calls.length - 1]).toEqual({ actId: 'act-1', beatId: 'beat-1', status: 'done' });
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-card-total'] !== undefined)?.children?.[0] ?? '')).toContain('场景卡 1 张');
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-statistics-card'] === 'detail-1')).toBe(true);
  });

  it('任务历史：状态筛选 → Remote 提交并渲染；章节详情 → 场景字数明细', async () => {
    let taskCalls = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          rebuild: async () => ({ ok: true, value: STATS }),
          overview: async () => ({ ok: true, value: OVERVIEW }),
          sceneCards: async () => ({ ok: true, value: { total: 3, cards: [] } }),
          tasks: async (_projectId, _status, _limit) => {
            taskCalls += 1;
            return { ok: true, value: { total: 1, tasks: [TASK] } };
          },
          chapterDetail: async (_projectId, chapterId) => ({
            ok: true,
            value: { chapter: { chapterId, index: 1, title: '旧灯塔', pov: 'mira', status: 'draft', sceneCount: 2, units: 22, chars: 49, scenes: [{ sceneId: 'scene-1', index: 0, summary: '进入灯塔', units: 18, chars: 20 }] } },
          }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-rebuild'] === '')?.props?.onClick as () => void)();
    await flush();
    // 任务历史：选状态 → 提交 status 筛选。
    const before = taskCalls;
    (collect(render(), 'select').find((n) => n.props?.['data-novel-statistics-task-status'] !== undefined)?.props?.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'completed' } });
    await flush();
    expect(taskCalls).toBe(before + 1);
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-task-total'] !== undefined)?.children?.[0] ?? '')).toContain('任务 1 个');
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-statistics-task'] === 'qt-detail-1')).toBe(true);
    // 章节详情：点章节 → Remote 提交 chapterId → 场景字数明细渲染。
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-chapter-select'] === 'chapter-1')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'li').some((n) => n.props?.['data-novel-statistics-scene'] === 'scene-1')).toBe(true);
    expect(String(collect(render(), 'li').find((n) => n.props?.['data-novel-statistics-scene'] === 'scene-1')?.children?.[0] ?? '')).toContain('18 字');
  });

  it('派生统计生命周期：删除 → 未构建提示；刷新状态可见（可删除重建，非第二真相）', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        statistics: {
          stats: async () => ({ ok: true, value: STATS }),
          drop: async () => ({ ok: true, value: { indexExists: false, counts: { chapters: 0, scenes: 0, cards: 0, tasks: 0 } } }),
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (navButton(render(), 'statistics')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-stats'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-stats'] !== undefined)?.children?.[0] ?? '')).toContain('章节 1 · 场景 2');
    (collect(render(), 'button').find((n) => n.props?.['data-novel-statistics-drop'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(statisticsMessage(render)).toContain('已删除派生统计');
    expect(String(collect(render(), 'p').find((n) => n.props?.['data-novel-statistics-stats'] !== undefined)?.children?.[0] ?? '')).toContain('未构建');
  });
});

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
});
