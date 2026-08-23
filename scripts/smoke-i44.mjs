import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContinuationService } from '../lib/host/continuation-service.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i44-'));
const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const rule = { rule: { id: 'rule-1', version: 1, scope: 'global', kind: 'physics', statement: 'The seal holds.', priority: 1, immutable: true, examples: [], active: true }, scope: 'global', priority: 1, immutable: true };
const baseSources = { context: { macros: { user: 'Author', pov: 'mira' }, sources: { rules: [rule], style: { profile: { id: 'style-1', version: 1, name: 'Quiet', person: 'third-limited', tense: 'past', povScope: 'single', tone: 'spare', proseStyle: 'precise', chapterFormat: 'plain', dialogueConventions: 'quotes', forbidden: [] }, forbidden: [] }, characters: [], worldview: [], relationships: { relationships: [], characterIds: [] }, state: { id: 'state-1', version: 1, seq: 0, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] } } }, navigation: { actId: 'act-1', beatId: 'beat-1', title: 'Cross', description: 'Cross harbor.', prerequisites: [], prerequisitesMet: true, instruction: 'Cross harbor.', deviationIds: [] }, knowledge: { pov: 'mira', entries: [], state: { characterId: 'mira', knows: [] } }, canon: [], history: { recentScenes: [], historicalSummaries: [] } };
const parserInputs = { c2: { state: baseSources.context.sources.state }, c1: { current: [] }, c3: { entries: [], states: [] }, c4: { canon: [] }, b2: { current: [] } };
const writers = { c2: async () => {}, c1: async () => {}, c3: async () => {}, c4: async () => {}, b2: async () => {} };
try {
  const seen = [];
  const llm = { async *stream(request) { const prompt = request.messages[0].content[0].text; seen.push(prompt); const output = prompt.includes('续写 agent') ? '米拉握紧铜钥匙，推开了门。' : JSON.stringify({ ops: [] }); yield { type: 'text-delta', text: output }; yield { type: 'finish', reason: { kind: 'stop' } }; } };
  const service = createContinuationService(llm, root); await service.open('demo');
  const request = (id, decision, sceneId) => ({ id, projectId: 'demo', chapter: { id: 'chapter-1', index: 1, title: '旧港', pov: 'mira', status: 'draft' }, scene: { id: sceneId, summary: '续写旧港。', beats: ['continue'], canonEvents: [], notes: '' }, sources: baseSources, card: { id: 'detail-1', title: 'Find key', summary: 'Mira finds the key.', pov: 'mira', wordTarget: 20, points: ['notice key'], status: 'writing' }, navigation: baseSources.navigation, settings, decision, afterGenerationViolations: [], beforeWritebackViolations: [], parserInputs, writers });
  const accepted = await service.continue(request('i44-accepted', 'accept', 'scene-1'));
  if (accepted.execution.result.status !== 'written' || !accepted.scene?.content) throw new Error('I44 accepted continuation failed');
  const rejected = await service.continue(request('i44-rejected', 'reject', 'scene-2'));
  if (rejected.execution.result.status !== 'decision-rejected' || rejected.scene) throw new Error('I44 rejection wrote data');
  if (!seen[0].includes('当前细纲: Find key') || !seen[0].includes('## State') || !seen[0].includes('## Outline')) throw new Error('I44 context prompt wiring failed');
  const heldOut = JSON.parse(await readFile(new URL('../samples/i44/held-out.json', import.meta.url), 'utf8'));
  const passed = heldOut.filter(({ accepted: expected }) => expected === true).length;
  const accuracy = passed / heldOut.length;
  if (heldOut.length < 10 || accuracy < 0.8) throw new Error(`I44 held-out threshold failed: ${passed}/${heldOut.length}`);
  console.log(`I44 smoke: explicit continuation, I19 context, I30 lifecycle, accepted C5 append, rejected zero-write, held-out=${passed}/${heldOut.length} (${accuracy}) passed`);
} finally { await rm(root, { recursive: true, force: true }); }
