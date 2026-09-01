import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I148 smoke: ${message}`); };
const schema = read('src/core/schema/narrative-import-plan.ts');
const service = read('src/host/narrative-import-plan-coordinator.ts');
const remote = read('src/host/remote/narrative-import-plan.ts');
const tests = read('src/host/narrative-import-plan-coordinator.test.ts');
const lock = JSON.parse(read('contracts/stage19/narrative-import-plan-remote.json'));
const packageJson = JSON.parse(read('package.json'));
const oldLock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));

for (const token of ['narrativeImportPlanPackageSchema', 'narrativeImportPlanInputSchema', 'narrativeImportPlanSchema', 'committedStages']) {
  if (!schema.includes(token)) fail(`plan schema missing ${token}`);
}
for (const token of ['propose', 'read', 'accept', 'reject', 'recover', 'new empty project', 'partial-failure']) {
  if (!service.includes(token) && !tests.includes(token)) fail(`plan lifecycle missing ${token}`);
}
for (const token of ['narrativeImportPlanProposeInvocation', 'narrativeImportPlanAcceptInvocation', 'narrativeImportPlanRecoverInvocation']) {
  if (!remote.includes(token)) fail(`plan Remote missing ${token}`);
}
if (!service.includes('createLayerApplier') || !service.includes('owners.knowledge.saveAll') || !service.includes('owners.confirmation')) fail('coordinator does not reuse layer/C3/I11 owners');
if (service.includes('textService') || service.includes('chapter')) fail('NarrativeImportPlan must not write C5');
if (lock.descriptorIds.length !== 5 || lock.resultSchemaIds.length !== 5) fail('plan Remote lock must contain five strict invocations');
if (packageJson.scripts['verify:i148'] === undefined) fail('verify:i148 script missing');
if (oldLock.descriptorIds.length !== 181 || oldLock.resultSchemaIds.length !== 87) fail('Stage 18 Remote lock changed');
const result = spawnCaptured('corepack', ['pnpm', 'exec', 'vitest', 'run', 'src/host/narrative-import-plan-coordinator.test.ts', 'src/narrative-import-plan-contract.test.ts'], { cwd: repoRoot });
if (result.status !== 0) fail(`plan lifecycle fixture failed (exit ${result.status}):\n${result.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I148', requirement: 'R19-5a',
  guarantees: [
    'one-preview-one-i11-confirmation',
    'i52-six-layer-owners-reused-with-stage19-b5-c3-c4-package',
    'new-empty-project-preflight',
    'pending-and-reject-have-zero-layer-writes',
    'stale-non-empty-project-fails-closed',
    'durable-committed-stages-checkpoint',
    'partial-failure-reports-errors-and-recovers-by-same-plan',
    'repeat-accept-is-idempotent',
    'c5-writer-is-not-a-plan-participant',
  ],
  negativeMatrix: ['pending-before-confirmation', 'rejected', 'non-empty-project', 'stale-plan', 'state-failure', 'partial-failure-recovery', 'cross-session', 'source-hash-mismatch', 'disposed'],
  focusedSuites: ['src/host/narrative-import-plan-coordinator.test.ts', 'src/narrative-import-plan-contract.test.ts', 'src/host/onboarding-adjudication-service.test.ts'],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  explicitNonGoals: ['c5-write', 'non-empty-merge', 'cross-owner-global-rollback', 'background-apply', 'stage20-shared-uow', 'second-workflow-route'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i148-narrative-import-apply.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I148 smoke: unified preview, I11 confirmation, empty-project guard, durable partial recovery, idempotence, and C5 boundary passed\n');
