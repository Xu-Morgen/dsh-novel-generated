import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I122 smoke: ${message}`); };

const session = read('src/client/polish-session.ts');
const candidateOps = read('src/client/ops/chapters-candidate.ts');
const chapters = read('src/client/layers/chapters.ts');
const store = read('src/client/store/index.ts');
const client = read('src/client.ts');
const remote = read('src/host/remote/writing.ts');
for (const token of ['orderPolishScenes', 'scene.index', 'startPolishSession', 'selectNextPolishScene', 'stopPolishSession']) {
  if (!session.includes(token)) fail(`session owner missing ${token}`);
}
for (const token of ["intent: 'rewrite'", 'polishMode', 'writing:polish:', 'previewAfterPropose']) {
  if (!candidateOps.includes(token)) fail(`candidate consumer missing ${token}`);
}
for (const token of ['data-novel-polish-start', 'data-novel-polish-next', 'data-novel-polish-stop', 'data-novel-polish-restart']) {
  if (!chapters.includes(token)) fail(`chapter controls missing ${token}`);
}
for (const token of ['chaptersPolishForRevision', 'freshPolishSession']) {
  if (!store.includes(token)) fail(`store session action missing ${token}`);
}
if (!client.includes('chaptersPolishReset')) fail('Fiber disposer does not clear polish session');
if (!remote.includes("polishMode: z.enum(['language', 'condense', 'expand']).optional()")) fail('strict Remote polishMode field missing');

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const writingDescriptors = lock.descriptorIds.filter((id) => id.includes('/novelWriting/'));
const writingResults = lock.resultSchemaIds.filter((id) => id.includes('/novelWriting/'));
if (writingDescriptors.length !== 5 || writingResults.length !== 5) fail('writing descriptor/result lock is incomplete');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/client-i122-polish.test.ts',
  'src/host/writing-adjudication-service.test.ts',
  'src/remote-binder.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I122 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I122',
  requirement: 'R18-4a',
  guarantees: [
    'scene-index-deterministic-order-with-id-tie-break',
    'one-existing-rewrite-candidate-per-current-scene',
    'independent-source-hash-and-existing-preview-adjudication-consumer',
    'accepted-scene-keeps-transient-session-and-exposes-next-action',
    'stop-invalidates-late-results-without-starting-next-scene',
    'empty-chapter-and-cross-navigation-do-not-create-polish-batch',
    'fiber-dispose-clears-client-only-session-state',
    'strict-polish-mode-remote-field-and-real-binder-negative-check',
  ],
  focusedSuites: 'I122 Client session/consumer, Host candidate, and real binder tests passed',
  explicitNonGoals: ['mode-specific-prompt-presets', 'full-book-batch', 'auto-accept', 'persistent-batch-journal', 'background-resume'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i122-polish-scene-flow.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I122 smoke: ordered scene polish session, existing rewrite adjudication, stop guard, and strict binder contract passed\n');
