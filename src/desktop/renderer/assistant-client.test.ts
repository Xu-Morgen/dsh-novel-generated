import { describe, expect, it } from 'vitest';

import { createDesktopAssistantClient } from './assistant-client.js';
import { createDesktopIpcClient } from './desktop-ipc-client.js';

describe('I181 Renderer desktop assistant client', () => {
  it('keeps the assistant method surface typed and rejects malformed success values', async () => {
    const transport = createDesktopIpcClient({
      version: 1,
      invoke: async (methodId) => methodId.endsWith('/open')
        ? { ok: true, value: { project: { id: 'demo', version: 1, name: '演示' }, layers: { characters: 'empty', worldview: 'empty', outline: 'empty', relationship: 'empty', state: 'ready', canon: 'empty' } } }
        : { ok: true, value: { unexpected: true } },
      cancel: async () => ({ ok: true, value: undefined }),
      onProgress: () => () => {},
    });
    const client = createDesktopAssistantClient(transport);
    await expect(client.open('demo')).resolves.toMatchObject({ ok: true, value: { project: { id: 'demo' } } });
    await expect(client.context('demo')).resolves.toMatchObject({ ok: false, error: { code: 'invalid-result' } });
  });
});
