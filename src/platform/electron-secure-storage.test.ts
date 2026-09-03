import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ElectronSecureSecretStorage, type ElectronSafeStorageApi } from './electron-secure-storage.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function fakePlatformStorage(available = true): ElectronSafeStorageApi {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(value, 'utf8').reverse(),
    decryptString: (value) => Buffer.from(value).reverse().toString('utf8'),
  };
}

describe('I169 Electron secure-storage adapter', () => {
  it('writes only encrypted blobs and atomically round-trips Main secrets', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i169-'));
    roots.push(root);
    const filePath = join(root, 'settings', 'credentials.bin');
    const storage = new ElectronSecureSecretStorage(filePath, fakePlatformStorage());

    await storage.set('NOVEL_API_KEY', 'sk-never-plaintext');
    const raw = await readFile(filePath, 'utf8');
    expect(raw).not.toContain('sk-never-plaintext');
    await expect(storage.get('NOVEL_API_KEY')).resolves.toBe('sk-never-plaintext');
    await storage.delete('NOVEL_API_KEY');
    await expect(storage.get('NOVEL_API_KEY')).resolves.toBeUndefined();
  });

  it('fails closed when platform encryption is unavailable and does not create a file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'novel-i169-unavailable-'));
    roots.push(root);
    const filePath = join(root, 'credentials.bin');
    const storage = new ElectronSecureSecretStorage(filePath, fakePlatformStorage(false));

    await expect(storage.set('NOVEL_API_KEY', 'sk-never-written')).rejects.toThrow(/Secure storage unavailable/);
    await expect(storage.get('NOVEL_API_KEY')).rejects.toThrow(/Secure storage unavailable/);
    await expect(readFile(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
