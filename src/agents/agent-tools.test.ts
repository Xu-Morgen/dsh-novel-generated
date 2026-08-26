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
import { createContinuationService } from '../host/continuation-service.js';
import { createInspirationService } from '../host/inspiration-service.js';
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
      if (prompt.includes('你是小说世界状态解析器')) {
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

async function setup(creation?: { wordTarget?: number; askWhenThin?: boolean }): Promise<Setup> {
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
  const continuation = createContinuationService(fakeLlm(seen), root);
  const inspiration = createInspirationService(fakeLlm());
  const deps: NovelAgentDeps = {
    project, characters, worldview, outline, relationship, state, canon,
    style, rules, knowledge, text, continuation, inspiration, confirmation,
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

  it('continues with accept: writes C5 text and structured layers through existing owners', async () => {
    const { agent, deps, root, seen } = await setup({ wordTarget: 800 });
    try {
      await seedProject(deps, 'demo');
      const result = await agent.continueScene('demo', 'accept');
      expect(result.execution.result.status).toBe('written');
      expect(result.scene?.content).toBe('米拉在码头找到铜钥匙。');
      // 通用目标字数（创作设置 800）覆盖了细纲卡自带的 wordTarget（20）。
      expect(seen.some((prompt) => prompt.includes('目标字数: 800'))).toBe(true);
      // C2 状态被写回（storyTime → dawn）。
      expect(deps.state.current('demo').storyTime).toBe('dawn');
      // C4 正史追加。
      expect(deps.canon.query('demo').map((entry) => entry.id)).toEqual(['evt-1']);
      // C5 文本落盘（chapter-1 已建并含 1 个场景）。
      const chapters = await deps.text.listChapters('demo');
      expect(chapters).toHaveLength(1);
      expect(chapters[0].scenes).toHaveLength(1);
      // 文件级证据：重启后数据仍在磁盘上（结构化文档，无需重新上传/初始化）。
      const projectDir = join(root, 'demo');
      const chapterFile = await readFile(join(projectDir, 'text', 'chapter-1.json'), 'utf8');
      expect(JSON.parse(chapterFile).scenes[0].content).toBe('米拉在码头找到铜钥匙。');
      // 可读镜像：docs/chapter-1.md 带段落，便于直接阅读。
      const docsFile = await readFile(join(projectDir, 'docs', 'chapter-1.md'), 'utf8');
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('continues with reject: no scene and no structured-layer write', async () => {
    const { agent, deps, root } = await setup();
    try {
      await seedProject(deps, 'demo');
      const result = await agent.continueScene('demo', 'reject');
      expect(result.execution.result.status).toBe('decision-rejected');
      expect(result.scene).toBeUndefined();
      expect(deps.state.current('demo').storyTime).toBe('');
      expect(deps.canon.query('demo')).toHaveLength(0);
      expect(await deps.text.listChapters('demo')).toHaveLength(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('registers the five novel tools into the DSH tools registry and disposes cleanly', () => {
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
    expect(registered).toEqual(['novel_open', 'novel_status', 'novel_context', 'novel_continue', 'novel_inspire']);
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
      await deps.text.createChapter('demo', { id: 'chapter-1', index: 1, title: '第一章', pov: 'mira', status: 'draft' });
      await deps.text.appendScene('demo', 'chapter-1', {
        id: 'scene-1', content: '米拉站在北港的码头上，望着内海西岸。', summary: '抵达北港', beats: ['beat-1'], canonEvents: [], notes: '',
      });
      // 上下文只注入 active 的 north-harbor-v2，绝不注入 rewritten 的 north-harbor。
      const context = await agent.context('demo');
      expect(context.sources.context.sources.worldview.map((hit) => hit.entryId)).toEqual(['north-harbor-v2']);
      // 端到端：存在 rewritten 条目时，续写组装不再抛「World entry hit must be active」。
      const result = await agent.continueScene('demo', 'reject');
      expect(result.execution.result.status).toBe('decision-rejected');
      expect(result.scene).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
