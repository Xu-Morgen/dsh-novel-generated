import { describe, expect, it } from 'vitest';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { ruleStyleRegenerationDescriptors } from '../../app/rule-style-regeneration-contract.js';
import { IPC_METHOD_IDS } from '../preload/ipc-method-ids.js';
import { DESKTOP_CLIENT_SERVICES } from '../renderer/ipc-client-registry.js';

const identity = { projectId: 'book', importSessionId: 'import-test', sourceHash: 'a'.repeat(64) };
describe('I201 strict additive replacement IPC', () => {
  it('registers the same three methods in canonical Main, preload and Renderer', () => {
    const methods = DESKTOP_CLIENT_SERVICES.find(service => service.key === 'ruleStyleImportInitialization')!.methods;
    for (const descriptor of ruleStyleRegenerationDescriptors) {
      expect(desktopIpcRegistry.get(descriptor.id)).toEqual(descriptor);
      expect(IPC_METHOD_IDS).toContain(descriptor.id);
      expect(methods.some(method => method.methodId === descriptor.id)).toBe(true);
    }
  });
  it('rejects malformed arguments and results before they reach a caller', async () => {
    for (const descriptor of ruleStyleRegenerationDescriptors) {
      let calls = 0;
      const args = descriptor.method === 'prepareRegeneration' ? identity : { ...identity, authorizationId: 'approval-test' };
      expect(await desktopIpcRegistry.invoke(descriptor.id, [{ ...args, overwrite: true }], () => { calls++; })).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
      expect(await desktopIpcRegistry.invoke(descriptor.id, [], () => { calls++; })).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
      expect(calls).toBe(0);
      expect(await desktopIpcRegistry.invoke(descriptor.id, [args], () => ({ ...identity, unexpected: true }))).toMatchObject({ ok: false, error: { code: 'invalid-result' } });
    }
  });
});
