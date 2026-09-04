import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readRoot = (path) => readFileSync(resolve(root, path), 'utf8');
const packageJson = JSON.parse(readRoot('package.json'));
const mainSource = readRoot('src/desktop/main/main.ts');
const securitySource = readRoot('src/desktop/main/security.ts');
const preloadSource = readRoot('src/desktop/preload/preload.ts');
const bridgeSource = readRoot('src/desktop/preload/bridge.ts');
const rendererSource = readRoot('src/desktop/renderer/main.ts');
const rendererBundle = readRoot('dist/desktop/renderer.js');
const html = readRoot('dist/desktop/index.html');
const artifactRoot = resolve(root, 'artifacts', 'desktop');
const packagedExecutable = join(artifactRoot, 'win-unpacked', 'Novel Creation Tool.exe');
const crashFixture = resolve(root, 'scripts', 'i185-crash-fixture.ts');
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';

function fail(message) {
  throw new Error(`I185: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function readLog(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

async function waitFor(predicate, message, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await wait(50);
  }
  fail(message);
}

function runTsxFixture(projectDirectory, mode) {
  return spawnSync(process.execPath, ['--import', 'tsx/esm', crashFixture, projectDirectory, mode], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

function findResidualTemporaryFiles(directory) {
  const residual = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(path);
        continue;
      }
      if (/\.tmp(?:-|$)|\.next$|\.bak$|\.project-uow-journal$/.test(entry.name)) {
        residual.push(relative(directory, path));
      }
    }
  }
  return residual.sort();
}

function auditSecurity() {
  assert(packageJson.build?.win?.target?.[0]?.target === 'nsis', 'Windows target is not NSIS');
  assert(mainSource.includes('requestSingleInstanceLock'), 'Main does not acquire the single-instance lock');
  assert(mainSource.includes("app.on('before-quit'"), 'Main does not route quit through lifecycle cleanup');
  assert(mainSource.includes('applicationKernel.stop()'), 'Main quit path does not stop the application kernel');
  assert(!mainSource.includes('loadURL('), 'Main contains an unbounded loadURL path');
  assert(!mainSource.match(/\.listen\s*\(/), 'Main contains a production network listener');
  for (const token of ['contextIsolation: true', 'sandbox: true', 'nodeIntegration: false', 'webSecurity: true', 'webviewTag: false']) {
    assert(securitySource.includes(token), `BrowserWindow security default is missing ${token}`);
  }
  for (const token of [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ]) {
    assert(html.includes(token), `production CSP is missing ${token}`);
  }
  assert(!html.includes("script-src 'self' 'unsafe-eval'"), 'production CSP enables unsafe-eval');
  assert(mainSource.includes('will-navigate'), 'Main does not install navigation protection');
  assert(mainSource.includes('setWindowOpenHandler'), 'Main does not install new-window protection');
  assert(mainSource.includes('will-attach-webview'), 'Main does not install webview protection');
  assert(preloadSource.includes('contextBridge.exposeInMainWorld'), 'Preload does not expose the versioned bridge');
  assert(!preloadSource.includes('contextBridge.exposeInMainWorld(\'ipcRenderer\''), 'Preload exposes raw ipcRenderer');
  assert(bridgeSource.includes('never accepts a caller-provided channel'), 'bridge allowlist contract is undocumented');
  assert(!rendererSource.match(/from ['"](?:electron|node:)/), 'Renderer source imports a privileged module');
  const forbiddenPatterns = [
    ['node:fs import', /(?:from|require\(|import\()\s*['"]node:fs['"]/],
    ['node:path import', /(?:from|require\(|import\()\s*['"]node:path['"]/],
    ['node:child_process import', /(?:from|require\(|import\()\s*['"]node:child_process['"]/],
    ['electron import', /(?:from|require\(|import\()\s*['"]electron['"]/],
    ['safeStorage API', /\bsafeStorage\b/],
    ['provider client', /@deepseek-ai/],
    ['ipcRenderer API', /\bipcRenderer\b/],
    ['process.env', /\bprocess\.env\b/],
    ['network fetch', /\bfetch\s*\(/],
  ];
  for (const [label, pattern] of forbiddenPatterns) {
    assert(!pattern.test(rendererBundle), `Renderer bundle contains a forbidden capability: ${label}`);
  }
}

function createChapterCrashFixture(tempRoot) {
  const projectDirectory = join(tempRoot, 'c5-crash-project');
  const textDirectory = join(projectDirectory, 'text');
  const oldChapter = {
    id: 'chapter-1',
    index: 1,
    title: 'I185 crash fixture',
    pov: 'mira',
    status: 'draft',
    scenes: [{ id: 'scene-1', index: 0, content: 'before-crash', summary: 'crash boundary', beats: [], canonEvents: [], notes: '', branches: [] }],
  };
  const oldRaw = `${JSON.stringify(oldChapter, null, 2)}\n`;
  mkdirSync(textDirectory, { recursive: true });
  writeFileSync(join(textDirectory, 'chapter-1.json'), oldRaw, 'utf8');

  const crashed = runTsxFixture(projectDirectory, 'crash');
  assert(crashed.status !== 0 || crashed.signal !== null, 'fault-injected writer did not terminate abnormally');
  assert(existsSync(join(textDirectory, '.project-uow-journal')), 'crash did not leave the prepared project journal');
  const preparedFiles = readdirSync(textDirectory);
  assert(preparedFiles.some((name) => /\.json\.[0-9a-f-]{36}\.bak$/.test(name)), 'crash did not leave a truth backup');
  assert(preparedFiles.some((name) => /\.json\.[0-9a-f-]{36}\.next$/.test(name)), 'crash did not leave a staged next file');

  const recovered = runTsxFixture(projectDirectory, 'recover');
  assert(recovered.status === 0, `fresh queue recovery failed:\n${recovered.stdout}\n${recovered.stderr}`);
  let payload;
  try {
    payload = JSON.parse(recovered.stdout);
  } catch {
    fail(`fresh queue recovery returned invalid evidence: ${recovered.stdout}`);
  }
  assert(payload.raw === oldRaw, 'recovery exposed a partially applied or new canonical chapter');
  assert(!payload.files.includes('.project-uow-journal'), 'recovery retained the project journal');
  assert(payload.files.every((name) => !/\.tmp(?:-|$)|\.next$|\.bak$/.test(name)), 'recovery retained a transaction artifact');
  const residual = findResidualTemporaryFiles(projectDirectory);
  assert(residual.length === 0, `C5 crash recovery left temporary artifacts: ${residual.join(', ')}`);
  return {
    childTerminated: true,
    preparedJournalObserved: true,
    recoveredSourceHash: createHash('sha256').update(oldRaw, 'utf8').digest('hex'),
    residualTemporaryFiles: residual,
  };
}

const activeChildren = new Set();
function launchPackaged(profile, label, holdMs) {
  const logPath = join(profile, `../${label}.log`);
  const fd = openSync(logPath, 'w');
  const environment = { ...process.env, NOVEL_DESKTOP_SMOKE: '1', NOVEL_DESKTOP_SMOKE_HOLD_MS: String(holdMs) };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(packagedExecutable, [
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${profile}`,
  ], {
    cwd: dirname(packagedExecutable),
    env: environment,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  });
  closeSync(fd);
  activeChildren.add(child);
  child.once('exit', () => activeChildren.delete(child));
  return { child, logPath };
}

function terminateChild(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid !== undefined) {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  child.kill('SIGKILL');
}

async function packagedSecurityAndRecovery(tempRoot) {
  assert(existsSync(packagedExecutable), 'packaged Electron executable is missing; run package:desktop first');

  const singleProfile = join(tempRoot, 'single-instance-profile');
  mkdirSync(singleProfile, { recursive: true });
  const first = launchPackaged(singleProfile, 'single-first', 3_500);
  await waitFor(() => readLog(first.logPath).includes('[I166] ready windows=1'), 'single-instance first process did not boot');
  const second = launchPackaged(singleProfile, 'single-second', 3_500);
  await waitFor(() => second.child.exitCode !== null, 'second instance did not exit', 8_000);
  await waitFor(() => readLog(first.logPath).includes('[I166] second-instance-focused'), 'second instance did not focus the first window');
  await waitFor(() => first.child.exitCode !== null, 'single-instance first process did not exit', 8_000);
  assert(second.child.exitCode === 0, `second instance exited ${second.child.exitCode}`);

  const crashProfile = join(tempRoot, 'packaged-crash-profile');
  mkdirSync(crashProfile, { recursive: true });
  const crashed = launchPackaged(crashProfile, 'packaged-crash', 5_000);
  await waitFor(() => readLog(crashed.logPath).includes('[I166] ready windows=1'), 'packaged crash fixture did not boot');
  await waitFor(() => readLog(crashed.logPath).includes('[I176] structured-loop'), 'packaged crash fixture did not reach a write consumer');
  assert(crashed.child.exitCode === null, 'packaged crash fixture exited before forced termination');
  terminateChild(crashed.child);
  await waitFor(() => crashed.child.exitCode !== null, 'packaged crash process did not terminate', 8_000);
  assert(crashed.child.exitCode !== 0, 'packaged crash fixture exited cleanly instead of being terminated');

  await wait(750);
  const relaunched = launchPackaged(crashProfile, 'packaged-relaunch', 1_800);
  await waitFor(() => readLog(relaunched.logPath).includes('[I166] ready windows=1'), 'packaged app did not relaunch after crash');
  await waitFor(() => relaunched.child.exitCode !== null, 'packaged relaunch did not exit', 12_000);
  const relaunchOutput = readLog(relaunched.logPath);
  assert(relaunched.child.exitCode === 0, `packaged relaunch exited ${relaunched.child.exitCode}:\n${relaunchOutput}`);
  assert(!relaunchOutput.includes('[I167] kernel-start-failed'), 'packaged relaunch failed to start the kernel');
  assert(!/sk-[A-Za-z0-9]/.test(relaunchOutput), 'packaged relaunch log contains a credential-looking secret');
  const residual = findResidualTemporaryFiles(crashProfile);
  assert(residual.length === 0, `packaged crash/relaunch left temporary artifacts: ${residual.join(', ')}`);
  return {
    singleInstance: { firstBooted: true, secondExited: true, secondFocusedFirst: true },
    crashRelaunch: { crashTerminated: true, relaunchBooted: true, relaunchExitCode: 0, kernelStartFailure: false },
    residualTemporaryFiles: residual,
  };
}

async function cleanup(directory) {
  for (const child of activeChildren) {
    terminateChild(child);
  }
  await wait(750);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch {
      await wait(250);
    }
  }
  process.stderr.write(`[I185] temporary smoke directory could not be removed: ${directory}\n`);
}

async function run() {
  assert(process.platform === 'win32', 'I185 security/recovery smoke must run on win32');
  auditSecurity();
  const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i185-'));
  let passed = false;
  try {
    const crashRecovery = createChapterCrashFixture(tempRoot);
    const packaged = await packagedSecurityAndRecovery(tempRoot);
    writeFileSync(join(root, 'artifacts', 'i185-security-recovery.json'), `${JSON.stringify({
      iteration: 'I185',
      platform: 'win32',
      security: {
        browserWindow: 'contextIsolation+sandbox+noNodeIntegration',
        navigation: 'external-navigation+new-window+webview blocked',
        csp: 'local scripts, no network connect/frame/object, no unsafe-eval',
        rendererForbiddenCapabilities: ['node', 'electron', 'ipcRenderer', 'provider client', 'secret', 'network fetch'],
      },
      faultInjection: crashRecovery,
      packaged,
    }, null, 2)}\n`, 'utf8');
    passed = true;
  } finally {
    if (!passed) {
      try {
        for (const name of readdirSync(tempRoot)) {
          const fullPath = join(tempRoot, name);
          if (name.endsWith('.log')) process.stderr.write(`[I185] ${name}\n${readLog(fullPath)}\n`);
        }
      } catch {
        // Preserve the original smoke failure if the temporary root is already gone.
      }
    }
    await cleanup(tempRoot);
  }
}

await run();
process.stdout.write('I185 smoke: security audit, C5 crash recovery, packaged crash/relaunch, single-instance, and temporary cleanup passed\n');
