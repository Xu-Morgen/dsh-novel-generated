import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { createExtensionService } from '../lib/host/extension-service.js';

const root = await mkdtemp(join(tmpdir(), 'novel-i32-smoke-'));
const seen = [];
const llm = { async *stream(options) {
  seen.push(options);
  yield { type: 'text-delta', text: '{"ops":[{"op":"set","field":"reserves","value":8}]}' };
  yield { type: 'finish', reason: { kind: 'stop' } };
} };
let dispose;
try {
  const schema = z.object({ currency: z.string(), reserves: z.number().int().nonnegative() }).strict();
  const service = createExtensionService(llm, root, (value) => { dispose = value; });
  service.register({ id: 'economy-provider', kind: 'provider', layerId: 'economy', schema });
  service.register({ id: 'economy-injector', kind: 'injector', layerId: 'economy', heading: 'Economy', serialize: (value) => `${value.currency}:${value.reserves}` });
  service.register({ id: 'economy-validator', kind: 'validator', check: () => [{ kind: 'economy-warning', severity: 'soft', message: 'Low reserve', references: ['economy'] }] });
  service.register({ id: 'economy-parser', kind: 'parser', layerId: 'economy', outputSchema: z.object({ ops: z.array(z.unknown()) }).strict(), parse: async (input, settings, runtime) => JSON.parse((await runtime.generate(`economy:${input.reserves}`, settings)).text) });
  service.register({ id: 'betrayal-rule', kind: 'relationship-rule', evaluate: () => [{ relationshipId: 'alice-bob', field: 'trust', delta: -30 }] });
  service.register({ id: 'calm-strategy', kind: 'backend-strategy', adapt: (input) => ({ ...input, temperature: 0.2 }) });

  await service.saveLayer({ projectId: 'smoke-project', layerId: 'economy', value: { currency: 'crown', reserves: 5 } });
  const layer = await service.loadLayer({ projectId: 'smoke-project', layerId: 'economy' });
  assert.equal(service.serializeLayer('economy', layer), 'crown:5');
  assert.deepEqual(await service.runParser('economy', layer, { modelRef: 'dsh/parser', credentialRef: 'HOST_ONLY' }), { ops: [{ op: 'set', field: 'reserves', value: 8 }] });
  assert.equal(service.adjudicate(service.runValidators(layer)).status, 'warn');
  assert.deepEqual(service.adaptBackendRequest({ modelRef: 'dsh/parser', credentialRef: 'HOST_ONLY', temperature: 1 }), { modelRef: 'dsh/parser', temperature: 0.2 });
  assert.deepEqual(service.evaluateRelationshipRules({ event: 'betrayal' }), []);
  service.armRelationshipRules();
  assert.equal(service.evaluateRelationshipRules({ event: 'betrayal' })[0].provenance.ruleId, 'betrayal-rule');
  assert.equal(JSON.stringify(seen).includes('HOST_ONLY'), false);

  dispose();
  assert.throws(() => service.seams(), /disposed/);
  console.log('I32 smoke passed: one Fiber registry covers all six Host-owned seams and disposes cleanly');
} finally {
  await rm(root, { recursive: true, force: true });
}
