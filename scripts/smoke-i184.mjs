import { createHash } from 'node:crypto';
import { closeSync as closeFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i184-'));
const artifactRoot = resolve(root, 'artifacts', 'desktop');
const installerName = `Novel-Creation-Tool-Setup-${packageJson.version}.exe`;
const installerPath = join(artifactRoot, installerName);
const blockmapPath = `${installerPath}.blockmap`;
const latestPath = join(artifactRoot, 'latest.yml');
const unpackedAsarPath = join(artifactRoot, 'win-unpacked', 'resources', 'app.asar');

function fail(message) {
  throw new Error(`I184: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readLog(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitFor(predicate, message, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await wait(50);
  }
  fail(message);
}

function sha512(path) {
  return createHash('sha512').update(readFileSync(path)).digest('base64');
}

function runInstaller(path, args, label) {
  const result = spawnSync(path, args, {
    cwd: root,
    stdio: 'ignore',
    windowsHide: true,
    timeout: 120_000,
  });
  assert(result.status === 0, `${label} failed (${result.error?.message ?? `exit ${result.status}`})`);
}

async function launchInstalled(executable, profile, label) {
  const logPath = join(tempRoot, `${label}.log`);
  const fd = openSync(logPath, 'w');
  const environment = {
    ...process.env,
    NOVEL_DESKTOP_SMOKE: '1',
    NOVEL_DESKTOP_SMOKE_HOLD_MS: '1200',
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(executable, [
    '--headless',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--user-data-dir=${profile}`,
  ], {
    cwd: dirname(executable),
    env: environment,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  });
  closeFileSync(fd);

  try {
    await waitFor(
      () => readLog(logPath).includes('[I166] ready windows=1'),
      `${label} packaged app did not start:\n${readLog(logPath)}`,
      20_000,
    );
    await waitFor(() => child.exitCode !== null, `${label} packaged app did not exit:\n${readLog(logPath)}`, 15_000);
    const output = readLog(logPath);
    for (const marker of ['[I166] ready windows=1', '[I166] renderer-probe', '[I173] renderer-shell']) {
      assert(output.includes(marker), `${label} packaged app is missing ${marker}:\n${output}`);
    }
    assert(!/Cordis|Typert|ModuleLoader|ctx\.llm|@deepseek-ai/i.test(output), `${label} boot output contains retired DSH symbols`);
    assert(child.exitCode === 0, `${label} packaged app exited ${child.exitCode}:\n${output}`);
  } finally {
    if (child.exitCode === null) child.kill();
  }
}

function writeRetentionMarker(profile) {
  const markerPath = join(profile, 'library', 'i184-retained', 'author-note.txt');
  mkdirSync(dirname(markerPath), { recursive: true });
  writeFileSync(markerPath, 'I184 retained author source of truth\n', 'utf8');
  return markerPath;
}

function writeArtifactManifest() {
  const files = [installerPath, blockmapPath, latestPath, unpackedAsarPath];
  for (const path of files) assert(existsSync(path), `packaged artifact is missing: ${path}`);
  const installerHash = sha512(installerPath);
  const latest = readFileSync(latestPath, 'utf8');
  assert(latest.includes(`url: ${installerName}`), 'latest.yml does not point to the published installer name');
  assert(latest.includes(`sha512: ${installerHash}`), 'latest.yml checksum does not match the installer');
  assert(latest.includes(`size: ${readFileSync(installerPath).byteLength}`), 'latest.yml size does not match the installer');
  const manifest = {
    iteration: 'I184',
    platform: 'win32',
    version: packageJson.version,
    installer: {
      file: installerName,
      bytes: readFileSync(installerPath).byteLength,
      sha512: installerHash,
    },
    blockmap: {
      file: `${installerName}.blockmap`,
      bytes: readFileSync(blockmapPath).byteLength,
      sha512: sha512(blockmapPath),
    },
    updateMetadata: {
      file: 'latest.yml',
      bytes: readFileSync(latestPath).byteLength,
      sha512: sha512(latestPath),
    },
    unpackedAsar: {
      file: 'win-unpacked/resources/app.asar',
      bytes: readFileSync(unpackedAsarPath).byteLength,
      sha512: sha512(unpackedAsarPath),
    },
  };
  writeFileSync(join(root, 'artifacts', 'i184-windows-artifacts.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

assert(process.platform === 'win32', 'I184 is a Windows installer smoke and must run on win32');
assert(packageJson.build?.artifactName === 'Novel-Creation-Tool-Setup-${version}.${ext}', 'artifactName is not stable for update metadata');
assert(packageJson.build?.win?.target?.[0]?.target === 'nsis', 'Windows target is not NSIS');
assert(packageJson.build?.win?.target?.[0]?.arch?.includes('x64'), 'Windows target does not include x64');
assert(packageJson.build?.nsis?.oneClick === false, 'installer must use assisted install mode');
assert(packageJson.build?.nsis?.perMachine === false, 'installer must remain per-user');
assert(packageJson.build?.nsis?.deleteAppDataOnUninstall === false, 'uninstall must retain app data');
assert(packageJson.build?.nsis?.runAfterFinish === false, 'smoke must control first launch explicitly');
assert(existsSync(installerPath), `version ${packageJson.version} installer is missing; run package:desktop first`);

writeArtifactManifest();

const installRoot = join(tempRoot, 'installed', 'Novel Creation Tool');
const installParent = dirname(installRoot);
const profile = join(tempRoot, 'user-data');
const firstLog = join(tempRoot, 'installer-v1.log');
const upgradeInstallerLog = join(tempRoot, 'installer-v2.log');
const uninstallLog = join(tempRoot, 'uninstall.log');
mkdirSync(installParent, { recursive: true });

const v2Output = join(tempRoot, 'v2-package');
mkdirSync(v2Output, { recursive: true });
const v2Build = spawnSync('pnpm', [
  'exec',
  'electron-builder',
  '--win',
  'nsis',
  '--publish',
  'never',
  '-c.extraMetadata.version=2.0.1',
  `-c.directories.output=${v2Output}`,
], {
  cwd: root,
  env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
  encoding: 'utf8',
  shell: process.platform === 'win32',
  windowsHide: true,
});
assert(v2Build.status === 0, `version 2.0.1 package failed (${v2Build.error?.message ?? `exit ${v2Build.status}`}):\n${v2Build.stdout}\n${v2Build.stderr}`);
const v2InstallerPath = join(v2Output, 'Novel-Creation-Tool-Setup-2.0.1.exe');
assert(existsSync(v2InstallerPath), 'version 2.0.1 installer is missing');

let passed = false;
try {
  runInstaller(installerPath, ['/S', `/LOG=${firstLog}`, `/D=${installRoot}`], 'initial install');
  const installedExecutable = join(installRoot, 'Novel Creation Tool.exe');
  assert(existsSync(installedExecutable), 'initial install did not place the application executable');
  assert(existsSync(join(installRoot, 'resources', 'app.asar')), 'initial install did not place app.asar');
  await launchInstalled(installedExecutable, profile, 'initial-install');

  const markerPath = writeRetentionMarker(profile);
  assert(existsSync(markerPath), 'retention marker was not created');

  runInstaller(v2InstallerPath, ['/S', `/LOG=${upgradeInstallerLog}`, `/D=${installRoot}`], 'upgrade install');
  assert(existsSync(installedExecutable), 'upgrade removed the installed executable');
  await launchInstalled(installedExecutable, profile, 'upgrade');
  assert(existsSync(markerPath), 'upgrade removed the author source-of-truth marker');

  const uninstaller = join(installRoot, 'Uninstall Novel Creation Tool.exe');
  assert(existsSync(uninstaller), 'installed uninstaller is missing');
  runInstaller(uninstaller, ['/S', `/LOG=${uninstallLog}`], 'uninstall');
  await waitFor(() => !existsSync(installedExecutable), 'uninstall retained the application executable', 30_000);
  await waitFor(() => !existsSync(join(installRoot, 'resources', 'app.asar')), 'uninstall retained app.asar', 30_000);
  assert(existsSync(markerPath), 'uninstall deleted the author source-of-truth marker');

  runInstaller(v2InstallerPath, ['/S', `/LOG=${join(tempRoot, 'reinstall-installer.log')}`, `/D=${installRoot}`], 'reinstall');
  await waitFor(() => existsSync(installedExecutable), 'reinstall did not restore the application executable', 30_000);
  await launchInstalled(installedExecutable, profile, 'reinstall');
  assert(existsSync(markerPath), 'reinstall could not reopen retained author data');
  passed = true;
} finally {
  if (!passed) {
    for (const logName of ['installer-v1.log', 'installer-v2.log', 'uninstall.log', 'reinstall-installer.log', 'initial-install.log', 'upgrade.log', 'reinstall.log']) {
      const logPath = join(tempRoot, logName);
      const output = readLog(logPath);
      if (output) process.stderr.write(`[I184] ${logName}\n${output}`);
    }
  }
  await wait(750);
  let cleaned = false;
  for (let attempt = 0; attempt < 20 && !cleaned; attempt += 1) {
    try {
      rmSync(tempRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      cleaned = true;
    } catch {
      await wait(250);
    }
  }
  if (!cleaned) process.stderr.write(`[I184] temporary smoke directory could not be removed: ${tempRoot}\n`);
}

process.stdout.write('I184 smoke: Windows install, packaged boot, upgrade retention, uninstall retention, and reinstall passed\n');
