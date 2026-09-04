import { closeSync, copyFileSync, existsSync, mkdtempSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const tempRoot = mkdtempSync(join(process.platform === 'win32' ? tmpdir() : '/tmp', 'novel-desktop-i183-'));
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const lock = read('pnpm-lock.yaml');
const lockImporter = lock.slice(lock.indexOf('importers:'), lock.indexOf('packages:'));
const productionLockImporter = lockImporter.slice(lockImporter.indexOf('dependencies:'), lockImporter.indexOf('devDependencies:'));
const forbiddenGraph = /@deepseek-ai|cordis|typert|client-ui-slots|ModuleLoader|ctx\.llm|src\/remote\.ts|src\/host\/remote\/|src\/host\/composition\//i;
const forbiddenBundle = /@deepseek-ai|Cordis|Typert|ModuleLoader|ctx\.llm|host\/remote|src\/remote\.ts/i;

function fail(message) {
  throw new Error(`I183: ${message}`);
}

if (packageJson.main !== 'dist/desktop/main.cjs') fail('package main is not the Electron Main bundle');
if (packageJson.exports !== undefined || packageJson.dsh !== undefined) fail('retired package entry surface is still present');
if (JSON.stringify(packageJson.dependencies ?? {}).match(/@deepseek-ai|cordis|typert|slot/i)) fail('retired packages remain in production dependencies');
if (productionLockImporter.match(/@deepseek-ai\/(?:cordis|dsh-)/)) fail('retired packages remain in the lockfile production importer');
for (const path of ['cordis.yml', 'cordis.patch.yml']) {
  if (existsSync(resolve(root, path))) fail(`root historical manifest still exists: ${path}`);
}
if (!read('legacy-dsh/README.md').includes('historical')) fail('legacy fixture boundary is undocumented');

const entries = [
  { path: 'src/desktop/main/main.ts', platform: 'node', format: 'cjs', external: ['electron'] },
  { path: 'src/desktop/preload/preload.ts', platform: 'node', format: 'cjs', external: ['electron'] },
  { path: 'src/desktop/renderer/main.ts', platform: 'browser', format: 'iife', external: [] },
];
for (const entry of entries) {
  const result = await build({
    entryPoints: [resolve(root, entry.path)],
    bundle: true,
    write: false,
    outdir: join(tempRoot, 'graph'),
    platform: entry.platform,
    format: entry.format,
    external: entry.external,
    metafile: true,
    logLevel: 'silent',
  });
  const inputs = Object.keys(result.metafile.inputs);
  const forbidden = inputs.filter((input) => forbiddenGraph.test(input));
  if (forbidden.length > 0) fail(`${entry.path} production graph contains ${forbidden.join(', ')}`);
}

const distFiles = ['main.cjs', 'preload.cjs', 'renderer.js', 'index.html', 'renderer.css'];
for (const file of distFiles) {
  const content = read(`dist/desktop/${file}`);
  if (forbiddenBundle.test(content)) fail(`dist/desktop/${file} contains a retired DSH entry symbol`);
}

const installRoot = join(tempRoot, 'production-install');
const installPackage = join(installRoot, 'package.json');
const installLock = join(installRoot, 'pnpm-lock.yaml');
const installPackageDir = resolve(installRoot);
mkdirSync(installPackageDir, { recursive: true });
copyFileSync(resolve(root, 'package.json'), installPackage);
copyFileSync(resolve(root, 'pnpm-lock.yaml'), installLock);
const install = spawnSync('pnpm', ['install', '--prod', '--frozen-lockfile', '--ignore-scripts'], {
  cwd: installRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
  windowsHide: true,
});
if (install.status !== 0) fail(`production-only install failed (${install.error?.message ?? `exit ${install.status}`}):\n${install.stdout}\n${install.stderr}`);
const installedPackages = readdirSync(join(installRoot, 'node_modules')).filter((name) => !name.startsWith('.'));
if (installedPackages.some((name) => /deepseek|cordis|typert|slot/i.test(name))) fail(`production-only install exposes retired package: ${installedPackages.join(', ')}`);

const electronBinary = process.platform === 'win32'
  ? resolve(root, 'node_modules/electron/dist/electron.exe')
  : resolve(root, 'node_modules/electron/dist/electron');
const logPath = join(tempRoot, 'electron.log');
const userData = join(tempRoot, 'user-data');
const fd = openSync(logPath, 'w');
const electronEnv = { ...process.env, NOVEL_DESKTOP_SMOKE: '1', NOVEL_DESKTOP_SMOKE_HOLD_MS: '3200' };
delete electronEnv.ELECTRON_RUN_AS_NODE;
const child = spawn(electronBinary, [
  '--headless',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  `--user-data-dir=${userData}`,
  root,
], { cwd: root, env: electronEnv, stdio: ['ignore', fd, fd], windowsHide: true });
closeSync(fd);

const waitFor = async (predicate, timeoutMs) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  fail(`Electron boot timed out:\n${readFileSync(logPath, 'utf8')}`);
};

try {
  await waitFor(() => readFileSync(logPath, 'utf8').includes('[I166] ready windows=1'), 15_000);
  await waitFor(() => child.exitCode !== null, 12_000);
  const output = readFileSync(logPath, 'utf8');
  for (const marker of ['[I166] ready windows=1', '[I166] renderer-probe', '[I173] renderer-shell']) {
    if (!output.includes(marker)) fail(`Electron smoke is missing ${marker}:\n${output}`);
  }
  if (output.match(forbiddenBundle)) fail('Electron boot output contains a retired DSH entry symbol');
  if (child.exitCode !== 0) fail(`Electron smoke exited ${child.exitCode}:\n${output}`);
} finally {
  if (child.exitCode === null) child.kill();
  await new Promise((resolveWait) => setTimeout(resolveWait, 300));
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

process.stdout.write('I183 smoke: production-only install, DSH-free Main/Preload/Renderer graph, bundle scan, and Electron boot passed\n');
