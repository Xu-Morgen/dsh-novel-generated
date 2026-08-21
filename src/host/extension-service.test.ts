import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createExtensionService } from './extension-service.js';

const economySchema = z.object({ currency: z.string().min(1), reserves: z.number().int().nonnegative() }).strict();
const parserOutputSchema = z.object({ ops: z.array(z.object({ op: z.string(), field: z.string(), value: z.number() }).strict()) }).strict();

function createLlm(seen: unknown[]) {
  return { async *stream(options: unknown) {
    seen.push(options);
    yield { type: 'text-delta', text: '{"ops":[{"op":"set","field":"reserves","value":9}]}' };
    yield { type: 'finish', reason: { kind: 'stop' } };
  } };
}

describe('I32 Host Extension seams', () => {
  it('runs a custom Provider through Host storage, injection, and Host-routed parsing', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-i32-provider-'));
    const llmCalls: unknown[] = [];
    try {
      const service = createExtensionService(createLlm(llmCalls), projectsRoot);
      service.register({ id: 'economy-provider', kind: 'provider', layerId: 'economy', schema: economySchema });
      service.register({
        id: 'economy-injector', kind: 'injector', layerId: 'economy', heading: 'Economy',
        serialize(value) { const layer = economySchema.parse(value); return `${layer.currency}:${layer.reserves}`; },
      });
      service.register({
        id: 'economy-parser', kind: 'parser', layerId: 'economy', outputSchema: parserOutputSchema,
        async parse(input, settings, runtime, signal) {
          const current = economySchema.parse(input);
          const result = await runtime.generate(`economy ${current.reserves}`, settings, signal);
          return JSON.parse(result.text) as unknown;
        },
      });

      await service.saveLayer({ projectId: 'smoke-project', layerId: 'economy', value: { currency: 'crown', reserves: 7 } });
      const loaded = await service.loadLayer({ projectId: 'smoke-project', layerId: 'economy' });
      expect(loaded).toEqual({ currency: 'crown', reserves: 7 });
      expect(service.serializeLayer('economy', loaded)).toBe('crown:7');
      await expect(service.runParser('economy', loaded, { modelRef: 'dsh/parser', credentialRef: 'HOST_ONLY' })).resolves.toEqual({
        ops: [{ op: 'set', field: 'reserves', value: 9 }],
      });
      expect(llmCalls).toHaveLength(1);
      expect(JSON.stringify(llmCalls)).not.toContain('HOST_ONLY');
      await expect(service.saveLayer({ projectId: 'smoke-project', layerId: 'economy', value: { currency: 'crown', reserves: -1 } })).rejects.toThrow();
    } finally { await rm(projectsRoot, { recursive: true, force: true }); }
  });

  it('rejects project ids that escape the configured projects root', async () => {
    const projectsRoot = await mkdtemp(join(tmpdir(), 'novel-i32-escape-'));
    try {
      const service = createExtensionService(undefined, projectsRoot);
      service.register({ id: 'economy-provider', kind: 'provider', layerId: 'economy', schema: economySchema });
      await expect(service.saveLayer({ projectId: '../escape', layerId: 'economy', value: { currency: 'crown', reserves: 0 } })).rejects.toThrow(/Invalid project ID/);
    } finally { await rm(projectsRoot, { recursive: true, force: true }); }
  });

  it('rejects malformed parser output at the seam boundary', async () => {
    const service = createExtensionService({
      async *stream() {
        yield { type: 'text-delta', text: '{"ops":[{"unexpected":true}]}' };
        yield { type: 'finish', reason: { kind: 'stop' } };
      },
    });
    service.register({ id: 'economy-provider', kind: 'provider', layerId: 'economy', schema: economySchema });
    service.register({
      id: 'economy-parser', kind: 'parser', layerId: 'economy', outputSchema: parserOutputSchema,
      async parse(_input, settings, runtime) {
        return JSON.parse((await runtime.generate('economy', settings)).text) as unknown;
      },
    });
    await expect(service.runParser('economy', { currency: 'crown', reserves: 0 }, { modelRef: 'dsh/parser', credentialRef: 'HOST_ONLY' })).rejects.toThrow();
  });

  it('dispatches validators and backend strategies only at their declared seams', () => {
    const service = createExtensionService(undefined);
    service.register({ id: 'forbidden-debt', kind: 'validator', check: (input) => String(input).includes('debt') ? [{
      kind: 'economy-debt', severity: 'soft', message: 'Debt mentioned', references: ['debt'],
    }] : [] });
    service.register({ id: 'calm-route', kind: 'backend-strategy', adapt: (input) => ({ ...(input as object), temperature: 0.2 }) });

    const findings = service.runValidators('the city has debt');
    expect(findings).toHaveLength(1);
    expect(service.adjudicate(findings).status).toBe('warn');
    expect(service.adaptBackendRequest({ modelRef: 'dsh/draft', credentialRef: 'SECRET', temperature: 1 })).toEqual({
      modelRef: 'dsh/draft', temperature: 0.2,
    });
  });

  it('rejects a backend strategy that reintroduces credentials', () => {
    const service = createExtensionService(undefined);
    service.register({ id: 'leaky-route', kind: 'backend-strategy', adapt: (input) => ({ ...(input as object), credentialRef: 'RAW' }) });
    expect(() => service.adaptBackendRequest({ modelRef: 'dsh/draft', credentialRef: 'SECRET', temperature: 1 })).toThrow();
  });

  it('keeps relationship rules disabled by default and attaches registry-owned provenance when armed', () => {
    const service = createExtensionService(undefined);
    service.register({
      id: 'betrayal-rule', kind: 'relationship-rule',
      evaluate: () => [{ relationshipId: 'alice-bob', field: 'trust', delta: -30 }],
    });
    const trigger = { canonEventId: 'event-7', kind: 'betrayal' };
    expect(service.evaluateRelationshipRules(trigger)).toEqual([]);
    service.armRelationshipRules();
    expect(service.evaluateRelationshipRules(trigger)).toEqual([{
      relationshipId: 'alice-bob', field: 'trust', delta: -30,
      provenance: { ruleId: 'betrayal-rule', input: trigger },
    }]);
  });

  it('rejects a malformed relationship-rule delta', () => {
    const service = createExtensionService(undefined);
    service.register({ id: 'bad-rule', kind: 'relationship-rule', evaluate: () => [{ relationshipId: 'alice-bob', field: 'made-up' } as unknown as never] });
    service.armRelationshipRules();
    expect(() => service.evaluateRelationshipRules({ event: 'betrayal' })).toThrow();
  });

  it('removes every registration when the owning Fiber disposes', () => {
    let dispose: (() => void) | undefined;
    const service = createExtensionService(undefined, undefined, (value) => { dispose = value; });
    service.register({ id: 'validator-one', kind: 'validator', check: () => [] });
    expect(service.seams().validators).toHaveLength(1);
    dispose?.();
    expect(() => service.seams()).toThrow(/disposed/);
  });
});
