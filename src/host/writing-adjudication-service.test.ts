import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it, afterEach } from 'vitest';

import { createCharacterService } from './character-service.js';
import { createWorldviewService } from './worldview-service.js';
import { createOutlineService } from './outline-service.js';
import { createRelationshipService } from './relationship-service.js';
import { createStateService } from './state-service.js';
import { createCanonService } from './canon-service.js';
import { createConfirmationService } from './confirmation-service.js';
import { createProjectService } from './project-service.js';
import { createStyleService } from './style-service.js';
import { createRuleService } from './rule-service.js';
import { createKnowledgeService } from './knowledge-service.js';
import { createTextService } from './text-service.js';
import { createSceneOutlineBindingService } from './scene-outline-binding-service.js';
import { SceneOutlineBindingRepository } from './scene-outline-binding-repository.js';
import { createConsistencyDetectionService } from './consistency-detection-service.js';
import { createKnowledgeLeakDetectionService } from './knowledge-leak-detection-service.js';
import { createRelationshipStyleDetectionService } from './relationship-style-detection-service.js';
import { createNextSceneContextBuilder } from './writing-context.js';
import { createWritingAdjudicationService } from './writing-adjudication-service.js';
import { TextRepository } from '../core/text/index.js';
import { readYaml } from '../core/io/yaml.js';
import { INITIAL_STATE } from '../core/schema/project-lifecycle.js';
import { stableSceneId } from '../core/queue/task.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };

/** Fake DSH `llm.stream` route：生成/探测器/五层解析器按 prompt 前缀分发。 */
function fakeLlm(seen: string[] = [], overrides: {
  hard?: unknown;
  leak?: unknown;
  soft?: unknown;
  beforeGeneration?: (call: number) => Promise<void>;
  beforeAnalysis?: (phase: 'detector' | 'parser') => Promise<void>;
  emptyParserOps?: boolean;
} = {}) {
  let generationCalls = 0;
  return {
    async *stream(options: { messages: Array<{ content: Array<{ text: string }> }> }) {
      const prompt = options.messages[0].content[0].text;
      seen.push(prompt);
      const analysisPhase = prompt.includes('检测器')
        ? 'detector' as const
        : prompt.includes('解析器')
          ? 'parser' as const
          : null;
      if (analysisPhase !== null) await overrides.beforeAnalysis?.(analysisPhase);
      let output: unknown;
      if (prompt.includes('你是小说一致性硬约束检测器')) {
        output = { violations: overrides.hard ?? [] };
      } else if (prompt.includes('你是小说 POV 知情泄漏硬约束检测器')) {
        output = { violations: overrides.leak ?? [] };
      } else if (prompt.includes('你是小说一致性软约束检测器')) {
        output = { violations: overrides.soft ?? [] };
      } else if (prompt.includes('你是小说世界状态解析器')) {
        output = { ops: overrides.emptyParserOps ? [] : [{ op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'dawn', confidence: 'high' }] };
      } else if (prompt.includes('你是小说正史解析器')) {
        output = { ops: overrides.emptyParserOps ? [] : [{ op: 'append', event: { id: 'evt-1', storyTime: 'dawn', kind: 'event', summary: '米拉找到铜钥匙', detail: '米拉在码头找到铜钥匙。', participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: ['state'] }, confidence: 'high' }] };
      } else if (prompt.includes('你是小说关系解析器') || prompt.includes('你是小说知情解析器') || prompt.includes('你是小说世界观改写解析器')) {
        output = { ops: [] };
      } else {
        await overrides.beforeGeneration?.(++generationCalls);
        output = '米拉在码头找到铜钥匙。';
      }
      yield { type: 'text-delta', text: typeof output === 'string' ? output : JSON.stringify(output) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
}

interface Setup {
  service: ReturnType<typeof createWritingAdjudicationService>;
  root: string;
  seen: string[];
  calls: { c5: number; writers: string[] };
  services: {
    characters: ReturnType<typeof createCharacterService>;
    worldview: ReturnType<typeof createWorldviewService>;
    outline: ReturnType<typeof createOutlineService>;
    relationship: ReturnType<typeof createRelationshipService>;
    state: ReturnType<typeof createStateService>;
    canon: ReturnType<typeof createCanonService>;
    confirmation: ReturnType<typeof createConfirmationService>;
    style: ReturnType<typeof createStyleService>;
    rules: ReturnType<typeof createRuleService>;
    knowledge: ReturnType<typeof createKnowledgeService>;
    text: ReturnType<typeof createTextService>;
    sceneOutlineBinding: ReturnType<typeof createSceneOutlineBindingService>;
  };
}

function trackMethod<T extends object>(target: T, method: keyof T, calls: string[], label: string, before?: () => Promise<void>): T {
  return new Proxy(target, {
    get(current, property, receiver) {
      const value = Reflect.get(current, property, receiver) as unknown;
      if (property === method && typeof value === 'function') {
        return async (...args: unknown[]) => {
          calls.push(label);
          await before?.();
          return Reflect.apply(value, current, args);
        };
      }
      return value;
    },
  });
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function setup(overrides: {
  hard?: unknown;
  failC5?: boolean | number;
  beforeC5?: () => Promise<void>;
  beforeGeneration?: (call: number) => Promise<void>;
  mutateOutlineAfterContext?: boolean;
  mutateTextAfterContextCall?: number;
  mutateContextBeforeRepropose?: boolean;
  captureRaceOwner?: 'text' | 'outline' | 'binding';
  mutateAcceptOwner?: 'outline' | 'binding';
  mutateAcceptPhase?: 'detector' | 'parser';
  mutateAtCandidateFreshCheck?: { readonly owner: 'outline' | 'binding'; readonly call: number };
  beforeWriter?: (label: string) => Promise<void>;
  emptyParserOps?: boolean;
} = {}): Promise<Setup> {
  const root = await mkdtemp(join(tmpdir(), 'novel-i63-'));
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
  const realContext = createNextSceneContextBuilder({
    outline, characters, worldview, relationship, state, canon, style, rules, knowledge, text,
    workbenchSettings: { load: async () => ({ wordTarget: 800, askWhenThin: true }) },
  });
  let contextCalls = 0;
  const context = overrides.mutateOutlineAfterContext || overrides.mutateTextAfterContextCall !== undefined || overrides.mutateContextBeforeRepropose
    ? {
      async context(projectId: string) {
        contextCalls += 1;
        if (overrides.mutateContextBeforeRepropose && contextCalls === 2) {
          const current = await outline.read(projectId);
          await outline.save(projectId, {
            ...current,
            acts: current.acts.map((act) => ({
              ...act,
              beats: act.beats.map((beat) => ({
                ...beat,
                detailBeats: beat.detailBeats.map((card) => card.id === 'detail-1' ? { ...card, status: 'done' as const } : card),
              })),
            })),
          });
        }
        const built = await realContext.context(projectId);
        if (overrides.mutateOutlineAfterContext) {
          const current = await outline.read(projectId);
          await outline.save(projectId, { ...current, logline: `${current.logline} changed-after-context` });
        }
        if (overrides.mutateTextAfterContextCall === contextCalls) {
          const fingerprint = await text.projectFingerprint(projectId);
          await text.updateChapterMutation(projectId, {
            chapterId: 'chapter-main', patch: { title: `Changed during context ${contextCalls}` }, expectedFingerprint: fingerprint,
          });
        }
        return built;
      },
    }
    : realContext;
  let textFingerprintReads = 0;
  const bindingText = overrides.captureRaceOwner === 'text'
    ? {
      listChapters: (projectId: string) => text.listChapters(projectId),
      async projectFingerprint(projectId: string) {
        const fingerprint = await text.projectFingerprint(projectId);
        textFingerprintReads += 1;
        return textFingerprintReads === 2 ? `${fingerprint[0] === '0' ? '1' : '0'}${fingerprint.slice(1)}` : fingerprint;
      },
    }
    : text;
  let outlineFingerprintReads = 0;
  const bindingOutline = overrides.captureRaceOwner === 'outline'
    ? {
      beatCards: (projectId: string) => outline.beatCards(projectId),
      async contentFingerprint(projectId: string) {
        const fingerprint = await outline.contentFingerprint(projectId);
        outlineFingerprintReads += 1;
        return outlineFingerprintReads === 2 ? `${fingerprint[0] === '0' ? '1' : '0'}${fingerprint.slice(1)}` : fingerprint;
      },
    }
    : outline;
  let bindingFingerprintReads = 0;
  const baseSceneOutlineBinding = createSceneOutlineBindingService(bindingText, bindingOutline, root, overrides.captureRaceOwner === 'binding'
    ? {
      repositoryFactory(directory) {
        const repository = new SceneOutlineBindingRepository(directory);
        const read = repository.read.bind(repository);
        repository.read = async () => {
          const snapshot = await read();
          bindingFingerprintReads += 1;
          return bindingFingerprintReads === 2
            ? { ...snapshot, fingerprint: `${snapshot.fingerprint[0] === '0' ? '1' : '0'}${snapshot.fingerprint.slice(1)}` }
            : snapshot;
        };
        return repository;
      },
    }
    : {});
  let candidateFreshChecks = 0;
  const sceneOutlineBinding = overrides.mutateAtCandidateFreshCheck === undefined
    ? baseSceneOutlineBinding
    : {
      ...baseSceneOutlineBinding,
      async assertCandidateTargetFresh(projectId: string, snapshot: Parameters<typeof baseSceneOutlineBinding.assertCandidateTargetFresh>[1]) {
        candidateFreshChecks += 1;
        if (candidateFreshChecks === overrides.mutateAtCandidateFreshCheck?.call) {
          if (overrides.mutateAtCandidateFreshCheck.owner === 'outline') {
            const current = await outline.read(projectId);
            await outline.save(projectId, { ...current, logline: `${current.logline} changed-at-writer-gate` });
          } else {
            const binding = await baseSceneOutlineBinding.read(projectId);
            await baseSceneOutlineBinding.save(projectId, { sceneId: 'accept-binding-anchor', detailBeatId: 'detail-2', expectedFingerprint: binding.fingerprint });
          }
        }
        return baseSceneOutlineBinding.assertCandidateTargetFresh(projectId, snapshot);
      },
    };
  let acceptMutationInjected = false;
  const llm = fakeLlm(seen, {
    ...overrides,
    beforeAnalysis: async (phase) => {
      if (acceptMutationInjected || phase !== overrides.mutateAcceptPhase || overrides.mutateAcceptOwner === undefined) return;
      acceptMutationInjected = true;
      if (overrides.mutateAcceptOwner === 'outline') {
        const current = await outline.read('demo');
        await outline.save('demo', { ...current, logline: `${current.logline} changed-during-${phase}` });
      } else {
        const binding = await sceneOutlineBinding.read('demo');
        await sceneOutlineBinding.save('demo', { sceneId: 'accept-binding-anchor', detailBeatId: 'detail-2', expectedFingerprint: binding.fingerprint });
      }
    },
  });
  const consistency = createConsistencyDetectionService(llm);
  const knowledgeLeak = createKnowledgeLeakDetectionService(llm);
  const relationshipStyle = createRelationshipStyleDetectionService(llm);
  const calls = { c5: 0, writers: [] as string[] };
  const service = createWritingAdjudicationService({
    llm,
    projectsRoot: root,
    context,
    sceneOutlineBinding,
    textMutation: {
      async createSceneMutation(projectId, input) {
        calls.c5 += 1;
        await overrides.beforeC5?.();
        const injectedFailures = typeof overrides.failC5 === 'number' ? overrides.failC5 : (overrides.failC5 ? 1 : 0);
        if (calls.c5 <= injectedFailures) throw new Error('injected last-moment C5 race');
        return text.createSceneMutation(projectId, input);
      },
    },
    state: trackMethod(state, 'transaction', calls.writers, 'c2', () => overrides.beforeWriter?.('c2') ?? Promise.resolve()),
    relationship: trackMethod(relationship, 'saveAll', calls.writers, 'c1', () => overrides.beforeWriter?.('c1') ?? Promise.resolve()),
    knowledge: trackMethod(knowledge, 'saveAll', calls.writers, 'c3', () => overrides.beforeWriter?.('c3') ?? Promise.resolve()),
    canon: trackMethod(canon, 'append', calls.writers, 'c4', () => overrides.beforeWriter?.('c4') ?? Promise.resolve()),
    worldview,
    confirmation: trackMethod(confirmation, 'propose', calls.writers, 'b2', () => overrides.beforeWriter?.('b2') ?? Promise.resolve()),
    rules, style,
    consistency, knowledgeLeak, relationshipStyle,
    resolveSettings: async () => settings,
  });
  void project;
  return {
    service, root, seen, calls,
    services: { characters, worldview, outline, relationship, state, canon, confirmation, style, rules, knowledge, text, sceneOutlineBinding },
  };
}

/** 六层就绪的演示作品（与 agent-tools 测试同构；复用 setup 的同一批服务实例）。 */
async function seedProject(root: string, services: Setup['services'], projectId: string, withChapter = true): Promise<void> {
  const { characters, worldview, outline, relationship, state, canon, confirmation, style, rules, knowledge, text } = services;
  const project = createProjectService(root, { characters, worldview, outline, relationship, state, canon, confirmation });
  await project.createProject({ projectId, name: '演示作品' });
  await project.openProject(projectId);
  await characters.create(projectId, {
    id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '追查真相',
    goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [],
    arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [],
  });
  await worldview.create(projectId, {
    id: 'north-harbor', kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港'],
    triggerMode: 'keyword', weight: 1, parent: null, mutable: true, status: 'active', supersededBy: null,
  });
  await outline.save(projectId, {
    id: 'outline-demo', structure: 'three-act', logline: '一名测绘师追查灯塔守夜人失踪之谜。', themes: ['追查'],
    acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '接受委托', beats: [{ id: 'beat-1', title: '午夜旧灯塔', description: '米拉在旧灯塔发现线索。', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [
      { id: 'detail-1', title: '发现海图', summary: '米拉发现半张烧焦海图', pov: 'mira', wordTarget: 20, points: ['发现海图'], status: 'writing' },
      { id: 'detail-2', title: '追踪潮痕', summary: '米拉追踪潮痕', pov: 'mira', wordTarget: 20, points: ['追踪'], status: 'planned' },
    ] }] }],
    foreshadowing: [], endings: [],
  });
  await outline.saveProgress(projectId, { outlineId: 'outline-demo', currentAct: 'act-1', currentBeat: 'beat-1', completedBeats: [], deviations: [], tensionLevel: 0 });
  await state.open(projectId, INITIAL_STATE);
  await canon.open(projectId);
  await style.open(projectId);
  await style.save(projectId, {
    id: 'style-demo', name: '默认', person: 'third-limited', tense: 'past', povScope: 'single',
    tone: '克制', proseStyle: '简洁', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [],
  });
  await rules.open(projectId);
  await rules.create(projectId, { id: 'rule-1', scope: 'global', kind: 'physics', statement: '旧灯塔的海图只会在月圆之夜显字。', priority: 1, immutable: true, examples: [], active: true });
  await knowledge.open(projectId);
  await knowledge.saveAll(projectId, [], [{ characterId: 'mira', knows: [] }]);
  await confirmation.open(projectId);
  await text.open(projectId);
  if (withChapter) {
    await text.createChapter(projectId, { id: 'chapter-main', index: 1, title: '正文', pov: 'mira', status: 'draft' });
  }
}

/** 项目目录全文件快照（相对路径 + 内容哈希），用于零写断言。 */
function snapshotDir(dir: string): string {
  const entries: string[] = [];
  const walk = (d: string): void => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const path = join(d, entry.name);
      if (entry.isDirectory()) walk(path);
      else entries.push(path);
    }
  };
  walk(dir);
  return entries.sort().map((p) => `${relative(dir, p)}\u0000${createHash('sha256').update(readFileSync(p, 'utf8'), 'utf8').digest('hex')}`).join('\n');
}

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe('I63 候选预览与生成后裁决（writing adjudication）', () => {
  it('continue 候选零写；preview 显示新场景 diff 与 pass 校验；accept 进入标准生命周期并受控写回；重复 accept 幂等', async () => {
    const { service, root, seen, services } = await setup();
    roots.push(root);
    await seedProject(root, services, 'demo');
    const before = snapshotDir(join(root, 'demo'));
    await service.open('demo');

    const { candidate } = await service.propose('demo', { intent: 'continue' });
    expect(candidate.intent).toBe('continue');
    expect(candidate.target.chapterId).toBe('chapter-main');
    expect(candidate.target.sceneId).toMatch(/^scene-/);
    // 只产候选：项目全层文件哈希不变。
    expect(snapshotDir(join(root, 'demo'))).toBe(before);

    // 审阅：正文 + diff（新场景）+ 校验结果（pass）。
    const review = await service.preview(candidate.id);
    expect(review.text).toBe('米拉在码头找到铜钥匙。');
    expect(review.diff).toEqual({ kind: 'new-scene' });
    expect(review.validation.status).toBe('pass');
    expect(seen.some((prompt) => prompt.includes('你是小说一致性硬约束检测器'))).toBe(true);

    // accept：标准校验 → 解析 → 受控写回（C2 状态 + C4 正史 + C5 文本）。
    const outcome = await service.adjudicate(candidate.id, 'accept');
    expect(outcome.status).toBe('written');
    if (outcome.status !== 'written') return;
    expect(outcome.layers).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']);
    expect(services.state.current('demo').storyTime).toBe('dawn');
    expect(services.canon.query('demo').map((entry) => entry.id)).toEqual(['evt-1']);
    const chapters = await services.text.listChapters('demo');
    expect(chapters).toHaveLength(1);
    expect(chapters[0].scenes).toHaveLength(1);
    expect(chapters[0].scenes[0].content).toBe('米拉在码头找到铜钥匙。');

    // 双击幂等：重复 accept 返回首次落地结果，不重复写。
    const again = await service.adjudicate(candidate.id, 'accept');
    expect(again.status).toBe('written');
    expect((await services.text.listChapters('demo'))[0].scenes).toHaveLength(1);
    expect(services.canon.query('demo')).toHaveLength(1);
  });

  it('C5 CAS failure keeps a process-local frozen landing plan; retry accept resumes only C5 and preserves public written outcome', async () => {
    const { service, root, seen, calls, services } = await setup({ failC5: true });
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');
    const { candidate } = await service.proposeAt('demo', { intent: 'continue', chapterId: 'chapter-main', sceneId: 'retry-c5' });

    await expect(service.adjudicate(candidate.id, 'accept')).rejects.toThrow(/compensation is required.*Retry accept.*resume C5 only/);
    expect(calls.writers).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']);
    expect(calls.c5).toBe(1);
    expect(seen).toHaveLength(9); // generation + 3 detectors + 5 parsers
    expect(services.state.current('demo').storyTime).toBe('dawn');
    expect(services.canon.query('demo')).toHaveLength(1);

    const outcome = await service.adjudicate(candidate.id, 'accept');
    expect(outcome).toMatchObject({ status: 'written', candidateId: candidate.id, scene: { sceneId: 'retry-c5' } });
    expect(calls.writers).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']);
    expect(calls.c5).toBe(2);
    expect(seen).toHaveLength(9);
    expect(services.canon.query('demo')).toHaveLength(1);
    expect((await services.text.readChapter('demo', 'chapter-main')).scenes).toHaveLength(1);
    expect(await service.adjudicate(candidate.id, 'accept')).toBe(outcome);
    expect(calls.c5).toBe(2);
    expect(seen).toHaveLength(9);
  });

  it('keeps repeated C5 failures retryable without replaying structured work', async () => {
    const { service, root, seen, calls, services } = await setup({ failC5: 2 });
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');
    const { candidate } = await service.proposeAt('demo', { intent: 'continue', chapterId: 'chapter-main', sceneId: 'retry-c5-twice' });

    await expect(service.adjudicate(candidate.id, 'accept')).rejects.toThrow(/resume C5 only/);
    await expect(service.adjudicate(candidate.id, 'accept')).rejects.toThrow(/resume C5 only/);
    expect((await service.adjudicate(candidate.id, 'accept')).status).toBe('written');
    expect(calls.writers).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']);
    expect(calls.c5).toBe(3);
    expect(seen).toHaveLength(9);
  });

  it('serializes overlapping accepts and returns the same cached result with one lifecycle/C5 write', async () => {
    const enteredC5 = deferred();
    const releaseC5 = deferred();
    const { service, root, seen, calls, services } = await setup({
      beforeC5: async () => { enteredC5.resolve(); await releaseC5.promise; },
    });
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');
    const { candidate } = await service.proposeAt('demo', { intent: 'continue', chapterId: 'chapter-main', sceneId: 'concurrent-accept' });

    const first = service.adjudicate(candidate.id, 'accept');
    await enteredC5.promise;
    const second = service.adjudicate(candidate.id, 'accept');
    releaseC5.resolve();
    const [left, right] = await Promise.all([first, second]);

    expect(left).toBe(right);
    expect(calls.writers).toEqual(['c2', 'c1', 'c3', 'c4', 'b2']);
    expect(calls.c5).toBe(1);
    expect(seen).toHaveLength(9);
  });

  it('serializes different same-project accepts through one lifecycle lane and preserves both journal outcomes', async () => {
    const firstWriterEntered = deferred();
    const releaseFirstWriter = deferred();
    let activeWriters = 0;
    let maxWriterConcurrency = 0;
    let writerCalls = 0;
    const { service, root, calls, services } = await setup({
      emptyParserOps: true,
      beforeWriter: async () => {
        activeWriters += 1;
        maxWriterConcurrency = Math.max(maxWriterConcurrency, activeWriters);
        writerCalls += 1;
        if (writerCalls === 1) {
          firstWriterEntered.resolve();
          await releaseFirstWriter.promise;
        }
        activeWriters -= 1;
      },
    });
    roots.push(root);
    await seedProject(root, services, 'demo', false);
    await services.text.createChapter('demo', { id: 'chapter-main', index: 1, title: '正文', pov: 'mira', status: 'draft' });
    await services.text.appendScene('demo', 'chapter-main', { id: 'scene-left', content: '左场景。', summary: '', beats: [], canonEvents: [], notes: '' });
    await services.text.appendScene('demo', 'chapter-main', { id: 'scene-right', content: '右场景。', summary: '', beats: [], canonEvents: [], notes: '' });
    await service.open('demo');
    const left = await service.propose('demo', { intent: 'rewrite', chapterId: 'chapter-main', sceneId: 'scene-left', prompt: '改写左场景' });
    const right = await service.propose('demo', { intent: 'rewrite', chapterId: 'chapter-main', sceneId: 'scene-right', prompt: '改写右场景' });

    const first = service.adjudicate(left.candidate.id, 'accept');
    await firstWriterEntered.promise;
    const second = service.adjudicate(right.candidate.id, 'accept');
    await new Promise((resolve) => { setTimeout(resolve, 25); });
    expect(maxWriterConcurrency).toBe(1);
    releaseFirstWriter.resolve();
    const outcomes = await Promise.all([first, second]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual(['written', 'written']);
    expect(maxWriterConcurrency).toBe(1);
    expect(calls.writers).toHaveLength(8);
    const journal = await readYaml<{ entries: Array<{ id: string; status: string; committedStages: string[] }> }>(join(root, 'demo', 'lifecycle-journal.yaml'));
    expect(journal.entries.map((entry) => entry.id)).toEqual([
      `w-${left.candidate.id}-1`,
      `w-${right.candidate.id}-1`,
    ]);
    expect(journal.entries.every((entry) => entry.status === 'written' && entry.committedStages.length === 5)).toBe(true);
  });

  it('keeps different-project adjudication lanes parallel', async () => {
    const entered = [deferred(), deferred()];
    const release = deferred();
    let activeWriters = 0;
    let maxWriterConcurrency = 0;
    let writerCalls = 0;
    const { service, root, services } = await setup({
      emptyParserOps: true,
      beforeWriter: async () => {
        activeWriters += 1;
        maxWriterConcurrency = Math.max(maxWriterConcurrency, activeWriters);
        const index = writerCalls++;
        entered[index]?.resolve();
        if (index < 2) await release.promise;
        activeWriters -= 1;
      },
    });
    roots.push(root);
    for (const projectId of ['left-project', 'right-project']) {
      await seedProject(root, services, projectId, false);
      await services.text.createChapter(projectId, { id: 'chapter-main', index: 1, title: '正文', pov: 'mira', status: 'draft' });
      await services.text.appendScene(projectId, 'chapter-main', { id: 'scene-main', content: `${projectId} 正文。`, summary: '', beats: [], canonEvents: [], notes: '' });
      await service.open(projectId);
    }
    const left = await service.propose('left-project', { intent: 'rewrite', chapterId: 'chapter-main', sceneId: 'scene-main', prompt: '改写' });
    const right = await service.propose('right-project', { intent: 'rewrite', chapterId: 'chapter-main', sceneId: 'scene-main', prompt: '改写' });

    const outcomes = Promise.all([
      service.adjudicate(left.candidate.id, 'accept'),
      service.adjudicate(right.candidate.id, 'accept'),
    ]);
    await Promise.all(entered.map((gate) => gate.promise));
    expect(maxWriterConcurrency).toBe(2);
    release.resolve();
    expect((await outcomes).map((outcome) => outcome.status)).toEqual(['written', 'written']);
  });

  it('serializes overlapping rewrites so one successor is generated and the second fails superseded', async () => {
    const enteredGeneration = deferred();
    const releaseGeneration = deferred();
    const { service, root, seen, services } = await setup({
      beforeGeneration: async (call) => {
        if (call === 2) { enteredGeneration.resolve(); await releaseGeneration.promise; }
      },
    });
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');
    const { candidate } = await service.proposeAt('demo', { intent: 'scene-card', chapterId: 'chapter-main', sceneId: 'concurrent-rewrite' });

    const first = service.adjudicate(candidate.id, 'rewrite');
    await enteredGeneration.promise;
    const second = service.adjudicate(candidate.id, 'rewrite');
    releaseGeneration.resolve();
    const successor = await first;
    await expect(second).rejects.toThrow(/already superseded/);

    expect(successor.status).toBe('rewritten');
    expect(seen).toHaveLength(2);
  });

  it('rewrite 候选绑定 sourceHash；preview 显示替换 diff；accept 替换既有场景全文并保留旧正文为分支', async () => {
    const { service, root, services } = await setup();
    roots.push(root);
    await seedProject(root, services, 'demo', false);
    await services.text.createChapter('demo', { id: 'chapter-1', index: 1, title: '正文', pov: 'mira', status: 'draft' });
    await services.text.appendScene('demo', 'chapter-1', { id: 'scene-1', content: '原场景正文。', summary: '相遇', beats: ['beat-1'], canonEvents: [], notes: '' });
    await service.open('demo');

    const { candidate } = await service.propose('demo', { intent: 'rewrite', chapterId: 'chapter-1', sceneId: 'scene-1', prompt: '把这段改得更有悬念。' });
    expect(candidate.target.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    const review = await service.preview(candidate.id);
    expect(review.diff).toEqual({ kind: 'replace', before: '原场景正文。', after: '米拉在码头找到铜钥匙。' });

    const outcome = await service.adjudicate(candidate.id, 'accept');
    expect(outcome.status).toBe('written');
    if (outcome.status !== 'written') return;
    const chapter = await services.text.readChapter('demo', 'chapter-1');
    expect(chapter.scenes).toHaveLength(1);
    // I70/R14-5：候选可保留为分支 —— 旧正文保留为非 chosen 分支，新正文成为唯一 chosen。
    const scene = chapter.scenes[0];
    expect(scene.content).toBe('米拉在码头找到铜钥匙。');
    expect(scene.branches).toHaveLength(2);
    const [previous, current] = scene.branches;
    expect(previous.content).toBe('原场景正文。');
    expect(previous.chosen).toBe(false);
    expect(current.content).toBe('米拉在码头找到铜钥匙。');
    expect(current.chosen).toBe(true);
    // 可逆回切：choose 旧分支逐字还原（只写 C5，不改结构层）。
    const repository = new TextRepository(join(root, 'demo'));
    await repository.open();
    const switched = await repository.chooseSceneBranch('chapter-1', 'scene-1', previous.id);
    expect(switched.content).toBe('原场景正文。');
    expect(services.canon.query('demo').map((entry) => entry.id)).toEqual(['evt-1']);
    expect(services.state.current('demo').storyTime).toBe('dawn');
  });

  it('reject 零写且幂等；rejected 之后 accept 失败', async () => {
    const { service, root, services } = await setup();
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');
    const before = snapshotDir(join(root, 'demo'));

    const { candidate } = await service.propose('demo', { intent: 'continue' });
    await service.preview(candidate.id);
    const outcome = await service.adjudicate(candidate.id, 'reject');
    expect(outcome).toEqual({ status: 'rejected', candidateId: candidate.id });
    expect(snapshotDir(join(root, 'demo'))).toBe(before);
    // 重复 reject 幂等（零写路径可重复触发）。
    expect((await service.adjudicate(candidate.id, 'reject')).status).toBe('rejected');
    // rejected 之后 accept 失败（须 rewrite 后继）。
    await expect(service.adjudicate(candidate.id, 'accept')).rejects.toThrow(/already rejected/);
  });

  it('rewrite 产生后继候选；旧候选不可静默接受；后继可正常 accept', async () => {
    const { service, root, services } = await setup();
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');

    const { candidate } = await service.propose('demo', { intent: 'continue' });
    const outcome = await service.adjudicate(candidate.id, 'rewrite');
    expect(outcome.status).toBe('rewritten');
    if (outcome.status !== 'rewritten') return;
    expect(outcome.candidate.id).not.toBe(candidate.id);
    // 旧候选不可静默接受 / 拒绝。
    await expect(service.adjudicate(candidate.id, 'accept')).rejects.toThrow(/superseded/);
    await expect(service.adjudicate(candidate.id, 'reject')).rejects.toThrow(/superseded/);
    // 后继候选可正常审阅与接受。
    const successorReview = await service.preview(outcome.candidate.id);
    expect(successorReview.validation.status).toBe('pass');
    const accepted = await service.adjudicate(outcome.candidate.id, 'accept');
    expect(accepted.status).toBe('written');
  });

  it('正文变化后旧候选 stale：accept 拒绝且零写（脏文本保护）', async () => {
    const { service, root, services } = await setup();
    roots.push(root);
    await seedProject(root, services, 'demo', false);
    await services.text.createChapter('demo', { id: 'chapter-1', index: 1, title: '正文', pov: 'mira', status: 'draft' });
    await services.text.appendScene('demo', 'chapter-1', { id: 'scene-1', content: '原场景正文。', summary: '相遇', beats: ['beat-1'], canonEvents: [], notes: '' });
    await service.open('demo');

    const { candidate } = await service.propose('demo', { intent: 'rewrite', chapterId: 'chapter-1', sceneId: 'scene-1', prompt: '改写。' });
    // 模拟作者在候选生成后修改了正文（源正文变化 → 候选过期）。
    const repository = new TextRepository(join(root, 'demo'));
    await repository.open();
    await repository.replaceRange('chapter-1', 'scene-1', { start: 0, end: '原场景正文。'.length }, '作者手动修改后的正文。');
    await expect(service.adjudicate(candidate.id, 'accept')).rejects.toThrow(/stale/);
    const chapter = await services.text.readChapter('demo', 'chapter-1');
    expect(chapter.scenes[0].content).toBe('作者手动修改后的正文。');
  });

  it('硬违规候选 preview 显示 reject；accept 进入标准校验门被拦（generation-rejected 零写）', async () => {
    const { service, root, services } = await setup({ hard: [{ kind: 'immutable-rule', severity: 'hard', message: '正文违反不可变规则。', references: ['rule-1'] }] });
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');

    const { candidate } = await service.propose('demo', { intent: 'continue' });
    const review = await service.preview(candidate.id);
    expect(review.validation.status).toBe('reject');
    const outcome = await service.adjudicate(candidate.id, 'accept');
    expect(outcome.status).toBe('generation-rejected');
    // 零写：无章节、无结构化层写入。
    expect((await services.text.listChapters('demo'))[0].scenes).toHaveLength(0);
    expect(services.state.current('demo').storyTime).toBe('');
    expect(services.canon.query('demo')).toHaveLength(0);
  });

  it('I105 proposeAt freezes the chosen existing chapter/unoccupied scene and rejects unknown, occupied, and reserved targets before generation', async () => {
    const { service, root, seen, services } = await setup();
    roots.push(root);
    await seedProject(root, services, 'demo');
    await services.text.createChapter('demo', { id: 'chapter-other', index: 2, title: 'Other', pov: 'mira', status: 'draft' });
    await services.text.appendScene('demo', 'chapter-other', { id: 'occupied-anywhere', content: 'x', summary: '', beats: [], canonEvents: [], notes: '' });
    await service.open('demo');

    const { candidate } = await service.proposeAt('demo', { intent: 'continue', chapterId: 'chapter-main', sceneId: 'chosen-scene' });
    expect(candidate.target).toEqual({ projectId: 'demo', chapterId: 'chapter-main', sceneId: 'chosen-scene' });
    const landed = await service.adjudicate(candidate.id, 'accept');
    expect(landed).toMatchObject({ status: 'written', scene: { chapterId: 'chapter-main', sceneId: 'chosen-scene' } });
    const generatedCalls = seen.length;
    await expect(service.proposeAt('demo', { intent: 'continue', chapterId: 'missing', sceneId: 'new-scene' })).rejects.toThrow(/Unknown chapter/);
    expect((await services.text.listChapters('demo')).some((chapter) => chapter.id === 'missing')).toBe(false);
    await expect(service.proposeAt('demo', { intent: 'continue', chapterId: 'chapter-main', sceneId: 'occupied-anywhere' })).rejects.toThrow(/already exists/);
    await expect(service.proposeAt('demo', {
      intent: 'continue', chapterId: 'chapter-main', sceneId: stableSceneId('act-1', 'beat-1', 'detail-2'),
    })).rejects.toThrow(/reserved for a different detail beat/);
    expect(seen).toHaveLength(generatedCalls);
  });

  it('I105 rejects an outline change between context assembly and target capture before generation', async () => {
    const { service, root, seen, services } = await setup({ mutateOutlineAfterContext: true });
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');
    await expect(service.proposeAt('demo', { intent: 'continue', chapterId: 'chapter-main', sceneId: 'mixed-context-target' }))
      .rejects.toThrow(/Candidate context changed before target capture/);
    expect(seen).toHaveLength(0);
  });

  it('I105 rejects a C5 mutation during initial new-scene context assembly before generation', async () => {
    const { service, root, seen, services } = await setup({ mutateTextAfterContextCall: 1 });
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');
    await expect(service.proposeAt('demo', { intent: 'continue', chapterId: 'chapter-main', sceneId: 'mixed-c5-context' }))
      .rejects.toThrow(/Candidate context changed before target capture/);
    expect(seen).toHaveLength(0);
  });

  for (const owner of ['text', 'outline', 'binding'] as const) {
    it(`I105 rejects a ${owner} fingerprint change during capture before generation`, async () => {
      const { service, root, seen, services } = await setup({ captureRaceOwner: owner });
      roots.push(root);
      await seedProject(root, services, 'demo');
      await service.open('demo');
      await expect(service.proposeAt('demo', {
        intent: 'continue', chapterId: 'chapter-main', sceneId: `capture-race-${owner}`,
      })).rejects.toThrow(/Candidate target owners changed during capture/);
      expect(seen).toHaveLength(0);
    });
  }

  it('I105 legacy propose supports explicit or exactly-one-chapter targets and rejects zero/multi/partial targets with proposeAt guidance', async () => {
    const first = await setup();
    roots.push(first.root);
    await seedProject(first.root, first.services, 'one');
    await first.service.open('one');
    const derived = await first.service.propose('one', { intent: 'continue' });
    expect(derived.candidate.target.chapterId).toBe('chapter-main');
    const explicit = await first.service.propose('one', { intent: 'scene-card', chapterId: 'chapter-main', sceneId: 'legacy-explicit' });
    expect(explicit.candidate.target.sceneId).toBe('legacy-explicit');
    await expect(first.service.propose('one', { intent: 'continue', chapterId: 'chapter-main' })).rejects.toThrow(/both chapterId and sceneId.*proposeAt/);

    const zero = await setup();
    roots.push(zero.root);
    await seedProject(zero.root, zero.services, 'zero', false);
    await zero.service.open('zero');
    await expect(zero.service.propose('zero', { intent: 'continue' })).rejects.toThrow(/found 0.*proposeAt/);

    const multi = await setup();
    roots.push(multi.root);
    await seedProject(multi.root, multi.services, 'multi');
    await multi.services.text.createChapter('multi', { id: 'chapter-second', index: 2, title: 'Second', pov: 'mira', status: 'draft' });
    await multi.service.open('multi');
    await expect(multi.service.propose('multi', { intent: 'continue' })).rejects.toThrow(/found 2.*proposeAt/);
  });

  for (const phase of ['preview', 'accept'] as const) {
    for (const owner of ['text', 'outline', 'binding'] as const) {
      it(`I105 ${owner} fingerprint stale at ${phase} rejects before downstream LLM/parser/write`, async () => {
        const { service, root, seen, services } = await setup();
        roots.push(root);
        await seedProject(root, services, 'demo');
        if (owner === 'binding') {
          await services.text.appendScene('demo', 'chapter-main', { id: 'binding-anchor', content: '', summary: '', beats: [], canonEvents: [], notes: '' });
        }
        await service.open('demo');
        const targetSceneId = `target-${owner}-${phase}`;
        const { candidate } = await service.proposeAt('demo', { intent: 'continue', chapterId: 'chapter-main', sceneId: targetSceneId });
        const callsBeforeStaleAction = seen.length;

        if (owner === 'text') {
          const expectedFingerprint = await services.text.projectFingerprint('demo');
          await services.text.updateChapterMutation('demo', { chapterId: 'chapter-main', patch: { title: 'Changed' }, expectedFingerprint });
        } else if (owner === 'outline') {
          const current = await services.outline.read('demo');
          await services.outline.save('demo', { ...current, logline: `${current.logline} changed` });
        } else {
          const binding = await services.sceneOutlineBinding.read('demo');
          await services.sceneOutlineBinding.save('demo', { sceneId: 'binding-anchor', detailBeatId: 'detail-2', expectedFingerprint: binding.fingerprint });
        }

        const action = phase === 'preview'
          ? service.preview(candidate.id)
          : service.adjudicate(candidate.id, 'accept');
        await expect(action).rejects.toThrow(/Stale candidate target/);
        expect(seen).toHaveLength(callsBeforeStaleAction);
        expect(services.state.current('demo').storyTime).toBe('');
        expect(services.canon.query('demo')).toHaveLength(0);
        expect((await services.text.readChapter('demo', 'chapter-main')).scenes.some((scene) => scene.id === targetSceneId)).toBe(false);
      });
    }
  }

  for (const owner of ['outline', 'binding'] as const) {
    for (const phase of ['detector', 'parser'] as const) {
      it(`I105 accept recaptures ${owner} freshness after async ${phase} work before lifecycle layer writes`, async () => {
        const { service, root, calls, services } = await setup({ mutateAcceptOwner: owner, mutateAcceptPhase: phase });
        roots.push(root);
        await seedProject(root, services, 'demo');
        if (owner === 'binding') {
          await services.text.appendScene('demo', 'chapter-main', { id: 'accept-binding-anchor', content: '', summary: '', beats: [], canonEvents: [], notes: '' });
        }
        await service.open('demo');
        const targetSceneId = `accept-race-${owner}-${phase}`;
        const { candidate } = await service.proposeAt('demo', {
          intent: 'continue', chapterId: 'chapter-main', sceneId: targetSceneId,
        });

        await expect(service.adjudicate(candidate.id, 'accept')).rejects.toThrow(/Stale candidate target/);
        expect(calls.writers).toEqual([]);
        expect(calls.c5).toBe(0);
        expect(services.state.current('demo').storyTime).toBe('');
        expect(services.canon.query('demo')).toHaveLength(0);
        expect((await services.text.readChapter('demo', 'chapter-main')).scenes.some((scene) => scene.id === targetSceneId)).toBe(false);
      });
    }
  }

  it('I105 first real layer write gate rejects a change after pre-execute freshness and leaves zero layer/C5 writes', async () => {
    const { service, root, calls, services } = await setup({
      mutateAtCandidateFreshCheck: { owner: 'outline', call: 3 },
    });
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');
    const { candidate } = await service.proposeAt('demo', {
      intent: 'continue', chapterId: 'chapter-main', sceneId: 'writer-gate-race',
    });

    const outcome = await service.adjudicate(candidate.id, 'accept');
    expect(outcome).toMatchObject({ status: 'pending-compensation', failedStage: 'c2' });
    expect(calls.writers).toEqual([]);
    expect(calls.c5).toBe(0);
    expect(services.state.current('demo').storyTime).toBe('');
    expect(services.canon.query('demo')).toHaveLength(0);
    expect((await services.text.readChapter('demo', 'chapter-main')).scenes.some((scene) => scene.id === 'writer-gate-race')).toBe(false);
    const journal = await readYaml<{ entries: Array<{ id: string; status: string; committedStages: string[]; failedStage?: string }> }>(join(root, 'demo', 'lifecycle-journal.yaml'));
    expect(journal.entries).toEqual([expect.objectContaining({
      id: `w-${candidate.id}-1`, status: 'pending-compensation', committedStages: [], failedStage: 'c2',
    })]);
  });

  it('I105 new-scene repropose rejects an outline mutation during rebuilt context assembly before generation', async () => {
    const { service, root, seen, services } = await setup({ mutateContextBeforeRepropose: true });
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');
    const { candidate } = await service.proposeAt('demo', {
      intent: 'scene-card', chapterId: 'chapter-main', sceneId: 'fresh-repropose-context',
    });
    expect(seen).toHaveLength(1);

    await expect(service.adjudicate(candidate.id, 'rewrite'))
      .rejects.toThrow(/Candidate context changed before target capture/);
    expect(seen).toHaveLength(1);
  });

  it('I105 shared new-scene preparation rejects a C5 mutation during repropose context assembly before generation', async () => {
    const { service, root, seen, services } = await setup({ mutateTextAfterContextCall: 2 });
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');
    const { candidate } = await service.proposeAt('demo', {
      intent: 'continue', chapterId: 'chapter-main', sceneId: 'mixed-c5-repropose',
    });
    expect(seen).toHaveLength(1);

    await expect(service.adjudicate(candidate.id, 'rewrite'))
      .rejects.toThrow(/Candidate context changed before target capture/);
    expect(seen).toHaveLength(1);
  });

  for (const owner of ['text', 'outline', 'binding'] as const) {
    it(`I105 ${owner} fingerprint stale blocks repropose before generation LLM`, async () => {
      const { service, root, seen, services } = await setup();
      roots.push(root);
      await seedProject(root, services, 'demo');
      if (owner === 'binding') {
        await services.text.appendScene('demo', 'chapter-main', { id: 'binding-anchor', content: '', summary: '', beats: [], canonEvents: [], notes: '' });
      }
      await service.open('demo');
      const { candidate } = await service.proposeAt('demo', { intent: 'continue', chapterId: 'chapter-main', sceneId: `rewrite-target-${owner}` });
      const before = seen.length;
      if (owner === 'text') {
        const fingerprint = await services.text.projectFingerprint('demo');
        await services.text.updateChapterMutation('demo', { chapterId: 'chapter-main', patch: { title: 'stale' }, expectedFingerprint: fingerprint });
      } else if (owner === 'outline') {
        const current = await services.outline.read('demo');
        await services.outline.save('demo', { ...current, logline: `${current.logline} stale` });
      } else {
        const binding = await services.sceneOutlineBinding.read('demo');
        await services.sceneOutlineBinding.save('demo', { sceneId: 'binding-anchor', detailBeatId: 'detail-2', expectedFingerprint: binding.fingerprint });
      }
      await expect(service.adjudicate(candidate.id, 'rewrite')).rejects.toThrow(/Stale candidate target/);
      expect(seen).toHaveLength(before);
    });
  }

  it('I65 registerRecoveredCandidate：队列候选可审阅/裁决/落盘；重复注册幂等；非 scene-card 拒绝', async () => {
    const { service, root, services } = await setup();
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');

    // 手工构造一个 I62 合同候选（模拟队列持久化后 rehydrate；绑定稳定 scene id）。
    const candidate = {
      id: 'cand-queue-recovered-1',
      intent: 'scene-card' as const,
      target: { projectId: 'demo', chapterId: 'chapter-main', sceneId: 'scene-recovered' },
      prompt: '你是长篇小说章节写作器。…',
      text: '米拉在码头找到铜钥匙。',
      chunkCount: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const targetSnapshot = await services.sceneOutlineBinding.captureCandidateTarget('demo', { chapterId: 'chapter-main', sceneId: 'scene-recovered' }, 'detail-1');
    const recovery = {
      card: { id: 'detail-1', title: '发现海图', summary: '米拉发现半张烧焦海图', pov: 'mira', wordTarget: 20, points: ['发现海图'], status: 'writing' as const },
      navigation: { actId: 'act-1', beatId: 'beat-1', title: '午夜旧灯塔', description: 'd', prerequisites: [], prerequisitesMet: true, instruction: 'i', deviationIds: [] },
      settings,
      targetSnapshot,
    };
    // 重复注册幂等（恢复路径可重入，不覆盖、不报错）。
    await service.registerRecoveredCandidate(candidate, recovery);
    await service.registerRecoveredCandidate(candidate, recovery);

    // 可审阅（正文 + diff + 校验结果）→ 可裁决。
    const review = await service.preview(candidate.id);
    expect(review.text).toBe('米拉在码头找到铜钥匙。');
    expect(review.validation.status).toBe('pass');
    const accepted = await service.adjudicate(candidate.id, 'accept');
    expect(accepted.status).toBe('written');
    const chapters = await services.text.listChapters('demo');
    expect(chapters[0].scenes.find((scene) => scene.id === 'scene-recovered')?.content).toBe('米拉在码头找到铜钥匙。');

    // 非 scene-card 意图 fail-closed（不伪造候选入账）。
    const rewriteCandidate = { ...candidate, id: 'cand-queue-recovered-2', intent: 'rewrite' as const, target: { ...candidate.target, sourceHash: 'a'.repeat(64) } };
    await expect(service.registerRecoveredCandidate(rewriteCandidate, recovery)).rejects.toThrow(/scene-card candidates only/);
  });
});
