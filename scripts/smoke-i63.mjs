import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I63 候选预览与生成后裁决 smoke（design §14.9「候选优先」/ R13-4）。
 *
 * 交付物核验：
 * - 构建产物（lib）：core/candidate/adjudication（幂等裁决账本）、
 *   host/writing-adjudication-service（propose/preview/adjudicate）、
 *   host/remote/writing（novelWriting Remote）存在且导出关键符号。
 * - 源码：writing-adjudication-service 复用 I30 executeLifecycle / I25–I29 真实解析器 /
 *   I17 候选服务，不复制既有实现；agent-tools 退役 novel_continue 的 decision=accept
 *   （旧预先接受产品入口零引用），新增 novel_adjudicate；index.ts 装配
 *   novelWritingAdjudication（Fiber 归属）。
 * - Host 行为（lib）：fake backend 消费者夹具走完整裁决闭环：
 *   propose（零写）→ preview（正文+diff+校验结果）→ accept（标准生命周期受控写回）/
 *   reject（零写）/ rewrite（后继候选 + 旧候选不可静默接受）；双击幂等；正文变化后
 *   旧候选 stale 拒绝落地；C5/docs 派生镜像随 accept 更新。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I63 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  for (const file of ['lib/core/candidate/adjudication.js', 'lib/host/writing-adjudication-service.js', 'lib/host/remote/writing.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const ledger = read('lib/core/candidate/adjudication.js');
  for (const symbol of ['CandidateAdjudicationLedger', 'accept', 'reject', 'supersede', 'requirePending']) {
    if (!ledger.includes(symbol)) fail(`lib adjudication ledger missing ${symbol}`);
  }
  // I79 拆分后：组合根只持 API 编排面；落地 saga 段（landing-saga.js）持解析 fan-out
  // 与 I30 executeLifecycle 复用符号。
  const service = read('lib/host/writing-adjudication-service.js');
  for (const symbol of ['createWritingAdjudicationService', 'propose', 'preview', 'adjudicate']) {
    if (!service.includes(symbol)) fail(`lib writing service missing ${symbol}`);
  }
  const saga = read('lib/host/writing-adjudication/landing-saga.js');
  for (const symbol of ['executeLifecycle', 'parseC2StateFromNarrative', 'parseC1RelationshipsFromNarrative', 'parseC3KnowledgeFromNarrative', 'parseC4CanonFromNarrative', 'parseB2WorldviewFromNarrative']) {
    if (!saga.includes(symbol)) fail(`lib landing-saga missing ${symbol}`);
  }
}

// Part 2 — 源码：复用而非复制 + 旧预先接受入口退役 + 装配（I79 拆分后按段校验）。
{
  const service = read('src/host/writing-adjudication-service.ts');
  const production = read('src/host/writing-adjudication/candidate-production.ts');
  const saga = read('src/host/writing-adjudication/landing-saga.ts');
  const ledger = read('src/core/candidate/adjudication.ts');
  const agent = read('src/agents/agent-tools.ts');
  const index = read('src/index.ts') + read('src/host/composition/base.ts') + read('src/host/composition/management.ts') + read('src/host/composition/orchestration.ts');
  const writingContext = read('src/host/writing-context.ts');
  // 复用 I30/I25–I29/I17，不复制既有 prompt 文案与解析实现（I79 拆段后符号落在
  // 对应段模块；组合根只做编排）。
  for (const reuse of ['executeLifecycle', 'parseC2StateFromNarrative', 'parseC4CanonFromNarrative']) {
    if (!saga.includes(reuse)) fail(`landing-saga must reuse ${reuse}`);
  }
  if (!production.includes('createWritingCandidateService')) fail('candidate-production must reuse createWritingCandidateService (I17)');
  for (const file of [service, saga, production, read('src/host/writing-adjudication/validation-projection.ts')]) {
    for (const copied of ['你是长篇小说续写 agent', '你是小说世界状态解析器']) {
      if (file.includes(copied)) fail(`writing service copies an existing prompt body: ${copied}`);
    }
  }
  // 幂等裁决状态机冻结。
  for (const symbol of ['superseded', 'supersede', 'requirePending', 'duplicate']) {
    if (!ledger.includes(symbol)) fail(`adjudication ledger missing ${symbol}`);
  }
  // 旧预先接受产品入口零引用：novel_continue 只产候选（无 decision 参数、无落盘语义）；
  // agent-tools 不再引用 continuation-service / continueScene；新增 novel_adjudicate。
  if (agent.includes('continueScene')) fail('agent-tools still exposes the retired continueScene pre-accept method');
  if (agent.includes('continuation-service') || agent.includes('createContinuationService')) {
    fail('agent-tools still wires the retired continuation engine');
  }
  const continueDef = agent.slice(agent.indexOf("name: 'novel_continue'"), agent.indexOf("name: 'novel_adjudicate'"));
  if (!continueDef.includes('只产生可审阅候选（零写')) fail('novel_continue must be candidate-only (zero write)');
  if (continueDef.includes('decision')) {
    fail('novel_continue still exposes the retired decision=accept write path');
  }
  if (!agent.includes('novel_adjudicate') || !agent.includes('writing: NovelWritingAdjudicationService')) {
    fail('agent-tools must route adjudication through the writing service');
  }
  // 共享上下文装配（agent 与 GUI 同一 builder，不复制）。
  if (!writingContext.includes('createNextSceneContextBuilder')) fail('shared next-scene context builder missing');
  if (agent.includes('pickCurrentCard')) fail('agent-tools duplicated the context builder internals');
  if (!index.includes("ctx.provide('novelWritingAdjudication'") || !index.includes('createWritingAdjudicationService')) {
    fail('index.ts missing novelWritingAdjudication wiring');
  }
}

// Part 3 — Host 行为（lib 构建产物）：fake backend 消费者夹具 + 裁决闭环矩阵。
{
  const { TextRepository } = await import('../lib/core/text/index.js');
  const { createWritingAdjudicationService } = await import('../lib/host/writing-adjudication-service.js');
  const { createStateService } = await import('../lib/host/state-service.js');
  const { createRelationshipService } = await import('../lib/host/relationship-service.js');
  const { createKnowledgeService } = await import('../lib/host/knowledge-service.js');
  const { createCanonService } = await import('../lib/host/canon-service.js');
  const { createWorldviewService } = await import('../lib/host/worldview-service.js');
  const { createConfirmationService } = await import('../lib/host/confirmation-service.js');
  const { createCharacterService } = await import('../lib/host/character-service.js');
  const { createOutlineService } = await import('../lib/host/outline-service.js');
  const { createStyleService } = await import('../lib/host/style-service.js');
  const { createRuleService } = await import('../lib/host/rule-service.js');
  const { createTextService } = await import('../lib/host/text-service.js');
  const { createConsistencyDetectionService } = await import('../lib/host/consistency-detection-service.js');
  const { createKnowledgeLeakDetectionService } = await import('../lib/host/knowledge-leak-detection-service.js');
  const { createRelationshipStyleDetectionService } = await import('../lib/host/relationship-style-detection-service.js');
  const { createNextSceneContextBuilder } = await import('../lib/host/writing-context.js');
  const { INITIAL_STATE } = await import('../lib/core/schema/project-lifecycle.js');

  const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
  const PROSE = '米拉在码头找到铜钥匙。';
  const ORIGINAL = '原场景正文。';

  let canonSeq = 0;
  const fakeLlm = (seen, overrides = {}) => ({
    async *stream(request) {
      const prompt = request.messages[0].content[0].text;
      seen.push(prompt);
      let output;
      if (prompt.includes('你是小说一致性硬约束检测器')) output = { violations: overrides.hard ?? [] };
      else if (prompt.includes('你是小说 POV 知情泄漏硬约束检测器')) output = { violations: [] };
      else if (prompt.includes('你是小说一致性软约束检测器')) output = { violations: [] };
      else if (prompt.includes('你是小说世界状态解析器')) output = { ops: [{ op: 'modify', target: 'state', field: 'storyTime', action: 'set', value: 'dawn', confidence: 'high' }] };
      else if (prompt.includes('你是小说正史解析器')) {
        // 每次 accept 都是新的解析 fan-out：事件 id 唯一，避免与已落库正史冲突。
        const id = `evt-${++canonSeq}`;
        output = { ops: [{ op: 'append', event: { id, storyTime: 'dawn', kind: 'event', summary: '米拉找到铜钥匙', detail: PROSE, participants: ['mira'], location: 'harbor', consequences: [], affectedLayers: ['state'] }, confidence: 'high' }] };
      }
      else if (prompt.includes('你是小说关系解析器') || prompt.includes('你是小说知情解析器') || prompt.includes('你是小说世界观改写解析器')) output = { ops: [] };
      else output = PROSE;
      yield { type: 'text-delta', text: typeof output === 'string' ? output : JSON.stringify(output) };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  });

  const snapshotDir = (dir) => {
    const entries = [];
    const walk = (d) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const path = join(d, entry.name);
        if (entry.isDirectory()) walk(path);
        else entries.push(path);
      }
    };
    walk(dir);
    return entries.sort().map((p) => `${relative(dir, p)}\u0000${createHash('sha256').update(readFileSync(p, 'utf8'), 'utf8').digest('hex')}`).join('\n');
  };

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i63-smoke-'));
  try {
    const buildService = (seen, overrides) => {
      const characters = createCharacterService(projectsRoot);
      const worldview = createWorldviewService(projectsRoot);
      const outline = createOutlineService(projectsRoot);
      const relationship = createRelationshipService(projectsRoot);
      const state = createStateService(projectsRoot);
      const canon = createCanonService(projectsRoot);
      const confirmation = createConfirmationService(projectsRoot);
      const style = createStyleService(projectsRoot);
      const rules = createRuleService(projectsRoot);
      const knowledge = createKnowledgeService(projectsRoot);
      const text = createTextService(projectsRoot);
      const context = createNextSceneContextBuilder({
        outline, characters, worldview, relationship, state, canon, style, rules, knowledge, text,
        workbenchSettings: { load: async () => ({ wordTarget: 800, askWhenThin: true }) },
      });
      const llm = fakeLlm(seen, overrides);
      const service = createWritingAdjudicationService({
        llm, projectsRoot, context,
        state, relationship, knowledge, canon, worldview, confirmation, rules, style,
        consistency: createConsistencyDetectionService(llm),
        knowledgeLeak: createKnowledgeLeakDetectionService(llm),
        relationshipStyle: createRelationshipStyleDetectionService(llm),
        resolveSettings: async () => settings,
      });
      return { service, services: { state, canon, text, worldview, relationship, knowledge, confirmation, outline, characters, style, rules, project: undefined }, context };
    };

    const seed = async (services, projectId = 'demo') => {
      const { outline, characters, worldview, relationship, state, canon, confirmation, style, rules, knowledge, text } = services;
      // projectService 需要六层；用真实组合（与单元测试同构）。
      const { createProjectService } = await import('../lib/host/project-service.js');
      const project = createProjectService(projectsRoot, { characters, worldview, outline, relationship, state, canon, confirmation });
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
    };

    const seen = [];
    const { service, services } = buildService(seen);
    await seed(services);
    await service.open('demo');
    const projectDir = join(projectsRoot, 'demo');
    const before = snapshotDir(projectDir);

    // 1) propose（continue）→ 候选 + 零写。
    const { candidate } = await service.propose('demo', { intent: 'continue' });
    assert.equal(candidate.intent, 'continue');
    assert.equal(candidate.target.projectId, 'demo');
    assert.equal(snapshotDir(projectDir), before, 'propose must not write any layer');

    // 2) preview → 正文 + diff（新场景）+ 校验结果（pass）。
    const review = await service.preview(candidate.id);
    assert.equal(review.text, PROSE);
    assert.deepEqual(review.diff, { kind: 'new-scene' });
    assert.equal(review.validation.status, 'pass');

    // 3) accept → 标准生命周期受控写回（C2/C4/C5）。
    const accepted = await service.adjudicate(candidate.id, 'accept');
    assert.equal(accepted.status, 'written');
    assert.equal(services.state.current('demo').storyTime, 'dawn');
    assert.deepEqual(services.canon.query('demo').map((e) => e.id), ['evt-1']);
    const chapters = await services.text.listChapters('demo');
    assert.equal(chapters[0].scenes.length, 1);
    assert.equal(chapters[0].scenes[0].content, PROSE);
    // docs/ 派生镜像随 accept 更新（可读文档带段落）。
    const docsFile = readFileSync(join(projectDir, 'docs', 'chapter-1.md'), 'utf8');
    assert.ok(docsFile.includes(PROSE), 'docs mirror must follow accepted C5 text');

    // 4) 双击幂等：重复 accept 返回首次落地结果，不重复写。
    const again = await service.adjudicate(candidate.id, 'accept');
    assert.equal(again.status, 'written');
    assert.equal((await services.text.listChapters('demo'))[0].scenes.length, 1);
    assert.equal(services.canon.query('demo').length, 1);

    // 5) reject 零写 + 幂等。
    const beforeReject = snapshotDir(projectDir);
    const { candidate: c2 } = await service.propose('demo', { intent: 'continue' });
    await service.preview(c2.id);
    const rejected = await service.adjudicate(c2.id, 'reject');
    assert.deepEqual(rejected, { status: 'rejected', candidateId: c2.id });
    assert.equal(snapshotDir(projectDir), beforeReject, 'reject must be zero-write');
    assert.equal((await service.adjudicate(c2.id, 'reject')).status, 'rejected');

    // 6) rewrite → 后继候选；旧候选不可静默接受；后继 accept 落盘。
    // chapter-1 已由第 3 步 accept 创建（C5 落地），此处只补一个既有场景作为重写目标。
    await services.text.appendScene('demo', 'chapter-1', { id: 'scene-1', content: ORIGINAL, summary: '相遇', beats: ['beat-1'], canonEvents: [], notes: '' });
    const { candidate: c3 } = await service.propose('demo', { intent: 'rewrite', chapterId: 'chapter-1', sceneId: 'scene-1', prompt: '把这段改得更有悬念。' });
    assert.ok(c3.target.sourceHash.match(/^[a-f0-9]{64}$/));
    const c3Review = await service.preview(c3.id);
    assert.deepEqual(c3Review.diff, { kind: 'replace', before: ORIGINAL, after: PROSE });
    const rewritten = await service.adjudicate(c3.id, 'rewrite');
    assert.equal(rewritten.status, 'rewritten');
    await assert.rejects(service.adjudicate(c3.id, 'accept'), /superseded/, 'old candidate must not be silently accepted');
    const successorAccepted = await service.adjudicate(rewritten.candidate.id, 'accept');
    assert.equal(successorAccepted.status, 'written');
    const chapter = await services.text.readChapter('demo', 'chapter-1');
    assert.equal(chapter.scenes.find((s) => s.id === 'scene-1').content, PROSE, 'rewrite accept must replace the scene content');

    // 7) 正文变化后旧候选 stale：accept 拒绝且零写（脏文本保护）。
    const { candidate: c4 } = await service.propose('demo', { intent: 'rewrite', chapterId: 'chapter-1', sceneId: 'scene-1', prompt: '改写。' });
    const repository = new TextRepository(projectDir);
    await repository.open();
    await repository.replaceRange('chapter-1', 'scene-1', { start: 0, end: PROSE.length }, '作者随后手动改写的正文。');
    await assert.rejects(service.adjudicate(c4.id, 'accept'), /stale/);
    const after = await services.text.readChapter('demo', 'chapter-1');
    assert.equal(after.scenes.find((s) => s.id === 'scene-1').content, '作者随后手动改写的正文。');

    // 8) 硬违规候选：preview 显示 reject；accept 被标准校验门拦截（generation-rejected 零写）。
    const seenHard = [];
    const hard = buildService(seenHard, { hard: [{ kind: 'immutable-rule', severity: 'hard', message: '正文违反不可变规则。', references: ['rule-1'] }] });
    await seed(hard.services, 'demo-hard');
    const hardService = hard.service;
    await hardService.open('demo-hard');
    const { candidate: c5 } = await hardService.propose('demo-hard', { intent: 'continue' });
    const hardReview = await hardService.preview(c5.id);
    assert.equal(hardReview.validation.status, 'reject');
    const hardOutcome = await hardService.adjudicate(c5.id, 'accept');
    assert.equal(hardOutcome.status, 'generation-rejected');

    console.log('I63 smoke: 候选审阅与生成后裁决（propose/preview/accept/reject/rewrite/幂等/supersede/stale/硬违规零写 + 旧入口退役）通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
