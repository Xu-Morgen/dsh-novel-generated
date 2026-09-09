import { expect, it } from 'vitest';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { outlineDescriptionDescriptors } from '../../app/outline-description-contract.js';
import { IPC_METHOD_IDS } from '../preload/ipc-method-ids.js';
import { DESKTOP_CLIENT_SERVICES } from '../renderer/ipc-client-registry.js';

it('I212 strict descriptors are wired and reject malformed arguments/results', async () => {
  for (const descriptor of outlineDescriptionDescriptors) {
    expect(desktopIpcRegistry.get(descriptor.id)).toEqual(descriptor);
    expect(IPC_METHOD_IDS).toContain(descriptor.id);
    expect(DESKTOP_CLIENT_SERVICES.find(service => service.key === 'workspace')!.methods.some(method => method.methodId === descriptor.id)).toBe(true);
    const input = descriptor.method === 'descriptionGenerate' ? { projectId: 'book', kind: 'act', actId: 'act' } : { projectId: 'book', proposalId: 'proposal', accept: true };
    let calls = 0;
    expect(await desktopIpcRegistry.invoke(descriptor.id, [{ ...input, extra: true }], () => { calls++; })).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(calls).toBe(0);
    expect(await desktopIpcRegistry.invoke(descriptor.id, [input], () => ({ description: 'wrong shape' }))).toMatchObject({ ok: false, error: { code: 'invalid-result' } });
  }
});
