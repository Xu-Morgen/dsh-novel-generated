import type { SecureSecretStorage } from '../app/credentials.js';

export interface FakeSecureStorageProbe {
  readonly reads: number;
  readonly writes: number;
  readonly deletes: number;
}

interface MutableFakeSecureStorageProbe {
  reads: number;
  writes: number;
  deletes: number;
}

/** Deterministic secure-store double; it intentionally exposes no read value in its probe. */
export function createFakeSecureStorage(options: { readonly available?: boolean } = {}): {
  readonly storage: SecureSecretStorage;
  readonly probe: FakeSecureStorageProbe;
  setAvailable(available: boolean): void;
} {
  const values = new Map<string, string>();
  const probe: MutableFakeSecureStorageProbe = { reads: 0, writes: 0, deletes: 0 };
  let available = options.available ?? true;
  const assertAvailable = (): void => {
    if (!available) throw new Error('secure storage unavailable');
  };
  const storage: SecureSecretStorage = {
    async get(ref) { assertAvailable(); probe.reads += 1; return values.get(ref); },
    async set(ref, secret) { assertAvailable(); probe.writes += 1; values.set(ref, secret); },
    async delete(ref) { assertAvailable(); probe.deletes += 1; values.delete(ref); },
  };
  return {
    storage,
    probe,
    setAvailable(next) { available = next; },
  };
}
