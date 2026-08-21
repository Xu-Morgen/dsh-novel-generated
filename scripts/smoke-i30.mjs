import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStoryLifecycleService } from '../lib/host/story-lifecycle-service.js';

const root = await mkdtemp(join(tmpdir(), 'novel-i30-smoke-'));
const settings = { modelRef: 'dsh/default', credentialRef: 'dsh/managed' };
const llm = { async *stream(request) {
  const prompt = request.messages[0].content[0].text;
  const output = prompt === '继续写这一幕' ? '米拉在码头找到铜钥匙。'
    : prompt.includes('C2 状态') || prompt.includes('C1 关系') || prompt.includes('C3 知情') || prompt.includes('C4 正史') || prompt.includes('B2 世界观') ? { ops: [] }
    : (() => { throw new Error(`Unexpected prompt: ${prompt}`); })();
  yield { type: 'text-delta', text: typeof output === 'string' ? output : JSON.stringify(output) };
  yield { type: 'finish', reason: { kind: 'stop' } };
} };
try {
  const writes = [];
  const writers = Object.fromEntries(['c2', 'c1', 'c3', 'c4', 'b2'].map((stage) => [stage, async () => { writes.push(stage); }]));
  const service = createStoryLifecycleService(llm, root);
  const result = await service.run({
    id: 'smoke-lifecycle', projectId: 'smoke-project', prompt: '继续写这一幕', settings, decision: 'accept', afterGenerationViolations: [], beforeWritebackViolations: [], writers,
    parserInputs: {
      c2: { state: { id: 'state-1', version: 1, seq: 0, storyTime: 'night', scene: { location: 'harbor', timeOfDay: 'night', weather: 'fog', season: 'winter', atmosphere: 'tense' }, characters: [] } },
      c1: { current: [] }, c3: { entries: [], states: [] }, c4: { canon: [] }, b2: { current: [] },
    },
  });
  assert.equal(result.result.status, 'written');
  assert.deepEqual(writes, ['c2', 'c1', 'c3', 'c4', 'b2']);
  console.log('I30 smoke passed: fake ctx.llm full lifecycle writes in serial saga order');
} finally {
  await rm(root, { recursive: true, force: true });
}
