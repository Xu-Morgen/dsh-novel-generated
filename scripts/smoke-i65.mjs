import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I65 可恢复自动生成队列 smoke（design §14.9「可恢复自动生成队列」/ R13-6）。
 *
 * 交付物核验：
 * - 构建产物（lib）：core/queue（task/journal：稳定 scene id / 状态机 / 预算单位 /
 *   账本 schema）、host/queue-service（createQueueService）、host/remote/queue
 *   （novelQueue Remote）存在且导出关键符号。
 * - 源码：queue-service 复用 I62 候选服务 + I63 裁决服务（registerRecoveredCandidate
 *   + preview 的 I20 判定），不复制 prompt、不新增第二裁决器；index.ts 装配 novelQueue；
 *   core/queue/task 复用既有 detailBeatSchema / 候选合同。
 * - Host 行为（lib）：fake backend 消费者夹具走完整队列闭环：
 *   按场景卡范围顺序生成（每卡独立候选 + 稳定 scene id + 停在待裁决，除队列账本外
 *   零层写入）；重启恢复（新实例 recover 不重新生成、候选可继续审阅/裁决，已写正文
 *   场景 completed → 无重复正文）；预算不超限；硬冲突立即停 / 软警告按策略停；
 *   暂停/继续/取消幂等；Fiber dispose 中止在飞运行且持久状态可恢复。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I65 smoke: ${msg}`); };
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Part 1 — 构建产物。
{
  for (const file of ['lib/core/queue/task.js', 'lib/core/queue/journal.js', 'lib/host/queue-service.js', 'lib/host/remote/queue.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const task = read('lib/core/queue/task.js');
  for (const symbol of ['stableSceneId', 'countProseUnits', 'assertTaskTransition', 'queueJournalSchema', 'queueTaskSchema', 'queueTaskId']) {
    if (!task.includes(symbol)) fail(`lib queue task missing ${symbol}`);
  }
  const journal = read('lib/core/queue/journal.js');
  for (const symbol of ['QueueJournalFile', 'queue-journal.yaml']) {
    if (!journal.includes(symbol)) fail(`lib queue journal missing ${symbol}`);
  }
  const service = read('lib/host/queue-service.js');
  for (const symbol of ['createQueueService', 'registerRecoveredCandidate', 'preview', 'status', 'budget-exhausted', 'stopped-hard', 'stopped-soft']) {
    if (!service.includes(symbol)) fail(`lib queue service missing ${symbol}`);
  }
  const remote = read('lib/host/remote/queue.js');
  for (const symbol of ['queueStatusInvocation', 'queueStartInvocation', 'queuePauseInvocation', 'queueResumeInvocation', 'queueCancelInvocation', 'queueRetryInvocation', 'queueRecoverInvocation', 'queueRemoteContribution']) {
    if (!remote.includes(symbol)) fail(`lib queue remote missing ${symbol}`);
  }
}

// Part 2 — 源码：复用而非复制 + 不新增第二裁决器 + 装配。
{
  const service = read('src/host/queue-service.ts');
  const task = read('src/core/queue/task.ts');
  const index = read('src/index.ts') + read('src/host/composition/base.ts') + read('src/host/composition/management.ts') + read('src/host/composition/orchestration.ts');
  const writing = read('src/host/writing-adjudication-service.ts');
  const remoteTs = read('src/remote.ts');
  const nav = read('src/client/nav.ts');
  // 复用 I62/I63：注册进裁决服务 + 消费 preview 的 I20 判定（停止策略）。
  for (const reuse of ['registerRecoveredCandidate', 'preview', 'resolveSettings', 'stableSceneId', 'countProseUnits', 'beatCards', 'navigate']) {
    if (!service.includes(reuse)) fail(`queue service must reuse ${reuse}`);
  }
  // 不复制既有 prompt 文案（生成/检测全部来自复用模块）。
  for (const copied of ['你是长篇小说章节写作器', '你是小说一致性硬约束检测器']) {
    if (service.includes(copied)) fail(`queue service copies an existing prompt body: ${copied}`);
  }
  // 不新增第二裁决器：队列只消费 I63 preview 的 validation.status，不定义严重度判定。
  if (service.includes('adjudicateViolations') || service.includes('createConsistencyDetectionService')) {
    fail('queue service must not define a second adjudicator or wire detectors directly');
  }
  if (!service.includes('validation.status')) fail('queue stop policy must consume I63 preview validation.status');
  // core/queue/task 复用既有 schema（detailBeatSchema / writingCandidateSchema），不重定义。
  if (!task.includes("from '../schema/outline.js'") || !task.includes("from '../candidate/index.js'")) {
    fail('queue task must reuse detailBeatSchema and the candidate contract');
  }
  // I63 提供恢复注册钩子（幂等；消费方不得绕过合同）。I79 拆段后注册实现在
  // 候选生产段（candidate-production.ts），组合根仍暴露公开钩子。
  if (!writing.includes('registerRecoveredCandidate')) {
    fail('writing-adjudication-service missing the I65 recovery registration hook');
  }
  const production = read('src/host/writing-adjudication/candidate-production.ts');
  if (!production.includes('registerRecoveredCandidate') || !production.includes('scene-card candidates only')) {
    fail('candidate-production missing the I65 recovery registration hook');
  }
  // 装配：index.ts 提供 novelQueue；remote.ts 注册 queueInvocations；nav/client 挂队列视图。
  if (!index.includes("ctx.provide('novelQueue'") || !index.includes('createQueueService')) fail('index.ts missing novelQueue wiring');
  if (!remoteTs.includes('...queueInvocations') || !remoteTs.includes('queueRemoteContribution')) fail('remote.ts missing queueInvocations registration');
  if (!nav.includes("view: 'queue'") || !nav.includes("view === 'queue'")) fail('nav.ts missing the queue view / stable-view handling');
  // I83 起 Remote 挂载经 mount.ts 参数化工厂；I90 起 per-Remote 声明式规格在 mount-registry.ts。
  const mountRegistry = read('src/client/mount-registry.ts');
  const mount = read('src/client/mount.ts');
  if (!mount.includes('export function mountRemote') || !mountRegistry.includes('queueRemoteContribution') || !mountRegistry.includes("'remote.novelQueue'")) fail('client mount wiring missing queue Remote mount');
}

// Part 3 — Host 行为（lib 构建产物）：fake backend 消费者夹具。
{
  const { createWritingCandidateService } = await import('../lib/host/candidate-service.js');
  const { createWritingAdjudicationService } = await import('../lib/host/writing-adjudication-service.js');
  const { createQueueService } = await import('../lib/host/queue-service.js');
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
  const { countProseUnits, stableSceneId } = await import('../lib/core/queue/task.js');
  const { INITIAL_STATE } = await import('../lib/core/schema/project-lifecycle.js');

  const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
  const PROSE = '米拉在码头找到铜钥匙。';
  const PROSE_UNITS = countProseUnits(PROSE);

  const CARDS = [
    { actId: 'act-1', beatId: 'beat-1', id: 'detail-1', title: '发现海图', summary: '米拉发现半张烧焦海图', pov: 'mira' },
    { actId: 'act-1', beatId: 'beat-1', id: 'detail-2', title: '灯塔守夜', summary: '米拉在灯塔前守夜', pov: 'mira' },
    { actId: 'act-1', beatId: 'beat-2', id: 'detail-3', title: '铜钥匙之谜', summary: '铜钥匙打开旧箱', pov: 'mira' },
  ];
  const sceneIdOf = (card) => stableSceneId(card.actId, card.beatId, card.id);

  /** 队列顺序生成：生成 prompt → 探测器；按最近一次生成场景卡标题分发硬/软违规。 */
  const fakeLlm = (seen, overrides = {}) => {
    let lastTitle = '';
    return {
      async *stream(request) {
        const prompt = request.messages[0].content[0].text;
        seen.push(prompt);
        await sleep(5);
        let output;
        if (prompt.includes('你是长篇小说章节写作器')) {
          lastTitle = (prompt.match(/场景标题: (.+)/) ?? [])[1] ?? '';
          output = PROSE;
        } else if (prompt.includes('你是小说一致性硬约束检测器')) {
          const hard = overrides.hardByTitle?.(lastTitle) ?? [];
          output = { violations: hard };
        } else if (prompt.includes('你是小说 POV 知情泄漏硬约束检测器')) {
          output = { violations: [] };
        } else if (prompt.includes('你是小说一致性软约束检测器')) {
          const soft = overrides.softByTitle?.(lastTitle) ?? [];
          output = { violations: soft };
        } else if (prompt.includes('你是小说世界状态解析器') || prompt.includes('你是小说正史解析器')
          || prompt.includes('你是小说关系解析器') || prompt.includes('你是小说知情解析器') || prompt.includes('你是小说世界观改写解析器')) {
          output = { ops: [] };
        } else {
          output = PROSE;
        }
        yield { type: 'text-delta', text: typeof output === 'string' ? output : JSON.stringify(output) };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    };
  };

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
  /** 除队列账本（queue-owned）外的项目快照：队列 run 必须零层写入。 */
  const snapshotWithoutQueueJournal = (dir) => snapshotDir(dir)
    .split('\n')
    .filter((line) => !line.includes('queue-journal.yaml'))
    .join('\n');

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i65-smoke-'));
  try {
    /** 种子项目：六层初始化 + B5 三张场景卡 + C5 空文本层。 */
    const seed = async (projectId) => {
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
      const { createProjectService } = await import('../lib/host/project-service.js');
      const project = createProjectService(projectsRoot, { characters, worldview, outline, relationship, state, canon, confirmation });
      await project.createProject({ projectId, name: '队列演示' });
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
        acts: [{ id: 'act-1', index: 0, title: '第一幕', goal: '接受委托', beats: [
          { id: 'beat-1', title: '午夜旧灯塔', description: '米拉在旧灯塔发现线索。', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [
            { id: 'detail-1', title: '发现海图', summary: '米拉发现半张烧焦海图', pov: 'mira', wordTarget: 20, points: ['发现海图'], status: 'writing' },
            { id: 'detail-2', title: '灯塔守夜', summary: '米拉在灯塔前守夜', pov: 'mira', wordTarget: 20, points: ['守夜'], status: 'writing' },
          ] },
          { id: 'beat-2', title: '铜钥匙之谜', description: '米拉追查铜钥匙。', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [
            { id: 'detail-3', title: '铜钥匙之谜', summary: '铜钥匙打开旧箱', pov: 'mira', wordTarget: 20, points: ['开箱'], status: 'writing' },
          ] },
        ] }],
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
      return { characters, worldview, outline, relationship, state, canon, confirmation, style, rules, knowledge, text };
    };

    /** 完整服务栈（I62 候选 + I63 裁决 + I65 队列；同一 projectsRoot）。 */
    const buildStack = (seen, overrides = {}, queueExtra = {}) => {
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
      const llm = fakeLlm(seen, overrides);
      const context = createNextSceneContextBuilder({
        outline, characters, worldview, relationship, state, canon, style, rules, knowledge, text,
        workbenchSettings: { load: async () => ({ wordTarget: 800, askWhenThin: true }) },
      });
      const candidate = createWritingCandidateService({ llm, projectsRoot });
      const writing = createWritingAdjudicationService({
        llm, projectsRoot, context,
        state, relationship, knowledge, canon, worldview, confirmation, rules, style,
        consistency: createConsistencyDetectionService(llm),
        knowledgeLeak: createKnowledgeLeakDetectionService(llm),
        relationshipStyle: createRelationshipStyleDetectionService(llm),
        resolveSettings: async () => settings,
      });
      const queue = createQueueService({
        projectsRoot,
        candidate,
        writing,
        text,
        outline,
        resolveSettings: async () => settings,
        ...queueExtra,
      });
      return {
        queue, writing, candidate,
        services: { characters, worldview, outline, relationship, state, canon, confirmation, style, rules, knowledge, text },
        llm,
      };
    };

    /** 打开栈内领域服务（模拟插件项目打开生命周期；I63 审阅/裁决与 I65 对账需要）。 */
    const openStackFor = async (stack, projectId) => {
      const { characters, worldview, outline, relationship, state, canon, confirmation, style, rules, knowledge, text } = stack.services;
      await characters.open(projectId);
      await worldview.open(projectId);
      await outline.open(projectId);
      await relationship.open(projectId);
      await state.open(projectId);
      await canon.open(projectId);
      await confirmation.open(projectId);
      await style.open(projectId);
      await rules.open(projectId);
      await knowledge.open(projectId);
      await text.open(projectId);
    };

    const waitFor = async (label, predicate, timeoutMs = 5000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (await predicate()) return;
        await sleep(15);
      }
      fail(`waitFor timeout: ${label}`);
    };
    const terminal = (runState) => runState !== 'running' && runState !== 'paused';
    const generationCount = (seen) => seen.filter((prompt) => prompt.includes('你是长篇小说章节写作器')).length;

    // ---- 场景 1：范围顺序生成 + 稳定 scene id + 零层写入 + 停在待裁决 ----
    {
      const seen = [];
      const services = await seed('demo');
      const stack = buildStack(seen);
      await openStackFor(stack, 'demo');
      const { queue, writing } = stack;
      await queue.open('demo');
      const projectDir = join(projectsRoot, 'demo');
      const before = snapshotWithoutQueueJournal(projectDir);

      const started = await queue.start('demo', { cardIds: CARDS.map((card) => card.id), maxRetries: 1, stopOnSoftWarnings: false });
      assert.equal(started.runState, 'running');
      await waitFor('queue run completes', async () => terminal((await queue.status('demo')).runState));
      const status = await queue.status('demo');
      assert.equal(status.runState, 'completed');
      // 每卡独立候选 + 稳定 scene id + 停在待裁决。
      assert.deepEqual(status.tasks.map((task) => task.sceneId), CARDS.map(sceneIdOf));
      assert.ok(status.tasks.every((task) => /^scene-[a-f0-9]{16}$/.test(task.sceneId)), 'scene ids must be stable entityId-valid');
      assert.ok(status.tasks.every((task) => task.status === 'candidate-ready' && task.candidateId !== null), 'every task must stop awaiting adjudication');
      assert.equal(status.consumedUnits, CARDS.length * PROSE_UNITS);
      assert.equal(generationCount(seen), CARDS.length);
      // 除队列账本外零层写入（B1/B2/B3/B5/C1/C2/C3/C4/C5/docs 不变）。
      assert.equal(snapshotWithoutQueueJournal(projectDir), before, 'queue run must not write any layer');
      // 候选可经 I63 审阅（正文 + 校验结果），队列不裁决。
      for (const task of status.tasks) {
        const review = await writing.preview(task.candidateId);
        assert.equal(review.text, PROSE);
        assert.equal(review.validation.status, 'pass');
        assert.deepEqual(review.diff, { kind: 'new-scene' });
      }
      console.log('I65 smoke: 场景 1（范围顺序生成/稳定 scene id/每卡独立候选停在待裁决/零层写入/可审阅）通过');
    }

    // ---- 场景 2：重启恢复 —— 不重新生成、候选可继续裁决、已写正文场景 completed、无重复正文 ----
    {
      const seen = [];
      const services = await seed('demo-recover');
      const first = buildStack(seen);
      await openStackFor(first, 'demo-recover');
      await first.queue.open('demo-recover');
      await first.queue.start('demo-recover', { cardIds: CARDS.map((card) => card.id) });
      await waitFor('first run completes', async () => terminal((await first.queue.status('demo-recover')).runState));
      const before = await first.queue.status('demo-recover');
      const generationsBefore = generationCount(seen);

      // 「重启」：全新实例（新 I62/I63/I65），同一 projectsRoot。
      const second = buildStack(seen);
      await openStackFor(second, 'demo-recover');
      await second.queue.open('demo-recover');
      const recovered = await second.queue.recover('demo-recover');
      // 不重新生成：已待裁决候选 id 不变、生成次数不变。
      assert.deepEqual(recovered.tasks.map((task) => task.candidateId), before.tasks.map((task) => task.candidateId));
      assert.equal(generationCount(seen), generationsBefore, 'recovery must not regenerate awaiting candidates');
      // 候选可继续经新实例的 I63 裁决服务审阅（rehydrate 生效）。
      const firstTask = recovered.tasks.find((task) => task.status === 'candidate-ready');
      const review = await second.writing.preview(firstTask.candidateId);
      assert.equal(review.text, PROSE);
      // 作者经 I63 接受第 1 张卡候选 → 场景落盘。
      const accepted = await second.writing.adjudicate(firstTask.candidateId, 'accept');
      assert.equal(accepted.status, 'written');
      const chapters = await second.services.text.listChapters('demo-recover');
      assert.equal(chapters[0].scenes.length, 1);
      assert.equal(chapters[0].scenes[0].content, PROSE);
      // 队列对账：该场景已写 → completed；再次 start 无 queued → completed；无重复正文、无重复生成。
      const reconciled = await second.queue.status('demo-recover');
      assert.equal(reconciled.tasks.find((task) => task.sceneId === accepted.scene.sceneId)?.status, 'completed');
      const resumed = await second.queue.start('demo-recover');
      assert.equal(resumed.runState, 'completed');
      assert.equal(generationCount(seen), generationsBefore, 'no regeneration for written scenes (no duplicate prose)');
      const afterChapters = await second.services.text.listChapters('demo-recover');
      assert.equal(afterChapters[0].scenes.length, 1, 'restart must not duplicate prose');
      console.log('I65 smoke: 场景 2（重启恢复/不重复生成/候选可继续裁决/已写场景 completed/无重复正文）通过');
    }

    // ---- 场景 3：预算不超限 ----
    {
      const seen = [];
      await seed('demo-budget');
      const stack = buildStack(seen);
      await openStackFor(stack, 'demo-budget');
      const { queue } = stack;
      await queue.open('demo-budget');
      await queue.start('demo-budget', { cardIds: CARDS.map((card) => card.id), wordBudget: PROSE_UNITS + 1 });
      await waitFor('budget run settles', async () => terminal((await queue.status('demo-budget')).runState));
      const status = await queue.status('demo-budget');
      assert.equal(status.runState, 'budget-exhausted');
      assert.equal(generationCount(seen), 2, 'queue must stop picking tasks once the budget is reached');
      assert.equal(status.consumedUnits, 2 * PROSE_UNITS);
      assert.deepEqual(status.tasks.map((task) => task.status), ['candidate-ready', 'candidate-ready', 'queued']);
      console.log('I65 smoke: 场景 3（预算不超限/budget-exhausted/后续任务不再启动）通过');
    }

    // ---- 场景 4：硬冲突立即停 / 软警告按策略停 ----
    {
      const seenHard = [];
      await seed('demo-hard');
      const hard = buildStack(seenHard, {
        hardByTitle: (title) => title === '灯塔守夜'
          ? [{ kind: 'immutable-rule', severity: 'hard', message: '正文违反不可变规则。', references: ['rule-1'] }]
          : [],
      });
      await openStackFor(hard, 'demo-hard');
      await hard.queue.open('demo-hard');
      await hard.queue.start('demo-hard', { cardIds: CARDS.map((card) => card.id) });
      await waitFor('hard stop settles', async () => terminal((await hard.queue.status('demo-hard')).runState));
      const hardStatus = await hard.queue.status('demo-hard');
      assert.equal(hardStatus.runState, 'stopped-hard');
      assert.deepEqual(hardStatus.tasks.map((task) => task.status), ['candidate-ready', 'candidate-ready', 'queued']);
      // 硬冲突场景的候选仍待裁决（队列不裁决、不落地）。
      assert.equal(hardStatus.tasks[1].status, 'candidate-ready');
      assert.equal(hardStatus.tasks[2].status, 'queued');

      const seenSoft = [];
      await seed('demo-soft');
      const softStop = buildStack(seenSoft, {
        softByTitle: (title) => title === '发现海图'
          ? [{ kind: 'style-deviation', severity: 'soft', message: '正文偏离叙事风格档案。', references: ['style-demo'] }]
          : [],
      });
      await openStackFor(softStop, 'demo-soft');
      await softStop.queue.open('demo-soft');
      await softStop.queue.start('demo-soft', { cardIds: CARDS.map((card) => card.id), stopOnSoftWarnings: true });
      await waitFor('soft stop settles', async () => terminal((await softStop.queue.status('demo-soft')).runState));
      const softStatus = await softStop.queue.status('demo-soft');
      assert.equal(softStatus.runState, 'stopped-soft');
      assert.deepEqual(softStatus.tasks.map((task) => task.status), ['candidate-ready', 'queued', 'queued']);

      const seenSoft2 = [];
      await seed('demo-soft2');
      const softContinue = buildStack(seenSoft2, {
        softByTitle: (title) => title === '发现海图'
          ? [{ kind: 'style-deviation', severity: 'soft', message: '正文偏离叙事风格档案。', references: ['style-demo'] }]
          : [],
      });
      await openStackFor(softContinue, 'demo-soft2');
      await softContinue.queue.open('demo-soft2');
      await softContinue.queue.start('demo-soft2', { cardIds: CARDS.map((card) => card.id), stopOnSoftWarnings: false });
      await waitFor('soft continue settles', async () => terminal((await softContinue.queue.status('demo-soft2')).runState));
      const softContinueStatus = await softContinue.queue.status('demo-soft2');
      assert.equal(softContinueStatus.runState, 'completed');
      assert.ok(softContinueStatus.tasks.every((task) => task.status === 'candidate-ready'));
      console.log('I65 smoke: 场景 4（硬冲突立即停/软警告按策略停）通过');
    }

    // ---- 场景 5：暂停/继续/取消幂等 + 取消复位 running→queued ----
    {
      const seen = [];
      await seed('demo-control');
      const stack = buildStack(seen);
      await openStackFor(stack, 'demo-control');
      const { queue } = stack;
      await queue.open('demo-control');
      // 空队列：pause/cancel/resume 全部幂等 no-op。
      assert.equal((await queue.start('demo-control')).runState, 'idle');
      assert.equal((await queue.pause('demo-control')).runState, 'idle');
      assert.equal((await queue.cancel('demo-control')).runState, 'idle');
      assert.equal((await queue.cancel('demo-control')).runState, 'idle');
      assert.equal((await queue.resume('demo-control')).runState, 'idle');
      // 完成态取消两次：completed → idle（幂等）。
      await queue.start('demo-control', { cardIds: CARDS.map((card) => card.id) });
      await waitFor('control run completes', async () => terminal((await queue.status('demo-control')).runState));
      assert.equal((await queue.cancel('demo-control')).runState, 'idle');
      assert.equal((await queue.cancel('demo-control')).runState, 'idle');
      assert.equal((await queue.pause('demo-control')).runState, 'idle');
      console.log('I65 smoke: 场景 5（暂停/继续/取消幂等）通过');
    }

    // ---- 场景 6：Fiber dispose 中止在飞运行，持久状态可被新实例恢复 ----
    {
      const seen = [];
      await seed('demo-dispose');
      const disposers = [];
      const first = buildStack(seen, {}, { onDispose: (dispose) => { disposers.push(dispose); } });
      await openStackFor(first, 'demo-dispose');
      const { queue } = first;
      await queue.open('demo-dispose');
      await queue.start('demo-dispose', { cardIds: CARDS.map((card) => card.id) });
      // 不等完成直接 dispose（模拟 Fiber 卸载）：中止在飞生成。
      for (const dispose of disposers) dispose();
      await waitFor('dispose settles', async () => {
        const status = await queue.status('demo-dispose');
        return terminal(status.runState) && status.tasks.every((task) => task.status !== 'running');
      });
      // 新实例可恢复：无 running 残留；已待裁决候选保留，未生成场景可继续。
      const second = buildStack(seen);
      await openStackFor(second, 'demo-dispose');
      await second.queue.open('demo-dispose');
      const recovered = await second.queue.status('demo-dispose');
      assert.ok(recovered.tasks.every((task) => task.status !== 'running'), 'dispose must leave no running tasks');
      const resumed = await second.queue.start('demo-dispose');
      assert.ok(['running', 'completed'].includes(resumed.runState), 'recovered queue must be restartable');
      await waitFor('recovered run settles', async () => terminal((await second.queue.status('demo-dispose')).runState));
      const finalStatus = await second.queue.status('demo-dispose');
      assert.equal(finalStatus.tasks.filter((task) => task.status === 'candidate-ready').length, CARDS.length);
      console.log('I65 smoke: 场景 6（Fiber dispose 中止在飞/持久状态可恢复/重启继续）通过');
    }

    console.log('I65 smoke: 可恢复自动生成队列（任务 Schema/Service/Remote、稳定 scene id、预算、停止策略、恢复无重复正文、控制幂等、Fiber dispose）全部通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
