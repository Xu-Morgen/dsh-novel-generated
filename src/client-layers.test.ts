/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：六层真表单 —— B3/B2 角色世界观、
 * B5 大纲 / C1 关系、C2 状态 / C4 正史（I47 / I48 / I49）。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);

describe('I47 B3/B2 真表单 (R10-4)', () => {
  /** Find the first element with the given data attribute value. */
  const byData = (tree: FakeNode, attr: string, value: string): FakeNode | undefined => {
    let found: FakeNode | undefined;
    const visit = (current: unknown): void => {
      if (found || current == null || typeof current !== 'object') return;
      if (Array.isArray(current)) { for (const item of current) visit(item); return; }
      const n = current as FakeNode;
      if (n.props?.[attr] === value) { found = n; return; }
      for (const child of n.children ?? []) visit(child);
    };
    visit(tree);
    return found;
  };

  it('renders the character list and a full-field form, and create goes only through Host Remote', async () => {
    const calls: Array<{ method: string; projectId: string; input: unknown }> = [];
    const created: unknown = {
      id: 'mara', name: 'Mara', aliases: [], kind: 'protagonist',
      personality: '冷静', background: '孤儿', motivation: '复仇', goals: ['活下去'],
      flaws: ['多疑'], abilities: ['剑术'], speechStyle: '简短',
      staticTraits: [], arc: { startingPoint: '起点', desiredEnd: '终点', keyBeats: [] },
      relationships: [], knowledgeIds: [],
    };
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        characterList: async () => [],
        characterCreate: async (projectId, input) => { calls.push({ method: 'create', projectId, input }); return created; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    // characters 层默认激活，列表为空但表单（新建）仍渲染。
    expect(byData(render(), 'data-novel-layer-panel', 'characters')).toBeDefined();
    expect(byData(render(), 'data-novel-character-new', '')).toBeDefined();

    // 填充名称并触发保存（新建路径走 characterCreate）。
    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara' } });
    const save = byData(render(), 'data-novel-character-save', '') as FakeNode;
    expect(save.props?.disabled).toBe(false);
    (save.props?.onClick as () => void)();
    await flush();

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('create');
    expect(calls[0].projectId).toBe('fixture-project');
    expect(calls[0].input).toMatchObject({
      id: 'mara', name: 'Mara', kind: 'extra',
      personality: '', background: '', motivation: '',
      goals: [], flaws: [], abilities: [], speechStyle: '',
    });
  });

  it('surfaces a post-save refresh rejection instead of leaving the layer loading', async () => {
    let reads = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        characterList: async () => { reads += 1; if (reads > 1) throw new Error('Host refresh failed'); return []; },
        characterCreate: async (_projectId, input) => input,
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const nameInput = collect(render(), 'input').find((node) => node.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara' } });
    ((byData(render(), 'data-novel-character-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    const error = byData(render(), 'data-novel-layer-state', 'error') as FakeNode;
    expect(error.props?.role).toBe('alert');
    expect((error.children ?? []).join('')).toContain('Host refresh failed');
  });

  it('round-trips a character update through Host Remote and reloads the list', async () => {
    const existing = {
      id: 'mara', name: 'Mara', aliases: [], kind: 'protagonist',
      personality: '冷静', background: '孤儿', motivation: '复仇', goals: ['活下去'],
      flaws: ['多疑'], abilities: ['剑术'], speechStyle: '简短',
      staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] },
      relationships: [], knowledgeIds: [],
    };
    const updateCalls: Array<{ id: string; patch: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        characterList: async () => [existing],
        characterUpdate: async (_projectId, id, patch) => { updateCalls.push({ id, patch }); return { ...existing, name: 'Mara II', ...(patch as object) }; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    // 点选列表项载入详情。
    const item = byData(render(), 'data-novel-character-id', 'mara') as FakeNode;
    (item.props?.onClick as () => void)();

    // 修改姓名后保存，走 characterUpdate。
    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara II' } });
    ((byData(render(), 'data-novel-character-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe('mara');
    expect(updateCalls[0].patch).toMatchObject({ id: 'mara', name: 'Mara II' });
  });

  it('shows the Host error when an illegal character write is rejected', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        characterList: async () => [],
        characterCreate: async () => { throw new Error('Host rejected: name required'); },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'X' } });
    ((byData(render(), 'data-novel-character-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    const error = byData(render(), 'data-novel-error', 'character') as FakeNode;
    expect(error).toBeDefined();
    expect(error.props?.role).toBe('alert');
    expect((error.children ?? []).join('')).toContain('Host rejected');
  });

  it('worldview rewrite goes through worldviewRewrite (supersede), never in-place create', async () => {
    const existing = {
      id: 'realm', kind: 'concept', title: '王国', content: '旧设定',
      keywords: [], triggerMode: 'constant', weight: 0, parent: null,
      mutable: true, status: 'active', supersededBy: null,
    };
    const rewriteCalls: Array<{ id: string; input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        worldviewList: async () => [existing],
        worldviewRewrite: async (_projectId, id, input) => {
          rewriteCalls.push({ id, input });
          return { superseded: { ...existing, status: 'rewritten', supersededBy: (input as { id?: string }).id }, replacement: input };
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    // 切到世界观层。
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'worldview')?.props?.onClick as () => void)();

    const item = byData(render(), 'data-novel-worldview-id', 'realm') as FakeNode;
    (item.props?.onClick as () => void)();

    // 修改内容后保存，字段标注为「改写」且走 worldviewRewrite。
    const content = collect(render(), 'textarea')[0];
    (content.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '新设定' } });
    const save = byData(render(), 'data-novel-worldview-save', '') as FakeNode;
    expect((save.children ?? []).join('')).toBe('改写');
    (save.props?.onClick as () => void)();
    await flush();

    expect(rewriteCalls).toHaveLength(1);
    expect(rewriteCalls[0].id).toBe('realm');
    expect(rewriteCalls[0].input).toMatchObject({ title: '王国', content: '新设定' });
  });

  it('shows the Host error when an illegal worldview write is rejected', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        worldviewList: async () => [],
        worldviewCreate: async () => { throw new Error('Host rejected: title required'); },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    // 切到世界观层。
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'worldview')?.props?.onClick as () => void)();

    // 新建条目：输入标题后保存，Host 拒绝并回传错误。
    const titleInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (titleInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '王国' } });
    ((byData(render(), 'data-novel-worldview-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    const error = byData(render(), 'data-novel-error', 'worldview') as FakeNode;
    expect(error).toBeDefined();
    expect(error.props?.role).toBe('alert');
    expect((error.children ?? []).join('')).toContain('Host rejected');
  });

  it('owns no fs API: the client source imports no node:fs and no browser LLM seam', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const source = readFileSync(resolve(root, 'src/client.ts'), 'utf8');
    expect(source).not.toMatch(/node:fs|fs\.readFile|window\.fetch|OPENAI_API_KEY|harness\.handle|host\.call/);
  });
});

describe('I48 B5/C1 结构化编辑器 (R10-5)', () => {
  /** Find the first element with the given data attribute value. */
  const byData = (tree: FakeNode, attr: string, value: string): FakeNode | undefined => {
    let found: FakeNode | undefined;
    const visit = (current: unknown): void => {
      if (found || current == null || typeof current !== 'object') return;
      if (Array.isArray(current)) { for (const item of current) visit(item); return; }
      const n = current as FakeNode;
      if (n.props?.[attr] === value) { found = n; return; }
      for (const child of n.children ?? []) visit(child);
    };
    visit(tree);
    return found;
  };

  const OUTLINE = {
    id: 'outline', structure: 'free', logline: 'A saga.', themes: ['trust'],
    acts: [{
      id: 'act-1', index: 0, title: '开端', goal: '遇见英雄', beats: [{
        id: 'beat-1', title: '初见', description: '相遇', charactersInvolved: ['hero'],
        conflictType: 'relational', prerequisites: [], optional: false,
        detailBeats: [{ id: 'card-1', title: '雨夜', summary: '初遇', pov: 'hero', wordTarget: 500, points: ['牵手'], status: 'planned' }],
      }],
    }],
    foreshadowing: [], endings: [],
  };

  it('renders the outline hierarchy (act→beat) and scene-card view, saved only through outlineSave', async () => {
    const saveCalls: Array<{ projectId: string; input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        outlineRead: async () => OUTLINE,
        outlineSave: async (projectId, input) => { saveCalls.push({ projectId, input }); return input; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;

    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'outline')?.props?.onClick as () => void)();
    const tree = render();
    expect(byData(tree, 'data-novel-layer-panel', 'outline')).toBeDefined();
    expect(byData(tree, 'data-novel-layer-state', 'ready')).toBeDefined();
    // 层级锚点：幕、节、场景卡均渲染。
    expect(byData(tree, 'data-novel-outline-act', 'act-1')).toBeDefined();
    expect(byData(tree, 'data-novel-outline-beat', 'beat-1')).toBeDefined();
    expect(byData(tree, 'data-novel-detail-card', 'card-1')).toBeDefined();

    // 修改一句话梗概后保存。
    const loglineInput = collect(tree, 'input').find((n) => n.props?.['type'] === 'text');
    (loglineInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'A new saga.' } });
    ((byData(render(), 'data-novel-outline-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].projectId).toBe('fixture-project');
    expect(saveCalls[0].input).toMatchObject({ logline: 'A new saga.', structure: 'free' });
    expect(byData(render(), 'data-novel-layer-state', 'ready')).toBeDefined();
    expect(byData(render(), 'data-novel-outline-save', '')).toBeDefined();
  });

  it('shows the Host error when an illegal outline write is rejected', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        outlineRead: async () => OUTLINE,
        outlineSave: async () => { throw new Error('Host rejected: unknown beat prerequisite'); },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'outline')?.props?.onClick as () => void)();

    const loglineInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (loglineInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'X' } });
    ((byData(render(), 'data-novel-outline-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    const error = byData(render(), 'data-novel-error', 'outline') as FakeNode;
    expect(error).toBeDefined();
    expect(error.props?.role).toBe('alert');
    expect((error.children ?? []).join('')).toContain('Host rejected');
  });

  it('renders the relationship list and full-field editor, saved only through relationshipSave', async () => {
    const existing = {
      id: 'hero+mentor', from: 'hero', to: 'mentor', type: 'mentor',
      affinity: 80, trust: 90, status: 'active', milestones: ['受训'], knownTo: ['hero'],
    };
    const saveCalls: Array<{ projectId: string; input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        // B3 角色列表：关系列表/标题显示角色名（join），而非角色 id。
        characterList: async () => [
          { id: 'hero', name: '英雄', kind: 'protagonist' },
          { id: 'mentor', name: '导师', kind: 'extra' },
        ],
        relationshipRead: async () => [existing],
        relationshipSave: async (projectId, input) => { saveCalls.push({ projectId, input }); return input; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'relationship')?.props?.onClick as () => void)();

    const tree = render();
    expect(byData(tree, 'data-novel-layer-panel', 'relationship')).toBeDefined();

    // 列表项显示角色名（id join B3）：`英雄 → 导师`，不直接展示 id。
    const item = byData(tree, 'data-novel-relationship-id', 'hero+mentor') as FakeNode;
    expect((item.children ?? []).join('')).toBe('英雄 → 导师');
    (item.props?.onClick as () => void)();

    // 点选后标题同样显示角色名。
    expect(String((collect(render(), 'h3').find((n) => n.children?.join('')?.startsWith('编辑关系'))?.children?.[0] ?? ''))).toContain('英雄 → 导师');

    // 修改状态后保存。
    const statusInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text' && (n.props?.value as string) === 'active');
    (statusInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'strained' } });
    ((byData(render(), 'data-novel-relationship-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].projectId).toBe('fixture-project');
    expect(saveCalls[0].input).toMatchObject({
      id: 'hero+mentor', from: 'hero', to: 'mentor', type: 'mentor', status: 'strained',
    });
  });

  it('shows the Host error when an illegal relationship write is rejected', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        relationshipRead: async () => [],
        relationshipSave: async () => { throw new Error('Host rejected: endpoints must differ'); },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'relationship')?.props?.onClick as () => void)();

    const textInputs = collect(render(), 'input').filter((n) => n.props?.['type'] === 'text');
    (textInputs[0]?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'hero' } });
    (textInputs[1]?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'hero' } });
    ((byData(render(), 'data-novel-relationship-save', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    const error = byData(render(), 'data-novel-error', 'relationship') as FakeNode;
    expect(error).toBeDefined();
    expect(error.props?.role).toBe('alert');
    expect((error.children ?? []).join('')).toContain('Host rejected');
  });

  it('owns no fs API: the client source imports no node:fs and no browser LLM seam', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const source = readFileSync(resolve(root, 'src/client.ts'), 'utf8');
    expect(source).not.toMatch(/node:fs|fs\.readFile|window\.fetch|OPENAI_API_KEY|harness\.handle|host\.call/);
  });
});

describe('I49 C2/C4 面板 (R10-6)', () => {
  /** Find the first element with the given data attribute value. */
  const byData = (tree: FakeNode, attr: string, value: string): FakeNode | undefined => {
    let found: FakeNode | undefined;
    const visit = (current: unknown): void => {
      if (found || current == null || typeof current !== 'object') return;
      if (Array.isArray(current)) { for (const item of current) visit(item); return; }
      const n = current as FakeNode;
      if (n.props?.[attr] === value) { found = n; return; }
      for (const child of n.children ?? []) visit(child);
    };
    visit(tree);
    return found;
  };

  const SNAPSHOTS = [
    { id: 'ws', seq: 0, storyTime: 'day 1', scene: { location: '城门', timeOfDay: 'dawn', weather: '', season: '', atmosphere: '' }, characters: [] },
    { id: 'ws', seq: 1, storyTime: 'day 2', scene: { location: '王宫', timeOfDay: 'noon', weather: '', season: '', atmosphere: '' }, characters: [] },
  ];

  it('renders the C2 snapshot timeline and rolls back only through stateRollback', async () => {
    const rollbackCalls: Array<{ projectId: string; seq: number }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        stateSnapshots: async () => SNAPSHOTS,
        stateRollback: async (projectId, seq) => { rollbackCalls.push({ projectId, seq }); return { ...SNAPSHOTS[0], seq: 2, storyTime: 'day 2 (rolled back)' }; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'state')?.props?.onClick as () => void)();

    const tree = render();
    expect(byData(tree, 'data-novel-layer-panel', 'state')).toBeDefined();
    // 时间线条目锚点 + 当前快照。
    expect(byData(tree, 'data-novel-state-snapshot', '0')).toBeDefined();
    expect(byData(tree, 'data-novel-state-snapshot', '1')).toBeDefined();

    // 选择 seq 0 后点击回滚：只经 Host stateRollback。
    ((byData(tree, 'data-novel-state-snapshot', '0') as FakeNode).props?.onClick as () => void)();
    const rollback = byData(render(), 'data-novel-state-rollback', '') as FakeNode;
    expect(rollback.props?.disabled).toBe(false);
    (rollback.props?.onClick as () => void)();
    await flush();

    expect(rollbackCalls).toHaveLength(1);
    expect(rollbackCalls[0]).toEqual({ projectId: 'fixture-project', seq: 0 });
  });

  it('computes a diff between two snapshots only through stateDiff', async () => {
    const diffCalls: Array<{ fromSeq: number; toSeq: number }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        stateSnapshots: async () => SNAPSHOTS,
        stateDiff: async (_projectId, fromSeq, toSeq) => {
          diffCalls.push({ fromSeq, toSeq });
          return { fromSeq, toSeq, changes: [{ path: 'scene.location', before: '城门', after: '王宫' }] };
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'state')?.props?.onClick as () => void)();

    // 初始 from=0, to=1（载入时已自动选中前两快照）。
    ((byData(render(), 'data-novel-state-diff', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    expect(diffCalls).toHaveLength(1);
    expect(diffCalls[0]).toEqual({ fromSeq: 0, toSeq: 1 });
    const diffRow = byData(render(), 'data-novel-state-diff-row', 'scene.location') as FakeNode;
    expect(diffRow).toBeDefined();
    const rowText = ((): string => {
      let text = '';
      const visit = (current: unknown): void => {
        if (current == null || typeof current !== 'object') { text += String(current); return; }
        for (const child of (current as FakeNode).children ?? []) visit(child);
      };
      visit(diffRow);
      return text;
    })();
    expect(rowText).toContain('城门');
    expect(rowText).toContain('王宫');
  });

  const CANON = [
    { id: 'ev-1', seq: 0, storyTime: 'day 1', kind: 'event', summary: '英雄入城', detail: '城门大开', participants: [], location: '城门', consequences: [], affectedLayers: [], immutable: true, supersededBy: null },
    { id: 'ev-2', seq: 1, storyTime: 'day 2', kind: 'decision', summary: '结盟', detail: '结为盟友', participants: [], location: '王宫', consequences: [], affectedLayers: [], immutable: true, supersededBy: null },
  ];

  it('renders C4 as a read-only ledger and proposes corrections through canonCorrectionPropose', async () => {
    const proposeCalls: Array<{ projectId: string; targetId: string; input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        canonQuery: async () => CANON,
        canonCorrectionPropose: async (projectId, targetId, input) => {
          proposeCalls.push({ projectId, targetId, input });
          return { id: 'proposal-1' };
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'canon')?.props?.onClick as () => void)();

    const tree = render();
    expect(byData(tree, 'data-novel-layer-panel', 'canon')).toBeDefined();
    // 只读徽标 + 账本条目锚点。
    expect(byData(tree, 'data-novel-canon-readonly', '')).toBeDefined();
    expect(byData(tree, 'data-novel-canon-id', 'ev-1')).toBeDefined();

    // 选中事件并修改摘要后发起提案。
    ((byData(tree, 'data-novel-canon-id', 'ev-1') as FakeNode).props?.onClick as () => void)();
    const summaryInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text' && (n.props?.value as string) === '英雄入城');
    (summaryInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '英雄改道入城' } });
    ((byData(render(), 'data-novel-canon-propose', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    expect(proposeCalls).toHaveLength(1);
    expect(proposeCalls[0].projectId).toBe('fixture-project');
    expect(proposeCalls[0].targetId).toBe('ev-1');
    expect(proposeCalls[0].input).toMatchObject({ summary: '英雄改道入城' });
  });

  it('appends a supersede only after canonCorrectionAccept confirms the gate proposal', async () => {
    const calls: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        canonQuery: async () => CANON,
        canonCorrectionPropose: async () => { calls.push('propose'); return { id: 'proposal-1' }; },
        canonCorrectionAccept: async () => { calls.push('accept'); return { confirmation: {}, event: {} }; },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((n) => n.props?.['data-novel-layer'] === 'canon')?.props?.onClick as () => void)();

    ((byData(render(), 'data-novel-canon-id', 'ev-1') as FakeNode).props?.onClick as () => void)();
    const summaryInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text' && (n.props?.value as string) === '英雄入城');
    (summaryInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '改' } });

    // 提案前没有 accept 入口。
    expect(byData(render(), 'data-novel-canon-accept', '')).toBeUndefined();
    ((byData(render(), 'data-novel-canon-propose', '') as FakeNode).props?.onClick as () => void)();
    await flush();

    // 提案后出现 accept 入口；确认后才追加 supersede（accept 被调用）。
    const accept = byData(render(), 'data-novel-canon-accept', '') as FakeNode;
    expect(accept).toBeDefined();
    expect(calls).toEqual(['propose']);
    (accept.props?.onClick as () => void)();
    await flush();
    expect(calls).toEqual(['propose', 'accept']);
  });

  it('owns no fs API and no direct canon write seam in the client source', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const source = readFileSync(resolve(root, 'src/client.ts'), 'utf8');
    expect(source).not.toMatch(/node:fs|fs\.readFile|window\.fetch|OPENAI_API_KEY|harness\.handle|host\.call/);
    // 正史无就地改写入口：客户端永不调用 update/delete/append/supersede 直接写账本。
    expect(source).not.toMatch(/canonUpdate|canonDelete|canonAppend|\.supersede\(/);
  });
});
