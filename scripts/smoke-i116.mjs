import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

/** I116 R18-5b smoke：operational audit journal、恢复、投影与真实 binder。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I116 smoke: ${message}`); };

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const auditId = 'novel-creation-tool/novelReferenceAudit/list';
if (lock.descriptorIds.length !== 145 || lock.resultSchemaIds.length !== 51) fail(`contract counts ${lock.descriptorIds.length}/${lock.resultSchemaIds.length}`);
if (lock.descriptorIds.at(-1) !== auditId || lock.resultSchemaIds.at(-1) !== auditId) fail('audit Remote is not the final additive suffix');
if (lock.descriptors[auditId]?.result?.mode !== 'strict' || lock.resultSchemas[auditId] === undefined) fail('audit Remote contract is not strict and locked');

const schema = read('src/core/schema/reference-audit.ts');
for (const token of ['referenceAuditRecordSchema', 'referenceAuditRecordInputSchema', 'referenceAuditListInputSchema', 'pending', 'applied', 'failed', 'REFERENCE_AUDIT_MAX_PAGE_SIZE']) {
  if (!schema.includes(token)) fail(`audit schema missing ${token}`);
}
const journal = read('src/core/reference-audit/journal.ts');
for (const token of ['ReferenceAuditJournal', 'ensurePending', 'markApplied', 'markFailed', 'retry', 'referenceAuditFileSchema', 'rename(temporary']) {
  if (!journal.includes(token)) fail(`journal missing ${token}`);
}
const coordinator = read('src/host/cross-layer-reference-coordinator.ts');
for (const token of ['operationalJournal', 'buildReferenceAuditInput', 'markFailed', 'markApplied']) {
  if (!coordinator.includes(token)) fail(`coordinator audit seam missing ${token}`);
}
const registry = read('src/client/mount-registry.ts');
if (!registry.includes('referenceAuditRemoteContribution') || !registry.includes("key: 'referenceAudit'")) fail('audit Remote is not mounted by the Client registry');
for (const forbidden of ['markError', 'confirmation.propose', 'llm']) {
  if (journal.toLowerCase().includes(forbidden.toLowerCase())) fail(`I117/I118 scope leaked into journal: ${forbidden}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/core/reference-audit/journal.test.ts',
  'src/host/reference-audit-service.test.ts',
  'src/host/cross-layer-reference-coordinator.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`I116 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 6000)}`);

const artifact = {
  iteration: 'I116',
  requirement: 'R18-5b',
  remoteNamespace: 'novelReferenceAudit',
  methods: ['list'],
  guarantees: [
    'strict-operation-source-target-before-after-hash-records',
    'atomic-append-and-project-isolated-journal',
    'pending-applied-failed-and-explicit-retry-transitions',
    'restart-recovery-with-idempotent-no-duplicate-apply',
    'fail-closed-corrupt-journal-and-invalid-state',
    'bounded-owner-status-pagination-and-stable-sort',
    'same-host-reference-UoW-audit-before-and-after-write',
    'minimal-client-owned-operational-json-only',
    'fiber-dispose-clears-journal-handles-with-zero-background-tasks',
    'real-DSH-client-binder-strict-result-and-negative-input',
  ],
  explicitNonGoals: ['reference-error-marking-ui', 'LLM-reference-correction', 'narrative-layer-owner', 'portable-export-entry'],
  contractLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length, auditSuffix: [auditId] },
  focusedSuites: 'journal/service/coordinator recovery, real DSH binder, and contract lock suites passed',
};
const artifactPath = resolve(repoRoot, 'artifacts/i116-reference-audit.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I116 smoke: atomic reference audit journal, recovery, bounded projection, coordinator UoW and binder passed\n');
