import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SecureSecretStorage } from '../app/credentials.js';
import { PlainTextSecretStorage } from './plaintext-secret-storage.js';

const REF = 'NOVEL_CUSTOM_API_KEY';
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function fixture(name: string, legacy?: SecureSecretStorage) {
  const root = await mkdtemp(join(tmpdir(), `${name}-`));
  roots.push(root);
  const filePath = join(root, 'settings', 'ai-token.txt');
  return { root, filePath, storage: new PlainTextSecretStorage(filePath, { ref: REF, legacy }) };
}

describe('I196 plaintext token storage', () => {
  it('writes the token as one plaintext line and observes external edits on every read', async () => {
    const { filePath, storage } = await fixture('novel-i196-plain');
    await storage.set(REF, 'sk-first-plaintext-token');
    expect(await readFile(filePath, 'utf8')).toBe('sk-first-plaintext-token\n');

    await writeFile(filePath, 'sk-edited-outside-app\n', 'utf8');
    await expect(storage.get(REF)).resolves.toBe('sk-edited-outside-app');
    await writeFile(filePath, '\n', 'utf8');
    await expect(storage.get(REF)).resolves.toBeUndefined();
  });

  it('migrates one old encrypted-store value only when the text file is absent', async () => {
    let migratedFile = '';
    const legacy: SecureSecretStorage = {
      get: vi.fn(async () => 'sk-legacy-migrated-token'),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => {
        expect(await readFile(migratedFile, 'utf8')).toBe('sk-legacy-migrated-token\n');
      }),
    };
    const { filePath, storage } = await fixture('novel-i196-migrate', legacy);
    migratedFile = filePath;
    await expect(storage.get(REF)).resolves.toBe('sk-legacy-migrated-token');
    expect(await readFile(filePath, 'utf8')).toBe('sk-legacy-migrated-token\n');
    expect(legacy.delete).toHaveBeenCalledWith(REF);
  });

  it('treats an existing empty text file as explicitly unconfigured instead of restoring legacy data', async () => {
    const legacy: SecureSecretStorage = {
      get: vi.fn(async () => 'sk-must-not-return'),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const { filePath, storage } = await fixture('novel-i196-empty', legacy);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, '\n', 'utf8');
    await expect(storage.get(REF)).resolves.toBeUndefined();
    expect(legacy.get).not.toHaveBeenCalled();
  });

  it('rejects other refs and multi-line content without echoing either token', async () => {
    const { filePath, storage } = await fixture('novel-i196-negative');
    await expect(storage.set('OTHER_API_KEY', 'sk-not-written')).rejects.toThrow(/Unsupported plaintext credential reference/);
    await expect(storage.set(REF, 'first\nsecond')).rejects.toThrow(/exactly one non-empty line/);
    await expect(readFile(filePath)).rejects.toMatchObject({ code: 'ENOENT' });

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, 'sk-line-one\nsk-line-two\n', 'utf8');
    const failure = await storage.get(REF).catch((cause: Error) => cause);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).not.toContain('sk-line-one');
    expect(String(failure)).not.toContain('sk-line-two');
  });
});
