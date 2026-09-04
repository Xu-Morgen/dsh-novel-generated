import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const rendererSources = [
  'src/desktop/renderer/main.ts',
  'src/desktop/renderer/shell.ts',
  'src/desktop/renderer/store-adapter.ts',
].map(read).join('\n');

if ((read('src/desktop/renderer/main.ts').match(/createRoot\s*\(/g) ?? []).length !== 1) throw new Error('I173 must keep exactly one createRoot call');
if (!rendererSources.includes('useSyncExternalStore') || !rendererSources.includes('createWorkbenchStore(desktopDefineStore)')) throw new Error('I173 desktop Store adapter is not wired to the existing Workbench contract');
if (!rendererSources.includes('workbenchView(React')) throw new Error('I173 desktop shell does not mount the existing presenter');
if (!rendererSources.includes('root.unmount()') || !rendererSources.includes('store.dispose()')) throw new Error('I173 root/store disposal is incomplete');
if (/from ['"](?:electron|node:|@deepseek-ai\/)/.test(rendererSources)) throw new Error('I173 Renderer source imports a forbidden platform/runtime module');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/desktop/renderer/store-adapter.test.ts', 'src/desktop/renderer/shell.test.ts'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, TMPDIR: smokeTempDir, TEMP: smokeTempDir, TMP: smokeTempDir, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (focused.status !== 0) throw new Error(`I173 focused Renderer tests failed (exit ${focused.status}):\n${focused.stdout}\n${focused.stderr}`);

const bundle = read('dist/desktop/renderer.js');
for (const forbidden of ['@deepseek-ai/dsh-', '@deepseek-ai/cordis', 'node:fs', 'node:path', 'NOVEL_CUSTOM_API_KEY']) {
  if (bundle.includes(forbidden)) throw new Error(`I173 Renderer bundle contains forbidden dependency/secret marker: ${forbidden}`);
}

const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i173-'));
const logPath = join(tempRoot, 'electron.log');
const electronBinary = process.platform === 'win32'
  ? resolve(root, 'node_modules/electron/dist/electron.exe')
  : resolve(root, 'node_modules/electron/dist/electron');
const electronEnv = { ...process.env, NOVEL_DESKTOP_SMOKE: '1', NOVEL_DESKTOP_SMOKE_HOLD_MS: '500' };
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
  ], {
    cwd: root,
    env: electronEnv,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  });
  closeSync(fd);
  const started = Date.now();
  while (Date.now() - started < 10_000 && !readFileSync(logPath, 'utf8').includes('[I173] renderer-shell')) {
    await new Promise((wait) => setTimeout(wait, 25));
  }
  const output = readFileSync(logPath, 'utf8');
  for (const marker of ['[I173] renderer-shell', '"rootCount":1', '"desktopRoots":1', '"workspace":', '创作台']) {
    if (!output.includes(marker)) throw new Error(`I173 Electron smoke missing marker ${marker}:\n${output}`);
  }
  if (child.exitCode === null) await new Promise((resolveWait) => child.once('exit', resolveWait));
  if (child.exitCode !== 0) throw new Error(`I173 Electron smoke exited ${child.exitCode}:\n${output}`);
  passed = true;
} finally {
  if (!passed && child?.exitCode === null) child.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

process.stdout.write('I173 smoke: single React root, existing presenter, Store adapter, token mapping, DSH-free Renderer bundle, and root/store disposal passed\n');
