import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I156 smoke: ${message}`); };

const sessionService = read('src/host/import-interpretation-session-service.ts');
const review = read('src/client/import-interpretation-review.ts');
const presenter = read('src/client/presenter.ts');

for (const token of ['TRANSIENT_WINDOWS_RENAME_CODES', 'MAX_TRANSIENT_RENAME_RETRIES', 'renameWithTransientRetry', 'ImportInterpretationSessionPersistenceOptions']) {
  if (!sessionService.includes(token)) fail(`Host persistence recovery missing ${token}`);
}
for (const token of ['technicalError', 'technicalFailure', 'sourceParagraphs', 'data-novel-import-interpretation-retry', '重试来源审阅']) {
  if (!review.includes(token)) fail(`Client source-review recovery missing ${token}`);
}
if (!presenter.includes('retryImportInterpretation')) fail('presenter retry wiring missing');

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/host/import-interpretation-session-service.test.ts',
  'src/client-onboarding-docx.test.ts',
  'src/client/import-interpretation-review.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`session recovery regression failed (exit ${focused.status}):\n${focused.output.slice(0, 16000)}`);

const artifact = {
  iteration: 'I156', requirement: 'R27-1',
  guarantees: [
    'bounded-transient-windows-rename-retry',
    'non-transient-and-exhausted-fail-closed',
    'source-evidence-preserved-for-in-place-retry',
    'missing-session-retry-creates-checkpoint',
    'existing-session-retry-reuses-checkpoint',
    'technical-cause-in-explicit-advanced-details',
  ],
  unchangedContracts: ['novelImportInterpretation', 'novelImportInterpretationAnalysis', 'docx-chunks', 'i151-first-import-trigger', 'llm-prompts-and-samples'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i156-source-review-session-recovery.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I156 smoke: transient session persistence retry, in-place Client recovery, and advanced diagnostics passed\n');
