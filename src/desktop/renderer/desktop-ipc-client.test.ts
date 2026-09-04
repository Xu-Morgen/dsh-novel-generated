import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { IpcEnvelope } from '../../app/ipc-registry.js';
import type { IpcProgressEvent } from '../../app/ipc-transport.js';
import { unwrap } from '../../client/shared.js';
import type { DesktopBridge } from '../preload/bridge.js';
import { createDesktopIpcClient } from './desktop-ipc-client.js';
import { DESKTOP_CLIENT_SERVICES } from './ipc-client-registry.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

interface FakeBridgeControls {
  readonly bridge: DesktopBridge;
  readonly invokes: Array<{ methodId: string; args: readonly unknown[]; requestId?: string }>;
  readonly cancels: string[];
  progress(event: IpcProgressEvent): void;
  progressDisposed(): boolean;
}

function fakeBridge(invoke?: DesktopBridge['invoke']): FakeBridgeControls {
  const invokes: FakeBridgeControls['invokes'] = [];
  const cancels: string[] = [];
  let listener: ((event: IpcProgressEvent) => void) | undefined;
  let disposed = false;
  return {
    invokes,
    cancels,
    bridge: {
      version: 1,
      invoke: invoke ?? (async (methodId, args, requestId) => {
        invokes.push({ methodId, args, requestId });
        return { ok: true, value: { methodId } };
      }),
      cancel: async (requestId) => {
        cancels.push(requestId);
        return { ok: true, value: undefined };
      },
      onProgress(next) {
        listener = next;
        return () => { disposed = true; listener = undefined; };
      },
    },
    progress: (event) => listener?.(event),
    progressDisposed: () => disposed,
  };
}

describe('I174 generated Renderer IPC client', () => {
  it('derives all 31 service keys and all canonical consumed methods from one registry', async () => {
    const controls = fakeBridge();
    const client = createDesktopIpcClient(controls.bridge);
    const calls: Array<Promise<unknown>> = [];

    expect(DESKTOP_CLIENT_SERVICES).toHaveLength(31);
    expect(new Set(DESKTOP_CLIENT_SERVICES.map(({ key }) => key)).size).toBe(31);
    expect(DESKTOP_CLIENT_SERVICES.reduce((count, service) => count + service.methods.length, 0)).toBe(207);
    expect(Object.keys(client.services).sort()).toEqual(DESKTOP_CLIENT_SERVICES.map(({ key }) => key).sort());

    for (const service of DESKTOP_CLIENT_SERVICES) {
      const namespace = client.services[service.key] as object as Record<string, (...args: readonly unknown[]) => Promise<unknown>>;
      expect(Object.keys(namespace).sort()).toEqual(service.methods.map(({ method }) => method).sort());
      for (const method of service.methods) calls.push(namespace[method.method]('fixture-argument'));
    }
    await Promise.all(calls);

    expect(controls.invokes.map(({ methodId }) => methodId)).toEqual(
      DESKTOP_CLIENT_SERVICES.flatMap(({ methods }) => methods.map(({ methodId }) => methodId)),
    );
    expect(controls.invokes.every(({ args }) => args[0] === 'fixture-argument')).toBe(true);
  });

  it('keeps the legacy unwrap envelope behavior without a Remote fallback', async () => {
    const controls = fakeBridge();
    const client = createDesktopIpcClient(controls.bridge);

    const result = await unwrap(client.services.workspace.viewModel());

    expect(result).toEqual({ methodId: 'novel-creation-tool/novelWorkspace/viewModel' });
    expect(controls.invokes[0]).toEqual({
      methodId: 'novel-creation-tool/novelWorkspace/viewModel',
      args: [],
      requestId: 'desktop:1',
    });
  });

  it('fails closed for malformed bridge results before a consumer writes UI state', async () => {
    const controls = fakeBridge(async () => ({ ok: true } as never));
    const client = createDesktopIpcClient(controls.bridge);
    const apply = vi.fn();
    const request = client.services.workspace.viewModel();

    await expect(request).resolves.toMatchObject({ ok: false, error: { code: 'invalid-result' } });
    await expect(client.consume(request, apply)).resolves.toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(client.getSnapshot().lastError?.code).toBe('invalid-result');
  });

  it('cancels in-flight calls and turns late results into bridge-closed without UI writes', async () => {
    let settle: ((result: IpcEnvelope<unknown>) => void) | undefined;
    const controls = fakeBridge((_methodId, _args, requestId) => {
      controls.invokes.push({ methodId: _methodId, args: _args, requestId });
      return new Promise((resolveRequest) => { settle = resolveRequest; });
    });
    const client = createDesktopIpcClient(controls.bridge);
    const apply = vi.fn();
    const request = client.services.workspace.viewModel();
    const consumed = client.consume(request, apply);

    expect(client.getSnapshot().pendingCount).toBe(1);
    controls.progress({ requestId: 'desktop:1', value: { completed: 1 } });
    expect(client.getSnapshot().progress).toMatchObject({
      requestId: 'desktop:1',
      methodId: 'novel-creation-tool/novelWorkspace/viewModel',
    });

    client.dispose();
    settle?.({ ok: true, value: { version: 'late' } });

    await expect(request).resolves.toMatchObject({ ok: false, error: { code: 'bridge-closed' } });
    await expect(consumed).resolves.toBe(false);
    expect(apply).not.toHaveBeenCalled();
    expect(controls.cancels).toEqual(['desktop:1']);
    expect(controls.progressDisposed()).toBe(true);
    expect(client.getSnapshot()).toEqual({ status: 'closed', pendingCount: 0 });
  });

  it('cancels every in-flight request for a stopped generation method', async () => {
    const controls = fakeBridge((_methodId, _args, requestId) => {
      controls.invokes.push({ methodId: _methodId, args: _args, requestId });
      return new Promise(() => undefined);
    });
    const client = createDesktopIpcClient(controls.bridge);
    void client.services.writing.propose('alpha', { intent: 'continue' }, undefined);
    void client.services.writing.proposeAt('alpha', { intent: 'continue', chapterId: 'c1', sceneId: 's1' }, undefined);

    client.cancelMethod('novel-creation-tool/novelWriting/propose');
    expect(controls.cancels).toEqual(['desktop:1']);
    client.dispose();
  });

  it('projects transport failures without exposing the rejected cause', async () => {
    const controls = fakeBridge(async () => { throw new Error('secret endpoint and key'); });
    const client = createDesktopIpcClient(controls.bridge);

    await expect(client.services.workspace.viewModel()).resolves.toMatchObject({
      ok: false,
      error: { code: 'handler-failed', message: 'Desktop bridge invocation failed', details: {} },
    });
    expect(client.getSnapshot()).toMatchObject({
      status: 'error',
      lastError: { code: 'handler-failed', message: 'Desktop bridge invocation failed' },
    });
    expect(JSON.stringify(client.getSnapshot())).not.toContain('secret endpoint');
  });

  it('keeps the generated aliases equal to the historical mount registry and canonical lock', () => {
    const mountSource = readFileSync(resolve(root, 'src/client/mount-registry.ts'), 'utf8');
    const lock = JSON.parse(readFileSync(resolve(root, 'contracts/desktop/ipc-methods.json'), 'utf8')) as {
      descriptorIds: string[];
    };
    const historical = [...mountSource.matchAll(/\{ key: '([^']+)', contribution: [^,]+, serviceKey: 'remote\.([^']+)'/g)]
      .map((match) => ({ key: match[1], namespace: match[2] }));

    expect(DESKTOP_CLIENT_SERVICES.map(({ key, namespace }) => ({ key, namespace }))).toEqual(historical);
    expect(lock.descriptorIds).toHaveLength(217);
    expect(DESKTOP_CLIENT_SERVICES.flatMap(({ methods }) => methods.map(({ methodId }) => methodId))
      .every((methodId) => lock.descriptorIds.includes(methodId))).toBe(true);
  });
});
