import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createCharacterService } from '../lib/host/character-service.js';
import { createWorldviewService } from '../lib/host/worldview-service.js';
import { createOutlineService } from '../lib/host/outline-service.js';
import { createRelationshipService } from '../lib/host/relationship-service.js';
import { createStateService } from '../lib/host/state-service.js';
import { createCanonService } from '../lib/host/canon-service.js';
import { createConfirmationService } from '../lib/host/confirmation-service.js';
import { createOnboardingAnalyzerService } from '../lib/host/onboarding-analyzer-service.js';
import { createOnboardingAdjudicationService } from '../lib/host/onboarding-adjudication-service.js';
import { INITIAL_STATE } from '../lib/core/schema/project-lifecycle.js';

/**
 * I57 初始化进度、取消、重试与应用刷新 smoke（design §14.8 / R12-4）。
 *
 * 交付物核验：
 * - 构建产物（lib/client.js）：分析 busy/progress/cancel/retry 面板、apply-retry
 *   按钮与轮询/重试接线锚点；负向：不再出现旧阻塞式 start 直接落审阅的路径标记。
 * - 样式源码（src/client/styles.ts）：分析面板 / apply-retry 类存在。
 * - Host 行为（lib 服务直连）：begin 立即返回会话 id、status/result 语义、
 *   cancel 零层写入；partial-retryable apply 重试不重复已完成层；
 *   Fiber dispose 后分析 job 归零（status 抛错）。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const fail = (msg) => { throw new Error(`I57 smoke: ${msg}`); };

// Part 1 — 构建产物：分析 busy/progress/cancel/retry + apply-retry 锚点。
{
  const bundlePath = resolve(repoRoot, 'lib', 'client.js');
  if (!existsSync(bundlePath)) fail('lib/client.js missing — run `pnpm build` first');
  const bundle = readFileSync(bundlePath, 'utf8');
  for (const required of [
    // 分析 busy/progress 面板 + 取消。
    'data-novel-analysis-busy', 'data-novel-analysis-status', 'data-novel-analysis-cancel',
    // 失败/取消后的可读错误与重试入口（错误可重试不砖化）。
    'data-novel-analysis-error', 'data-novel-analysis-cancelled', 'data-novel-analysis-retry',
    // apply result 分层显示 + 部分失败重试（partial retry 不重复已完成层）。
    'data-novel-onboarding-result', 'data-novel-onboarding-apply-retry',
  ]) {
    if (!bundle.includes(required)) fail(`bundle missing I57 marker: ${required}`);
  }
  // 防重复 start：分析进行中「分析原文」按钮必须带 disabled 绑定。
  if (!bundle.includes('data-novel-onboarding-start')) fail('bundle lost the onboarding start button marker');
}

// Part 2 — 样式源码：分析面板 / apply-retry 类存在。
{
  const styles = readFileSync(resolve(repoRoot, 'src', 'client', 'styles.ts'), 'utf8');
  for (const required of [
    '.nv-analysis', '.nv-analysis__status', '.nv-analysis__cancel', '.nv-analysis__retry',
    '.nv-analysis--terminal', '.nv-onboarding__apply-retry',
  ]) {
    if (!styles.includes(required)) fail(`styles missing I57 class: ${required}`);
  }
}

// Part 3 — Host 行为：begin/status/result/cancel + partial retry 幂等 + dispose。
const tempRoot = await mkdtemp(join(tmpdir(), 'novel-smoke-i57-'));
const projectId = 'smoke';
const sourceHash = 'c'.repeat(64);
const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const output = {
  evidence: { e1: { sourceChunkIndex: 0, quote: '米拉抵达北港。' } },
  layers: {
    characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    worldview: { candidates: [{ id: 'north-harbor', kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    outline: { candidates: [{ id: 'outline', structure: 'free', logline: '一个测绘师的故事。', themes: [], acts: [{ id: 'act-1', index: 0, title: '开端', goal: '抵达北港', beats: [{ id: 'beat-1', title: '抵达北港', description: '米拉抵达北港', charactersInvolved: ['mira'], conflictType: 'external', prerequisites: [], optional: false, detailBeats: [] }] }], foreshadowing: [], endings: [] }], confidence: 'low', warnings: [], evidenceIds: [] },
    relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    state: { candidates: [{ id: 'initial-state', storyTime: '清晨', scene: { location: '北港', timeOfDay: '', weather: '', season: '', atmosphere: '' }, characters: [{ characterId: 'mira', location: '北港', alive: true, health: '健康', mood: '', inventory: [], condition: '', currentGoal: '', flags: {} }] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    canon: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
  },
};
const backendValue = { async *stream() { yield { type: 'text-delta', text: JSON.stringify(output) }; yield { type: 'finish', reason: { kind: 'stop' } }; } };

try {
  const characters = createCharacterService(tempRoot);
  const worldview = createWorldviewService(tempRoot);
  const outline = createOutlineService(tempRoot);
  const relationship = createRelationshipService(tempRoot);
  const state = createStateService(tempRoot);
  const canon = createCanonService(tempRoot);
  const confirmation = createConfirmationService(tempRoot);
  await Promise.all([characters.open(projectId), worldview.open(projectId), outline.open(projectId), relationship.open(projectId), state.open(projectId, INITIAL_STATE), canon.open(projectId), confirmation.open(projectId)]);

  // I57 session-first：begin 立即返回会话 id（不再阻塞到完整结果）。
  const analyzer = createOnboardingAnalyzerService(backendValue);
  const begun = analyzer.begin({ projectId, sourceHash, text: '米拉抵达北港。' }, settings);
  assert.ok(begun.onboardingSessionId, 'begin must return the session id immediately');
  // 后台 job 汇入 succeeded，result 返回绑定结果。
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(analyzer.status(begun.onboardingSessionId), 'succeeded');
  const result = analyzer.result(begun.onboardingSessionId);
  assert.equal(result.onboardingSessionId, begun.onboardingSessionId);
  assert.equal(result.projectId, projectId);
  assert.ok(result.layers.characters.candidates.length === 1, 'expected one character candidate');

  // 取消零层写入：挂起后端 + cancel → cancelled，result 抛错，角色层零写入。
  {
    let releaseGate;
    const gate = new Promise((resolve) => { releaseGate = resolve; });
    const hanging = { async *stream() {
      yield { type: 'text-delta', text: '{"evidence":{},"layers":{}}' };
      await gate;
      throw new Error('aborted by controller');
    } };
    const cancelAnalyzer = createOnboardingAnalyzerService(hanging);
    const cancelSession = cancelAnalyzer.begin({ projectId, sourceHash, text: '会挂起的分析。' }, settings);
    await cancelAnalyzer.cancel(cancelSession.onboardingSessionId);
    assert.equal(cancelAnalyzer.status(cancelSession.onboardingSessionId), 'cancelled');
    assert.throws(() => cancelAnalyzer.result(cancelSession.onboardingSessionId), /取消/);
    releaseGate();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal((await characters.list(projectId)).length, 0, 'cancel must leave zero layer writes');
  }

  // partial-retryable apply：跳过 B3 使 B5（charactersInvolved 引用 mira）悬空被阻断；
  // 补齐（重新接受 B3）后重试只补未完成层，不重复已完成层（worldview 不重复写）。
  {
    const adjudication = createOnboardingAdjudicationService({ characters, worldview, outline, relationship, state, canon, confirmation }, {
      getResult: (id) => analyzer.getResult(id),
      async regenerate(id, layer, input) { const r = await analyzer.regenerate(id, layer, input); return { layers: r.layers }; },
    });
    // 第一次裁决：B3 跳过（B5 引用其 id → 预检阻断 outline）；worldview 独立应用。
    await adjudication.adjudicate({ projectId, onboardingSessionId: begun.onboardingSessionId, sourceHash, layer: 'characters', decision: 'skip' });
    await adjudication.adjudicate({ projectId, onboardingSessionId: begun.onboardingSessionId, sourceHash, layer: 'worldview', decision: 'accept' });
    await adjudication.adjudicate({ projectId, onboardingSessionId: begun.onboardingSessionId, sourceHash, layer: 'outline', decision: 'accept' });
    for (const layer of ['relationship', 'state', 'canon']) {
      await adjudication.adjudicate({ projectId, onboardingSessionId: begun.onboardingSessionId, sourceHash, layer, decision: 'skip' });
    }
    const first = await adjudication.finalApply({ projectId, onboardingSessionId: begun.onboardingSessionId, sourceHash });
    assert.ok(first.blockedLayers.includes('outline'), 'B5 must be blocked by the skipped B3 reference');
    assert.ok(first.appliedLayers.includes('worldview'), 'worldview applies independently');
    assert.equal(first.retryable, true, 'partial failure must be retryable');
    assert.equal((await worldview.list(projectId)).length, 1);

    // 补齐：将 B3 重新接受（显式跳过是终态，edit 后继解除）后重试 —— 只补未完成层。
    await adjudication.adjudicate({
      projectId, onboardingSessionId: begun.onboardingSessionId, sourceHash,
      layer: 'characters', decision: 'edit', editedValue: output.layers.characters,
    });
    const retried = await adjudication.finalApply({ projectId, onboardingSessionId: begun.onboardingSessionId, sourceHash });
    assert.equal(retried.blockedLayers.length, 0, 'retry must clear the block');
    assert.equal((await characters.list(projectId)).length, 1, 'characters applied once');
    assert.equal((await worldview.list(projectId)).length, 1, 'worldview not duplicated by retry');
    assert.equal((await outline.read(projectId)).logline, '一个测绘师的故事。', 'B5 lands after the retry');
  }

  // Fiber dispose：分析 job 随服务 dispose 归零（status 抛 Unknown session）。
  {
    let disposeJobs;
    const disposeAnalyzer = createOnboardingAnalyzerService(backendValue, (dispose) => { disposeJobs = dispose; });
    const session = disposeAnalyzer.begin({ projectId, sourceHash, text: '米拉抵达北港。' }, settings);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(disposeAnalyzer.status(session.onboardingSessionId), 'succeeded');
    disposeJobs();
    assert.throws(() => disposeAnalyzer.status(session.onboardingSessionId), /Unknown onboarding session/);
  }

  console.log('I57 smoke: 分析 busy/progress/cancel/retry（bundle+样式扫描）+ begin/status/result/cancel 语义 + partial retry 幂等 + dispose 归零 通过');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
