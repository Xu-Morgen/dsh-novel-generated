import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { desktopIpcMethodDescriptors, desktopIpcRegistry } from './desktop-ipc-registry.js';

const lockPath = resolve(process.cwd(), 'contracts/desktop/ipc-methods.json');

describe('desktop canonical IPC registry', () => {
  it('covers the historical baseline plus source-import seams exactly once', () => {
    expect(desktopIpcMethodDescriptors).toHaveLength(223);
    expect(desktopIpcRegistry.size).toBe(223);
    expect(new Set(desktopIpcMethodDescriptors.map((descriptor) => descriptor.id)).size).toBe(223);
    expect(new Set(desktopIpcMethodDescriptors.map((descriptor) => `${descriptor.namespace}/${descriptor.method}`)).size).toBe(223);
    expect(desktopIpcRegistry.get('novel-creation-tool/novelReviewRepair/propose')).toBeDefined();
    expect(desktopIpcMethodDescriptors.every((descriptor) => descriptor.id === `novel-creation-tool/${descriptor.service}/${descriptor.method}`)).toBe(true);
  });

  it('keeps every parameter and result on a strict codec', () => {
    for (const descriptor of desktopIpcMethodDescriptors) {
      expect(descriptor.result.mode, descriptor.id).toBe('strict');
      for (const parameter of descriptor.parameters) expect(parameter.codec.mode, `${descriptor.id}/${parameter.name}`).toBe('strict');
    }
  });

  it('strictly validates the additive review-repair transport registration', async () => {
    const id = 'novel-creation-tool/novelReviewRepair/propose';
    const validResult = {
      projectId: 'p1', issueId: 'iss-1', issueFingerprint: 'iss-1',
      target: { chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) },
      anchor: { start: 0, end: 2, quote: '米拉', sourceHash: 'a'.repeat(64) },
      lineage: { kind: 'review-repair', issueId: 'iss-1', issueFingerprint: 'iss-1', sourceHash: 'a'.repeat(64) },
      candidate: { id: 'repair-1', intent: 'rewrite', target: { projectId: 'p1', chapterId: 'chapter-1', sceneId: 'scene-1', sourceHash: 'a'.repeat(64) }, prompt: '修复', text: '米拉抬起头。', chunkCount: 1, createdAt: '2026-09-03T00:00:00.000Z' },
    };

    await expect(desktopIpcRegistry.invoke(id, ['p1', { issueId: 'iss-1' }, undefined], async () => validResult))
      .resolves.toEqual({ ok: true, value: validResult });
    await expect(desktopIpcRegistry.invoke(id, ['p1', { issueId: '' }, undefined], async () => validResult))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-arguments' } });
    await expect(desktopIpcRegistry.invoke(id, ['p1', { issueId: 'iss-1' }, undefined], async () => ({ ...validResult, issueFingerprint: 1 })))
      .resolves.toMatchObject({ ok: false, error: { code: 'invalid-result' } });
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
