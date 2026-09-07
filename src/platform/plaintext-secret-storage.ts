import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { SecureSecretStorage } from '../app/credentials.js';

export interface PlainTextSecretStorageOptions {
  /** The only credential ref represented by this one-line text file. */
  readonly ref: string;
  /** Optional previous store used only for a one-time, best-effort migration. */
  readonly legacy?: SecureSecretStorage;
}

/**
 * One-credential, deliberately unencrypted local text storage (design §14.33).
 *
 * The file is read for every `get`, so an author can edit it outside the app.
 * It must contain exactly one non-empty line; comments and multi-line values
 * fail closed. Writes are serialized and atomically replace the previous file.
 * This adapter provides convenience, not confidentiality: the same OS account
 * and any process able to read the application data directory can read it.
 */
export class PlainTextSecretStorage implements SecureSecretStorage {
  private mutation = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly options: PlainTextSecretStorageOptions,
  ) {
    if (typeof filePath !== 'string' || filePath.length === 0) throw new TypeError('Plaintext credential file path is required');
    if (typeof options.ref !== 'string' || options.ref.length === 0) throw new TypeError('Plaintext credential ref is required');
  }

  async get(ref: string): Promise<string | undefined> {
    return this.withExclusive(async () => {
      this.assertRef(ref);
      const current = await this.readCurrent();
      if (current.exists) return current.secret;

      const migrated = await this.readLegacy(ref);
      if (migrated === undefined) return undefined;
      this.assertSecret(migrated);
      await this.writeCurrent(migrated);
      await this.deleteLegacy(ref);
      return migrated;
    });
  }

  async set(ref: string, secret: string): Promise<void> {
    await this.withExclusive(async () => {
      this.assertRef(ref);
      this.assertSecret(secret);
      await this.writeCurrent(secret);
      await this.deleteLegacy(ref);
    });
  }

  async delete(ref: string): Promise<void> {
    await this.withExclusive(async () => {
      this.assertRef(ref);
      await rm(this.filePath, { force: true });
      await this.deleteLegacy(ref);
    });
  }

  private async readCurrent(): Promise<{ readonly exists: boolean; readonly secret?: string }> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false };
      throw new Error('Plaintext credential file cannot be read');
    }
    const secret = raw.trim();
    if (secret === '') return { exists: true };
    this.assertSecret(secret);
    return { exists: true, secret };
  }

  private async readLegacy(ref: string): Promise<string | undefined> {
    try {
      return await this.options.legacy?.get(ref);
    } catch {
      // A missing/unavailable old secure store must not block the new plaintext policy.
      return undefined;
    }
  }

  private async writeCurrent(secret: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    try {
      await writeFile(temporary, `${secret}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, this.filePath);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async deleteLegacy(ref: string): Promise<void> {
    try {
      await this.options.legacy?.delete(ref);
    } catch {
      // The plaintext write already succeeded; a stale encrypted copy is harmless
      // and can be retried on the next read/save without exposing either value.
    }
  }

  private assertRef(ref: string): void {
    if (ref !== this.options.ref) throw new Error('Unsupported plaintext credential reference');
  }

  private assertSecret(secret: string): void {
    if (typeof secret !== 'string' || secret.trim() === '' || /[\r\n]/.test(secret)) {
      throw new Error('Plaintext credential must contain exactly one non-empty line');
    }
  }

  private async withExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutation.then(operation, operation);
    this.mutation = next.then(() => undefined, () => undefined);
    return next;
  }
}

/** Factory used by Main for the explicitly accepted plaintext credential policy. */
export function createPlainTextSecretStorage(
  filePath: string,
  options: PlainTextSecretStorageOptions,
): SecureSecretStorage {
  return new PlainTextSecretStorage(filePath, options);
}
