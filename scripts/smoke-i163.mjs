import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const digest = (path) => createHash('sha256').update(readFileSync(resolve(repoRoot, path))).digest('hex');
const fail = (message) => { throw new Error(`I163 smoke: ${message}`); };

const host = read('src/host/import-interpretation-analysis-service.ts');
const client = read('src/client/import-interpretation-review.ts');
for (const token of ["previous.status !== 'failed'", 'sameBoundInput(previous.input, input)', 'retry input mismatch']) {
  if (!host.includes(token)) fail(`Host retry invariant missing: ${token}`);
}
for (const token of ["if (status.status === 'failed')", 'target.result(identity)', "current?.importSessionId !== identity.importSessionId", "current.analysisStatus === 'cancelled'"]) {
  if (!client.includes(token)) fail(`Client failure diagnostic invariant missing: ${token}`);
}

const unchangedAssets = {
  'contracts/stage19/import-interpretation-remote.json': '9f8427f805563aaca71d514c21e7e3b057e2d5df234cafb493cfacb85afa36b5',
  'src/llm/analyze/import-interpretation.ts': 'cde979a4b7cbfbe97a7aeefae03c6705486fc7a00f6338f0b31cbe3acf938792',
  'src/core/schema/import-interpretation-analysis.ts': '763f9997771077fe21ad4f4d458f7e9e7ca64ba52cb1dea2d299767d32699150',
  'samples/i143/dev.json': '1b4f6178914c289f1bccb5c6d3ce0085ddec92227e4a5391b3acf2897b9dd69d',
  'samples/i143/cases.json': '1f360e6a144d6c75a3f6fa330eaf0cb42b607b291e58fd7f6aba8890143b3142',
  'samples/i143/gold.json': '4e84343cabfe7ccd102fa4118229b1526e16be6e35b8e9bc5c254587cd66c411',
};
for (const [path, expected] of Object.entries(unchangedAssets)) if (digest(path) !== expected) fail(`protected contract/LLM asset changed: ${path}`);

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/host/import-interpretation-analysis-service.test.ts',
  'src/client/import-interpretation-review.test.ts',
  'src/client-onboarding-docx.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`asynchronous retry regression failed (exit ${focused.status}):\n${focused.output.slice(0, 18000)}`);

const artifact = {
  iteration: 'I163', requirement: 'R32-1',
  guarantees: [
    'failed-job-restarts-only-with-identical-bound-input',
    'queued-running-succeeded-and-cancelled-duplicates-remain-rejected',
    'project-source-hash-and-paragraph-mismatches-fail-closed',
    'client-reads-existing-result-for-original-failure-detail',
    'retry-reuses-the-import-session-without-a-second-checkpoint',
    'late-results-cannot-overwrite-a-replacement-session',
  ],
  unchangedAssets,
  unchangedBoundaries: ['remote-and-schema', 'llm-prompt-and-samples', 'session-yaml', 'i162-segmentation', 'narrative-layer-owners', 'confirmation-gate', 'f1-f2'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i163-import-analysis-retry.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I163 smoke: bounded failed-job retry, original error detail, late-response guard, and protected contracts passed\n');
