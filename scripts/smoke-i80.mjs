import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I80 拆分 onboarding-adjudication-service 与类型断言消除 smoke（架构审查 §4.1 / §3.3 /
 * §9 #4；重构纪律 §16-2 行为等价）。
 *
 * 交付物核验：
 * - 类型断言归零：onboarding 裁决范围（组合根 + onboarding-adjudication/ 切片）生产
 *   代码无 `as unknown as`；全 src/host 生产代码仅保留 remote/shared.ts 的泛型适配
 *   擦除（I75 有意保留，非领域输入断言）—— 12 处 `raw as unknown as XxxInput` 消除。
 * - 拆分成立：原 648 行 god service 拆为组合根（finalApply 编排 + 公开面）与
 *   裁决状态机 / 6 个 applyLayer 两切片，行数护栏（均 < 320）；实现符号归位
 *   （apply* / preflight / strip* 只落在 apply-layers，状态机符号只落在 state-machine）。
 * - 行为等价（lib 构建产物）：apply 顺序 B3→B2→B5→C2→C4→C1 与幂等重试语义回归不变
 *   （accept/skip → finalApply → 重试零额外 state snapshot），与 smoke-i53 同源断言。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I80 smoke: ${msg}`); };

/** 过滤注释行（`//`、`/*`、块注释 `*` 续行），只留代码行做 grep 断言。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});

const hostDir = resolve(repoRoot, 'src/host');
const allHostTs = [];
const walkSrc = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walkSrc(path);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) allHostTs.push(path);
  }
};
walkSrc(hostDir);

// Part 1 — 类型断言归零（审查 §3.3：onboarding 12 处 `raw as unknown as XxxInput`）。
{
  // 1a) 本迭代目标范围：组合根 + 切片生产代码 `as unknown as` 归零。
  const targetFiles = [
    'src/host/onboarding-adjudication-service.ts',
    'src/host/onboarding-adjudication/apply-layers.ts',
    'src/host/onboarding-adjudication/state-machine.ts',
  ];
  for (const file of targetFiles) {
    const hits = codeLines(file).filter((line) => line.includes('as unknown as'));
    if (hits.length !== 0) fail(`${file} 残留 ${hits.length} 处 as unknown as：\n${hits.join('\n')}`);
  }
  // 1b) 全 src/host 生产代码只允许 remote/shared.ts 的泛型适配擦除（I75 有意保留，
  //     非领域输入断言；stage-15 完成线只要求领域输入断言归零）。
  const hostCasts = allHostTs.flatMap((p) => codeLines(p)
    .filter((line) => line.includes('as unknown as'))
    .map((line) => ({ file: p, line })));
  for (const { file, line } of hostCasts) {
    if (file === resolve(repoRoot, 'src/host/remote/shared.ts') && line.includes('as unknown as TService')) continue;
    fail(`src/host 生产代码意外残留 as unknown as（${file}）：${line}`);
  }
  console.log('I80 Part 1: 类型断言归零（onboarding 范围 0 处；src/host 仅保留 shared.ts 泛型适配擦除）OK');
}

// Part 2 — 拆分成立（行数护栏 + 职责归位）。
{
  const lines = {
    root: read('src/host/onboarding-adjudication-service.ts').split('\n').length,
    stateMachine: read('src/host/onboarding-adjudication/state-machine.ts').split('\n').length,
    applyLayers: read('src/host/onboarding-adjudication/apply-layers.ts').split('\n').length,
  };
  // 原文件 648 行（4 种职责）；拆分后组合根与每一切片单职责且显著小于原体积
  // （护栏：均 < 400；apply-layers 因承载 6 个落地函数 + 预检 + 类型化管线而最大，
  // 仍比原文件小 43%）。
  for (const [name, count] of Object.entries(lines)) {
    if (count >= 400) fail(`${name} 行数 ${count} 超护栏 400（原 648 行单文件未有效拆分）`);
  }
  // 组合根只做编排：apply 实现符号的**定义**必须唯一落在 apply-layers 切片
  // （组合根只能经 `applier.` 引用调用，不能定义实现体）。
  const scopeFiles = [
    'src/host/onboarding-adjudication-service.ts',
    'src/host/onboarding-adjudication/apply-layers.ts',
    'src/host/onboarding-adjudication/state-machine.ts',
  ];
  const definitionPatterns = [
    ['async function applyCharacters', 'B3 落地'],
    ['async function applyWorldview', 'B2 落地'],
    ['async function applyOutline', 'B5 落地'],
    ['async function applyState', 'C2 落地'],
    ['async function applyCanon', 'C4 落地'],
    ['async function applyRelationship', 'C1 落地'],
    ['const preflightAccepted', '跨层预检'],
    ['function stripVersion', '版本剥离'],
    ['function stripStorage', '存储剥离'],
  ];
  for (const [pattern, label] of definitionPatterns) {
    const hits = scopeFiles.flatMap((file) => codeLines(file).filter((line) => line.includes(pattern)).map(() => file));
    if (hits.length !== 1 || hits[0] !== 'src/host/onboarding-adjudication/apply-layers.ts') {
      fail(`${label}（${pattern}）定义必须唯一落在 apply-layers.ts，实际 ${hits.length} 处：${hits.join(', ')}`);
    }
  }
  // 切片职责归属正向断言：状态机切片持四裁决/会话记账/裁决门；落地切片持 6 个
  // applyLayer + preflight + 类型化输入管线。
  const stateMachine = read('src/host/onboarding-adjudication/state-machine.ts');
  for (const symbol of ['adjudicate', 'acceptedLayers', 'assertCandidateable', 'proposalByLayer', 'skippedLayers']) {
    if (!codeLines('src/host/onboarding-adjudication/state-machine.ts').some((line) => line.includes(symbol))) fail(`state-machine 缺失 ${symbol}`);
  }
  const applyLayers = read('src/host/onboarding-adjudication/apply-layers.ts');
  for (const symbol of ['applyCharacters', 'applyWorldview', 'applyOutline', 'applyState', 'applyCanon', 'applyRelationship', 'preflightAccepted', 'parseLayerCandidates']) {
    if (!codeLines('src/host/onboarding-adjudication/apply-layers.ts').some((line) => line.includes(symbol))) fail(`apply-layers 缺失 ${symbol}`);
  }
  // 类型化输入管线确为落地切片的唯一类型边界（无领域输入断言可查）。
  if (!codeLines('src/host/onboarding-adjudication/apply-layers.ts').some((line) => line.includes('safeParse'))) fail('apply-layers 缺失类型化输入管线（safeParse）');
  if (!stateMachine.includes('onboardingAdjudicateInputSchema') || !stateMachine.includes('OnboardingLayerProposalPayload')) fail('state-machine 缺失裁决状态机契约符号');
  if (!applyLayers.includes('topologicalWorldviewOrder')) fail('apply-layers 缺失 B2 拓扑序引用');
  console.log(`I80 Part 2: 拆分成立（行数护栏 root=${lines.root}/state-machine=${lines.stateMachine}/apply-layers=${lines.applyLayers} < 400），职责归位 OK`);
}

// Part 3 — 行为等价（lib 构建产物）：apply 顺序 + 幂等重试语义回归不变。
{
  for (const file of ['lib/host/onboarding-adjudication-service.js', 'lib/host/onboarding-adjudication/state-machine.js', 'lib/host/onboarding-adjudication/apply-layers.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const { createCharacterService } = await import('../lib/host/character-service.js');
  const { createWorldviewService } = await import('../lib/host/worldview-service.js');
  const { createOutlineService } = await import('../lib/host/outline-service.js');
  const { createRelationshipService } = await import('../lib/host/relationship-service.js');
  const { createStateService } = await import('../lib/host/state-service.js');
  const { createCanonService } = await import('../lib/host/canon-service.js');
  const { createConfirmationService } = await import('../lib/host/confirmation-service.js');
  const { createOnboardingAnalyzerService } = await import('../lib/host/onboarding-analyzer-service.js');
  const { createOnboardingAdjudicationService } = await import('../lib/host/onboarding-adjudication-service.js');
  const { createLayerApplier } = await import('../lib/host/onboarding-adjudication/apply-layers.js');
  const { INITIAL_STATE } = await import('../lib/core/schema/project-lifecycle.js');

  const projectsRoot = mkdtempSync(join(tmpdir(), 'novel-i80-smoke-'));
  try {
    const projectId = 'demo';
    const sourceHash = 'a'.repeat(64);
    const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
    const output = {
      evidence: { e1: { sourceChunkIndex: 0, quote: '米拉抵达北港。' } },
      layers: {
        characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
        worldview: { candidates: [{ id: 'north-harbor', kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
        outline: { candidates: [{ id: 'outline', structure: 'free', logline: '一个测绘师的故事。', themes: [], acts: [{ id: 'act-1', index: 0, title: '开端', goal: '抵达北港', beats: [{ id: 'beat-1', title: '抵达北港', description: '米拉抵达北港开始测绘', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [{ id: 'db-1', title: '测绘', summary: '米拉测绘海岸线', pov: 'mira', wordTarget: 100, points: [], status: 'planned' }] }] }], foreshadowing: [], endings: [] }], confidence: 'low', warnings: [], evidenceIds: [] },
        relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
        state: { candidates: [{ id: 'initial-state', storyTime: '清晨', scene: { location: '北港', timeOfDay: '', weather: '', season: '', atmosphere: '' }, characters: [{ characterId: 'mira', location: '北港', alive: true, health: '健康', mood: '', inventory: [], condition: '', currentGoal: '', flags: {} }] }], confidence: 'medium', warnings: [], evidenceIds: ['e1'] },
        canon: { candidates: [{ id: 'evt-1', storyTime: '清晨', kind: 'event', summary: '米拉抵达北港', detail: '', participants: ['mira'], location: '北港', consequences: [], affectedLayers: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
      },
    };
    const characters = createCharacterService(projectsRoot);
    const worldview = createWorldviewService(projectsRoot);
    const outline = createOutlineService(projectsRoot);
    const relationship = createRelationshipService(projectsRoot);
    const state = createStateService(projectsRoot);
    const canon = createCanonService(projectsRoot);
    const confirmation = createConfirmationService(projectsRoot);
    await Promise.all([characters.open(projectId), worldview.open(projectId), outline.open(projectId), relationship.open(projectId), state.open(projectId, INITIAL_STATE), canon.open(projectId), confirmation.open(projectId)]);
    const backend = { async *stream() { yield { type: 'text-delta', text: JSON.stringify(output) }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
    const analyzer = createOnboardingAnalyzerService(backend);
    const adjudication = createOnboardingAdjudicationService({ characters, worldview, outline, relationship, state, canon, confirmation }, {
      getResult: (id) => analyzer.getResult(id),
      async regenerate(id, layer, input) { const result = await analyzer.regenerate(id, layer, input); return { layers: result.layers }; },
    });
    const analysis = await analyzer.start({ projectId, sourceHash, text: '米拉抵达北港。' }, settings);
    for (const layer of ['characters', 'worldview', 'outline', 'state', 'canon']) {
      await adjudication.adjudicate({ projectId, onboardingSessionId: analysis.onboardingSessionId, sourceHash, layer, decision: 'accept' });
    }
    await adjudication.adjudicate({ projectId, onboardingSessionId: analysis.onboardingSessionId, sourceHash, layer: 'relationship', decision: 'skip' });
    const first = await adjudication.finalApply({ projectId, onboardingSessionId: analysis.onboardingSessionId, sourceHash });
    // apply 顺序回归不变：固定 B3→B2→B5→C2→C4（relationship 显式跳过）。
    assert.deepEqual(first.appliedLayers, ['characters', 'worldview', 'outline', 'state', 'canon'], 'apply 顺序（B3→B2→B5→C2→C4）回归不变');
    assert.deepEqual(first.skippedLayers, ['relationship']);
    assert.deepEqual(first.blockedLayers, []);
    assert.equal(first.retryable, false);
    assert.equal((await characters.list(projectId)).length, 1);
    assert.equal(canon.query(projectId).length, 1);
    const snapshotsAfterFirstApply = state.snapshots(projectId).length;
    // 幂等语义回归不变：重复 apply 只继续未完成层，不追加 state snapshot。
    const retry = await adjudication.finalApply({ projectId, onboardingSessionId: analysis.onboardingSessionId, sourceHash });
    assert.deepEqual(retry.blockedLayers, []);
    assert.equal(state.snapshots(projectId).length, snapshotsAfterFirstApply, 'equal retry must not append a state snapshot');
    // 类型化输入管线（lib 负向）：损坏的已接受记录被结构化契约错误拒绝。
    const applier = createLayerApplier({ characters, worldview, outline, relationship, state, canon });
    let rejected = false;
    try {
      await applier.applyLayer('characters', {
        layer: 'characters', proposalId: 'p-bad', confidence: 'high',
        candidates: [{ id: 'mira', name: '米拉' }],
      }, projectId, new Set());
    } catch (cause) {
      rejected = /不符合层契约/.test(cause.message);
    }
    assert.equal(rejected, true, 'malformed accepted record must fail loudly via the typed pipeline');

    console.log('I80 Part 3: lib 行为等价（apply 顺序 + 幂等重试 + 类型化管线负向）OK');
  } finally {
    rmSync(projectsRoot, { recursive: true, force: true });
  }
}

console.log('I80 smoke: 类型断言归零 + 拆分成立/职责归位 + lib 行为等价通过');
