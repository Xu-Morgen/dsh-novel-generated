import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

/** I114 R18-11d smoke：Gate 应用、B5/C6 定稿、下一 baseline 与 materials Client。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I114 smoke: ${message}`); };

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const plannerIds = [
  'novel-creation-tool/novelOutlineReconciliation/prepare',
  'novel-creation-tool/novelOutlineReconciliation/regenerateOne',
  'novel-creation-tool/novelOutlineReconciliation/read',
  'novel-creation-tool/novelOutlineReconciliation/cancel',
];
const applicationIds = [
  'novel-creation-tool/novelOutlineReconciliation/propose',
  'novel-creation-tool/novelOutlineReconciliation/accept',
  'novel-creation-tool/novelOutlineReconciliation/reject',
  'novel-creation-tool/novelOutlineReconciliation/finalize',
  'novel-creation-tool/novelOutlineReconciliation/continue',
];
if (lock.descriptorIds.length !== 144 || lock.resultSchemaIds.length !== 50) fail(`contract counts ${lock.descriptorIds.length}/${lock.resultSchemaIds.length}`);
if (JSON.stringify(lock.descriptorIds.slice(-5)) !== JSON.stringify(applicationIds) || JSON.stringify(lock.resultSchemaIds.slice(-5)) !== JSON.stringify(applicationIds)) fail('I114 application methods are not the final additive suffix');
for (const id of [...plannerIds, ...applicationIds]) if (lock.descriptors[id]?.result?.mode !== 'strict' || lock.resultSchemas[id] === undefined) fail(`missing strict contract ${id}`);

const schema = read('src/core/schema/outline-reconciliation-application.ts');
for (const token of ['outlineReconciliationDecisionSchema', 'outlineReconciliationGatePayloadSchema', 'outlineReconciliationFinalizeResultSchema', 'blocked-pending', 'needs-target']) if (!schema.includes(token)) fail(`application schema missing ${token}`);
const service = read('src/host/outline-reconciliation-service.ts');
for (const token of ['RECONCILIATION_KIND', 'confirmation.accept', 'outline.save', 'outline.saveProgress', 'baseline.finalize', 'onDisposeCleanup', 'OutlineNavigator']) if (!service.includes(token)) fail(`application service missing ${token}`);
for (const forbidden of ['planner.prepare(', 'text.replaceRange(']) if (service.includes(forbidden)) fail(`application service must consume an existing plan and cannot ${forbidden}`);
const client = read('src/client/layers/chapters.ts');
for (const token of ['data-novel-outline-reconciliation', 'data-novel-reconciliation-summary', 'data-novel-reconciliation-evidence', 'data-novel-reconciliation-choice', 'data-novel-reconciliation-next-scene']) if (!client.includes(token)) fail(`materials Client consumer missing ${token}`);
const registry = read('src/client/mount-registry.ts');
if (!registry.includes('outlineReconciliationRemoteContribution') || !registry.includes("key: 'outlineReconciliation'")) fail('reconciliation Remote is not mounted by the Client registry');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/outline-reconciliation-service.test.ts',
  'src/client-chapters.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`I114 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 6000)}`);

const artifact = {
  iteration: 'I114',
  requirement: 'R18-11d',
  remoteNamespace: 'novelOutlineReconciliation',
  applicationMethods: ['propose', 'accept', 'reject', 'finalize', 'continue'],
  guarantees: [
    'strict-gate-payload-and-decision-contract',
    'unconfirmed-rejected-incomplete-and-stale-zero-write',
    'accepted-future-card-only-B5-application',
    'pending-choice-records-C6-deviation',
    'same-host-lane-B5-C6-compensation',
    'explicit-current-detail-beat-finalize',
    'monotonic-C6-beat-completion-and-navigation',
    'next-baseline-uses-exact-reconciled-B5-or-needs-target',
    'duplicate-accept-finalize-continue-idempotent',
    'materials-mode-four-state-manual-evidence-and-next-scene-entry',
    'real-DSH-client-binder-and-client-materials-consumer',
  ],
  explicitNonGoals: ['automatic-body-accept', 'unattended-outline-edit', 'act-beat-restructure', 'book-revision-timeline'],
  contractLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length, plannerSuffix: plannerIds, applicationSuffix: applicationIds },
  focusedSuites: 'Host UoW consumer, materials Client, real DSH binder, and contract lock suites passed',
};
const artifactPath = resolve(repoRoot, 'artifacts/i114-outline-reconciliation-e2e.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I114 smoke: strict Gate application, B5/C6 finalize/continue, next baseline, materials Client and real binder passed\n');
