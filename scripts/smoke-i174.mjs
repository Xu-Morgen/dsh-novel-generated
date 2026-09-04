import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const lock = JSON.parse(read('contracts/desktop/ipc-methods.json'));
const registrySource = read('src/desktop/renderer/ipc-client-registry.ts');
const clientSource = read('src/desktop/renderer/desktop-ipc-client.ts');
const rendererSource = [clientSource, read('src/desktop/renderer/shell.ts'), read('src/desktop/renderer/main.ts')].join('\n');

if (lock.descriptorIds.length !== 216 || !lock.descriptorIds.includes('novel-creation-tool/novelReviewRepair/propose')) {
  throw new Error('I174 canonical registry must contain the 214-method baseline plus the existing review-repair seam');
}
if ((registrySource.match(/"key":/g) ?? []).length !== 31 || (registrySource.match(/"methodId":/g) ?? []).length !== 206) {
  throw new Error('I174 generated registry does not cover 31 Client services / 206 consumed methods');
}
if (rendererSource.includes('$mount') || /from ['"]@deepseek-ai\//.test(rendererSource) || rendererSource.includes('Remote fallback')) {
  throw new Error('I174 desktop Renderer retains a DSH Remote mount/fallback');
}
for (const required of ['bridge.cancel(requestId)', 'removeProgressListener()', "failure('bridge-closed'", 'normalizeEnvelope', 'client.dispose()']) {
  if (!rendererSource.includes(required)) throw new Error(`I174 lifecycle/result boundary missing: ${required}`);
}

const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/desktop/renderer/desktop-ipc-client.test.ts', 'src/desktop/renderer/shell.test.ts'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, TMPDIR: smokeTempDir, TEMP: smokeTempDir, TMP: smokeTempDir, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (focused.status !== 0) throw new Error(`I174 focused client tests failed (exit ${focused.status}):\n${focused.stdout}\n${focused.stderr}`);

const bundle = read('dist/desktop/renderer.js');
for (const forbidden of ['@deepseek-ai/dsh-', '@deepseek-ai/cordis', 'node:fs', 'node:path', 'NOVEL_CUSTOM_API_KEY']) {
  if (bundle.includes(forbidden)) throw new Error(`I174 Renderer bundle contains forbidden dependency/secret marker: ${forbidden}`);
}
if (!bundle.includes('data-novel-connection-status')) throw new Error('I174 built Renderer omits the connection projection');

const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i174-'));
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
    env: { ...process.env, NOVEL_DESKTOP_SMOKE: '1', NOVEL_DESKTOP_SMOKE_HOLD_MS: '700' },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  });
  closeSync(fd);
  const started = Date.now();
  while (Date.now() - started < 10_000) {
    const current = readFileSync(logPath, 'utf8');
    if (current.includes('[I174] review-repair-negative') && current.includes('[I173] renderer-shell')) break;
    await new Promise((wait) => setTimeout(wait, 25));
  }
  const output = readFileSync(logPath, 'utf8');
  for (const marker of ['[I174] review-repair-negative', '"code":"invalid-arguments"', '[I173] renderer-shell', '"connection":"ready"']) {
    if (!output.includes(marker)) throw new Error(`I174 Electron smoke missing marker ${marker}:\n${output}`);
  }
  if (child.exitCode === null) await new Promise((resolveWait) => child.once('exit', resolveWait));
  if (child.exitCode !== 0) throw new Error(`I174 Electron smoke exited ${child.exitCode}:\n${output}`);
  passed = true;
} finally {
  if (!passed && child?.exitCode === null) child.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}

process.stdout.write('I174 smoke: generated 31-service/206-method client, unwrap/error projection, cancellation, late-response guard, real strict IPC, and DSH-free bundle passed\n');
