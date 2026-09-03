import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i166-'));
const profile = join(tempRoot, 'user-data');
const firstLog = join(tempRoot, 'first.log');
const secondLog = join(tempRoot, 'second.log');
const electronBinary = process.platform === 'win32'
  ? resolve(root, 'node_modules/electron/dist/electron.exe')
  : resolve(root, 'node_modules/electron/dist/electron');

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
const readLog = (path) => {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
};

function launch(logPath) {
  const fd = openSync(logPath, 'w');
  const args = [
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${profile}`,
    root,
  ];
  const child = spawn(electronBinary, args, {
    cwd: root,
    env: {
      ...process.env,
      NOVEL_DESKTOP_SMOKE: '1',
      NOVEL_DESKTOP_SMOKE_HOLD_MS: '1200',
    },
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  });
  closeSync(fd);
  return child;
}

async function waitFor(predicate, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await wait(25);
  }
  throw new Error('I166 Electron smoke timed out');
}

let smokePassed = false;
let first;
let second;
try {
  first = launch(firstLog);
  await waitFor(() => readLog(firstLog).includes('[I166] ready windows=1'), 10_000);

  second = launch(secondLog);
  await waitFor(() => second.exitCode !== null, 5_000);
  await waitFor(() => readLog(firstLog).includes('[I166] second-instance-focused'), 5_000);
  await waitFor(() => first.exitCode !== null, 5_000);

  const output = readLog(firstLog);
  if (second.exitCode !== 0) throw new Error(`second Electron instance exited ${second.exitCode}`);
  for (const marker of [
    '[I166] ready windows=1',
    '[I166] renderer-probe',
    '"hasNodeRequire":false',
    '"hasNodeProcess":false',
    '"rootCount":1',
    '[I166] second-instance-focused',
    '[I166] navigation-blocked',
    '[I166] new-window-blocked',
  ]) {
    if (!output.includes(marker)) throw new Error(`I166 Electron smoke missing marker: ${marker}`);
  }
  smokePassed = true;
  process.stdout.write('I166 Electron smoke: one window, isolated renderer, blocked navigation/new-window, second instance focused\n');
} finally {
  if (!smokePassed) {
    process.stderr.write(`[I166] first.log\n${readLog(firstLog)}`);
    process.stderr.write(`[I166] second.log\n${readLog(secondLog)}`);
  }
  if (!smokePassed && first?.exitCode === null) first.kill();
  if (!smokePassed && second?.exitCode === null) second.kill();
  rmSync(tempRoot, { recursive: true, force: true });
}
