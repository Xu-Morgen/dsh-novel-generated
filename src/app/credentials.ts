export interface CredentialDescription {
  readonly ref: string;
  readonly configured: boolean;
}

/**
 * The only credential control surface suitable for preload/IPC exposure.
 * Secret values are accepted transiently by `set`, never returned by this
 * interface, and never included in descriptions or errors.
 */
export interface CredentialStore {
  describe(ref: string): Promise<CredentialDescription>;
  set(ref: string, secret: string): Promise<void>;
  delete(ref: string): Promise<void>;
}

/** Main-only resolver reserved for a provider adapter in I170. */
export interface MainCredentialResolver {
  resolve(ref: string): Promise<string | undefined>;
}

export interface CredentialStoreBundle {
  readonly store: CredentialStore;
  readonly resolver: MainCredentialResolver;
}

/**
 * Low-level secure storage seam. Implementations may hold a secret in memory
 * during a provider request, but persistence must be encrypted by the platform.
 */
export interface SecureSecretStorage {
  get(ref: string): Promise<string | undefined>;
  set(ref: string, secret: string): Promise<void>;
  delete(ref: string): Promise<void>;
}

const CREDENTIAL_REF = /^[A-Z_][A-Z0-9_]*$/;

/**
 * Adapt a secure platform store into the Main-owned credential contract.
 * Storage failures are sanitized so a platform exception cannot echo a key.
 */
export function createCredentialStore(storage: SecureSecretStorage): CredentialStoreBundle {
  const describe = async (ref: string): Promise<CredentialDescription> => {
    const safeRef = validateRef(ref);
    const secret = await safely('read', () => storage.get(safeRef));
    return Object.freeze({ ref: safeRef, configured: secret !== undefined });
  };

  const set = async (ref: string, secret: string): Promise<void> => {
    const safeRef = validateRef(ref);
    if (typeof secret !== 'string' || secret.length === 0) throw new Error('Credential secret is required');
    await safely('write', () => storage.set(safeRef, secret));
  };

  const remove = async (ref: string): Promise<void> => {
    const safeRef = validateRef(ref);
    await safely('delete', () => storage.delete(safeRef));
  };

  return Object.freeze({
    store: Object.freeze({ describe, set, delete: remove }),
    resolver: Object.freeze({
      resolve: async (ref: string): Promise<string | undefined> => safely('resolve', () => storage.get(validateRef(ref))),
    }),
  });
}

function validateRef(ref: string): string {
  if (typeof ref !== 'string' || !CREDENTIAL_REF.test(ref)) throw new Error('Invalid credential reference');
  return ref;
}

async function safely<T>(operation: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch {
    throw new Error(`Credential secure storage ${operation} failed`);
  }
}
