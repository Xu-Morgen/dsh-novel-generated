import assert from 'node:assert/strict';
import { createGenerationService } from '../lib/host/generation-service.js';

const seen = [];
const service = createGenerationService({
  async *stream(request) {
    seen.push(request);
    yield { type: 'text-delta', index: 0, text: 'I17-' };
    yield { type: 'text-delta', index: 0, text: 'SMOKE' };
    yield { type: 'finish', reason: { kind: 'stop' } };
  },
});
const result = await service.generate('smoke', { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });
assert.equal(result.text, 'I17-SMOKE');
assert.equal(seen.length, 1);
assert.equal(seen[0].provider, 'dsh');
assert.equal(seen[0].model, 'default');
assert.equal(seen[0].messages[0].content[0].text, 'smoke');
assert.equal('credentialRef' in seen[0], false);
console.log('I17 smoke passed: Host stream routed through DSH GenerateOptions');
