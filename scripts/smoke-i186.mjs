import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const artifactRoot = resolve(root, 'artifacts', 'desktop');
const packagedExecutable = join(artifactRoot, 'win-unpacked', 'Novel Creation Tool.exe');
const forbiddenDsh = /@deepseek-ai|cordis|typert|client-ui-slots|ModuleLoader|ctx\.llm|src\/remote\.ts|host\/remote/i;
const activeChildren = new Set();

function fail(message) {
  throw new Error(`I186: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function readJson(path) {
  return JSON.parse(read(path));
}

function sha512(path) {
  return createHash('sha512').update(readFileSync(path)).digest('base64');
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

function runPnpm(label, args) {
  const result = spawnCaptured('pnpm', args, {
    cwd: root,
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      TMPDIR: smokeTempDir,
      TEMP: smokeTempDir,
      TMP: smokeTempDir,
      CI: 'true',
      VITEST_MIN_WORKERS: '1',
      VITEST_MAX_WORKERS: '1',
    },
  });
  assert(result.status === 0, `${label} failed (${result.error?.message ?? `exit ${result.status}`}):\n${result.stdout}`);
  return result.stdout;
}

function verifyReadmeProductFlow() {
  const readme = read('README.md');
  const heading = '## 唯一作者流程：12 步';
  const endHeading = '### 产品测试流程';
  const start = readme.indexOf(heading);
  const end = readme.indexOf(endHeading, start);
  assert(start >= 0 && end > start, 'README product-flow section is missing');
  const flow = readme.slice(start, end);
  const steps = [...flow.matchAll(/^\d+\. /gm)].map((match) => Number(match[0].slice(0, -2)));
  assert(steps.join(',') === '1,2,3,4,5,6,7,8,9,10,11,12', `README product flow is not exactly twelve steps: ${steps.join(',')}`);
  const stepText = flow.split('\n').filter((line) => /^\d+\. /.test(line)).join('\n');
  for (const phrase of ['导入创作思路', '生成大纲候选', '生成细纲', '生成基线', '正文候选', '接受为草稿', '分析作者最终保存的正文', '一次确认', '进入下一张有效细纲卡', '有效细纲', '全书一致性检查', '完整 TXT 或 Markdown']) {
    assert(flow.includes(phrase), `README product flow is missing: ${phrase}`);
  }
  assert(!/(projectId|sourceHash|fingerprint|ConfirmationGate|\b(?:B[1-5]|C[1-6])\b)/.test(stepText), 'README twelve-step author path exposes technical identifiers');

  const primary = readJson('artifacts/i140-primary-author-workflow.json');
  assert(primary.iteration === 'I140' && primary.flow.length === 12, 'I140 primary workflow evidence is incomplete');
  assert(primary.flow.every((item) => item.status === 'passed'), 'I140 primary workflow contains a non-passing step');
  assert(primary.negativeMatrix.length >= 8, 'I140 negative product matrix is incomplete');

  const sourceAware = readJson('artifacts/i149-source-aware-product-flow.json');
  assert(sourceAware.iteration === 'I149' && sourceAware.flow.some((item) => item.route === 'existing-i140-workflow'), 'I149 source-aware flow does not converge on the twelve-step workflow');
  for (const artifact of ['i151-rule-style-import-initialization', 'i153-controlled-import-entry', 'i154-source-review-help']) {
    const evidence = readJson(`artifacts/${artifact}.json`);
    assert(evidence.iteration !== undefined && evidence.guarantees.length > 0, `${artifact} evidence is incomplete`);
  }

  return {
    stepCount: steps.length,
    primaryEvidence: 'I140 twelve-step fake-LLM Host/Remote/Client harness',
    sourceAwareEvidence: 'I149 source-aware import converges on I140 steps 3-12',
    negativeMatrix: primary.negativeMatrix.length,
  };
}

function verifyDesktopReleaseBaseline() {
  const packageJson = readJson('package.json');
  const lock = readJson('contracts/desktop/ipc-methods.json');
  assert(packageJson.main === 'dist/desktop/main.cjs', 'package main is not the Electron Main bundle');
  assert(packageJson.exports === undefined && packageJson.dsh === undefined, 'retired package entry surface remains');
  assert(packageJson.build?.win?.target?.[0]?.target === 'nsis', 'release target is not NSIS');
  const dependencyNames = Object.keys(packageJson.dependencies ?? {});
  assert(!dependencyNames.some((name) => forbiddenDsh.test(name)), 'production dependencies contain a retired DSH package');
  const productionImporter = read('pnpm-lock.yaml').slice(read('pnpm-lock.yaml').indexOf('dependencies:'), read('pnpm-lock.yaml').indexOf('devDependencies:'));
  assert(!/@deepseek-ai\/|cordis|typert|client-ui-slots/i.test(productionImporter), 'production lock importer contains a retired DSH package');
  for (const historicalEntry of ['cordis.yml', 'cordis.patch.yml']) {
    assert(!existsSync(resolve(root, historicalEntry)), `historical root entry remains: ${historicalEntry}`);
  }

  assert(lock.schemaVersion === 1, 'desktop IPC lock schema version changed');
  assert(lock.descriptorIds.length >= 214, 'desktop IPC lock lost the 214 invocation baseline');
  assert(lock.descriptorIds.length === 226, `desktop IPC lock count changed unexpectedly: ${lock.descriptorIds.length}`);
  assert(new Set(lock.descriptorIds).size === lock.descriptorIds.length, 'desktop IPC lock contains duplicate method ids');
  assert(Object.keys(lock.descriptors).length === lock.descriptorIds.length, 'desktop IPC descriptor map is not exhaustive');
  assert(Object.keys(lock.schemas).length > lock.descriptorIds.length, 'desktop IPC result/argument schemas are missing');

  const distFiles = ['main.cjs', 'preload.cjs', 'renderer.js', 'index.html', 'renderer.css'];
  for (const file of distFiles) assert(!forbiddenDsh.test(read(`dist/desktop/${file}`)), `desktop bundle contains a retired DSH symbol: ${file}`);
  const asarPath = join(artifactRoot, 'win-unpacked', 'resources', 'app.asar');
  assert(existsSync(asarPath), 'packaged app.asar is missing');
  const asarText = readFileSync(asarPath).toString('utf8');
  assert(!forbiddenDsh.test(asarText), 'packaged app.asar contains a retired DSH symbol');

  const installerFile = `Novel-Creation-Tool-Setup-${packageJson.version}.exe`;
  const installerPath = join(artifactRoot, installerFile);
  assert(existsSync(installerPath), 'release installer is missing');
  const installerBytes = readFileSync(installerPath).byteLength;
  const installerHash = sha512(installerPath);
  const latest = readFileSync(join(artifactRoot, 'latest.yml'), 'utf8');
  assert(latest.includes(`url: ${installerFile}`), 'latest.yml does not name the release installer');
  assert(latest.includes(`sha512: ${installerHash}`), 'latest.yml installer hash is stale');
  assert(latest.includes(`size: ${installerBytes}`), 'latest.yml installer size is stale');

  return {
    ipc: { baseline: 214, current: lock.descriptorIds.length, schemas: Object.keys(lock.schemas).length },
    productionDependencies: dependencyNames,
    installer: { file: installerFile, bytes: installerBytes, sha512: installerHash },
    appAsar: { bytes: readFileSync(asarPath).byteLength, sha512: sha512(asarPath), dshFree: true },
  };
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
      } else if (/\.tmp(?:-|$)|\.next$|\.bak$|\.project-uow-journal$/.test(entry.name)) {
        residual.push(relative(directory, path));
      }
    }
  }
  return residual.sort();
}

function terminateChild(child) {
  if (child?.exitCode !== null && child?.exitCode !== undefined) return;
  if (process.platform === 'win32' && child?.pid !== undefined) {
    runTaskkill(child.pid);
    return;
  }
  child?.kill('SIGKILL');
}

function runTaskkill(pid) {
  const result = spawnCaptured('taskkill', ['/PID', String(pid), '/T', '/F'], { cwd: root });
  return result.status;
}

function launchPackaged(profile, label, holdMs) {
  mkdirSync(profile, { recursive: true });
  const logPath = join(dirname(profile), `${label}.log`);
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

async function runPackagedProductFlow(tempRoot) {
  assert(existsSync(packagedExecutable), 'packaged Electron executable is missing');
  const profile = join(tempRoot, 'packaged-product-profile');
  const launched = launchPackaged(profile, 'packaged-product', 4_500);
  const requiredMarkers = [
    '[I166] ready windows=1',
    '[I166] renderer-probe',
    '[I172] ipc-probe',
    '[I173] renderer-shell',
    '[I174] review-repair-negative',
    '[I175] project-loop',
    '[I176] structured-loop',
    '[I177] c5-loop',
    '[I178] review-queue-loop',
    '[I179] source-import-loop',
    '[I180] author-flow-loop',
    '[I181] assistant-loop',
    '[I182] migration-loop',
  ];
  try {
    const markerStarted = Date.now();
    await waitFor(() => requiredMarkers.every((marker) => readFileSync(launched.logPath, 'utf8').includes(marker)), 'packaged Main/Renderer product markers did not complete', 25_000);
    const markerElapsedMs = Date.now() - markerStarted;
    const exitStarted = Date.now();
    await waitFor(() => launched.child.exitCode !== null, 'packaged product flow did not exit', 15_000);
    const exitElapsedMs = Date.now() - exitStarted;
    const output = readFileSync(launched.logPath, 'utf8');
    assert(launched.child.exitCode === 0, `packaged product flow exited ${launched.child.exitCode}:\n${output}`);
    assert(!forbiddenDsh.test(output), 'packaged product flow output contains a retired DSH symbol');
    assert(!/sk-[A-Za-z0-9]/.test(output), 'packaged product flow output contains a credential-looking secret');
    const residual = findResidualTemporaryFiles(profile);
    assert(residual.length === 0, `packaged product flow left transaction artifacts: ${residual.join(', ')}`);
    return {
      markers: requiredMarkers,
      exitCode: launched.child.exitCode,
      residualTemporaryFiles: residual,
      performance: { markerElapsedMs, exitElapsedMs, markerDeadlineMs: 25_000, exitDeadlineMs: 15_000 },
    };
  } finally {
    terminateChild(launched.child);
  }
}

async function cleanup(directory) {
  for (const child of activeChildren) terminateChild(child);
  await wait(750);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch {
      await wait(250);
    }
  }
  process.stderr.write(`[I186] temporary smoke directory could not be removed: ${directory}\n`);
}

async function run() {
  assert(process.platform === 'win32', 'Stage 36 release smoke must run on win32');
  const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i186-'));
  try {
    const productFlow = verifyReadmeProductFlow();
    const release = verifyDesktopReleaseBaseline();
    runPnpm('I140 primary product-flow smoke', ['run', 'smoke:i140']);
    runPnpm('I149 source-aware product-flow smoke', ['run', 'smoke:i149']);
    runPnpm('I151 held-out import initialization smoke', ['run', 'smoke:i151']);
    runPnpm('I153 controlled import entry smoke', ['run', 'smoke:i153']);
    runPnpm('I154 source review help smoke', ['run', 'smoke:i154']);
    runPnpm('I182 migration smoke', ['run', 'smoke:i182']);
    runPnpm('I184 install/upgrade/uninstall smoke', ['run', 'smoke:i184']);
    runPnpm('I185 security/recovery smoke', ['run', 'smoke:i185']);
    const focused = runPnpm('desktop product-flow focused suites', ['exec', 'vitest', 'run',
      'src/host/onboarding-analyzer-service.test.ts',
      'src/host/onboarding-adjudication-service.test.ts',
      'src/host/long-draft-workflow-coordinator.test.ts',
      'src/host/outline-generation-scope-service.test.ts',
      'src/host/outline-generation-baseline-service.test.ts',
      'src/host/writing-context.test.ts',
      'src/host/writing-adjudication-service.test.ts',
      'src/host/review-repair-workflow.test.ts',
      'src/host/finalization-plan-builder.test.ts',
      'src/host/finalization-coordinator.test.ts',
      'src/host/book-completion-service.test.ts',
      'src/host/manuscript-compiler.test.ts',
      'src/client/workflow.test.ts',
      'src/client-i121-writing-workflow.test.ts',
      'src/client/source-aware-workflow.test.ts',
      'src/client-i159-source-import.test.ts',
      'src/client-panels-review.test.ts',
      'src/client-panels-import-export.test.ts',
      'src/desktop/renderer/project-workflow.test.ts',
      'src/desktop/renderer/structured-ops.test.ts',
      'src/desktop/renderer/assistant-client.test.ts',
      'src/desktop/renderer/migration-client.test.ts',
      'src/desktop/renderer/shell.test.ts',
      'src/desktop/main/assistant-command-registry.test.ts',
      'src/desktop/main/migration-command-registry.test.ts',
      'src/platform/desktop-ipc-registry.test.ts',
      'src/contract-lock.test.ts',
      '--maxWorkers=1',
    ]);
    assert(/Test Files\s+\d+ passed/.test(focused) && /Tests\s+\d+ passed/.test(focused), 'focused product-flow result did not report all suites passing');
    const packaged = await runPackagedProductFlow(tempRoot);
    const i184 = readJson('artifacts/i184-windows-artifacts.json');
    const i185 = readJson('artifacts/i185-security-recovery.json');
    const report = {
      iteration: 'I186',
      stage: 'Stage 36',
      platform: 'win32',
      productFlow,
      focusedSuites: 'README twelve-step Host/Client product owners, source-aware import, desktop Renderer consumers, Main migration/assistant, IPC lock',
      priorGates: {
        i182Migration: true,
        i184InstallUpgradeUninstallReinstall: i184.iteration === 'I184',
        i185SecurityRecovery: i185.iteration === 'I185' && i185.faultInjection.residualTemporaryFiles.length === 0,
      },
      release,
      packaged,
      releaseChecklist: [
        { item: 'Electron-only production host', status: 'passed' },
        { item: 'strict IPC lock and Main/Preload/Renderer boundary', status: 'passed' },
        { item: 'clean install, upgrade, uninstall retention, reinstall reopen', status: 'passed' },
        { item: 'legacy source preview, backup, rollback, and immutability', status: 'passed' },
        { item: 'crash/relaunch, journal recovery, single instance, and cleanup', status: 'passed' },
        { item: 'README twelve-step author flow without technical ids', status: 'passed' },
        { item: 'packaged artifact and update metadata checksum', status: 'passed' },
      ],
      negativeMatrix: [
        'no-DSH-production-dependency-or-asar',
        'README-twelve-step-technical-id-free-author-path',
        '214-invocation-baseline-plus-current-strict-IPC-lock',
        'source-aware-import-converges-on-existing-workflow',
        'migration-source-immutability-and-rollback',
        'install-upgrade-uninstall-reinstall-source-retention',
        'crash-relaunch-and-C5-journal-recovery',
        'single-instance-and-renderer-privilege-boundary',
      ],
      explicitNonGoals: ['F1', 'F2', 'new-domain-feature', 'new-ipc-method', 'manual-demo-as-acceptance', 'gold-or-threshold-change', 'automatic-publishing-upload'],
    };
    const artifactPath = resolve(root, 'artifacts/i186-release-readiness.json');
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  } finally {
    await cleanup(tempRoot);
  }
}

await run();
process.stdout.write('I186 smoke: no-DSH twelve-step product flow, IPC/release baseline, migration, install lifecycle, security recovery, and packaged Main/Renderer E2E passed\n');
