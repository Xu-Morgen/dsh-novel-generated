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
const fail = (message) => { throw new Error(`I133 smoke: ${message}`); };

const schema = read('src/core/schema/outline-generation-scope.ts');
const service = read('src/host/outline-generation-scope-service.ts');
const remote = read('src/host/remote/outline-generation-scope.ts');
const adapter = read('src/host/outline-generation-scope-adapter.ts');
const composition = read('src/host/composition/base.ts');
const binder = read('src/remote-binder.test.ts');
const consumer = read('src/host/outline-generation-scope-service.test.ts');
const lock = readJson('contracts/stage18/remote-descriptors.json');

for (const token of ['outlineGenerationScopeInputSchema', 'fill-missing-only', 'requires-explicit-regeneration', 'outsideScopeWritable', 'outlineGenerationScopePageSchema']) {
  if (!schema.includes(token)) fail(`scope schema missing ${token}`);
}
for (const token of ['contentFingerprint', 'stale-b5', 'allowedDetailBeatIds', 'OUTLINE_GENERATION_SCOPE_PAGE_MAX_TARGET_BEATS']) {
  if (!service.includes(token)) fail(`Host freshness/binding/page resolver missing ${token}`);
}
for (const token of ['outlineGenerationScopeResolveInvocation', 'novelOutlineGenerationScope:input', 'novelOutlineGenerationScope:result']) {
  if (!remote.includes(token)) fail(`strict scope Remote contract missing ${token}`);
}
if (!adapter.includes('method: \'resolve\'') || !composition.includes('novelOutlineGenerationScope')) fail('Host scope adapter is not composed');
if (!binder.includes('I133 novelOutlineGenerationScope.resolve') || !consumer.includes('bound-chapter')) fail('I133 consumer/binder fixture missing');
if (lock.descriptorIds.length !== 162 || lock.resultSchemaIds.length !== 68) fail('Stage 18 lock counts drifted');
if (lock.descriptorIds.at(-1) !== 'novel-creation-tool/novelOutlineGenerationScope/resolve') fail('scope descriptor is not the additive lock tail');
if (lock.resultSchemaIds.at(-1) !== 'novel-creation-tool/novelOutlineGenerationScope/resolve') fail('scope result is not the additive lock tail');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/core/schema/outline-generation-scope.test.ts',
  'src/host/outline-generation-scope-service.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I133',
  requirement: 'R18-12a',
  guarantees: [
    'act-outline-beat-bound-chapter-and-all-resolve-through-one-host-b5-owner',
    'stable-act-beat-detail-beat-order-and-per-card-fingerprints',
    'bound-chapter-selects-only-scene-outline-bound-detail-beats',
    'b5-freshness-is-rechecked-before-a-generation-consumer-can-proceed',
    'default-mutation-budget-adds-missing-detail-beats-only',
    'large-all-book-projections-are-offset-paged-and-bounded',
    'strict-remote-contract-and-real-client-binder-pass',
  ],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  focusedSuites: 'scope schema, Host resolver, real DSH binder, and contract-lock fixtures passed',
  explicitNonGoals: ['llm-call', 'detail-beat-copy-generation', 'outline-write', 'client-editor'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i133-outline-generation-scope.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I133 smoke: bounded act/beat/chapter/all scope, readiness, freshness, binding, binder, and lock passed\n');
