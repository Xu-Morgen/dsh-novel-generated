/**
 * I95 按面板拆分（计划 §18 I95）：I64 一致性审校中心 UI (R13-5)
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

  it('I128 审校问题入口生成候选：复用 Host repair namespace，候选可见但不提供自动接受', async () => {
    const repaired: Array<{ projectId: string; issueId: string }> = [];
    const repairProjection = {
      ...PROJECTION,
      issues: [{ ...PROJECTION.issues[0]!, location: { ...PROJECTION.issues[0]!.location!, anchor: { start: 0, end: 2, quote: '米拉', sourceHash: 'a'.repeat(64) } } }],
      summary: { ...PROJECTION.summary, total: 1, hard: 1, soft: 0, byCategory: { ...PROJECTION.summary.byCategory, canon: 0, knowledge: 0, relationship: 0, style: 0 } },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        review: { scan: async () => ({ ok: true, value: repairProjection }), records: async () => ({ ok: true, value: [] }) },
        reviewRepair: {
          propose: async (projectId, input) => {
            repaired.push({ projectId, issueId: input.issueId });
            return { ok: true, value: {
              projectId, issueId: input.issueId, issueFingerprint: input.issueId,
              target: { chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) },
              anchor: { start: 0, end: 2, quote: '米拉', sourceHash: 'a'.repeat(64) },
              lineage: { kind: 'review-repair', issueId: input.issueId, issueFingerprint: input.issueId, sourceHash: 'a'.repeat(64) },
              candidate: { id: 'repair-candidate', intent: 'rewrite', target: { projectId, chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) }, prompt: '修复', text: '米拉抬起头。', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' },
            } };
          },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openReview(render);
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-repair'] === 'iss-rule')?.props?.onClick as () => void)();
    await flush();
    expect(repaired).toEqual([{ projectId: 'fixture-project', issueId: 'iss-rule' }]);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-review-repair-candidate'] === 'repair-candidate')).toBe(true);
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-writing-candidate-accept'] !== undefined)).toBe(false);
  });

  it('I129 接受修复候选后自动复扫：同一 fingerprint 消失才显示当前会话 resolved', async () => {
    let scans = 0;
    const adjudications: string[] = [];
    const repairProjection = {
      ...PROJECTION,
      issues: [PROJECTION.issues[0]!],
      summary: { ...PROJECTION.summary, total: 1, hard: 1, soft: 0, byCategory: { ...PROJECTION.summary.byCategory, canon: 0, knowledge: 0, relationship: 0, style: 0 } },
    };
    const resolvedProjection = { ...repairProjection, issues: [], summary: { total: 0, hard: 0, soft: 0, byCategory: { rule: 0, canon: 0, knowledge: 0, relationship: 0, style: 0 } } };
    const proposal = {
      projectId: 'fixture-project', issueId: 'iss-rule', issueFingerprint: 'iss-rule',
      target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) },
      anchor: { start: 0, end: 2, quote: '米拉', sourceHash: 'a'.repeat(64) },
      lineage: { kind: 'review-repair', issueId: 'iss-rule', issueFingerprint: 'iss-rule', sourceHash: 'a'.repeat(64) },
      candidate: { id: 'repair-candidate-accept', intent: 'rewrite', target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) }, prompt: '修复', text: '米拉抬起头。', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        review: {
          scan: async () => { scans += 1; return { ok: true, value: scans === 1 ? repairProjection : resolvedProjection }; },
          records: async () => ({ ok: true, value: [] }),
        },
        reviewRepair: { propose: async () => ({ ok: true, value: proposal }) },
        writing: {
          adjudicate: async (_candidateId, decision) => { adjudications.push(decision); return { ok: true, value: { status: 'written', candidateId: 'repair-candidate-accept', scene: { chapterId: 'chapter-1', sceneId: 'scene-1', index: 0, content: '米拉抬起头。' }, layers: [] } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openReview(render);
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-repair'] === 'iss-rule')?.props?.onClick as () => void)();
    await flush();
    const accept = () => collect(render(), 'button').find((node) => node.props?.['data-novel-review-repair-accept'] === '');
    accept()?.props?.onClick && (accept()!.props!.onClick as () => void)();
    // 同一候选的重复点击在 Remote 返回前只允许一次。
    accept()?.props?.onClick && (accept()!.props!.onClick as () => void)();
    await flush();
    expect(adjudications).toEqual(['accept']);
    expect(scans).toBe(2);
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-review-repair-resolved'] === 'iss-rule')).toBe(true);
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-review-repair-accept'] !== undefined)).toBe(false);
    // 完整重扫开启新审校会话，旧 resolved 证据不跨越本次 scan。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(scans).toBe(3);
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-review-repair-resolved'] !== undefined)).toBe(false);
  });

  it('I129 同一问题仍在或复扫失败时不伪造 resolved，并可重试；拒绝候选零写', async () => {
    let scans = 0;
    const adjudications: string[] = [];
    const repairProjection = { ...PROJECTION, issues: [PROJECTION.issues[0]!], summary: { ...PROJECTION.summary, total: 1, hard: 1, soft: 0, byCategory: { ...PROJECTION.summary.byCategory, canon: 0, knowledge: 0, relationship: 0, style: 0 } } };
    const proposal = {
      projectId: 'fixture-project', issueId: 'iss-rule', issueFingerprint: 'iss-rule',
      target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) },
      lineage: { kind: 'review-repair', issueId: 'iss-rule', issueFingerprint: 'iss-rule', sourceHash: 'a'.repeat(64) },
      candidate: { id: 'repair-candidate-uncertain', intent: 'rewrite', target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) }, prompt: '修复', text: '米拉抬起头。', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        review: {
          scan: async () => { scans += 1; if (scans === 2) throw new Error('复扫失败：模型输出非法'); return { ok: true, value: repairProjection }; },
          records: async () => ({ ok: true, value: [] }),
        },
        reviewRepair: { propose: async () => ({ ok: true, value: proposal }) },
        writing: {
          adjudicate: async (_candidateId, decision) => { adjudications.push(decision); return { ok: true, value: decision === 'reject' ? { status: 'rejected', candidateId: 'repair-candidate-uncertain' } : { status: 'written', candidateId: 'repair-candidate-uncertain', scene: { chapterId: 'chapter-1', sceneId: 'scene-1', index: 0, content: '米拉抬起头。' }, layers: [] } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openReview(render);
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-repair'] === 'iss-rule')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-repair-accept'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(adjudications).toEqual(['accept']);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-review-repair-uncertain'] !== undefined)).toBe(true);
    expect(collect(render(), 'div').some((node) => node.props?.['data-novel-review-repair-resolved'] !== undefined)).toBe(false);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-repair-retry'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(scans).toBe(3);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-review-repair-unresolved'] !== undefined)).toBe(true);

    // 新会话验证 reject：只调用既有裁决 owner，不触发 scan。
    const rejected = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }), {},
      {
        review: { scan: async () => ({ ok: true, value: repairProjection }), records: async () => ({ ok: true, value: [] }) },
        reviewRepair: { propose: async () => ({ ok: true, value: proposal }) },
        writing: { adjudicate: async (_candidateId, decision) => { adjudications.push(decision); return { ok: true, value: { status: 'rejected', candidateId: 'repair-candidate-uncertain' } }; } },
      },
    );
    await flush();
    const renderRejected = () => rejected.registrations['shell.overlay'][0].component() as FakeNode;
    openReview(renderRejected);
    await flush();
    (collect(renderRejected(), 'button').find((node) => node.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(renderRejected(), 'button').find((node) => node.props?.['data-novel-review-repair'] === 'iss-rule')?.props?.onClick as () => void)();
    await flush();
    (collect(renderRejected(), 'button').find((node) => node.props?.['data-novel-review-repair-reject'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(adjudications).toEqual(['accept', 'reject']);
    expect(collect(renderRejected(), 'p').some((node) => node.props?.['data-novel-review-repair-rejected'] !== undefined)).toBe(true);
  });

  it('I129 取消候选生成后丢弃晚到结果，不污染当前审校会话', async () => {
    const pendingProposal = {
      projectId: 'fixture-project', issueId: 'iss-rule', issueFingerprint: 'iss-rule',
      target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) },
      lineage: { kind: 'review-repair', issueId: 'iss-rule', issueFingerprint: 'iss-rule', sourceHash: 'a'.repeat(64) },
      candidate: { id: 'repair-candidate-cancelled', intent: 'rewrite', target: { projectId: 'fixture-project', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) }, prompt: '修复', text: '米拉抬起头。', chunkCount: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    } as const;
    let resolveProposal: (proposal: typeof pendingProposal) => void = () => undefined;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }), {},
      {
        review: { scan: async () => ({ ok: true, value: PROJECTION }), records: async () => ({ ok: true, value: [] }) },
        reviewRepair: { propose: async () => new Promise<typeof pendingProposal>((resolve) => { resolveProposal = resolve; }) },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    openReview(render);
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-refresh'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-repair'] === 'iss-rule')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'button').some((node) => node.props?.['data-novel-review-repair-cancel'] !== undefined)).toBe(true);
    (collect(render(), 'button').find((node) => node.props?.['data-novel-review-repair-cancel'] !== undefined)?.props?.onClick as () => void)();
    await flush();
    resolveProposal(pendingProposal);
    await flush();
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-review-repair-candidate'] === 'repair-candidate-cancelled')).toBe(false);
  });
})
