import assert from 'node:assert/strict';
import { createGenerationService } from '../lib/host/generation-service.js';

const seen = [];
const service = createGenerationService({
  async *stream(request) {
    seen.push(request);
    yield { text: 'I17-' };
    yield { text: 'SMOKE' };
  },
});
const result = await service.generate('smoke', { modelRef: 'dsh/default', credentialRef: 'dsh/managed' });
assert.equal(result.text, 'I17-SMOKE');
assert.equal(seen.length, 1);
assert.equal(seen[0].settings.credentialRef, 'dsh/managed');
assert.equal('endpoint' in seen[0].settings, false);
console.log('I17 smoke passed: Host stream routed through injected backend');
