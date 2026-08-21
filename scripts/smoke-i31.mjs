import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettingsService } from '../lib/host/settings-service.js';

const root = await mkdtemp(join(tmpdir(), 'novel-i31-smoke-'));
const seen = [];
const llm = { async *stream(options) {
  seen.push(options);
  yield { type: 'text-delta', text: '候选正文' };
  yield { type: 'finish', reason: { kind: 'stop' } };
} };
const config = {
  version: 1,
  backends: [{ id: 'draft', modelRef: 'dsh/draft-model', secretRef: 'DRAFT_API_KEY', sampling: { temperature: 0.4 } }],
  templates: [{ id: 'chapter', backendRef: 'draft', roleHeaders: { system: 'SYSTEM', user: 'USER', assistant: 'ASSISTANT' }, sectionOrder: ['state', 'outline'], stopSequences: [] }],
  presets: [{ id: 'safe', backendRef: 'draft', systemPrompt: '保持正史。' }],
  active: { backendId: 'draft', templateId: 'chapter', presetId: 'safe' },
};
try {
  const resolved = [];
  const service = createSettingsService(llm, root, { async resolve(ref) { resolved.push(ref); return { value: 'never-exposed' }; } });
  await service.save(config);
  const result = await service.generate({ sections: [{ id: 'outline', text: 'OUTLINE' }, { id: 'state', text: 'STATE' }], userPrompt: '继续这一幕。' });
  assert.equal(result.text, '候选正文');
  assert.ok(result.prompt.indexOf('STATE') < result.prompt.indexOf('OUTLINE'));
  assert.deepEqual({ provider: seen[0].provider, model: seen[0].model, temperature: seen[0].temperature, stop: seen[0].stop }, { provider: 'dsh', model: 'draft-model', temperature: 0.4, stop: [] });
  assert.deepEqual(resolved, ['DRAFT_API_KEY']);
  assert.ok(!JSON.stringify(await service.load()).includes('DRAFT_API_KEY'));
  console.log('I31 smoke passed: persisted A2 config renders ordered Host prompt and delegates only through ctx.llm');
} finally {
  await rm(root, { recursive: true, force: true });
}
