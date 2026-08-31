import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I129 smoke: ${message}`); };

const session = read('src/client/review-repair-session.ts');
const ops = read('src/client/ops/review.ts');
const panel = read('src/client/layers/review.ts');
const tests = read('src/client-panels-review.test.ts');
for (const token of ['ReviewRepairSessionStatus', 'correlateReviewRepairScan', 'uncertain', 'freshReviewRepairSession']) if (!session.includes(token)) fail(`session state machine missing ${token}`);
for (const token of ["writing.adjudicate(candidate.candidate.id, 'accept'", 'review:repair:rescan', 'repairRunIsCurrent', 'retryRepairScan']) if (!ops.includes(token)) fail(`review operation missing ${token}`);
for (const token of ['接受并复扫', 'data-novel-review-repair-resolved', 'data-novel-review-repair-uncertain', 'data-novel-review-repair-cancel']) if (!panel.includes(token)) fail(`review session UI missing ${token}`);
for (const token of ['同一 fingerprint 消失', '复扫失败', '拒绝候选零写']) if (!tests.includes(token)) fail(`consumer fixture missing ${token}`);

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/client/review-repair-session.test.ts',
  'src/client-panels-review.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I129 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I129',
  requirement: 'R18-3b',
  guarantees: [
    'accepted-repair-reuses-existing-writing-adjudication-owner-and-then-rescans',
    'only-correlated-missing-fingerprint-enters-client-session-resolved',
    'persistent-issue-and-rescan-failure-remain-unresolved-or-uncertain',
    'manual-full-rescan-and-session-reset-clear-resolved-evidence',
    'duplicate-accept-scan-and-cancel-late-result-guards-are-idempotent',
    'reject-path-does-not-trigger-scan-or-direct-c5-write',
  ],
  focusedSuites: 'I129 session state-machine and review panel consumer suites passed',
  explicitNonGoals: ['host-resolved-ledger', 'cross-session-history', 'new-review-remote', 'direct-c5-write'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i129-review-resolved-session.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I129 smoke: accept, correlated rescan, resolved/uncertain session states, retry, cancel, and reject guards passed\n');
