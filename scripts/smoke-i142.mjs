import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I142 smoke: ${message}`); };
const sessionSchema = read('src/core/schema/import-interpretation-session.ts');
const remote = read('src/host/remote/import-interpretation.ts');
const service = read('src/host/import-interpretation-session-service.ts');
const lock = JSON.parse(read('contracts/stage19/import-interpretation-remote.json'));
const oldLock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));

for (const token of ['importInterpretationSessionSchema', 'importInterpretationSessionCreateInputSchema', 'importInterpretationSessionConfirmInputSchema', 'importInterpretationSessionDiscardInputSchema']) {
  if (!sessionSchema.includes(token)) fail(`session schema missing ${token}`);
}
for (const token of ['importInterpretationCreateInvocation', 'importInterpretationReadInvocation', 'importInterpretationConfirmInvocation', 'importInterpretationDiscardInvocation']) {
  if (!remote.includes(token)) fail(`Remote descriptor missing ${token}`);
}
for (const token of ['source hash mismatch', 'status: \'stale\'', 'writeStore', 'dispose']) {
  if (!service.includes(token)) fail(`Host owner missing ${token}`);
}
if (lock.descriptorIds.length !== 4 || lock.resultSchemaIds.length !== 4) fail('I142 lock must contain exactly four descriptor/result entries');
if (oldLock.descriptorIds.length !== 181 || oldLock.resultSchemaIds.length !== 87) fail('Stage 18 Remote lock changed');
const result = spawnCaptured('corepack', ['pnpm', 'exec', 'vitest', 'run', 'src/host/import-interpretation-session-service.test.ts', 'src/import-interpretation-contract.test.ts'], { cwd: repoRoot });
if (result.status !== 0) fail(`session/lock fixture failed (exit ${result.status}):\n${result.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I142', requirement: 'R19-1b',
  guarantees: [
    'project-session-source-hash-binding',
    'restart-recovery-from-host-owned-checkpoint',
    'changed-source-becomes-stale',
    'cross-project-and-forged-hash-commands-fail-closed',
    'dispose-removes-the-service-with-no-background-resource',
    'four-additive-remote-descriptors-have-strict-result-locks',
    'legacy-stage18-remote-lock-is-unchanged',
  ],
  negativeMatrix: ['unknown-fields', 'invalid-intent-combination', 'duplicate-paragraph-id', 'cross-project', 'forged-source-hash', 'malformed-result'],
  focusedSuites: ['src/host/import-interpretation-session-service.test.ts', 'src/import-interpretation-contract.test.ts', 'src/remote-binder.test.ts'],
  checkpointFile: '.import-interpretation-sessions.yaml',
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  explicitNonGoals: ['automatic-classification', 'ui-rendering', 'narrative-import-plan', 'narrative-layer-writes'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i142-import-session-contract.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I142 smoke: recoverable session owner, freshness guard, additive Remote, and lock passed\n');
