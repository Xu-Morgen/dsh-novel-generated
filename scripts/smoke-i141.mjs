import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I141 smoke: ${message}`); };
const schema = read('src/core/schema/import-interpretation.ts');
const client = read('src/client/import-intent.ts');
const oldLock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
for (const token of ['importSourceRoleSchema', 'importTreatmentSchema', 'narrativeIntentSchema', 'importSourceBindingSchema', 'fingerprintImportSourceBinding']) {
  if (!schema.includes(token)) fail(`canonical contract missing ${token}`);
}
for (const token of ['IMPORT_SOURCE_ROLES', 'IMPORT_TREATMENTS', 'NARRATIVE_POVS', 'REVEAL_PACINGS']) {
  if (!client.includes(token)) fail(`Client derived projection missing ${token}`);
}
if (schema.includes("'preserve-prose'")) fail('Stage 21 treatment leaked into I141');
if (oldLock.descriptorIds.length !== 181 || oldLock.resultSchemaIds.length !== 87) fail('existing Remote lock changed');
// The repository declares pnpm 11; invoking through Corepack keeps the smoke
// deterministic when a system pnpm 8 binary appears earlier on PATH.
const result = spawnCaptured('corepack', ['pnpm', 'exec', 'vitest', 'run', 'src/core/schema/import-interpretation.test.ts'], { cwd: repoRoot });
if (result.status !== 0) fail(`consumer fixture failed (exit ${result.status}):\n${result.output.slice(0, 10000)}`);
const artifact = {
  iteration: 'I141', requirement: 'R19-1a',
  guarantees: [
    'source-role-and-treatment-are-independent-axes',
    'stage19-only-expand-outline-and-adapt-pov',
    'limited-pov-requires-resolved-character-or-stable-candidate',
    'omniscient-may-omit-a-focal-character',
    'canonical-serialization-and-fingerprint-are-byte-stable',
    'existing-stage18-remote-lock-is-unchanged',
  ],
  negativeMatrix: ['unknown-fields', 'illegal-treatment', 'missing-limited-focal', 'unresolved-candidate', 'treatment-intent-mismatch'],
  focusedSuite: 'src/core/schema/import-interpretation.test.ts',
  remoteLock: { descriptorCount: oldLock.descriptorIds.length, resultSchemaCount: oldLock.resultSchemaIds.length },
  explicitNonGoals: ['llm', 'remote', 'session-persistence', 'ui-rendering', 'project-writes'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i141-import-intent-contract.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I141 smoke: import intent schema, stable fingerprint, negative matrix, and legacy lock passed\n');
