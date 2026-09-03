import { describe, expect, it } from 'vitest';

import { createCredentialStore } from './credentials.js';
import { createFakeSecureStorage } from '../platform/fake-secure-storage.js';

describe('I169 CredentialStore', () => {
  it('exposes only configured state while Main resolver retains the secret boundary', async () => {
    const fake = createFakeSecureStorage();
    const credentials = createCredentialStore(fake.storage);
    const secret = 'sk-test-only';

    await expect(credentials.store.describe('NOVEL_API_KEY')).resolves.toEqual({ ref: 'NOVEL_API_KEY', configured: false });
    await credentials.store.set('NOVEL_API_KEY', secret);
    const description = await credentials.store.describe('NOVEL_API_KEY');
    expect(description).toEqual({ ref: 'NOVEL_API_KEY', configured: true });
    expect(Object.keys(description)).toEqual(['ref', 'configured']);
    expect(JSON.stringify(description)).not.toContain(secret);
    await expect(credentials.resolver.resolve('NOVEL_API_KEY')).resolves.toBe(secret);

    await credentials.store.delete('NOVEL_API_KEY');
    await expect(credentials.store.describe('NOVEL_API_KEY')).resolves.toEqual({ ref: 'NOVEL_API_KEY', configured: false });
    expect(fake.probe).toEqual({ reads: 4, writes: 1, deletes: 1 });
  });

  it('rejects invalid references and never writes settings after secure-store failure', async () => {
    const fake = createFakeSecureStorage({ available: false });
    const credentials = createCredentialStore(fake.storage);
    let settingsWrites = 0;
    const saveA2AfterCredential = async (): Promise<void> => {
      await credentials.store.set('NOVEL_API_KEY', 'secret');
      settingsWrites += 1;
    };

    await expect(credentials.store.set('bad-ref', 'secret')).rejects.toThrow(/Invalid credential reference/);
    await expect(saveA2AfterCredential()).rejects.toThrow(/secure storage write failed/);
    expect(settingsWrites).toBe(0);
    await expect(credentials.store.set('NOVEL_API_KEY', '')).rejects.toThrow(/secret is required/);
  });
});
