import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { describe, expect, it } from 'vitest';

import { apply } from './index.js';
import { knowledgePendingInvocation } from './host/remote/knowledge.js';
import { reviewRecordsInvocation } from './host/remote/review.js';

/** Minimal valid A2 config (I31 schema) pointing at the test LLM route. */
const FIXTURE_A2 = [
  'version: 1',
  'backends:',
  '  - id: draft',
  '    modelRef: dsh/default',
  '    secretRef: DEEPSEEK_API_KEY',
  '    sampling: {}',
  'templates:',
  '  - id: default',
  '    backendRef: draft',
  '    roleHeaders:',
  '      system: system',
  '      user: user',
  '      assistant: assistant',
  '    sectionOrder: [system, user]',
  '    stopSequences: []',
  'presets: []',
  'active:',
  '  backendId: draft',
  '  templateId: default',
  '',
].join('\n');

describe('novel-creation-tool Host plugin (I1)', () => {
  it('provides the novelCreation service while the Fiber is live', async () => {
    const root = new Context();
    const fiber = await root.plugin(apply);

    expect(root.get('novelCreation')).toEqual({ version: '2.0.0', ready: true });

    await fiber.dispose();
  });

  it('registers the novel_* agent tools when the tools service is provided, and boots cleanly without it', async () => {
    // 有 tools：apply 后经 inject 懒注册进注册表。
    const registered: string[] = [];
    const root = new Context();
    root.provide('tools', {
      register(def: { name: string }) {
        registered.push(def.name);
        return () => {};
      },
    });
    const fiber = await root.plugin(apply);
    expect(registered).toEqual(['novel_open', 'novel_status', 'novel_context', 'novel_continue', 'novel_adjudicate', 'novel_inspire']);
    await fiber.dispose();
    // 卸载后清空（下次重挂不再重复注册）。
    expect(registered).toHaveLength(6);

    // 无 tools：必须照常启动（此前 “cannot get property tools without inject” 崩溃）。
    const bare = new Context();
    const bareFiber = await bare.plugin(apply);
    expect(bare.get('novelCreation')).toEqual({ version: '2.0.0', ready: true });
    await bareFiber.dispose();
  });

  it('wires I21 detection to the Host ctx.llm service while its Fiber is live', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: JSON.stringify({
          violations: [{ kind: 'immutable-rule', severity: 'hard', message: '违反禁魔规则。', references: ['rule-no-magic'] }],
        }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const detector = root.get('novelConsistencyDetection') as {
      detectRuleAndCanon(input: unknown, settings: unknown): Promise<{ adjudication: { status: string } }>;
    };

    await expect(detector.detectRuleAndCanon({
      prose: '米拉施放火球。',
      rules: [{ id: 'rule-no-magic', statement: '人类不能施放魔法。', immutable: true, active: true }],
      canon: [],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ adjudication: { status: 'reject' } });

    await fiber.dispose();
    expect(root.get('novelConsistencyDetection', false)).toBeUndefined();
  });

  it('wires I22 POV leak detection to the Host ctx.llm service while its Fiber is live', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: JSON.stringify({
          violations: [{ kind: 'knowledge-leak', severity: 'hard', message: '米拉知晓了暗门秘密。', references: ['secret-gate'] }],
        }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const detector = root.get('novelKnowledgeLeakDetection') as {
      detectKnowledgeLeak(input: unknown, settings: unknown): Promise<{ adjudication: { status: string } }>;
    };

    await expect(detector.detectKnowledgeLeak({
      prose: '米拉知道北港暗门只能在退潮时开启。', pov: 'mira',
      entries: [{ id: 'secret-gate', version: 1, fact: '北港暗门只能在退潮时开启。', kind: 'secret', holders: ['lin'], revealPlan: { revealTo: ['mira'], revealAt: 'act-2' }, status: 'hidden' }],
      states: [{ characterId: 'mira', knows: [] }, { characterId: 'lin', knows: ['secret-gate'] }],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ adjudication: { status: 'reject' } });

    await fiber.dispose();
    expect(root.get('novelKnowledgeLeakDetection', false)).toBeUndefined();
  });

  it('wires I24 relationship/style soft detection to the Host ctx.llm service while its Fiber is live', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: JSON.stringify({
          violations: [{ kind: 'style-deviation', severity: 'soft', message: '时态偏离。', references: ['style-main'] }],
        }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const detector = root.get('novelRelationshipStyleDetection') as {
      detectRelationshipAndStyle(input: unknown, settings: unknown): Promise<{ adjudication: { status: string } }>;
    };

    await expect(detector.detectRelationshipAndStyle({
      prose: '米拉现在走进码头。', relationships: [],
      style: { id: 'style-main', version: 1, name: '港湾阴谋', person: 'third-limited', tense: 'past', povScope: 'single', tone: '克制紧张', proseStyle: '冷峻简洁', chapterFormat: '场景标题', dialogueConventions: '使用中文引号', forbidden: [] },
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ adjudication: { status: 'warn' } });

    await fiber.dispose();
    expect(root.get('novelRelationshipStyleDetection', false)).toBeUndefined();
  });

  it('wires I27 C1 recognition as the only automatic C1 parser service', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', text: JSON.stringify({ ops: [{ op: 'modify', targetId: 'lin-mira', field: 'trust', action: 'set', value: 70, confidence: 'high' }] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const parser = root.get('novelRelationshipParser') as {
      parseC1Relationships(input: unknown, settings: unknown): Promise<{ ops: unknown[] }>;
    };

    await expect(parser.parseC1Relationships({
      prose: '林舟终于相信米拉。',
      current: [{ id: 'lin-mira', version: 1, from: 'lin', to: 'mira', type: 'friendship', affinity: 30, trust: 40, status: 'uneasy alliance', milestones: [], knownTo: ['lin', 'mira'] }],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ ops: [{ targetId: 'lin-mira', field: 'trust' }] });
    expect(Object.keys(parser)).toEqual(['parseC1Relationships']);
    expect(root.get('relationshipEngine', false)).toBeUndefined();

    await fiber.dispose();
    expect(root.get('novelRelationshipParser', false)).toBeUndefined();
  });

  it('wires I28 C3 recognition as a forward-only parser service', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', text: JSON.stringify({ ops: [{ op: 'advance', targetId: 'harbor-secret', addHolders: ['mira'], status: 'partially-revealed', confidence: 'high' }] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const parser = root.get('novelKnowledgeParser') as {
      parseC3Knowledge(input: unknown, settings: unknown): Promise<{ ops: unknown[] }>;
    };

    await expect(parser.parseC3Knowledge({
      prose: '米拉看见了暗门。',
      entries: [{ id: 'harbor-secret', version: 1, fact: '暗门藏在灯塔地下。', kind: 'secret', holders: ['lin'], revealPlan: { revealTo: ['mira'], revealAt: '钟楼对峙后' }, status: 'hidden' }],
      states: [{ characterId: 'lin', knows: ['harbor-secret'] }, { characterId: 'mira', knows: [] }],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ ops: [{ targetId: 'harbor-secret', status: 'partially-revealed' }] });
    expect(Object.keys(parser)).toEqual(['parseC3Knowledge']);

    await fiber.dispose();
    expect(root.get('novelKnowledgeParser', false)).toBeUndefined();
  });

  it('wires I29 B2 recognition as a confirmation-first supersede parser service', async () => {
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', text: JSON.stringify({ ops: [{ op: 'supersede', targetId: 'north-kingdom', replacement: { id: 'fallen-north-kingdom', kind: 'faction', title: '北境废墟', content: '王国已覆灭。', keywords: ['北境'], triggerMode: 'keyword', weight: 3, parent: null, mutable: true }, confidence: 'high' }] }) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply);
    const parser = root.get('novelWorldviewParser') as {
      parseB2Worldview(input: unknown, settings: unknown): Promise<{ ops: unknown[] }>;
    };

    await expect(parser.parseB2Worldview({
      prose: '王国覆灭。',
      current: [{ id: 'north-kingdom', version: 1, kind: 'faction', title: '北境王国', content: '北境由延续千年的王国统治。', keywords: ['北境'], triggerMode: 'keyword', weight: 3, parent: null, mutable: true, status: 'active', supersededBy: null }],
    }, { modelRef: 'dsh/default', credentialRef: 'dsh/managed' })).resolves.toMatchObject({ ops: [{ targetId: 'north-kingdom', replacement: { id: 'fallen-north-kingdom' } }] });
    expect(Object.keys(parser)).toEqual(['parseB2Worldview']);

    await fiber.dispose();
    expect(root.get('novelWorldviewParser', false)).toBeUndefined();
  });

  it('wires the I32 internal Extension registry to the Host Fiber and removes it on dispose', async () => {
    const root = new Context();
    const fiber = await root.plugin(apply);
    const extensions = root.get('novelExtension') as {
      register(input: unknown): { release(): void };
      seams(): { validators: unknown[] };
    };

    extensions.register({ id: 'fiber-validator', kind: 'validator', check: () => [] });
    expect(extensions.seams().validators).toHaveLength(1);
    expect(root.get('relationshipEngine', false)).toBeUndefined();

    await fiber.dispose();
    expect(root.get('novelExtension', false)).toBeUndefined();
    expect(() => extensions.seams()).toThrow(/disposed/);
  });

  it('removes the novelCreation service after Fiber dispose', async () => {
    const root = new Context();
    const fiber = await root.plugin(apply);

    await fiber.dispose();

    expect(root.get('novelCreation', false)).toBeUndefined();
  });

  it('restarts cleanly on a fresh Fiber', async () => {
    const root = new Context();

    const first = await root.plugin(apply);
    await first.dispose();

    const second = await root.plugin(apply);
    expect(root.get('novelCreation')).toEqual({ version: '2.0.0', ready: true });
    await second.dispose();
  });

  it('registers a single combined host face against the real Typert registry', async () => {
    const root = new Context();
    await root.plugin(TypertRegistry);
    const fiber = await root.plugin(apply);

    // The I2 probe and I33+ workspace invocations share one `novel-creation-tool#host`
    // package face; a second registration with the same face would reject the boot.
    expect(root.typert.local.get('novelProbe/probe')).toBeDefined();
    expect(root.typert.local.get('novelWorkspace/viewModel')).toBeDefined();
    expect(root.typert.local.get('novelWorkspace/characterList')).toBeDefined();
    // The gateway dispatches strict descriptors only to a service carrying the
    // `typertRemote` binding; assert the single workspace service exposes it.
    expect((root.get('novelWorkspace') as { typertRemote?: unknown }).typertRemote).toMatchObject({
      serviceKey: 'novelWorkspace', namespace: 'novelWorkspace',
    });

    await fiber.dispose();
    expect(root.typert.local.get('novelProbe/probe')).toBeUndefined();
  });

  it('I77 novelReview.records returns the bare array the wire contract declares', async () => {
    // I77 修复（架构审查 §8#1）：服务层 records() 返回裸数组，wire 契约
    // （reviewRecordsInvocation）即声明裸数组 —— 组合根不再整形 envelope，
    // 契约漂移在边界直接暴露；网关按 descriptor.result strict codec 校验裸数组。
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-review-records-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot });
    try {
      const review = root.get('novelReview') as { records(projectId: string): Promise<unknown> };
      const result = await review.records('demo');
      expect(result).toEqual([]);
      // 与 dsh-api-gateway decode() 相同的边界校验：结果必须通过声明的 result codec。
      const codec = reviewRecordsInvocation.result;
      if (codec.mode !== 'strict') throw new Error('novelReview/records must declare a strict result codec');
      expect(codec.schema.parse(result)).toEqual([]);
    } finally {
      await fiber.dispose();
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });

  it('I77 novelKnowledgeManager.pending returns the bare array the wire contract declares', async () => {
    // I77 修复（架构审查 §8#1）：服务层 pending() 返回裸数组，wire 契约
    // （knowledgePendingInvocation）即声明裸数组 —— 组合根不再整形 envelope。
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-knowledge-pending-'));
    const root = new Context();
    const fiber = await root.plugin(apply, { projectsRoot });
    try {
      const manager = root.get('novelKnowledgeManager') as { pending(projectId: string): Promise<unknown> };
      const result = await manager.pending('demo');
      expect(result).toEqual([]);
      // 与 dsh-api-gateway decode() 相同的边界校验：结果必须通过声明的 result codec。
      const codec = knowledgePendingInvocation.result;
      if (codec.mode !== 'strict') throw new Error('novelKnowledgeManager/pending must declare a strict result codec');
      expect(codec.schema.parse(result)).toEqual([]);
    } finally {
      await fiber.dispose();
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });

  it('analyzer start resolves generation settings from the A2 config when omitted', async () => {
    const settingsRoot = await mkdtemp(join(tmpdir(), 'novel-settings-'));
    await writeFile(join(settingsRoot, 'a2-settings.yaml'), FIXTURE_A2);
    const corpus = JSON.parse(await readFile(resolve(process.cwd(), 'samples/i52/cases.json'), 'utf8')) as { cases: Array<{ id: string; text: string; expected: unknown }> };
    const sample = corpus.cases[0];
    const root = new Context();
    const routes: string[] = [];
    root.provide('llm', {
      async *stream(options: { provider: string; model: string }) {
        routes.push(`${options.provider}/${options.model}`);
        yield { type: 'text-delta', index: 0, text: JSON.stringify(sample.expected) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply, { settingsRoot });
    const analyzer = root.get('novelOnboardingAnalyzer') as { start(input: unknown, settings?: unknown): Promise<unknown> };
    const result = await analyzer.start({ projectId: 'demo', sourceHash: 'a'.repeat(64), text: sample.text }, undefined);
    expect(result).toMatchObject({ projectId: 'demo' });
    expect(routes).toEqual(['dsh/default']);
    await fiber.dispose();
    await rm(settingsRoot, { recursive: true, force: true });
  });

  it('analyzer start fails with an actionable error when no settings are configured', async () => {
    const settingsRoot = await mkdtemp(join(tmpdir(), 'novel-settings-'));
    const root = new Context();
    root.provide('llm', {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: '{}' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply, { settingsRoot });
    const analyzer = root.get('novelOnboardingAnalyzer') as { start(input: unknown, settings?: unknown): Promise<unknown> };
    await expect(analyzer.start({ projectId: 'demo', sourceHash: 'a'.repeat(64), text: '故事文本' }, undefined)).rejects.toThrow(/生成设置未配置/);
    await fiber.dispose();
    await rm(settingsRoot, { recursive: true, force: true });
  });

  it('I151 opens C3 before checking whether a freshly opened project is empty', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-i151-c3-open-'));
    const sourceHash = 'a'.repeat(64);
    const settings = { modelRef: 'dsh/fake', credentialRef: 'dsh/test' };
    const ruleStyleCandidate = {
      rules: [],
      style: {
        id: 'style-imported', name: '导入文风', person: 'third-limited', tense: 'past', povScope: 'single',
        tone: '克制', proseStyle: '紧贴角色感知', chapterFormat: '按调查节点分章', dialogueConventions: '对白简洁', forbidden: [],
      },
    };
    const root = new Context();
    root.provide('llm', {
      async *stream(options: { messages: readonly [{ content: readonly [{ text: string }] }] }) {
        const prompt = options.messages[0].content[0].text;
        const result = prompt.includes('来源解释分类器')
          ? {
              sourceRole: 'synopsis', confidence: 'high', evidenceParagraphIds: ['paragraph-0001'],
              paragraphs: [{ paragraphId: 'paragraph-0001', role: 'plot-plan', confidence: 'high', evidence: '这是剧情计划。' }],
              rationale: '来源描述了预定剧情。',
            }
          : ruleStyleCandidate;
        yield { type: 'text-delta', text: JSON.stringify(result) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    const fiber = await root.plugin(apply, { projectsRoot });
    try {
      const project = root.get('novelProject') as {
        createProject(input: { projectId: string; name: string }): Promise<unknown>;
        openProject(projectId: string): Promise<unknown>;
      };
      const sessions = root.get('novelImportInterpretation') as {
        create(input: unknown): Promise<{ importSessionId: string }>;
        confirm(input: unknown): Promise<unknown>;
      };
      const analysis = root.get('novelImportInterpretationAnalysis') as {
        begin(input: unknown, settings: unknown): Promise<unknown>;
        status(input: unknown): { status: string };
      };
      const initialization = root.get('novelRuleStyleImportInitialization') as {
        begin(input: unknown, settings: unknown): Promise<{ status: string }>;
      };

      await project.createProject({ projectId: 'fresh', name: 'Fresh' });
      await project.openProject('fresh');
      const intent = { sourceRole: 'synopsis', treatment: 'expand-outline' };
      const paragraphDecisions = [{ paragraphId: 'paragraph-0001', decision: 'accepted', summary: '保留为剧情计划。' }];
      const session = await sessions.create({ projectId: 'fresh', sourceHash, intent, paragraphDecisions });
      const identity = { projectId: 'fresh', importSessionId: session.importSessionId, sourceHash };
      await analysis.begin({
        ...identity,
        paragraphs: [{ paragraphId: 'paragraph-0001', index: 0, text: '主角将前往北境。', startOffset: 0, endOffset: 8 }],
      }, settings);
      await expect.poll(() => analysis.status(identity).status).toBe('succeeded');
      await sessions.confirm({ ...identity, intent, paragraphDecisions });

      await expect(initialization.begin(identity, settings)).resolves.toMatchObject({ status: 'queued' });
    } finally {
      await fiber.dispose();
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });
});
