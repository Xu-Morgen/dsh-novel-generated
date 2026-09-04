import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const lock = JSON.parse(read('contracts/desktop/ipc-methods.json'));
const mainSources = [
  'src/desktop/main/author-workflow-handlers.ts',
  'src/desktop/main/file-handlers.ts',
  'src/desktop/main/project-handlers.ts',
  'src/desktop/main/main.ts',
  'src/desktop/file-dialog-contract.ts',
].map(read).join('\n');
const rendererSources = [
  'src/desktop/renderer/file-dialog.ts',
  'src/desktop/renderer/structured-ops.ts',
  'src/desktop/renderer/shell.ts',
  'src/client/ops/import-export.ts',
].map(read).join('\n');

if (lock.descriptorIds.length !== 217 || !lock.descriptorIds.includes('novel-creation-tool/novelDesktopFiles/saveFile')) {
  throw new Error('I180 canonical desktop lock is missing the Main-owned save seam');
}
for (const required of ['createDesktopAuthorWorkflowHandlers', 'createSearchService', 'createStatisticsService', 'createProgressInspirationService', 'createNovelPortabilityService', 'createDesktopFileHandlers', 'showSaveDialog', 'saveFile']) {
  if (!mainSources.includes(required)) throw new Error(`I180 Main owner missing: ${required}`);
}
for (const required of ['createDesktopFileDialog', 'saveFile: fileDialog', 'saveFile', 'desktopSaveFileInvocation']) {
  if (!rendererSources.includes(required)) throw new Error(`I180 Renderer consumer missing: ${required}`);
}
for (const forbidden of ['node:fs', 'node:path', 'libraryRoot', 'credentials.bin']) {
  if (rendererSources.includes(forbidden)) throw new Error(`I180 Renderer source contains forbidden host capability: ${forbidden}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/desktop/main/project-handlers.test.ts',
  'src/desktop/renderer/structured-ops.test.ts',
  'src/platform/desktop-ipc-registry.test.ts',
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, TMPDIR: smokeTempDir, TEMP: smokeTempDir, TMP: smokeTempDir, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (focused.status !== 0) throw new Error(`I180 focused tests failed (exit ${focused.status}):\n${focused.stdout}\n${focused.stderr}`);

const bundle = read('dist/desktop/renderer.js');
for (const forbidden of ['node:fs', 'node:path', 'electron.shell', 'libraryRoot', 'credentials.bin']) {
  if (bundle.includes(forbidden)) throw new Error(`I180 Renderer bundle contains a forbidden file capability: ${forbidden}`);
}

const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i180-'));
const logPath = join(tempRoot, 'electron.log');
const electronBinary = process.platform === 'win32'
  ? resolve(root, 'node_modules/electron/dist/electron.exe')
  : resolve(root, 'node_modules/electron/dist/electron');
const electronEnv = { ...process.env, NOVEL_DESKTOP_SMOKE: '1', NOVEL_DESKTOP_SMOKE_HOLD_MS: '2600' };
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
  while (Date.now() - started < 15_000 && !readFileSync(logPath, 'utf8').includes('[I180] author-flow-loop')) {
    await new Promise((wait) => setTimeout(wait, 25));
  }
  const output = readFileSync(logPath, 'utf8');
  for (const marker of [
    '[I180] author-flow-loop',
    '"progress":{"ok":true',
    '"search":{"ok":true',
    '"statistics":{"ok":true',
    '"timeline":{"ok":true',
    '"archive":true,"text":true',
    '"compile":{"ok":false,"error":{"code":"handler-failed"',
  ]) {
    if (!output.includes(marker)) throw new Error(`I180 Electron smoke missing marker ${marker}:\n${output}`);
  }
  if (child.exitCode === null) await new Promise((resolveWait) => child.once('exit', resolveWait));
  if (child.exitCode !== 0) throw new Error(`I180 Electron smoke exited ${child.exitCode}:\n${output}`);
  passed = true;
} finally {
  if (!passed && child?.exitCode === null) child.kill();
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

process.stdout.write('I180 smoke: progress/search/statistics/timeline/import-export Main consumers, native save seam, strict lock, and negative manuscript gate passed\n');
