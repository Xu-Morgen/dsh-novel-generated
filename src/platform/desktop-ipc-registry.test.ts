import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { desktopIpcMethodDescriptors, desktopIpcRegistry } from './desktop-ipc-registry.js';

const lockPath = resolve(process.cwd(), 'contracts/desktop/ipc-methods.json');

describe('desktop canonical IPC registry', () => {
  it('covers the complete current 214 invocation surface exactly once', () => {
    expect(desktopIpcMethodDescriptors).toHaveLength(214);
    expect(desktopIpcRegistry.size).toBe(214);
    expect(new Set(desktopIpcMethodDescriptors.map((descriptor) => descriptor.id)).size).toBe(214);
    expect(new Set(desktopIpcMethodDescriptors.map((descriptor) => `${descriptor.namespace}/${descriptor.method}`)).size).toBe(214);
    expect(desktopIpcMethodDescriptors.every((descriptor) => descriptor.id === `novel-creation-tool/${descriptor.service}/${descriptor.method}`)).toBe(true);
  });

  it('keeps every parameter and result on a strict codec', () => {
    for (const descriptor of desktopIpcMethodDescriptors) {
      expect(descriptor.result.mode, descriptor.id).toBe('strict');
      for (const parameter of descriptor.parameters) expect(parameter.codec.mode, `${descriptor.id}/${parameter.name}`).toBe('strict');
    }
  });

  it('matches the checked-in contract lock and supports a real registry consumer', async () => {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as unknown;
    expect({ schemaVersion: (lock as { schemaVersion: number }).schemaVersion, namespace: (lock as { namespace: string }).namespace, descriptorIds: (lock as { descriptorIds: unknown }).descriptorIds, descriptors: (lock as { descriptors: unknown }).descriptors, schemas: (lock as { schemas: unknown }).schemas })
      .toEqual(desktopIpcRegistry.contractLock());

    const result = await desktopIpcRegistry.invoke(
      'novel-creation-tool/novelProbe/probe',
      [],
      async () => ({ marker: 'I2-PROBE', ready: true }),
    );
    expect(result).toEqual({ ok: true, value: { marker: 'I2-PROBE', ready: true } });
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/novelProbe/probe', [], async () => ({ marker: 'wrong', ready: 'yes' })))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-result' } });
    await expect(desktopIpcRegistry.invoke('novel-creation-tool/does-not-exist/method', [], async () => undefined))
      .resolves.toMatchObject({ ok: false, error: { code: 'unknown-method' } });
  });
});
