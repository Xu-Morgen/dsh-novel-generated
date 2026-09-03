import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { safeStorage } from 'electron';
import type { SecureSecretStorage } from '../app/credentials.js';

export interface ElectronSafeStorageApi {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface EncryptedCredentialDocument {
  readonly version: 1;
  readonly entries: Readonly<Record<string, string>>;
}

/**
 * Electron Main adapter backed by `safeStorage`. Only encrypted base64 blobs
 * are written to disk; the file is not a YAML/settings/project source of
 * truth. Every mutation is serialized and replaced atomically.
 */
export class ElectronSecureSecretStorage implements SecureSecretStorage {
  private mutation = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly platformStorage: ElectronSafeStorageApi = safeStorage,
  ) {}

  async get(ref: string): Promise<string | undefined> {
    return this.withExclusive(async () => {
      const document = await this.readDocument();
      const encrypted = document.entries[ref];
      if (encrypted === undefined) return undefined;
      try {
        return this.platformStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch {
        throw new Error('Secure credential record is invalid');
      }
    });
  }

  async set(ref: string, secret: string): Promise<void> {
    await this.withExclusive(async () => {
      const document = await this.readDocument();
      const encrypted = this.platformStorage.encryptString(secret).toString('base64');
      await this.writeDocument({ version: 1, entries: { ...document.entries, [ref]: encrypted } });
    });
  }

  async delete(ref: string): Promise<void> {
    await this.withExclusive(async () => {
      const document = await this.readDocument();
      if (!(ref in document.entries)) return;
      const entries = { ...document.entries };
      delete entries[ref];
      await this.writeDocument({ version: 1, entries });
    });
  }

  private async readDocument(): Promise<EncryptedCredentialDocument> {
    this.assertAvailable();
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, entries: {} };
      throw new Error('Secure credential storage cannot be read');
    }
    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) throw new Error();
      const entries = (value as { entries?: unknown }).entries;
      if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error();
      for (const encrypted of Object.values(entries as Record<string, unknown>)) {
        if (typeof encrypted !== 'string' || encrypted.length === 0) throw new Error();
      }
      return { version: 1, entries: entries as Record<string, string> };
    } catch {
      throw new Error('Secure credential storage is invalid');
    }
  }

  private async writeDocument(document: EncryptedCredentialDocument): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(document)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private assertAvailable(): void {
    try {
      if (!this.platformStorage.isEncryptionAvailable()) throw new Error();
    } catch {
      throw new Error('Secure storage unavailable');
    }
  }

  private async withExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutation.then(operation, operation);
    this.mutation = next.then(() => undefined, () => undefined);
    return next;
  }
}

/** Factory used by Main so the production adapter cannot be confused with a fake. */
export function createElectronSecureStorage(filePath: string): SecureSecretStorage {
  return new ElectronSecureSecretStorage(filePath);
}
