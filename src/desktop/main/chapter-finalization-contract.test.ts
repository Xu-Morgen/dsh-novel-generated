import { expect, it } from 'vitest';
import { chapterFinalizationDescriptors } from '../../app/chapter-finalization-contract.js';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { IPC_METHOD_IDS } from '../preload/ipc-method-ids.js';
import { DESKTOP_CLIENT_SERVICES } from '../renderer/ipc-client-registry.js';

it('I217 chapter methods enforce strict input/result through canonical registry and both clients', async () => {
  for (const descriptor of chapterFinalizationDescriptors) {
    expect(IPC_METHOD_IDS).toContain(descriptor.id);
    expect(DESKTOP_CLIENT_SERVICES.find(service => service.key === 'workspace')!.methods.some(method => method.methodId === descriptor.id)).toBe(true);
    const input = descriptor.method === 'chapterFinalize' ? { projectId: 'book', proposalId: 'proposal', accept: true } : { projectId: 'book', chapterId: 'chapter' };
    let calls = 0;
    expect(await desktopIpcRegistry.invoke(descriptor.id, [{ ...input, candidateId: 'forged' }], () => { calls++; })).toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    expect(calls).toBe(0);
    expect(await desktopIpcRegistry.invoke(descriptor.id, [input], () => ({ wrong: true }))).toMatchObject({ ok: false, error: { code: 'invalid-result' } });
  }
});
