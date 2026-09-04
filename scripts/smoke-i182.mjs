import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const lock = JSON.parse(read('contracts/desktop/ipc-methods.json'));
const migrationIds = [
  'novel-creation-tool/novelMigration/preview',
  'novel-creation-tool/novelMigration/execute',
  'novel-creation-tool/novelMigration/rollback',
];
const migrationSources = [
  'src/core/schema/desktop-migration.ts',
  'src/host/desktop-migration-service.ts',
  'src/desktop/main/migration-command-registry.ts',
  'src/desktop/main/project-handlers.ts',
  'src/desktop/main/main.ts',
].map(read).join('\n');
const migrationServiceSource = read('src/host/desktop-migration-service.ts');
const rendererSources = [
  'src/desktop/renderer/migration-client.ts',
  'src/desktop/renderer/migration-panel.ts',
  'src/desktop/renderer/shell.ts',
].map(read).join('\n');

if (lock.descriptorIds.length !== 226 || migrationIds.some((id) => !lock.descriptorIds.includes(id))) {
  throw new Error('I182 canonical desktop lock is missing the strict migration descriptors');
}
for (const required of ['DesktopMigrationService', 'ConfirmationGate', 'copyPlanToBackup', 'backupManifestHash', 'sourceFingerprint', 'createDesktopMigrationCommandRegistry', 'legacyProjectsRoot']) {
  if (!migrationSources.includes(required)) throw new Error(`I182 Main migration owner missing: ${required}`);
}
for (const forbidden of ['registerTool', 'registerNovelAgentTools', 'moveFile', 'unlink(source', 'CredentialStore']) {
  if (migrationServiceSource.includes(forbidden)) throw new Error(`I182 migration source contains forbidden behavior: ${forbidden}`);
}
for (const required of ['createDesktopMigrationClient', 'DesktopMigrationPanel', 'data-novel-migration-preview', 'data-novel-migration-execute', 'data-novel-migration-rollback']) {
  if (!rendererSources.includes(required)) throw new Error(`I182 Renderer migration consumer missing: ${required}`);
}
for (const forbidden of ['node:fs', 'node:path', 'electron', 'credentials.bin', 'libraryRoot', 'secretRef', 'provider client']) {
  if (rendererSources.includes(forbidden)) throw new Error(`I182 Renderer migration source contains forbidden capability: ${forbidden}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/desktop-migration-service.test.ts',
  'src/desktop/main/migration-command-registry.test.ts',
  'src/desktop/main/project-handlers.test.ts',
  'src/desktop/renderer/migration-client.test.ts',
  'src/desktop/renderer/shell.test.ts',
  'src/platform/desktop-ipc-registry.test.ts',
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, TMPDIR: smokeTempDir, TEMP: smokeTempDir, TMP: smokeTempDir, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (focused.status !== 0) throw new Error(`I182 focused tests failed (exit ${focused.status}):\n${focused.stdout}\n${focused.stderr}`);

const bundle = read('dist/desktop/renderer.js');
for (const required of ['data-novel-migration', 'novelMigration/preview', 'data-novel-migration-execute']) {
  if (!bundle.includes(required)) throw new Error(`I182 Renderer bundle is missing migration marker: ${required}`);
}
for (const forbidden of ['node:fs', 'node:path', 'electron.shell', 'credentials.bin', 'NOVEL_CUSTOM_API_KEY']) {
  if (bundle.includes(forbidden)) throw new Error(`I182 Renderer bundle contains forbidden migration capability: ${forbidden}`);
}

const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i182-'));
const logPath = join(tempRoot, 'electron.log');
const electronBinary = process.platform === 'win32'
  ? resolve(root, 'node_modules/electron/dist/electron.exe')
  : resolve(root, 'node_modules/electron/dist/electron');
const electronEnv = { ...process.env, NOVEL_DESKTOP_SMOKE: '1', NOVEL_DESKTOP_SMOKE_HOLD_MS: '3200' };
delete electronEnv.ELECTRON_RUN_AS_NODE;
let child;
let passed = false;
try {
  const fd = openSync(logPath, 'w');
  child = spawn(electronBinary, [
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${join(tempRoot, 'user-data')}`,
    root,
  ], { cwd: root, env: electronEnv, stdio: ['ignore', fd, fd], windowsHide: true });
  closeSync(fd);
  const started = Date.now();
  while (Date.now() - started < 15_000 && !readFileSync(logPath, 'utf8').includes('[I182] migration-loop')) {
    await new Promise((wait) => setTimeout(wait, 25));
  }
  const output = readFileSync(logPath, 'utf8');
  for (const marker of [
    '[I182] migration-loop',
    '"preview":true',
    '"executed":true',
    '"repeated":true',
    '"rolledBack":true',
    '"opened":true',
    '"exported":true',
    '"sourceUnchanged":true',
  ]) {
    if (!output.includes(marker)) throw new Error(`I182 Electron smoke missing marker ${marker}:\n${output}`);
  }
  if (child.exitCode === null) await new Promise((resolveWait) => child.once('exit', resolveWait));
  if (child.exitCode !== 0) throw new Error(`I182 Electron smoke exited ${child.exitCode}:\n${output}`);
  passed = true;
} finally {
  if (!passed && child?.exitCode === null) child.kill();
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

process.stdout.write('I182 smoke: explicit preview/backup/hash migration, source immutability, idempotent repeat, rollback, and open/export loop passed\n');
