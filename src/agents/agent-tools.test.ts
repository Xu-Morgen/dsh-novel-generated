import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createCharacterService } from '../host/character-service.js';
import { createWorldviewService } from '../host/worldview-service.js';
import { createOutlineService } from '../host/outline-service.js';
import { createRelationshipService } from '../host/relationship-service.js';
import { createStateService } from '../host/state-service.js';
import { createCanonService } from '../host/canon-service.js';
import { createConfirmationService } from '../host/confirmation-service.js';
import { createProjectService } from '../host/project-service.js';
import { createStyleService } from '../host/style-service.js';
import { createRuleService } from '../host/rule-service.js';
import { createKnowledgeService } from '../host/knowledge-service.js';
import { createTextService } from '../host/text-service.js';
import { createSceneOutlineBindingService } from '../host/scene-outline-binding-service.js';
import { createInspirationService } from '../host/inspiration-service.js';
import { createConsistencyDetectionService } from '../host/consistency-detection-service.js';
import { createKnowledgeLeakDetectionService } from '../host/knowledge-leak-detection-service.js';
import { createRelationshipStyleDetectionService } from '../host/relationship-style-detection-service.js';
import { createNextSceneContextBuilder, type NextSceneContextProvider } from '../host/writing-context.js';
import { createWritingAdjudicationService } from '../host/writing-adjudication-service.js';
import { INITIAL_STATE } from '../core/schema/project-lifecycle.js';
import { createNovelAgentService, registerNovelAgentTools, type NovelAgentDeps } from './agent-tools.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };

/** Fake DSH `llm.stream` route answering the prose prompt and each parser prompt. */
function fakeLlm(seen: string[] = []) {
  return {
    async *stream(options: { messages: Array<{ content: Array<{ text: string }> }> }) {
      const prompt = options.messages[0].content[0].text;
      seen.push(prompt);
      let output: unknown;
      if (prompt.includes('你是小说一致性硬约束检测器') || prompt.includes('你是小说 POV 知情泄漏硬约束检测器') || prompt.includes('你是小说一致性软约束检测器')) {
        output = { violations: [] };
      } else if (prompt.includes('你是小说世界状态解析器')) {
        output = { ops: [{ op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'dawn', confidence: 'high' }] };
      } else if (prompt.includes('你是小说正史解析器')) {
        output = { ops: [{ op: 'append', event: { id: 'evt-1', storyTime: 'dawn', kind: 'event', summary: '米拉找到铜钥匙', detail: '米拉在码头找到铜钥匙。', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: ['state'] }, confidence: 'high' }] };
      } else if (prompt.includes('你是小说关系解析器') || prompt.includes('你是小说知情解析器') || prompt.includes('你是小说世界观改写解析器')) {
        output = { ops: [] };
      } else {
        output = '米拉在码头找到铜钥匙。';
      }
      yield { type: 'text-delta', text: typeof output === 'string' ? output : JSON.stringify(output) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
}

interface Setup {
  agent: ReturnType<typeof createNovelAgentService>;
  deps: NovelAgentDeps;
  root: string;
  seen: string[];
}

async function setup(
  creation?: { wordTarget?: number; askWhenThin?: boolean },
  wrapContext?: (real: NextSceneContextProvider) => NextSceneContextProvider,
): Promise<Setup> {
  const root = await mkdtemp(join(tmpdir(), 'novel-agent-tools-'));
  const seen: string[] = [];
  const characters = createCharacterService(root);
  const worldview = createWorldviewService(root);
  const outline = createOutlineService(root);
  const relationship = createRelationshipService(root);
  const state = createStateService(root);
  const canon = createCanonService(root);
  const confirmation = createConfirmationService(root);
  const project = createProjectService(root, { characters, worldview, outline, relationship, state, canon, confirmation });
  const style = createStyleService(root);
  const rules = createRuleService(root);
  const knowledge = createKnowledgeService(root);
  const text = createTextService(root);
  const inspiration = createInspirationService(fakeLlm());
  const llm = fakeLlm(seen);
  // I87：上下文 provider 由组合根注入（与写作裁决路径同一实例，见一致性测试）；
  // 测试默认把同一 builder 实例传给两个 owner，镜像生产装配。
  const realContext = createNextSceneContextBuilder({
    outline, characters, worldview, relationship, state, canon, style, rules, knowledge, text,
    workbenchSettings: { load: async () => ({ wordTarget: creation?.wordTarget ?? 500, askWhenThin: creation?.askWhenThin ?? true }) },
  });
  const context = wrapContext === undefined ? realContext : wrapContext(realContext);
  const sceneOutlineBinding = createSceneOutlineBindingService(text, outline, root);
  const writing = createWritingAdjudicationService({
    llm,
    projectsRoot: root,
    context,
    sceneOutlineBinding,
    textMutation: text,
    state, relationship, knowledge, canon, worldview, confirmation, rules, style,
    consistency: createConsistencyDetectionService(llm),
    knowledgeLeak: createKnowledgeLeakDetectionService(llm),
    relationshipStyle: createRelationshipStyleDetectionService(llm),
    resolveSettings: async () => settings,
  });
  const deps: NovelAgentDeps = {
    project, characters, worldview, outline, relationship, state, canon,
    style, rules, knowledge, text, writing, inspiration, confirmation,
    context,
    resolveSettings: async () => settings,
    workbenchSettings: { load: async () => ({ wordTarget: creation?.wordTarget ?? 500, askWhenThin: creation?.askWhenThin ?? true }) },
  };
  const agent = createNovelAgentService(deps);
  return { agent, deps, root, seen };
}

/** 建一个六层就绪的演示作品：1 个角色 + 1 幕/节/细纲 + C2 基线快照。 */
async function seedProject(deps: NovelAgentDeps, projectId: string): Promise<void> {
  await deps.project.createProject({ projectId, name: '演示作品' });
  await deps.project.openProject(projectId);
  await deps.characters.create(projectId, {
    id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '追查真相',
    goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
    arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
  });
  await deps.worldview.create(projectId, {
    id: 'north-harbor', kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港'],
    triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null,
  });
  await deps.outline.save(projectId, {
    id: 'outline-demo', structure: 'three-act', logline: '一名测绘师追查灯塔守夜人失踪之谜。', themes: ['追查'],
    acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '接受委托', beats: [{ id: 'beat-1', title: '午夜旧灯塔', description: '米拉在旧灯塔发现线索。', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'detail-1', title: '发现海图', summary: '米拉发现半张烧焦海图', pov: 'mira', wordTarget: 20, points: ['发现海图'], status: 'writing' }] }] }],
    foreshadowing: [], endings: [],
  });
  await deps.outline.saveProgress(projectId, { outlineId: 'outline-demo', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: [], deviations: [], tensionLevel: 0 });
  await deps.state.open(projectId, INITIAL_STATE);
  await deps.canon.open(projectId);
  await deps.style.open(projectId);
  await deps.style.save(projectId, {
    id: 'style-demo', name: '默认', person: 'third-limited', tense: 'past', povScope: 'single',
    tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [],
  });
  await deps.rules.open(projectId);
  await deps.rules.create(projectId, { id: 'rule-1', scope: 'global', kind: 'physics', statement: '旧灯塔的海图只会在月圆之夜显字。', priority: 1, immutable: true, examples: [], active: true });
  await deps.knowledge.open(projectId);
  await deps.knowledge.saveAll(projectId, [], [{ characterId: 'mira', knows: [] }]);
  await deps.text.open(projectId);
  await deps.text.createChapter(projectId, { id: 'chapter-main', index: 1, title: '正文', pov: 'mira', status: 'draft' });
  await deps.confirmation.open(projectId);
}

describe('novel agent tools（对话创作入口）', () => {
  it('opens a project and reports layer status with entity counts', async () => {
    const { agent, deps, root } = await setup();
    try {
      await seedProject(deps, 'demo');
      const opened = await agent.open('demo');
      expect(opened.project.id).toBe('demo');
      expect(opened.layers.characters).toBe('ready');
      const status = await agent.status('demo');
      expect(status.characters).toBe(1);
      expect(status.outlineReady).toBe(true);
      expect(status.scenes).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('assembles the next-scene context with navigation, current card and sources', async () => {
    const { agent, deps, root } = await setup();
    try {
      await seedProject(deps, 'demo');
      const context = await agent.context('demo');
      expect(context.card.id).toBe('detail-1');
      expect(context.navigation.beatId).toBe('beat-1');
      expect(context.sources.context.sources.characters[0].character.id).toBe('mira');
      expect(context.sources.context.sources.state.storyTime).toBe('');
      expect(context.sources.canon).toHaveLength(0);
      expect(context.creation).toEqual({ wordTarget: 500, askWhenThin: true });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('proposeContinue 只产候选（零写）；accept 经写作裁决进入标准生命周期并受控写回；重复 accept 幂等', async () => {
    const { agent, deps, root, seen } = await setup({ wordTarget: 800 });
    try {
      await seedProject(deps, 'demo');
      const { candidate } = await agent.proposeContinue('demo');
      expect(candidate.intent).toBe('continue');
      expect(candidate.target.chapterId).toBe('chapter-main');
      // 只产候选：既有章节仍无场景、无结构化层写入。
      expect((await deps.text.listChapters('demo'))[0].scenes).toHaveLength(0);
      expect(deps.state.current('demo').storyTime).toBe('');
      // 通用目标字数（创作设置 800）覆盖了细纲卡自带的 wordTarget（20）。
      expect(seen.some((prompt) => prompt.includes('目标字数: 800'))).toBe(true);

      const accepted = await agent.adjudicate(candidate.id, 'accept');
      expect(accepted.status).toBe('written');
      if (accepted.status !== 'written') return;
      // C2 状态被写回（storyTime → dawn）。
      expect(deps.state.current('demo').storyTime).toBe('dawn');
      // C4 正史追加。
      expect(deps.canon.query('demo').map((entry) => entry.id)).toEqual(['evt-1']);
      // C5 文本落盘（显式既有章节含 1 个场景）。
      const chapters = await deps.text.listChapters('demo');
      expect(chapters).toHaveLength(1);
      expect(chapters[0].scenes).toHaveLength(1);
      expect(chapters[0].scenes[0].content).toBe('米拉在码头找到铜钥匙。');
      // 文件级证据：重启后数据仍在磁盘上（结构化文档，无需重新上传/初始化）。
      const projectDir = join(root, 'demo');
      const chapterFile = await readFile(join(projectDir, 'text', 'chapter-main.json'), 'utf8');
      expect(JSON.parse(chapterFile).scenes[0].content).toBe('米拉在码头找到铜钥匙。');
      // 可读镜像带段落，便于直接阅读。
      const docsFile = await readFile(join(projectDir, 'docs', 'chapter-main.md'), 'utf8');
      expect(docsFile).toContain('# 正文');
      expect(docsFile).toContain('米拉在码头找到铜钥匙。');
      const canonFile = await readFile(join(projectDir, 'canon', 'canon.jsonl'), 'utf8');
      expect(canonFile).toContain('evt-1');
      const stateFile = await readFile(join(projectDir, 'state', 'snapshots.yaml'), 'utf8');
      expect(stateFile).toContain('dawn');
      // 六层初始化产物：大纲/关系/角色/世界观文件存在（重启后直接读取，无需重传）。
      await expect(readFile(join(projectDir, 'outline.yaml'), 'utf8')).resolves.toContain('outline-demo');
      await expect(readFile(join(projectDir, 'relationships.yaml'), 'utf8')).resolves.toMatch(/\S/);
      await expect(readFile(join(projectDir, 'characters', 'mira.yaml'), 'utf8')).resolves.toContain('米拉');
      await expect(readFile(join(projectDir, 'worldview', 'north-harbor.yaml'), 'utf8')).resolves.toContain('北港');
      // 双击幂等：重复 accept 不重复写。
      const again = await agent.adjudicate(candidate.id, 'accept');
      expect(again.status).toBe('written');
      expect((await deps.text.listChapters('demo'))[0].scenes).toHaveLength(1);
      expect(deps.canon.query('demo')).toHaveLength(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('I105 proposeContinue with both target ids routes to explicit proposeAt', async () => {
    const { agent, deps, root } = await setup();
    try {
      await seedProject(deps, 'demo');
      const { candidate } = await agent.proposeContinue('demo', { chapterId: 'chapter-main', sceneId: 'agent-explicit' });
      expect(candidate.target).toEqual({ projectId: 'demo', chapterId: 'chapter-main', sceneId: 'agent-explicit' });
      const controller = new AbortController();
      const legacy = await agent.proposeContinue('demo', controller.signal);
      expect(legacy.candidate.target.chapterId).toBe('chapter-main');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reject 零写：无场景、无结构化层写入；重复 reject 幂等', async () => {
    const { agent, deps, root } = await setup();
    try {
      await seedProject(deps, 'demo');
      const { candidate } = await agent.proposeContinue('demo');
      const outcome = await agent.adjudicate(candidate.id, 'reject');
      expect(outcome).toEqual({ status: 'rejected', candidateId: candidate.id });
      expect(deps.state.current('demo').storyTime).toBe('');
      expect(deps.canon.query('demo')).toHaveLength(0);
      expect((await deps.text.listChapters('demo'))[0].scenes).toHaveLength(0);
      expect((await agent.adjudicate(candidate.id, 'reject')).status).toBe('rejected');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('registers the six novel tools into the DSH tools registry and disposes cleanly', () => {
    const registered: string[] = [];
    const registry = {
      register(definition: { name: string }) {
        registered.push(definition.name);
        return () => undefined;
      },
    };
    const ctx = {
      get(name: string) { return name === 'tools' ? registry : undefined; },
    } as never;
    const agent = { listProjects: async () => [] } as never;
    const dispose = registerNovelAgentTools(ctx, agent);
    expect(registered).toEqual(['novel_open', 'novel_status', 'novel_context', 'novel_continue', 'novel_adjudicate', 'novel_inspire']);
    dispose();
  });

  it('injects only active world entries via trigger matching when a superseded entry exists', async () => {
    const { agent, deps, root } = await setup();
    try {
      await seedProject(deps, 'demo');
      // B2 supersede（设计 §5.4 / I29）：旧条目标 rewritten + supersededBy，新条目 active。
      await deps.worldview.rewrite('demo', 'north-harbor', {
        id: 'north-harbor-v2', kind: 'geography', title: '北港新志', content: '北港位于内海西岸，现为翠玉录展览所在地。',
        keywords: ['北港'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null,
      });
      // 一段提到「北港」的最近正文作为触发源（否则无命中，无法验证 active 过滤）。
      await deps.text.appendScene('demo', 'chapter-main', {
        id: 'scene-1', content: '米拉站在北港的码头上，望着内海西岸。', summary: '抵达北港', beats: ['beat-1'], canonEvents: [], notes: '',
      });
      // 上下文只注入 active 的 north-harbor-v2，绝不注入 rewritten 的 north-harbor。
      const context = await agent.context('demo');
      expect(context.sources.context.sources.worldview.map((hit) => hit.entryId)).toEqual(['north-harbor-v2']);
      // 端到端：存在 rewritten 条目时，续写候选不再抛「World entry hit must be active」。
      const { candidate } = await agent.proposeContinue('demo');
      expect(candidate.text).toBe('米拉在码头找到铜钥匙。');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('I87：novel_context 与 novel_continue 基于同一 NextSceneContextProvider 实例（双 owner 消除）', async () => {
    // 双 owner 语义分叉（review v2.0 §3.2）：agent 自建 context builder 时可能暴露
    // 「未来」关系（无 timeline 过滤）。修复后 provider 由组合根注入——同一实例同时
    // 服务 novel_context 展示与 novel_continue 的 prompt 装配（写作裁决服务内部）。
    // wrapContext 用 spy 包装真实 builder 并交给两个 owner：断言两条路径命中同一
    // provider 实例（代理委托真实装配，语义不变）。
    const usedBy: string[] = [];
    const { agent, deps, root } = await setup(undefined, (real) => ({
      async context(projectId) {
        usedBy.push(projectId);
        return real.context(projectId);
      },
    }));
    try {
      await seedProject(deps, 'demo');
      // novel_context：经注入的 provider 展示。
      const shown = await agent.context('demo');
      expect(shown.card.id).toBe('detail-1');
      // novel_continue：prompt 装配（写作裁决服务 propose → candidate production）
      // 复用同一 provider —— 与 novel_context 的展示基于同一上下文。
      await agent.proposeContinue('demo');
      expect(usedBy.filter((projectId) => projectId === 'demo').length).toBeGreaterThanOrEqual(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
