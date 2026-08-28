import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I62 统一写作候选命令合同 smoke（design §14.9「候选优先」/ R13-3）。
 *
 * 交付物核验：
 * - 构建产物（lib）：core/candidate 冻结合同（四种 intent、target 绑定、过期语义）
 *   与 host/candidate-service（统一 propose 入口）存在且导出关键符号。
 * - 源码：四种 intent adapter 复用 I19 assembleStoryContext / I43 buildChapterWritingPrompt /
 *   I44 buildContinuationPrompt / I17 createGenerationService，不复制既有 prompt 文案；
 *   index.ts 装配 novelWritingCandidate（Fiber 归属）。
 * - Host 行为（lib）：fake backend 消费者夹具走四种 intent，全部产生合法候选且
 *   项目全层文件哈希不变；错绑定（脏 sourceHash）/ 模型失败 / 空文本零写；
 *   取消抛 cancelled；正文变化后候选过期（assertCandidateFresh 拒绝落地）。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I62 smoke: ${msg}`); };

// Part 1 — 构建产物：候选合同与候选服务已编译进 lib。
{
  for (const file of ['lib/core/candidate/index.js', 'lib/host/candidate-service.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const contract = read('lib/core/candidate/index.js');
  for (const symbol of ['writingIntentSchema', 'candidateTargetSchema', 'writingCandidateSchema', 'validateCandidateTarget', 'isCandidateStale', 'assertCandidateFresh', 'parseWritingCandidate', 'hashText']) {
    if (!contract.includes(symbol)) fail(`lib candidate contract missing ${symbol}`);
  }
  const service = read('lib/host/candidate-service.js');
  for (const symbol of ['createWritingCandidateService', 'propose']) {
    if (!service.includes(symbol)) fail(`lib candidate service missing ${symbol}`);
  }
}

// Part 2 — 源码：复用而非复制 + 装配。
{
  const service = read('src/host/candidate-service.ts');
  const contract = read('src/core/candidate/index.ts');
  const index = read('src/index.ts') + read('src/host/composition/base.ts') + read('src/host/composition/management.ts') + read('src/host/composition/orchestration.ts');
  for (const reuse of ['assembleStoryContext', 'buildChapterWritingPrompt', 'buildContinuationPrompt', 'createGenerationService']) {
    if (!service.includes(reuse)) fail(`candidate-service must reuse ${reuse} instead of copying`);
  }
  // 既有 prompt 文案不得出现在候选服务里（证明 prompt 全部来自复用 builder）。
  for (const copied of ['你是长篇小说续写 agent', '你是长篇小说章节写作器']) {
    if (service.includes(copied)) fail(`candidate-service copies an existing prompt body: ${copied}`);
  }
  if (!contract.includes("z.enum(['generate', 'continue', 'scene-card', 'rewrite'])")) fail('candidate contract must freeze exactly the four intents');
  if (!contract.includes('sourceHash') || !contract.includes('assertCandidateFresh')) fail('candidate contract missing sourceHash binding / stale semantics');
  if (!index.includes("ctx.provide('novelWritingCandidate'") || !index.includes('createWritingCandidateService')) fail('index.ts missing novelWritingCandidate wiring');
}

// Part 3 — Host 行为（lib 构建产物）：fake backend 消费者夹具 + 零写矩阵。
{
  const { TextRepository } = await import('../lib/core/text/index.js');
  const { createWritingCandidateService } = await import('../lib/host/candidate-service.js');
  const { createStateService } = await import('../lib/host/state-service.js');
  const { hashText, isCandidateStale, assertCandidateFresh, parseWritingCandidate } = await import('../lib/core/candidate/index.js');

  const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
  const ORIGINAL = '源正文内容';
  const CHAPTER = 'chapter-1';
  const SCENE = 'scene-1';
  const stateFixture = {
    id: 'state-1', version: 1, seq: 0, storyTime: 'night',
    scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' },
    characters: [],
  };
  const navigation = { actId: 'act-1', beatId: 'beat-1', title: 'Cross', description: 'Cross harbor.', prerequisites: [], prerequisitesMet: true, instruction: 'Cross harbor.', deviationIds: [] };
  const card = { id: 'detail-1', title: 'Find key', summary: 'Mira finds the key.', pov: 'mira', wordTarget: 20, points: ['notice key'], status: 'writing' };
  const sources = {
    context: {
      macros: { user: 'Author', pov: 'mira' },
      sources: {
        rules: [{ rule: { id: 'rule-1', version: 1, scope: 'global', kind: 'physics', statement: 'The seal holds.', priority: 1, immutable: true, examples: [], active: true }, scope: 'global', priority: 1, immutable: true }],
        style: { profile: { id: 'style-1', version: 1, name: 'Quiet', person: 'third-limited', tense: 'past', povScope: 'single', tone: 'spare', proseStyle: 'precise', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] }, forbidden: [] },
        characters: [], worldview: [],
        relationships: { relationships: [], characterIds: [] },
        state: stateFixture,
      },
    },
    navigation,
    knowledge: { pov: 'mira', entries: [], state: { characterId: 'mira', knows: [] } },
    canon: [],
    history: { recentScenes: [], historicalSummaries: [] },
  };
  const fakeLlm = (seen, text) => ({
    async *stream(request) {
      const prompt = request.messages[0].content[0].text;
      seen.push(prompt);
      if (text === undefined) throw new Error('backend exploded');
      yield { type: 'text-delta', text };
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

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i62-smoke-'));
  try {
    const projectDir = join(projectsRoot, 'demo');
    const text = new TextRepository(projectDir);
    await text.open();
    await text.createChapter({ id: CHAPTER, index: 1, title: '第一章', pov: 'mira', status: 'draft' });
    await text.appendScene(CHAPTER, { id: SCENE, content: ORIGINAL, summary: '相遇', beats: [], canonEvents: [], notes: '' });
    const state = createStateService(projectsRoot);
    await state.open('demo', stateFixture);

    const seen = [];
    const service = createWritingCandidateService({ llm: fakeLlm(seen, '米拉推开了门。'), projectsRoot });
    await service.open('demo');
    const before = snapshotDir(projectDir);

    const requests = [
      { id: 'cand-generate', intent: 'generate', target: { projectId: 'demo' }, sources, settings },
      { id: 'cand-continue', intent: 'continue', target: { projectId: 'demo', chapterId: CHAPTER, sceneId: 'scene-next' }, sources, card, navigation, settings },
      { id: 'cand-scene-card', intent: 'scene-card', target: { projectId: 'demo', chapterId: CHAPTER, sceneId: 'scene-next' }, card, navigation, settings },
      { id: 'cand-rewrite', intent: 'rewrite', target: { projectId: 'demo', chapterId: CHAPTER, sceneId: SCENE, sourceHash: hashText(ORIGINAL) }, prompt: '把这一段改得更有悬念。', settings },
    ];
    for (const request of requests) {
      const { candidate } = await service.propose(request);
      parseWritingCandidate(candidate); // strict 合同必须通过
      assert.equal(candidate.intent, request.intent);
      assert.equal(candidate.text, '米拉推开了门。');
      assert.equal(candidate.target.projectId, 'demo');
    }
    assert.ok(seen[1].includes('你是长篇小说续写 agent'), 'continue adapter must reuse I44 prompt');
    assert.ok(seen[2].includes('你是长篇小说章节写作器'), 'scene-card adapter must reuse I43 prompt');
    assert.equal(seen[3], '把这一段改得更有悬念。');
    assert.equal(snapshotDir(projectDir), before, 'four intents must not write any layer');

    // 错绑定（脏 sourceHash）零写。
    await assert.rejects(
      service.propose({ id: 'stale-hash', intent: 'rewrite', target: { projectId: 'demo', chapterId: CHAPTER, sceneId: SCENE, sourceHash: hashText('旧正文') }, prompt: '改写。', settings }),
      /脏文本保护/,
    );
    // 模型失败零写。
    const broken = createWritingCandidateService({ llm: fakeLlm([], undefined), projectsRoot });
    await broken.open('demo');
    await assert.rejects(
      broken.propose({ id: 'fail', intent: 'rewrite', target: { projectId: 'demo', chapterId: CHAPTER, sceneId: SCENE, sourceHash: hashText(ORIGINAL) }, prompt: '改写。', settings }),
      (error) => error.name === 'GenerationError' && error.code === 'backend',
    );
    // 取消：流中 abort → cancelled。
    const controller = new AbortController();
    const aborting = {
      async *stream() {
        yield { type: 'text-delta', text: '前半' };
        controller.abort();
        yield { type: 'text-delta', text: '后半' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    };
    const cancellable = createWritingCandidateService({ llm: aborting, projectsRoot });
    await cancellable.open('demo');
    await assert.rejects(
      cancellable.propose({ id: 'cancel', intent: 'generate', target: { projectId: 'demo' }, sources, settings, signal: controller.signal }),
      (error) => error.name === 'GenerationError' && error.code === 'cancelled',
    );
    // 空文本非法输出零写。
    const empty = createWritingCandidateService({ llm: fakeLlm([], ''), projectsRoot });
    await empty.open('demo');
    await assert.rejects(empty.propose({ id: 'empty', intent: 'generate', target: { projectId: 'demo' }, sources, settings }), /non-empty/);
    assert.equal(snapshotDir(projectDir), before, 'failure paths must keep every layer unchanged');

    // 过期语义：正文变化后旧候选不可落地。
    const { candidate } = await service.propose({ id: 'cand-stale', intent: 'rewrite', target: { projectId: 'demo', chapterId: CHAPTER, sceneId: SCENE, sourceHash: hashText(ORIGINAL) }, prompt: '改写。', settings });
    assert.equal(isCandidateStale(candidate, ORIGINAL), false);
    assert.throws(() => assertCandidateFresh(candidate, '其他正文'), /stale/);

    console.log('I62 smoke: 统一候选合同（contract/源码复用/四种 intent 零写/错绑定/失败/取消/空文本/过期）通过');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}
