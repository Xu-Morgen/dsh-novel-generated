import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const sources = [
  'src/desktop/main/project-handlers.ts',
  'src/desktop/renderer/project-workflow.ts',
  'src/desktop/renderer/shell.ts',
].map(read).join('\n');

for (const required of ['createDesktopProjectHandlers', 'projectOpen', 'LAST_PROJECT_PREFERENCE', 'hasDirtyDrafts', 'DESKTOP_MANAGED_PATH', 'data-novel-project-chooser']) {
  if (!sources.includes(required)) throw new Error(`I175 project/settings seam missing: ${required}`);
}
if (/localStorage\.setItem\([^,]+,\s*(?:JSON\.stringify\()?[^)]*(?:path|layers)/.test(sources)) {
  throw new Error('I175 Renderer persists domain data or paths instead of only the selected project id');
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/desktop/main/project-handlers.test.ts', 'src/desktop/renderer/project-workflow.test.ts', 'src/desktop/renderer/shell.test.ts'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, TMPDIR: smokeTempDir, TEMP: smokeTempDir, TMP: smokeTempDir, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (focused.status !== 0) throw new Error(`I175 focused tests failed (exit ${focused.status}):\n${focused.stdout}\n${focused.stderr}`);

const bundle = read('dist/desktop/renderer.js');
for (const forbidden of ['node:fs', 'node:path', 'electron.shell', 'libraryRoot', 'DESKTOP_MANAGED_PATH']) {
  if (bundle.includes(forbidden)) throw new Error(`I175 Renderer bundle contains a forbidden Main/path capability: ${forbidden}`);
}

const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i175-'));
const logPath = join(tempRoot, 'electron.log');
const electronBinary = process.platform === 'win32'
  ? resolve(root, 'node_modules/electron/dist/electron.exe')
  : resolve(root, 'node_modules/electron/dist/electron');
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
    env: { ...process.env, NOVEL_DESKTOP_SMOKE: '1', NOVEL_DESKTOP_SMOKE_HOLD_MS: '1200' },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  });
  closeSync(fd);
  const started = Date.now();
  while (Date.now() - started < 10_000 && !readFileSync(logPath, 'utf8').includes('[I175] project-loop')) {
    await new Promise((wait) => setTimeout(wait, 25));
  }
  const output = readFileSync(logPath, 'utf8');
  for (const marker of ['[I175] project-loop', '"created":{"ok":true', '"opened":{"ok":true', '"archivedOpen":{"ok":false', '"code":"handler-failed"', '"restored":{"ok":true', '"settings":{"ok":true', '"chooser":1']) {
    if (!output.includes(marker)) throw new Error(`I175 Electron smoke missing marker ${marker}:\n${output}`);
  }
  if (child.exitCode === null) await new Promise((resolveWait) => child.once('exit', resolveWait));
  if (child.exitCode !== 0) throw new Error(`I175 Electron smoke exited ${child.exitCode}:\n${output}`);
  passed = true;
} finally {
  if (!passed && child?.exitCode === null) child.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

process.stdout.write('I175 smoke: Main-revalidated project lifecycle, archive isolation, restart preference, dirty switch gate, settings, and path confinement passed\n');
