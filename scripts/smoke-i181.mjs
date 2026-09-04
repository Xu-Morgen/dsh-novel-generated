import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const smokeTempDir = process.platform === 'win32' ? tmpdir() : '/tmp';
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const lock = JSON.parse(read('contracts/desktop/ipc-methods.json'));
const assistantIds = [
  'novel-creation-tool/novelAssistant/open',
  'novel-creation-tool/novelAssistant/status',
  'novel-creation-tool/novelAssistant/context',
  'novel-creation-tool/novelAssistant/continue',
  'novel-creation-tool/novelAssistant/adjudicate',
  'novel-creation-tool/novelAssistant/inspire',
];
const mainSources = [
  'src/host/novel-agent-service.ts',
  'src/desktop/main/assistant-command-registry.ts',
  'src/desktop/main/author-workflow-handlers.ts',
  'src/desktop/main/c5-handlers.ts',
  'src/desktop/main/project-handlers.ts',
].map(read).join('\n');
const rendererSources = [
  'src/desktop/renderer/assistant-client.ts',
  'src/desktop/renderer/assistant-panel.ts',
  'src/desktop/renderer/shell.ts',
].map(read).join('\n');

if (lock.descriptorIds.length !== 223 || assistantIds.some((id) => !lock.descriptorIds.includes(id))) {
  throw new Error('I181 canonical desktop lock is missing the strict assistant descriptors');
}
for (const required of ['NovelAgentService', 'createDesktopAssistantCommandRegistry', 'createNovelAgentService', 'context: nextSceneContext', 'inspiration']) {
  if (!mainSources.includes(required)) throw new Error(`I181 Main assistant owner missing: ${required}`);
}
for (const forbidden of ['registerNovelAgentTools', 'registerTool', 'child_process', 'exec(']) {
  if (mainSources.includes(forbidden)) throw new Error(`I181 Main assistant imports forbidden command surface: ${forbidden}`);
}
for (const required of ['createDesktopAssistantClient', 'DesktopAssistantPanel', 'desktopAssistant']) {
  if (!rendererSources.includes(required)) throw new Error(`I181 Renderer assistant consumer missing: ${required}`);
}
for (const forbidden of ['node:fs', 'node:path', 'electron', '@deepseek-ai/', 'credentials.bin', 'libraryRoot']) {
  if (rendererSources.includes(forbidden)) throw new Error(`I181 Renderer assistant source contains forbidden host capability: ${forbidden}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/desktop/main/assistant-command-registry.test.ts',
  'src/desktop/main/project-handlers.test.ts',
  'src/desktop/renderer/assistant-client.test.ts',
  'src/desktop/renderer/shell.test.ts',
  'src/platform/desktop-ipc-registry.test.ts',
], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, TMPDIR: smokeTempDir, TEMP: smokeTempDir, TMP: smokeTempDir, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (focused.status !== 0) throw new Error(`I181 focused tests failed (exit ${focused.status}):\n${focused.stdout}\n${focused.stderr}`);

const bundle = read('dist/desktop/renderer.js');
for (const required of ['data-novel-assistant', 'novelAssistant/status']) {
  if (!bundle.includes(required)) throw new Error(`I181 Renderer bundle is missing assistant marker: ${required}`);
}
for (const forbidden of ['node:fs', 'node:path', 'electron.shell', '@deepseek-ai/dsh-', 'credentials.bin', 'NOVEL_CUSTOM_API_KEY']) {
  if (bundle.includes(forbidden)) throw new Error(`I181 Renderer bundle contains forbidden capability/secret marker: ${forbidden}`);
}

const tempRoot = mkdtempSync(join(smokeTempDir, 'novel-desktop-i181-'));
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
  while (Date.now() - started < 15_000 && !readFileSync(logPath, 'utf8').includes('[I181] assistant-loop')) {
    await new Promise((wait) => setTimeout(wait, 25));
  }
  const output = readFileSync(logPath, 'utf8');
  for (const marker of [
    '[I181] assistant-loop',
    '"listed":{"ok":true',
    '"opened":{"ok":true',
    '"status":{"ok":true',
    '"context":{"ok":true',
    '"invalid":{"ok":false,"error":{"code":"handler-failed"',
    '"unknown":{"ok":false,"error":{"code":"invalid-request"',
  ]) {
    if (!output.includes(marker)) throw new Error(`I181 Electron smoke missing marker ${marker}:\n${output}`);
  }
  if (child.exitCode === null) await new Promise((resolveWait) => child.once('exit', resolveWait));
  if (child.exitCode !== 0) throw new Error(`I181 Electron smoke exited ${child.exitCode}:\n${output}`);
  passed = true;
} finally {
  if (!passed && child?.exitCode === null) child.kill();
  await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

process.stdout.write('I181 smoke: strict Main-owned assistant command loop, shared context, bounded Renderer surface, and negative IPC gates passed\n');
