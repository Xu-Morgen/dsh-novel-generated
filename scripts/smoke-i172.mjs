import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const preloadSource = readFileSync(resolve(root, 'src/desktop/preload/preload.ts'), 'utf8');
const bridgeSource = readFileSync(resolve(root, 'src/desktop/preload/bridge.ts'), 'utf8');
const binderSource = readFileSync(resolve(root, 'src/platform/electron-ipc-binder.ts'), 'utf8');
const mainSource = readFileSync(resolve(root, 'src/desktop/main/main.ts'), 'utf8');
const lock = JSON.parse(readFileSync(resolve(root, 'contracts/desktop/ipc-methods.json'), 'utf8'));
const methodIdsSource = readFileSync(resolve(root, 'src/desktop/preload/ipc-method-ids.ts'), 'utf8');

if (!preloadSource.includes('contextBridge.exposeInMainWorld(\'novelDesktop\'')) throw new Error('I172 preload does not expose the versioned novelDesktop bridge');
if (!preloadSource.includes('IPC_INVOKE_CHANNEL') || !preloadSource.includes('IPC_CANCEL_CHANNEL') || !preloadSource.includes('IPC_PROGRESS_CHANNEL')) throw new Error('I172 preload does not use the three fixed IPC channels');
if (preloadSource.includes('exposeInMainWorld(\'ipcRenderer\'') || preloadSource.includes('exposeInMainWorld(\'fs\'') || preloadSource.includes('exposeInMainWorld(\'process\'')) throw new Error('I172 preload exposes forbidden system capabilities');
if (!bridgeSource.includes('allowlist.has(methodId)') || bridgeSource.includes("from 'electron'") || bridgeSource.includes('from "electron"')) throw new Error('I172 bridge allowlist boundary is incomplete');
if (!binderSource.includes('registry.invoke') || !binderSource.includes('removeHandler') || !binderSource.includes('AbortController') || !binderSource.includes('IPC_PROGRESS_CHANNEL')) throw new Error('I172 Main binder lifecycle/strict boundary is incomplete');
if (mainSource.includes('ipcRenderer') || !mainSource.includes('bindElectronIpc')) throw new Error('I172 Main wiring is not a Main-owned binder');
if (lock.descriptorIds.length !== 215 || (methodIdsSource.match(/novel-creation-tool\//g) ?? []).length !== 215) throw new Error('I172 preload allowlist is not derived from the 214-method baseline plus review repair');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/desktop/preload/bridge.test.ts', 'src/platform/electron-ipc-binder.test.ts'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (focused.status !== 0) throw new Error(`I172 focused bridge/binder tests failed (exit ${focused.status}):\n${focused.output}`);

const tempRoot = mkdtempSync(join(process.platform === 'win32' ? tmpdir() : '/tmp', 'novel-desktop-i172-'));
const logPath = join(tempRoot, 'electron.log');
const electronBinary = process.platform === 'win32'
  ? resolve(root, 'node_modules/electron/dist/electron.exe')
  : resolve(root, 'node_modules/electron/dist/electron');
let child;
let passed = false;
try {
  const fd = openSync(logPath, 'w');
  child = spawn(electronBinary, ['--headless', '--disable-gpu', '--disable-dev-shm-usage', `--user-data-dir=${join(tempRoot, 'user-data')}`, root], {
    cwd: root,
    env: { ...process.env, NOVEL_DESKTOP_SMOKE: '1', NOVEL_DESKTOP_SMOKE_HOLD_MS: '1200' },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  });
  closeSync(fd);
  const started = Date.now();
  while (Date.now() - started < 10_000 && !readFileSync(logPath, 'utf8').includes('[I172] ipc-probe')) {
    await new Promise((wait) => setTimeout(wait, 25));
  }
  const output = readFileSync(logPath, 'utf8');
  for (const marker of ['[I172] ipc-probe', '"ok":true', '"marker":"I2-PROBE"', '[I166] navigation-blocked', '[I166] new-window-blocked']) {
    if (!output.includes(marker)) throw new Error(`I172 Electron smoke missing marker: ${marker}\n${output}`);
  }
  await new Promise((resolveWait) => child.once('exit', resolveWait));
  if (child.exitCode !== 0) throw new Error(`I172 Electron smoke exited ${child.exitCode}`);
  passed = true;
} finally {
  if (!passed && child?.exitCode === null) child.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

process.stdout.write('I172 smoke: versioned allowlist bridge, fixed channels, real Main strict IPC result, navigation/new-window guards, and focused lifecycle fixtures passed\n');
