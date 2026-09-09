import { expect, it } from 'vitest';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { draftCardProgressDescriptors } from '../../app/draft-card-progress-contract.js';
import { IPC_METHOD_IDS } from '../preload/ipc-method-ids.js';
import { DESKTOP_CLIENT_SERVICES } from '../renderer/ipc-client-registry.js';

it('I216 additive methods reject extra arguments and malformed results through strict registry', async () => {
  for (const descriptor of draftCardProgressDescriptors) {
    expect(IPC_METHOD_IDS).toContain(descriptor.id);
    expect(DESKTOP_CLIENT_SERVICES.find(service => service.key === 'workspace')!.methods.some(method => method.methodId === descriptor.id)).toBe(true);
    const input = descriptor.method === 'sceneCardDraftAdopt' ? { candidateId: 'candidate' } : { projectId: 'book', proposalId: 'proposal', accept: true };
    let calls = 0;
    expect(await desktopIpcRegistry.invoke(descriptor.id, [{ ...input, detailBeatId: 'forged' }], () => { calls++; })).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(calls).toBe(0);
    expect(await desktopIpcRegistry.invoke(descriptor.id, [input], () => ({ wrong: true }))).toMatchObject({ ok: false, error: { code: 'invalid-result' } });
  }
});
