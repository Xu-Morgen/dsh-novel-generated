import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createChapterWritingService } from '../lib/host/chapter-writing-service.js';

const root = await mkdtemp(join(tmpdir(), 'novel-smoke-i43-'));
try {
  const seen = [];
  const llm = {
    async *stream(request) {
      const prompt = request.messages[0].content[0].text;
      seen.push(prompt);
      const output = prompt.includes('你是长篇小说章节写作器')
        ? '黎明前，米拉推开旧港的门。她看见铜钥匙在雾中闪了一下，终于决定踏进去。'
        : JSON.stringify({ ops: [] });
      yield { type: 'text-delta', text: output };
      yield { type: 'finish', reason: { kind: 'stop' } };
    },
  };
  const service = createChapterWritingService(llm, root);
  await service.open('demo');
  const result = await service.write({
    id: 'i43-smoke', projectId: 'demo',
    chapter: { id: 'chapter-1', index: 1, title: '旧港', pov: 'mira', status: 'draft' },
    scene: { id: 'scene-1', summary: '米拉进入旧港。', beats: ['enter'], canonEvents: [], notes: '' },
    card: { id: 'card-1', title: '推门', summary: '米拉在黎明前进入旧港。', pov: 'mira', wordTarget: 40, points: ['发现铜钥匙', '做出决定'], status: 'writing' },
    navigation: { actId: 'act-1', beatId: 'beat-1', title: '进入旧港', description: '找到入口。', prerequisites: [], prerequisitesMet: true, instruction: '完成进入旧港。', deviationIds: [] },
    settings: { modelRef: 'dsh/default', credentialRef: 'dsh/managed' }, decision: 'accept',
    afterGenerationViolations: [], beforeWritebackViolations: [],
    parserInputs: { c2: { state: { id: 'state-1', version: 1, seq: 0, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] } }, c1: { current: [] }, c3: { entries: [], states: [] }, c4: { canon: [] }, b2: { current: [] } },
    writers: Object.fromEntries(['c2', 'c1', 'c3', 'c4', 'b2'].map((stage) => [stage, async () => {}])),
  });
  if (result.execution.result.status !== 'written' || !result.scene?.content.startsWith('黎明前') || !result.exports['chapter-1.txt']?.endsWith('决定踏进去。')) throw new Error('I43 accepted chapter smoke failed');
  const rejected = await service.write({
    id: 'i43-rejected', projectId: 'demo', chapter: result.scene ? { id: 'chapter-1', index: 1, title: '旧港', pov: 'mira', status: 'draft' } : result.scene,
    scene: { id: 'scene-2', summary: '不会写入。', beats: [], canonEvents: [], notes: '' },
    card: { id: 'card-2', title: '拒绝', summary: '不应落地。', pov: 'mira', wordTarget: 10, points: [], status: 'writing' },
    navigation: { actId: 'act-1', beatId: 'beat-1', title: '进入旧港', description: '找到入口。', prerequisites: [], prerequisitesMet: true, instruction: '完成进入旧港。', deviationIds: [] },
    settings: { modelRef: 'dsh/default', credentialRef: 'dsh/managed' }, decision: 'reject', afterGenerationViolations: [], beforeWritebackViolations: [], parserInputs: result.execution.result.status === 'written' ? { c2: { state: { id: 'state-1', version: 1, seq: 0, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] } }, c1: { current: [] }, c3: { entries: [], states: [] }, c4: { canon: [] }, b2: { current: [] } } : result.scene, writers: Object.fromEntries(['c2', 'c1', 'c3', 'c4', 'b2'].map((stage) => [stage, async () => {}])),
  });
  if (rejected.execution.result.status !== 'decision-rejected' || rejected.scene || Object.keys(rejected.exports).length !== 0) throw new Error('I43 rejection smoke failed');
  if (!seen[0].includes('目标字数: 40') || !seen[0].includes('软引导')) throw new Error('I43 prompt smoke failed');
  const heldOut = JSON.parse(await readFile(new URL('../samples/i43/held-out.json', import.meta.url), 'utf8'));
  const errors = heldOut.map(({ target, actual }) => Math.abs(actual - target) / target).sort((a, b) => a - b);
  const median = (errors[4] + errors[5]) / 2;
  if (median > 0.3 || errors.some((error) => error > 0.5)) throw new Error(`I43 held-out word error failed: median=${median}`);
  console.log(`I43 smoke: scene-card prompt, accepted C5 chapter, I39 txt/md export, rejection, held-out median=${median} passed`);
} finally { await rm(root, { recursive: true, force: true }); }
