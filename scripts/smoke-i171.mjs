import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const appRegistrySource = readFileSync(resolve(root, 'src/app/ipc-registry.ts'), 'utf8');
const platformRegistrySource = readFileSync(resolve(root, 'src/platform/desktop-ipc-registry.ts'), 'utf8');
const lock = JSON.parse(readFileSync(resolve(root, 'contracts/desktop/ipc-methods.json'), 'utf8'));

for (const forbidden of ['electron', 'node:', '@deepseek-ai/', 'ipcRenderer']) {
  if (appRegistrySource.includes(forbidden)) throw new Error(`I171 framework-neutral app registry imports forbidden host capability: ${forbidden}`);
}
if (!appRegistrySource.includes('parseArguments') || !appRegistrySource.includes('parseResult') || !appRegistrySource.includes('IpcEnvelope')) {
  throw new Error('I171 registry is missing strict boundary primitives');
}
if (!platformRegistrySource.includes('hostContribution') || !platformRegistrySource.includes('createIpcRegistry')) {
  throw new Error('I171 legacy-to-canonical registry adapter is incomplete');
}
if (lock.schemaVersion !== 1 || lock.namespace !== 'desktopIpc' || lock.descriptorIds.length !== 226 || Object.keys(lock.descriptors).length !== 226 || Object.keys(lock.schemas ?? {}).length === 0) {
  throw new Error('I171 desktop IPC contract lock does not contain the 214-method baseline plus review repair');
}
if (new Set(lock.descriptorIds).size !== 226 || lock.descriptorIds.some((id) => lock.descriptors[id]?.id !== id)) {
  throw new Error('I171 desktop IPC contract lock contains duplicate or mismatched ids');
}

const result = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/app/ipc-registry.test.ts', 'src/platform/desktop-ipc-registry.test.ts'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (result.status !== 0) throw new Error(`I171 registry consumer smoke failed (exit ${result.status}):\n${result.output}`);

process.stdout.write('I171 smoke: framework-neutral 214-method baseline plus review repair, strict validation, contract lock, and fail-closed fixtures passed\n');
