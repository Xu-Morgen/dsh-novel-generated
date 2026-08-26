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
import { onboardingAdjudicateInputSchema } from '../lib/core/schema/onboarding.js';
import { INITIAL_STATE } from '../lib/core/schema/project-lifecycle.js';

/**
 * I56 六层初始化裁决正确性 smoke（design §14.8 / R12-3）。
 *
 * 交付物核验：
 * - 构建产物（lib/client.js）：逐层编辑面板（JSON 编辑 + 确认/取消）、重生成
 *   反馈面板、逐层终态状态、apply eligibility 门的所有 data-novel-* 锚点；
 *   负向：adjudicate 载荷必须出现 editedValue/feedback 键（不再空手发裁决）。
 * - 样式源码（src/client/styles.ts）：面板 / 状态徽标 / eligibility 类存在。
 * - Host 行为（lib 服务直连）：edit 精确提交用户值且不写原候选；空候选层
 *   accept 被拒绝；edit 缺 editedValue 被 schema 拒绝。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const fail = (msg) => { throw new Error(`I56 smoke: ${msg}`); };

// Part 1 — 构建产物：逐层编辑控件 + regenerate feedback + 终态门锚点。
{
  const bundlePath = resolve(repoRoot, 'lib', 'client.js');
  if (!existsSync(bundlePath)) fail('lib/client.js missing — run `pnpm build` first');
  const bundle = readFileSync(bundlePath, 'utf8');
  for (const required of [
    // 逐层编辑控件（修改后接受提交真实 editedValue）。
    'data-novel-onboarding-edit-open', 'data-novel-onboarding-edit-text',
    'data-novel-onboarding-edit-confirm', 'data-novel-onboarding-edit-cancel',
    // 打回重生成反馈面板（feedback 随 regenerate 提交 Host）。
    'data-novel-onboarding-regenerate-open', 'data-novel-onboarding-feedback',
    'data-novel-onboarding-regenerate-confirm', 'data-novel-onboarding-regenerate-cancel',
    // 逐层终态状态 + apply eligibility 门。
    'data-novel-onboarding-status', 'data-novel-onboarding-eligibility',
  ]) {
    if (!bundle.includes(required)) fail(`bundle missing I56 marker: ${required}`);
  }
  // 负向：裁决载荷必须携带 editedValue（edit）与 feedback（regenerate），
  // 不再只发 layer+decision 空手裁决。
  if (!bundle.includes('editedValue')) fail('bundle does not wire editedValue into the adjudicate payload');
  if (!bundle.includes('feedback')) fail('bundle does not wire feedback into the adjudicate payload');
}

// Part 2 — 样式源码：面板 / 状态徽标 / eligibility 类存在。
{
  const styles = readFileSync(resolve(repoRoot, 'src', 'client', 'styles.ts'), 'utf8');
  for (const required of [
    '.nv-onboarding__status', '.nv-onboarding__panel', '.nv-onboarding__panel-actions',
    '.nv-onboarding__panel-confirm', '.nv-onboarding__panel-cancel', '.nv-onboarding__eligibility',
  ]) {
    if (!styles.includes(required)) fail(`styles missing I56 class: ${required}`);
  }
}

// Part 3 — Host 行为：edit 精确提交 / 空候选阻止 / edit 缺值拒绝。
const tempRoot = await mkdtemp(join(tmpdir(), 'novel-smoke-i56-'));
const projectId = 'smoke';
const sourceHash = 'b'.repeat(64);
const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const output = {
  evidence: { e1: { sourceChunkIndex: 0, quote: '米拉抵达北港。' } },
  layers: {
    characters: { candidates: [{ id: 'mira', name: '米拉', aliases: [], kind: 'protagonist', personality: '谨慎', background: '测绘师', motivation: '', goals: [], flaws: [], abilities: [], speechStyle: '', staticTraits: [], arc: { startingPoint: '', desiredEnd: '', keyBeats: [] }, relationships: [], knowledgeIds: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    worldview: { candidates: [{ id: 'north-harbor', kind: 'geography', title: '北港', content: '北港位于内海西岸。', keywords: ['北港'], triggerMode: 'keyword', weight: 1, parent: null, mutable: true }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    outline: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    relationship: { candidates: [], confidence: 'high', warnings: [], evidenceIds: [] },
    state: { candidates: [{ id: 'initial-state', storyTime: '清晨', scene: { location: '北港', timeOfDay: '', weather: '', season: '', atmosphere: '' }, characters: [{ characterId: 'mira', location: '北港', alive: true, health: '健康', mood: '', inventory: [], condition: '', currentGoal: '', flags: {} }] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
    canon: { candidates: [{ id: 'arrival', storyTime: '清晨', kind: 'event', summary: '米拉抵达北港', detail: '', participants: ['mira'], location: '北港', consequences: [], affectedLayers: [] }], confidence: 'high', warnings: [], evidenceIds: ['e1'] },
  },
};

try {
  const characters = createCharacterService(tempRoot);
  const worldview = createWorldviewService(tempRoot);
  const outline = createOutlineService(tempRoot);
  const relationship = createRelationshipService(tempRoot);
  const state = createStateService(tempRoot);
  const canon = createCanonService(tempRoot);
  const confirmation = createConfirmationService(tempRoot);
  await Promise.all([characters.open(projectId), worldview.open(projectId), outline.open(projectId), relationship.open(projectId), state.open(projectId, INITIAL_STATE), canon.open(projectId), confirmation.open(projectId)]);
  const backend = { async *stream() { yield { type: 'text-delta', text: JSON.stringify(output) }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
  const analyzer = createOnboardingAnalyzerService(backend);
  const adjudication = createOnboardingAdjudicationService({ characters, worldview, outline, relationship, state, canon, confirmation }, {
    getResult: (id) => analyzer.getResult(id),
    async regenerate(id, layer, input) { const result = await analyzer.regenerate(id, layer, input); return { layers: result.layers }; },
  });
  const analysis = await analyzer.start({ projectId, sourceHash, text: '米拉抵达北港。' }, settings);
  const sessionId = analysis.onboardingSessionId;

  // 空候选层（relationship）accept 必须被拒绝（R12-3 空候选阻止裁决）。
  await assert.rejects(
    () => adjudication.adjudicate({ projectId, onboardingSessionId: sessionId, sourceHash, layer: 'relationship', decision: 'accept' }),
    /无候选/,
  );

  // edit 缺 editedValue 必须被 schema 拒绝（Host 不回退写原候选）。
  await assert.rejects(
    async () => onboardingAdjudicateInputSchema.parse({ projectId, onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'edit' }),
    /editedValue/,
  );

  // edit 精确提交用户值：payload 即用户值，apply 写出的角色性格为用户编辑值。
  const editedLayer = {
    candidates: [{ ...output.layers.characters.candidates[0], personality: '大胆' }],
    confidence: 'high', warnings: [], evidenceIds: ['e1'],
  };
  const record = await adjudication.adjudicate({ projectId, onboardingSessionId: sessionId, sourceHash, layer: 'characters', decision: 'edit', editedValue: editedLayer });
  assert.equal(record.status, 'accepted');
  const stored = confirmation.get(projectId, record.id).payload;
  assert.deepEqual(stored.value, editedLayer, 'proposal payload must carry the exact user-edited value');
  for (const layer of ['worldview', 'state', 'canon']) {
    await adjudication.adjudicate({ projectId, onboardingSessionId: sessionId, sourceHash, layer, decision: 'accept' });
  }
  await adjudication.adjudicate({ projectId, onboardingSessionId: sessionId, sourceHash, layer: 'outline', decision: 'skip' });
  await adjudication.adjudicate({ projectId, onboardingSessionId: sessionId, sourceHash, layer: 'relationship', decision: 'skip' });
  const result = await adjudication.finalApply({ projectId, onboardingSessionId: sessionId, sourceHash });
  assert.deepEqual(result.blockedLayers, []);
  const mira = (await characters.list(projectId)).find((c) => c.id === 'mira');
  assert.equal(mira?.personality, '大胆', 'apply must write the edited value, not the original candidate');
  console.log('I56 smoke: 编辑面板/反馈面板/终态门（bundle+样式扫描）+ Host 精确提交/空候选阻止/edit 缺值拒绝 通过');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
