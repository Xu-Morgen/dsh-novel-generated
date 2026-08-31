import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const fail = (message) => { throw new Error(`I137 smoke: ${message}`); };

const schema = read('src/core/schema/book-readiness.ts');
const service = read('src/host/book-completion-service.ts');
const remote = read('src/host/remote/review.ts');
const management = read('src/host/composition/management.ts');
const panel = read('src/client/layers/review.ts');
const ops = read('src/client/ops/review.ts');
const binder = read('src/remote-binder.test.ts');
const consumer = read('src/host/book-completion-service.test.ts');
const lock = readJson('contracts/stage18/remote-descriptors.json');

for (const token of ['bookReadinessPageInputSchema', 'bookReadinessIssueSchema', 'bookReadinessResultSchema', 'BOOK_READINESS_MAX_ISSUES']) if (!schema.includes(token)) fail(`strict completion schema missing ${token}`);
for (const token of ['createBookCompletionService', 'readStructural', 'structuralIssues', 'pending-finalization', 'review-warning', 'issue budget']) if (!service.includes(token)) fail(`Host completion owner missing ${token}`);
for (const token of ['bookReadinessInvocation', 'bookScanInvocation']) if (!remote.includes(token)) fail(`Remote contract missing ${token}`);
for (const token of ['bookReadiness', 'bookScan']) if (!management.includes(token)) fail(`composition wiring missing ${token}`);
for (const token of ['data-novel-book-readiness-panel', 'data-novel-book-release-gate', '检查全书完成度', '检查全书并审校']) if (!panel.includes(token)) fail(`release gate UI missing ${token}`);
for (const token of ['runBookCheck', 'bookReadiness', 'bookScan']) if (!ops.includes(token)) fail(`release gate Client action missing ${token}`);
for (const token of ['novelReview/bookReadiness', 'novelReview/bookScan', 'rejected "page"', 'rejected "result"']) if (!binder.includes(token)) fail(`real binder fixture missing ${token}`);
for (const token of ['重开服务后结果一致', '审校失败只失败本次读取', 'pending 定稿']) if (!consumer.includes(token)) fail(`Host completion consumer fixture missing ${token}`);
if (lock.descriptorIds.length !== 180 || lock.resultSchemaIds.length !== 86) fail('Stage 18 lock counts drifted after I137');
if (lock.descriptorIds.at(-1) !== 'novel-creation-tool/novelReview/bookScan') fail('I137 descriptor is not the additive lock tail');
if (lock.resultSchemaIds.at(-1) !== 'novel-creation-tool/novelReview/bookScan') fail('I137 result is not the additive lock tail');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/book-completion-service.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I137', requirement: 'R18-14a',
  guarantees: [
    'recomputed-book-readiness-from-c5-b5-c6-binding-truth',
    'bounded-paginated-chapter-snapshots-and-issue-budget',
    'pending-finalization-reconciliation-outline-change-and-candidate-block-release',
    'existing-review-detectors-aggregated-with-explicit-warning-adjudication',
    'read-only-failure-and-restart-recomputation',
    'real-client-binder-and-contract-lock-pass',
  ],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  focusedSuites: 'BookCompletionService, real binder, and contract-lock fixtures passed',
  explicitNonGoals: ['automatic-prose-editing', 'new-full-book-snapshot', 'one-click-polish', 'client-side-release-truth'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i137-book-readiness.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I137 smoke: book readiness gate, bounded scan, binder, and lock passed\n');
