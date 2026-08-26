import { mkdtemp, rm } from 'node:fs/promises';
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
function fakeLlm() {
  return {
    async *stream(options: { messages: Array<{ content: Array<{ text: string }> }> }) {
      const prompt = options.messages[0].content[0].text;
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
}

async function setup(): Promise<Setup> {
  const root = await mkdtemp(join(tmpdir(), 'novel-agent-tools-'));
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
  const continuation = createContinuationService(fakeLlm(), root);
  const inspiration = createInspirationService(fakeLlm());
  const deps: NovelAgentDeps = {
    project, characters, worldview, outline, relationship, state, canon,
    style, rules, knowledge, text, continuation, inspiration, confirmation,
    resolveSettings: async () => settings,
  };
  const agent = createNovelAgentService(deps);
  return { agent, deps, root };
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('continues with accept: writes C5 text and structured layers through existing owners', async () => {
    const { agent, deps, root } = await setup();
    try {
      await seedProject(deps, 'demo');
      const result = await agent.continueScene('demo', 'accept');
      expect(result.execution.result.status).toBe('written');
      expect(result.scene?.content).toBe('米拉在码头找到铜钥匙。');
      // C2 状态被写回（storyTime → dawn）。
      expect(deps.state.current('demo').storyTime).toBe('dawn');
      // C4 正史追加。
      expect(deps.canon.query('demo').map((entry) => entry.id)).toEqual(['evt-1']);
      // C5 文本落盘（chapter-1 已建并含 1 个场景）。
      const chapters = await deps.text.listChapters('demo');
      expect(chapters).toHaveLength(1);
      expect(chapters[0].scenes).toHaveLength(1);
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
    const disposers: Array<() => void> = [];
    const ctx = {
      tools: {
        register(definition: { name: string }) {
          registered.push(definition.name);
          const disposer = () => { disposers.push(() => undefined); };
          return disposer;
        },
      },
    } as never;
    const agent = { listProjects: async () => [] } as never;
    const dispose = registerNovelAgentTools(ctx, agent);
    expect(registered).toEqual(['novel_open', 'novel_status', 'novel_context', 'novel_continue', 'novel_inspire']);
    dispose();
  });
});
