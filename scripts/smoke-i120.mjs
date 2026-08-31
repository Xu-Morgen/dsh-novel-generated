import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I120 smoke: ${message}`); };

const schema = read('src/core/schema/long-draft.ts');
const repository = read('src/host/long-draft-workflow-repository.ts');
const coordinator = read('src/host/long-draft-workflow-coordinator.ts');
const remote = read('src/host/remote/long-draft.ts');
const composition = read('src/host/composition/management.ts');
const client = read('src/client/long-draft-guide.ts') + read('src/client/mount-registry.ts');
for (const token of ['longDraftOutlineGatePayloadSchema', 'longDraftWorkflowCheckpointEntrySchema', 'longDraftWorkflowRecoverResultSchema', 'longDraftOutlineAcceptResultSchema']) {
  if (!schema.includes(token)) fail(`I120 strict schema missing ${token}`);
}
for (const token of ['writeYaml', 'rename', 'longDraftWorkflowCheckpointDocumentSchema', 'longDraftWorkflowCheckpointEntrySchema']) {
  if (!repository.includes(token)) fail(`checkpoint atomic persistence missing ${token}`);
}
for (const token of ['proposeApply', 'confirmation.accept', 'confirmation.reject', 'outline.save', 'recover', 'already-applied', 'sourceHash changed']) {
  if (!coordinator.includes(token)) fail(`Host apply/recovery invariant missing ${token}`);
}
for (const token of ['longDraftProposeApplyInvocation', 'longDraftAcceptInvocation', 'longDraftRejectInvocation', 'longDraftRecoverInvocation']) {
  if (!remote.includes(token)) fail(`I120 Remote contract missing ${token}`);
}
if (!composition.includes("ctx.provide('novelLongDraft'")) fail('composition root does not bind the single long-draft owner');
for (const token of ['data-novel-long-draft-guide', 'I11 Gate', 'C5', 'checkpoint']) {
  if (!client.includes(token)) fail(`Client guidance missing ${token}`);
}

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const descriptorIds = lock.descriptorIds.filter((id) => id.includes('/novelLongDraft/'));
const resultIds = lock.resultSchemaIds.filter((id) => id.includes('/novelLongDraft/'));
if (descriptorIds.length !== 9 || resultIds.length !== 9) fail('I119 + I120 long-draft descriptor/result lock is incomplete');
if (!descriptorIds.slice(-4).every((id) => /\/(proposeApply|accept|reject|recover)$/.test(id))) fail('I120 descriptor suffix drifted');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/long-draft-workflow-coordinator.test.ts',
  'src/client-i120-long-draft.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I120 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I120',
  requirement: 'R18-6b',
  guarantees: [
    'empty-project-preflight-before-Gate-proposal-and-apply',
    'strict-I11-payload-binds-candidate-project-and-proposal',
    'sourceHash-stale-accept-fails-with-zero-narrative-write',
    'rejected-and-cancelled-paths-preserve-uninitialized-B5',
    'atomic-outline-write-and-minimal-checkpoint-rename',
    'failed-write-records-recoverable-checkpoint-without-half-outline',
    'accepted-replay-and-reopen-recovery-are-idempotent',
    'Client-guidance-keeps-B5-only-and-C5-boundaries-visible',
    'additive-real-remote-descriptor-and-result-contract-lock',
  ],
  focusedSuites: 'I120 Host apply/recovery and Client guidance tests passed',
  explicitNonGoals: ['non-empty-outline-overwrite', 'C5-import', 'ST-support', 'outline-merge-or-backup-migration', 'chapter-loop'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i120-long-draft-apply.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I120 smoke: empty-only I11 apply, atomic checkpoint/recovery, idempotent replay, and Client guidance passed\n');
