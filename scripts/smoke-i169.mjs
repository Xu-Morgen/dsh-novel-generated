import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const credentialsSource = readFileSync(resolve(root, 'src/app/credentials.ts'), 'utf8');
const secureStorageSource = readFileSync(resolve(root, 'src/platform/electron-secure-storage.ts'), 'utf8');
const mainSource = readFileSync(resolve(root, 'src/desktop/main/main.ts'), 'utf8');

if (!credentialsSource.includes('describe') || !credentialsSource.includes('set') || !credentialsSource.includes('delete')) {
  throw new Error('I169 CredentialStore control surface is incomplete');
}
if (credentialsSource.includes('return secret') || credentialsSource.includes('return { ref, secret')) throw new Error('I169 CredentialStore returns a secret');
if (secureStorageSource.includes('.credentials.yaml') || secureStorageSource.includes('writeFile(this.filePath, secret')) throw new Error('I169 secure adapter contains a legacy/plaintext credential path');
if (!secureStorageSource.includes('safeStorage') || !secureStorageSource.includes('encryptString')) throw new Error('I169 production adapter is not backed by Electron safeStorage');
if (!mainSource.includes("credentials.bin")) throw new Error('I169 Main did not register its secure credential store');

const result = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/app/credentials.test.ts', 'src/platform/electron-secure-storage.test.ts'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (result.status !== 0) throw new Error(`I169 credential smoke failed (exit ${result.status}):\n${result.output}`);

process.stdout.write('I169 smoke: Main-only credential control, encrypted storage, no secret echo, unavailable-store fail-closed, and zero-write negative fixture passed\n');
