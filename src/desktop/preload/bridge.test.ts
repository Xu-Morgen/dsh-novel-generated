import { describe, expect, it } from 'vitest';

import type { IpcInvokeRequest, IpcProgressEvent } from '../../app/ipc-transport.js';
import { createDesktopBridge } from './bridge.js';

const methodId = 'novel-creation-tool/test/probe';

describe('I172 versioned preload bridge', () => {
  it('sends only allowlisted methods through fixed transport data', async () => {
    const requests: IpcInvokeRequest[] = [];
    const bridge = createDesktopBridge([methodId], {
      invoke: async (request) => { requests.push(request); return { ok: true, value: { ready: true } }; },
      cancel: async () => ({ ok: true, value: undefined }),
      onProgress: () => () => undefined,
    });

    expect(Object.keys(bridge)).toEqual(['version', 'invoke', 'cancel', 'onProgress']);
    expect(bridge.version).toBe(1);
    await expect(bridge.invoke(methodId, [], 'smoke-request')).resolves.toEqual({ ok: true, value: { ready: true } });
    expect(requests).toEqual([{ methodId, args: [], requestId: 'smoke-request' }]);
  });

  it('rejects unknown methods, malformed args, and invalid request ids before transport', async () => {
    let transportCalls = 0;
    const bridge = createDesktopBridge([methodId], {
      invoke: async () => { transportCalls += 1; return { ok: true, value: undefined }; },
      cancel: async () => { transportCalls += 1; return { ok: true, value: undefined }; },
      onProgress: () => () => undefined,
    });

    await expect(bridge.invoke('novel-creation-tool/test/other', [])).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    await expect(bridge.invoke(methodId, 'not-an-array' as never)).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    await expect(bridge.invoke(methodId, [], 'contains spaces')).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    await expect(bridge.cancel('')).resolves.toMatchObject({ ok: false, error: { code: 'invalid-request' } });
    expect(transportCalls).toBe(0);
  });

  it('supports explicit cancellation and bounded progress subscription cleanup', async () => {
    let cancelRequest: unknown;
    let progressListener: ((event: IpcProgressEvent) => void) | undefined;
    let removed = false;
    const bridge = createDesktopBridge([methodId], {
      invoke: async () => ({ ok: true, value: undefined }),
      cancel: async (request) => { cancelRequest = request; return { ok: true, value: undefined }; },
      onProgress: (listener) => { progressListener = listener; return () => { removed = true; }; },
    });

    await expect(bridge.cancel('request-1')).resolves.toEqual({ ok: true, value: undefined });
    expect(cancelRequest).toEqual({ requestId: 'request-1' });
    const disposeProgress = bridge.onProgress((event) => { expect(event.requestId).toBe('request-1'); });
    progressListener?.({ requestId: 'request-1', value: { phase: 'working' } });
    disposeProgress();
    expect(removed).toBe(true);
  });
});
