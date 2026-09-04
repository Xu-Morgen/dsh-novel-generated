import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const sources = [
  'src/core/schema/upload.ts',
  'src/host/remote/upload.ts',
  'src/desktop/main/source-import-handlers.ts',
  'src/desktop/main/project-handlers.ts',
  'src/desktop/main/main.ts',
  'src/desktop/renderer/upload-controller.ts',
  'src/desktop/renderer/project-workflow.ts',
  'src/desktop/renderer/shell.ts',
  'src/client/desktop-upload.ts',
  'src/client/source-import.ts',
].map(read).join('\n');

for (const required of [
  'selectedDocxResultSchema',
  'uploadSelectDocxInvocation',
  'createDesktopSourceImportHandlers',
  'selectDocxFile',
  'createDesktopUploadController',
  'selectDocxFromMain',
  'createImportInterpretationController',
  'importInterpretation: client.services.importInterpretation',
  'normalizeSource',
  'data-novel-upload-main-dialog',
  'createImportedProject',
]) {
  if (!sources.includes(required)) throw new Error(`I179 source import seam missing: ${required}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/desktop/main/project-handlers.test.ts',
  'src/desktop/renderer/shell.test.ts',
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, TMPDIR: smokeTempDir, TEMP: smokeTempDir, TMP: smokeTempDir, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (focused.status !== 0) throw new Error(`I179 focused tests failed (exit ${focused.status}):\n${focused.stdout}\n${focused.stderr}`);

const bundle = read('dist/desktop/renderer.js');
for (const forbidden of ['node:fs', 'node:path', 'FileReader', 'readAsArrayBuffer', 'electron.shell', 'libraryRoot', 'credentials.bin']) {
  if (bundle.includes(forbidden)) throw new Error(`I179 Renderer bundle contains a forbidden file capability: ${forbidden}`);
}

const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i179-'));
const logPath = join(tempRoot, 'electron.log');
const electronBinary = process.platform === 'win32'
  ? resolve(root, 'node_modules/electron/dist/electron.exe')
  : resolve(root, 'node_modules/electron/dist/electron');
const electronEnv = { ...process.env, NOVEL_DESKTOP_SMOKE: '1', NOVEL_DESKTOP_SMOKE_HOLD_MS: '2200' };
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
  while (Date.now() - started < 12_000 && !readFileSync(logPath, 'utf8').includes('[I179] source-import-loop')) {
    await new Promise((wait) => setTimeout(wait, 25));
  }
  const output = readFileSync(logPath, 'utf8');
  for (const marker of [
    '[I179] source-import-loop',
    '"normalized":{"ok":true',
    '"session":{"ok":true',
    '"read":{"ok":true',
    '"discarded":{"ok":true',
    '"invalid":{"ok":false,"error":{"code":"handler-failed"',
  ]) {
    if (!output.includes(marker)) throw new Error(`I179 Electron smoke missing marker ${marker}:\n${output}`);
  }
  if (child.exitCode === null) await new Promise((resolveWait) => child.once('exit', resolveWait));
  if (child.exitCode !== 0) throw new Error(`I179 Electron smoke exited ${child.exitCode}:\n${output}`);
  passed = true;
} finally {
  if (!passed && child?.exitCode === null) child.kill();
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

process.stdout.write('I179 smoke: Main native DOCX chooser seam, source normalization, semantic-review identity, and negative IPC validation passed\n');
