import { describe, expect, it } from 'vitest';

import { createDesktopMigrationClient } from './migration-client.js';
import { createDesktopIpcClient } from './desktop-ipc-client.js';

describe('I182 Renderer desktop migration client', () => {
  it('parses strict preview results and rejects malformed success values', async () => {
    const transport = createDesktopIpcClient({
      version: 1,
      invoke: async (methodId) => methodId.endsWith('/preview')
        ? { ok: true, value: { operationId: 'migration-op', sourceFingerprint: 'a'.repeat(64), source: { projects: 'missing', settings: 'missing', projectCount: 0, invalidEntries: 0 }, projects: [], settings: { a2: { status: 'absent', bytes: 0 }, workbench: { status: 'absent', bytes: 0 } }, backup: { planned: true }, canExecute: false, confirmation: null } }
        : { ok: true, value: { unexpected: true } },
      cancel: async () => ({ ok: true, value: undefined }),
      onProgress: () => () => {},
    });
    const client = createDesktopMigrationClient(transport);
    await expect(client.preview()).resolves.toMatchObject({ ok: true, value: { canExecute: false } });
    await expect(client.execute('migration-op')).resolves.toMatchObject({ ok: false, error: { code: 'invalid-result' } });
  });
});
