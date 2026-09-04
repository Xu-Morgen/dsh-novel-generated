import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const sources = [
  'src/desktop/main/c5-handlers.ts',
  'src/desktop/main/main.ts',
  'src/desktop/main/project-handlers.ts',
  'src/desktop/renderer/desktop-ipc-client.ts',
  'src/desktop/renderer/project-workflow.ts',
  'src/desktop/renderer/shell.ts',
  'src/desktop/renderer/structured-ops.ts',
  'src/client/ops/chapters-candidate.ts',
].map(read).join('\n');

for (const required of [
  'createDesktopC5Handlers',
  'includeChapters: true',
  "cancelMethod(methodId: string)",
  'novel-creation-tool/novelWriting/proposeAt',
  'novel-creation-tool/novelBranches/chooseFresh',
  'novel-creation-tool/novelTextDeletion',
  'novel-creation-tool/novelOutlineReconciliation',
]) {
  if (!sources.includes(required)) throw new Error(`I177 C5 migration seam missing: ${required}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/desktop/main/project-handlers.test.ts',
  'src/desktop/renderer/desktop-ipc-client.test.ts',
  'src/desktop/renderer/project-workflow.test.ts',
  'src/desktop/renderer/structured-ops.test.ts',
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, TMPDIR: smokeTempDir, TEMP: smokeTempDir, TMP: smokeTempDir, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (focused.status !== 0) throw new Error(`I177 focused tests failed (exit ${focused.status}):\n${focused.stdout}\n${focused.stderr}`);

const bundle = read('dist/desktop/renderer.js');
for (const forbidden of ['node:fs', 'node:path', 'electron.shell', 'libraryRoot', 'credentials.bin']) {
  if (bundle.includes(forbidden)) throw new Error(`I177 Renderer bundle contains a forbidden Main capability: ${forbidden}`);
}

const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i177-'));
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
  while (Date.now() - started < 12_000 && !readFileSync(logPath, 'utf8').includes('[I177] c5-loop')) {
    await new Promise((wait) => setTimeout(wait, 25));
  }
  const output = readFileSync(logPath, 'utf8');
  for (const marker of [
    '[I177] c5-loop',
    '"created":{"ok":true',
    '"opened":{"ok":true',
    '"chapter":{"ok":true',
    '"scene":{"ok":true',
    '"chapters":{"ok":true',
    '"read":{"ok":true',
    '"edited":{"ok":true',
    '"branch":{"ok":true',
    '"branchRead":{"ok":true',
    '"binding":{"ok":true',
    '"invalid":{"ok":false,"error":{"code":"invalid-arguments"',
  ]) {
    if (!output.includes(marker)) throw new Error(`I177 Electron smoke missing marker ${marker}:\n${output}`);
  }
  if (child.exitCode === null) await new Promise((resolveWait) => child.once('exit', resolveWait));
  if (child.exitCode !== 0) throw new Error(`I177 Electron smoke exited ${child.exitCode}:\n${output}`);
  passed = true;
} finally {
  if (!passed && child?.exitCode === null) child.kill();
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

process.stdout.write('I177 smoke: C5 chapter/scene editing, branch freshness seam, Main routing, and negative range validation passed\n');
