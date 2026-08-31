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
const fail = (message) => { throw new Error(`I136 smoke: ${message}`); };

const schema = read('src/core/schema/finalization.ts');
const coordinator = read('src/host/finalization-coordinator.ts');
const reconciliation = read('src/host/outline-reconciliation-service.ts');
const writeback = read('src/host/five-layer-writeback.ts');
const management = read('src/host/composition/management.ts');
const clientLayer = read('src/client/layers/chapters.ts');
const clientOps = read('src/client/ops/chapters-management.ts');
const clientWorkflow = read('src/client/writing-workflow.ts');
const binder = read('src/remote-binder.test.ts');
const consumer = read('src/host/finalization-coordinator.test.ts');
const lock = readJson('contracts/stage18/remote-descriptors.json');

for (const token of ['finalizationProposalInputSchema', 'finalizationGatePayloadSchema', 'finalizationApplyResultSchema', 'partial-failure', 'needs-target']) {
  if (!schema.includes(token)) fail(`strict finalization contract missing ${token}`);
}
for (const token of ['createFinalizationCoordinator', 'finalization.apply', 'operationId', 'applyAuthorized', 'completeAuthorized', 'authorizedFinalization']) {
  if (!coordinator.includes(token) && !reconciliation.includes(token) && !writeback.includes(token)) fail(`Host one-confirm seam missing ${token}`);
}
for (const token of ['finalizationCoordinator', 'proposeFinalization', 'acceptFinalization', 'rejectFinalization']) if (!management.includes(token)) fail(`composition wiring missing ${token}`);
for (const token of ['data-novel-finalization', '提交一次确认', '确认并同步定稿', '拒绝本次定稿', '重试同步定稿']) if (!clientLayer.includes(token)) fail(`single confirmation UI missing ${token}`);
for (const token of ['prepareFinalization', 'proposeFinalization', 'acceptFinalization', 'rejectFinalization']) if (!clientOps.includes(token)) fail(`single confirmation Client action missing ${token}`);
if (!clientWorkflow.includes('candidateId')) fail('workflow did not retain candidate identity');
for (const token of ['novelWriting/proposeFinalization', 'novelWriting/acceptFinalization', 'novelWriting/rejectFinalization']) if (!binder.includes(token)) fail(`real binder fixture missing ${token}`);
if (!consumer.includes('already-applied') || !consumer.includes('source freshness changes')) fail('coordinator consumer fixture missing idempotence/freshness assertions');
if (lock.descriptorIds.length !== 178 || lock.resultSchemaIds.length !== 84) fail('Stage 18 lock counts drifted after I136');
if (lock.descriptorIds.at(-1) !== 'novel-creation-tool/novelWriting/rejectFinalization') fail('I136 descriptor is not the additive lock tail');
if (lock.resultSchemaIds.at(-1) !== 'novel-creation-tool/novelWriting/rejectFinalization') fail('I136 result is not the additive lock tail');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/finalization-coordinator.test.ts',
  'src/host/finalization-plan-builder.test.ts',
  'src/client-chapters.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I136', requirement: 'R18-13b',
  guarantees: [
    'one-finalization-proposal-and-one-author-confirmation',
    'authorized-five-layer-application-without-nested-gates',
    'ordered-current-card-completion-and-next-baseline',
    'deterministic-operation-id-with-already-applied-convergence',
    'stale-and-partial-failure-results-remain-visible-and-retryable',
    'no-generation-baseline-returns-needs-target-without-ghost-content',
    'client-summary-confirmation-consumer-and-real-binder-pass',
  ],
  applicationOrder: ['c2', 'c1', 'c3', 'c4', 'b2', 'b5', 'c6', 'baseline'],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  focusedSuites: 'FinalizationCoordinator, FinalizationPlanBuilder, author Client flow, real binder, and contract-lock fixtures passed',
  explicitNonGoals: ['background-finalization', 'automatic-semantic-judgment', 'multi-card-batch-acceptance', 'legacy-candidate-accept-removal'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i136-one-confirm-finalization.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I136 smoke: one-confirm finalization, authorized UoW, stale/retry outcomes, binder, and lock passed\n');
