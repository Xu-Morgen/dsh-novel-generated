/**
 * I83 拆分自 client.test.ts（架构审查 §4.2）：项目启动 / 作品上下文栏与切换 /
 * LLM 设置页（I50 / I55 / LLM 设置）。
 */


import { afterEach, describe, expect, it } from 'vitest';
import { analyzerStub, cleanupClientTestEnv, collect, factory, FakeFileReader, fakeReact, flush, I56_LAYERS, layerButtons, makeWorkspace, MountOptions, mount, openOnboardingReview, READY_MODEL, WorkspaceOverrides, type FakeNode } from './client/test-harness.js';

afterEach(cleanupClientTestEnv);

describe('I50 project-session startup', () => {
  const projectButton = (tree: FakeNode, id: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-project-open'] === id);

  it('shows an empty-root new-project state without mounting six layers', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      { projectList: async () => [] },
      { openProjectId: null },
    );
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    expect(tree.props?.['data-novel-workspace']).toBe('ready');
    expect(collect(tree, 'p').some((node) => node.props?.['data-novel-project-empty'] === '')).toBe(true);
    expect(layerButtons(tree)).toEqual([]);
    // I50 requires an actionable blank-project entry. The current production
    // chooser only describes the state, so this assertion is intentionally red
    // until it exposes a create control wired to projectCreate.
    expect(collect(tree, 'button').some((node) => node.props?.['data-novel-project-create'] === '')).toBe(true);
  });

  it('shows multiple projects without selecting the first one', async () => {
    const projectOpen: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }],
        projectOpen: async (id) => { projectOpen.push(id); return {}; },
      },
      { openProjectId: null },
    );
    await flush();
    const tree = registrations['shell.overlay'][0].component() as FakeNode;
    expect(collect(tree, 'ul').some((node) => node.props?.['data-novel-project-list'] === '')).toBe(true);
    expect(projectButton(tree, 'alpha')).toBeDefined();
    expect(projectButton(tree, 'beta')).toBeDefined();
    expect(projectOpen).toEqual([]);
    expect(layerButtons(tree)).toEqual([]);
  });

  it('opens the selected project, reloads every layer, and keeps later writes on that id', async () => {
    const calls: Array<{ method: string; projectId: string }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }],
        projectOpen: async (id) => { calls.push({ method: 'projectOpen', projectId: id }); return {}; },
        characterList: async () => { calls.push({ method: 'characterList', projectId: 'beta' }); return []; },
        worldviewList: async () => { calls.push({ method: 'worldviewList', projectId: 'beta' }); return []; },
        outlineRead: async (id) => { calls.push({ method: 'outlineRead', projectId: id }); return { id: 'outline', structure: 'free', logline: '', themes: [], acts: [], foreshadowing: [], endings: [] }; },
        relationshipRead: async (id) => { calls.push({ method: 'relationshipRead', projectId: id }); return []; },
        stateSnapshots: async (id) => { calls.push({ method: 'stateSnapshots', projectId: id }); return []; },
        canonQuery: async (id) => { calls.push({ method: 'canonQuery', projectId: id }); return []; },
        characterCreate: async (id, input) => { calls.push({ method: 'characterCreate', projectId: id }); return { ...(input as object), id: 'mara' }; },
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (projectButton(render(), 'beta')?.props?.onClick as () => void)();
    await flush();

    expect(render().props?.['data-novel-project-open']).toBe('beta');
    expect(calls.filter((call) => call.method !== 'characterCreate')).toEqual(expect.arrayContaining([
      { method: 'projectOpen', projectId: 'beta' },
      { method: 'characterList', projectId: 'beta' },
      { method: 'worldviewList', projectId: 'beta' },
      { method: 'outlineRead', projectId: 'beta' },
      { method: 'relationshipRead', projectId: 'beta' },
      { method: 'stateSnapshots', projectId: 'beta' },
      { method: 'canonQuery', projectId: 'beta' },
    ]));

    (layerButtons(render()).find((node) => node.props?.['data-novel-layer'] === 'characters')?.props?.onClick as () => void)();
    const nameInput = collect(render(), 'input').find((node) => node.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara' } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-character-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(calls).toContainEqual({ method: 'characterCreate', projectId: 'beta' });
  });

  it('fails closed when opening the selected project fails (I55: keeps the chooser with a recoverable error)', async () => {
    let characterLoads = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [{ id: 'broken', name: 'Broken' }],
        projectOpen: async () => { throw new Error('cannot open'); },
        characterList: async () => { characterLoads += 1; return []; },
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (projectButton(render(), 'broken')?.props?.onClick as () => void)();
    await flush();
    // I55：open 失败不再 brick 成整屏错误，而是停在作品列表并展示可恢复错误。
    expect(render().props?.['data-novel-workspace']).toBe('ready');
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-project-error'] === '')).toBe(true);
    expect(layerButtons(render())).toEqual([]);
    expect(characterLoads).toBe(0);
  });

  it('skips outlineRead for an uninitialized outline and shows the empty form', async () => {
    let outlineReads = 0;
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [{ id: 'fresh', name: 'Fresh' }],
        // projectOpen reports B5 as uninitialized (legacy `{}` outline).
        projectOpen: async () => ({ project: { id: 'fresh', name: 'Fresh', version: 1 }, layers: { characters: 'empty', worldview: 'empty', outline: 'uninitialized', relationship: 'empty', state: 'ready', canon: 'empty' } }),
        outlineRead: async () => { outlineReads += 1; return { id: 'outline', structure: 'free', logline: '', themes: [], acts: [], foreshadowing: [], endings: [] }; },
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-project-open'] === 'fresh')?.props?.onClick as () => void)();
    await flush();
    // I50 step 21: skip outlineRead for uninitialized — outlineRead would throw
    // "Invalid outline document" on the legacy `{}` marker.
    expect(outlineReads).toBe(0);
    (layerButtons(render()).find((node) => node.props?.['data-novel-layer'] === 'outline')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-layer-panel'] === 'outline' && node.props?.['data-novel-layer-state'] === 'ready')).toBe(true);
  });
});

describe('I55 作品上下文栏与项目切换 (R12-2)', () => {
  const projectButton = (tree: FakeNode, id: string): FakeNode | undefined =>
    collect(tree, 'button').find((node) => node.props?.['data-novel-project-open'] === id);
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

  const ALPHA = { id: 'alpha', name: 'Alpha' };
  const BETA = { id: 'beta', name: 'Beta' };
  const READY_LAYERS = { characters: 'empty', worldview: 'empty', outline: 'uninitialized', relationship: 'empty', state: 'ready', canon: 'empty' };
  const character = (id: string, name: string) => ({ id, name, aliases: [], kind: 'protagonist', personality: '', background: '', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] });

  it('shows the project context bar with the current name and a back-to-projects entry', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [ALPHA],
        projectOpen: async () => ({ project: ALPHA, layers: READY_LAYERS }),
      },
      { openProjectId: 'alpha' },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    expect(byData(render(), 'data-novel-project-context', '')).toBeDefined();
    expect(collect(render(), 'span').some((node) => node.props?.['data-novel-project-context-name'] === '' && (node.children ?? []).join('') === 'Alpha')).toBe(true);
    expect(byData(render(), 'data-novel-back-to-projects', '')).toBeDefined();
  });

  it('round-trips two projects with zero cross-project draft leakage', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [ALPHA, BETA],
        projectOpen: async (id) => ({ project: id === 'alpha' ? ALPHA : BETA, layers: READY_LAYERS }),
        characterList: async (id) => (id === 'alpha' ? [character('mara', 'Mara')] : [character('beta-hero', 'Beta Hero')]),
      },
      { openProjectId: null },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (projectButton(render(), 'alpha')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-project-open']).toBe('alpha');
    (layerButtons(render()).find((node) => node.props?.['data-novel-layer'] === 'characters')?.props?.onClick as () => void)();
    expect(byData(render(), 'data-novel-character-id', 'mara')).toBeDefined();

    // dirty a character draft in alpha
    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Mara Edited' } });

    // back-to-projects → dirty confirm → confirm leave
    (byData(render(), 'data-novel-back-to-projects', '')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-leave-confirm', '')).toBeDefined();
    (byData(render(), 'data-novel-leave-discard', '')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeDefined();

    // open beta
    (projectButton(render(), 'beta')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-project-open']).toBe('beta');
    (layerButtons(render()).find((node) => node.props?.['data-novel-layer'] === 'characters')?.props?.onClick as () => void)();
    // beta's own character, never alpha's (zero cross-project leakage)
    expect(byData(render(), 'data-novel-character-id', 'beta-hero')).toBeDefined();
    expect(byData(render(), 'data-novel-character-id', 'mara')).toBeUndefined();
    // editor draft reset: name input is empty, not the alpha draft
    const betaName = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    expect(betaName?.props?.value).toBe('');
  });

  it('adjudicates a dirty form before leaving and cancels without navigating', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [ALPHA],
        projectOpen: async () => ({ project: ALPHA, layers: READY_LAYERS }),
      },
      { openProjectId: 'alpha' },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (layerButtons(render()).find((node) => node.props?.['data-novel-layer'] === 'characters')?.props?.onClick as () => void)();
    const nameInput = collect(render(), 'input').find((n) => n.props?.['type'] === 'text');
    (nameInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'Dirty' } });

    (byData(render(), 'data-novel-back-to-projects', '')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-leave-confirm', '')).toBeDefined();
    // cancel keeps the project open and does not navigate
    (byData(render(), 'data-novel-leave-cancel', '')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-leave-confirm', '')).toBeUndefined();
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeUndefined();
    expect(render().props?.['data-novel-project-open']).toBe('alpha');
  });

  it('keeps the original project when a switch fails to open', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        projectList: async () => [ALPHA, BETA],
        projectOpen: async (id) => {
          if (id === 'alpha') return { project: ALPHA, layers: READY_LAYERS };
          throw new Error('cannot open beta');
        },
        characterList: async () => [character('mara', 'Mara')],
      },
      { openProjectId: 'alpha' },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    expect(render().props?.['data-novel-project-open']).toBe('alpha');
    (layerButtons(render()).find((node) => node.props?.['data-novel-layer'] === 'characters')?.props?.onClick as () => void)();

    // browse to switch
    (byData(render(), 'data-novel-back-to-projects', '')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-project-browsing', '')).toBeDefined();

    // attempt to open beta → fails with a recoverable error, original kept
    (projectButton(render(), 'beta')?.props?.onClick as () => void)();
    await flush();
    expect(byData(render(), 'data-novel-project-error', '')).toBeDefined();
    expect(render().props?.['data-novel-project-open']).toBe('alpha');

    // cancel browsing → back to alpha, its data still intact
    (byData(render(), 'data-novel-browse-cancel', '')?.props?.onClick as () => void)();
    await flush();
    expect(render().props?.['data-novel-project-open']).toBe('alpha');
    (layerButtons(render()).find((node) => node.props?.['data-novel-layer'] === 'characters')?.props?.onClick as () => void)();
    expect(byData(render(), 'data-novel-character-id', 'mara')).toBeDefined();
  });
});

describe('LLM 设置页', () => {
  it('opens the settings page, echoes the saved view and saves new values through the Remote', async () => {
    const loads: string[] = [];
    const saves: Array<{ input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        llmConfig: {
          load: async () => { loads.push('load'); return { providerId: 'novel-custom', baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', hasKey: true }; },
          save: async (input) => { saves.push({ input }); return { ok: true, value: { ok: true, modelRef: 'novel-custom/gpt-4o' } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const settingsNav = collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '');
    expect(settingsNav).toBeDefined();
    (settingsNav?.props?.onClick as () => void)();
    await flush();

    expect(loads).toEqual(['load']);
    const urlInput = collect(render(), 'input').find((node) => node.props?.['data-novel-llm-url'] === '');
    expect(urlInput?.props?.value).toBe('https://api.example.com/v1');
    expect(collect(render(), 'input').find((node) => node.props?.['data-novel-llm-model'] === '')?.props?.value).toBe('gpt-4o');

    (urlInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'https://new.example.com/v1' } });
    (collect(render(), 'input').find((node) => node.props?.['data-novel-llm-model'] === '')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'gpt-5' } });
    (collect(render(), 'input').find((node) => node.props?.['data-novel-llm-key'] === '')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'sk-new-key-123456' } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-llm-save'] === '')?.props?.onClick as () => void)();
    await flush();

    expect(saves).toEqual([{ input: { baseUrl: 'https://new.example.com/v1', model: 'gpt-5', apiKey: 'sk-new-key-123456' } }]);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-llm-message'] !== undefined)).toBe(true);
  });

  it('toggles the settings page closed and exits it when a layer is activated', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      { llmConfig: { load: async () => ({ providerId: 'novel-custom', baseUrl: '', model: '', hasKey: true }) } },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    const settingsNav = () => collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '');
    (settingsNav()?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-llm-settings'] === '')).toBe(true);
    // 再次点击「LLM 设置」关闭，回到层级面板。
    (settingsNav()?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-llm-settings'] === '')).toBe(false);
    // 打开后点击任一层级按钮也会退出设置页。
    (settingsNav()?.props?.onClick as () => void)();
    await flush();
    (layerButtons(render()).find((node) => node.props?.['data-novel-layer'] === 'characters')?.props?.onClick as () => void)();
    await flush();
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-llm-settings'] === '')).toBe(false);
    expect(collect(render(), 'section').some((node) => node.props?.['data-novel-layer-panel'] === 'characters')).toBe(true);
  });

  it('saves with an empty key when a key is already stored (keeps it)', async () => {
    const saves: Array<{ input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        llmConfig: {
          load: async () => ({ providerId: 'novel-custom', baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', hasKey: true, maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high' }),
          save: async (input) => { saves.push({ input }); return { ok: true, value: { ok: true, modelRef: 'novel-custom/gpt-4o' } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'input').find((node) => node.props?.['data-novel-llm-url'] === '')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'https://new.example.com/v1' } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-llm-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(saves).toEqual([{ input: { baseUrl: 'https://new.example.com/v1', model: 'gpt-4o', apiKey: '', maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high' } }]);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-llm-message'] !== undefined)).toBe(true);
  });

  it('adjusts maxTokens, thinking and effort controls and submits them on save', async () => {
    const saves: Array<{ input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        llmConfig: {
          load: async () => ({ providerId: 'novel-custom', baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', hasKey: true, maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high' }),
          save: async (input) => { saves.push({ input }); return { ok: true, value: { ok: true, modelRef: 'novel-custom/gpt-4o' } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    const maxTokens = collect(tree, 'select').find((node) => node.props?.['data-novel-llm-max-tokens'] === '');
    const thinking = collect(tree, 'select').find((node) => node.props?.['data-novel-llm-thinking'] === '');
    const effort = collect(tree, 'select').find((node) => node.props?.['data-novel-llm-effort'] === '');
    expect(maxTokens).toBeDefined();
    expect(thinking).toBeDefined();
    expect(effort).toBeDefined();
    (maxTokens?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '131072' } });
    (thinking?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'disabled' } });
    (effort?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'low' } });
    const after = render();
    expect(after && collect(after, 'select').find((node) => node.props?.['data-novel-llm-effort'] === '')?.props?.disabled).toBe(true);
    (collect(after, 'button').find((node) => node.props?.['data-novel-llm-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(saves).toEqual([{ input: { baseUrl: 'https://api.example.com/v1', model: 'gpt-4o', apiKey: '', maxTokens: 131072, thinking: 'disabled', reasoningEffort: 'low' } }]);
  });

  it('blocks save when the key is missing and none is stored', async () => {
    const saves: unknown[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        llmConfig: {
          load: async () => ({ providerId: 'novel-custom', baseUrl: '', model: '', hasKey: false, maxTokens: 32768, thinking: 'enabled', reasoningEffort: 'high' }),
          save: async (input) => { saves.push(input); return { ok: true, value: { ok: true, modelRef: 'x' } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'input').find((node) => node.props?.['data-novel-llm-url'] === '')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'https://x.example/v1' } });
    (collect(render(), 'input').find((node) => node.props?.['data-novel-llm-model'] === '')?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: 'gpt-4o' } });
    (collect(render(), 'button').find((node) => node.props?.['data-novel-llm-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(saves).toEqual([]);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-llm-error'] !== undefined)).toBe(true);
  });

  it('edits and saves creation settings (word target and ask-when-thin)', async () => {
    const saves: Array<{ input: unknown }> = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        workbenchSettings: {
          load: async () => ({ wordTarget: 500, askWhenThin: true }),
          save: async (input) => { saves.push({ input }); return { ok: true, value: { wordTarget: 1200, askWhenThin: false } }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-workbench-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    const tree = render();
    const word = collect(tree, 'input').find((node) => node.props?.['data-novel-workbench-word-target'] === '');
    const ask = collect(tree, 'input').find((node) => node.props?.['data-novel-workbench-ask-thin'] === '');
    expect(word).toBeDefined();
    expect(ask).toBeDefined();
    (word?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '1200' } });
    (ask?.props?.onChange as (event: { target: { checked: boolean } }) => void)({ target: { checked: false } });
    const after = render();
    (collect(after, 'button').find((node) => node.props?.['data-novel-workbench-save'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(saves).toEqual([{ input: { wordTarget: 1200, askWhenThin: false } }]);
  });

  it('adds, views and edits a detail beat under a beat', async () => {
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {
        outlineRead: async () => ({ id: 'outline', structure: 'three-act', logline: '一句话梗概', themes: [], acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '开局', beats: [{ id: 'beat-1', title: '第一节', description: '火车上', charactersInvolved: [], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] }] }], foreshadowing: [], endings: [] }),
        outlineSave: async (input) => input,
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-layer'] === 'outline')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-act'] === 'act-1')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-beat'] === 'beat-1')?.props?.onClick as () => void)();
    await flush();
    // 手动新增细纲场景卡。
    (collect(render(), 'button').find((node) => node.props?.['data-novel-outline-add-detail'] === '')?.props?.onClick as () => void)();
    await flush();
    const card = collect(render(), 'button').find((node) => node.props?.['data-novel-detail-card'] !== undefined);
    expect(card).toBeDefined();
    // 点击卡片 → 查看/编辑面板出现。
    (card?.props?.onClick as () => void)();
    await flush();
    const editor = collect(render(), 'div').find((node) => node.props?.['data-novel-detail-card-editor'] !== undefined);
    expect(editor).toBeDefined();
    // 编辑标题 → 列表卡片同步更新。
    const titleInput = collect(editor as unknown as FakeNode, 'input')[0];
    (titleInput?.props?.onChange as (event: { target: { value: string } }) => void)({ target: { value: '火车相遇' } });
    await flush();
    const updated = collect(render(), 'button').find((node) => node.props?.['data-novel-detail-card'] !== undefined);
    const titleText = (updated?.children?.[0] as FakeNode | undefined)?.children?.[0];
    expect(String(titleText ?? '')).toContain('火车相遇');
  });

  it('opens the selected project landing folder from creation settings', async () => {
    const opened: string[] = [];
    const { registrations } = mount(
      () => Promise.resolve({ ok: true, value: READY_MODEL }),
      {},
      {
        workbenchSettings: {
          load: async () => ({ wordTarget: 500, askWhenThin: true }),
          openProjectFolder: async (projectId) => { opened.push(projectId); return { opened: true, path: `C:\\projects\\${projectId}` }; },
        },
      },
    );
    await flush();
    const render = () => registrations['shell.overlay'][0].component() as FakeNode;
    (collect(render(), 'button').find((node) => node.props?.['data-novel-workbench-settings-nav'] === '')?.props?.onClick as () => void)();
    await flush();
    (collect(render(), 'button').find((node) => node.props?.['data-novel-open-project-folder'] === '')?.props?.onClick as () => void)();
    await flush();
    expect(opened).toEqual(['fixture-project']);
    expect(collect(render(), 'p').some((node) => node.props?.['data-novel-workbench-message'] !== undefined)).toBe(true);
  });
});
