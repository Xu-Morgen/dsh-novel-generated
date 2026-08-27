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
import { createConsistencyDetectionService } from './consistency-detection-service.js';
import { createKnowledgeLeakDetectionService } from './knowledge-leak-detection-service.js';
import { createRelationshipStyleDetectionService } from './relationship-style-detection-service.js';
import { createNextSceneContextBuilder } from './writing-context.js';
import { createWritingAdjudicationService } from './writing-adjudication-service.js';
import { TextRepository } from '../core/text/index.js';
import { INITIAL_STATE } from '../core/schema/project-lifecycle.js';

const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };

/** Fake DSH `llm.stream` route：生成/探测器/五层解析器按 prompt 前缀分发。 */
function fakeLlm(seen: string[] = [], overrides: { hard?: unknown; leak?: unknown; soft?: unknown } = {}) {
  return {
    async *stream(options: { messages: Array<{ content: Array<{ text: string }> }> }) {
      const prompt = options.messages[0].content[0].text;
      seen.push(prompt);
      let output: unknown;
      if (prompt.includes('你是小说一致性硬约束检测器')) {
        output = { violations: overrides.hard ?? [] };
      } else if (prompt.includes('你是小说 POV 知情泄漏硬约束检测器')) {
        output = { violations: overrides.leak ?? [] };
      } else if (prompt.includes('你是小说一致性软约束检测器')) {
        output = { violations: overrides.soft ?? [] };
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
  service: ReturnType<typeof createWritingAdjudicationService>;
  root: string;
  seen: string[];
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
  };
}

async function setup(overrides: { hard?: unknown } = {}): Promise<Setup> {
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
  const context = createNextSceneContextBuilder({
    outline, characters, worldview, relationship, state, canon, style, rules, knowledge, text,
    workbenchSettings: { load: async () => ({ wordTarget: 800, askWhenThin: true }) },
  });
  const llm = fakeLlm(seen, overrides);
  const consistency = createConsistencyDetectionService(llm);
  const knowledgeLeak = createKnowledgeLeakDetectionService(llm);
  const relationshipStyle = createRelationshipStyleDetectionService(llm);
  const service = createWritingAdjudicationService({
    llm,
    projectsRoot: root,
    context,
    state, relationship, knowledge, canon, worldview, confirmation, rules, style,
    consistency, knowledgeLeak, relationshipStyle,
    resolveSettings: async () => settings,
  });
  void project;
  return {
    service, root, seen,
    services: { characters, worldview, outline, relationship, state, canon, confirmation, style, rules, knowledge, text },
  };
}

/** 六层就绪的演示作品（与 agent-tools 测试同构；复用 setup 的同一批服务实例）。 */
async function seedProject(root: string, services: Setup['services'], projectId: string): Promise<void> {
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
    acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '接受委托', beats: [{ id: 'beat-1', title: '午夜旧灯塔', description: '米拉在旧灯塔发现线索。', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'detail-1', title: '发现海图', summary: '米拉发现半张烧焦海图', pov: 'mira', wordTarget: 20, points: ['发现海图'], status: 'writing' }] }] }],
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
    expect(candidate.target.chapterId).toBe('chapter-1');
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

  it('rewrite 候选绑定 sourceHash；preview 显示替换 diff；accept 替换既有场景全文并保留旧正文为分支', async () => {
    const { service, root, services } = await setup();
    roots.push(root);
    await seedProject(root, services, 'demo');
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
    await seedProject(root, services, 'demo');
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
    expect(await services.text.listChapters('demo')).toHaveLength(0);
    expect(services.state.current('demo').storyTime).toBe('');
    expect(services.canon.query('demo')).toHaveLength(0);
  });

  it('I65 registerRecoveredCandidate：队列候选可审阅/裁决/落盘；重复注册幂等；非 scene-card 拒绝', async () => {
    const { service, root, services } = await setup();
    roots.push(root);
    await seedProject(root, services, 'demo');
    await service.open('demo');

    // 手工构造一个 I62 合同候选（模拟队列持久化后 rehydrate；绑定稳定 scene id）。
    const candidate = {
      id: 'cand-queue-recovered-1',
      intent: 'scene-card' as const,
      target: { projectId: 'demo', chapterId: 'chapter-1', sceneId: 'scene-recovered' },
      prompt: '你是长篇小说章节写作器。…',
      text: '米拉在码头找到铜钥匙。',
      chunkCount: 1,
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const recovery = {
      card: { id: 'detail-1', title: '发现海图', summary: '米拉发现半张烧焦海图', pov: 'mira', wordTarget: 20, points: ['发现海图'], status: 'writing' as const },
      navigation: { actId: 'act-1', beatId: 'beat-1', title: '午夜旧灯塔', description: 'd', prerequisites: [], prerequisitesMet: true, instruction: 'i', deviationIds: [] },
      settings,
    };
    // 重复注册幂等（恢复路径可重入，不覆盖、不报错）。
    service.registerRecoveredCandidate(candidate, recovery);
    service.registerRecoveredCandidate(candidate, recovery);

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
    expect(() => service.registerRecoveredCandidate(rewriteCandidate, recovery)).toThrow(/scene-card candidates only/);
  });
});
