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
const fail = (message) => { throw new Error(`I130 smoke: ${message}`); };

const schema = read('src/core/schema/branch-aggregate.ts');
const service = read('src/host/branch-service.ts');
const remote = read('src/host/remote/branch.ts');
const orchestration = read('src/host/composition/orchestration.ts');
const whitelist = read('src/client-bundle-whitelist.ts');
for (const token of [
  'branchAggregateSchema', 'BRANCH_AGGREGATE_MAX_CHAPTERS',
  'BRANCH_AGGREGATE_MAX_SCENES', 'BRANCH_AGGREGATE_MAX_BRANCHES_PER_SCENE',
  'implicit-single', 'branched', 'Exactly one branch must be chosen',
]) if (!schema.includes(token)) fail(`aggregate schema missing ${token}`);
if (/\bcontent\b/.test(schema)) fail('aggregate schema must not declare or expose a content field');
for (const token of ['aggregate(projectId)', 'get(projectId).listChapters()', 'BRANCH_AGGREGATE_MAX_BYTES', 'branchAggregateSchema.parse']) {
  if (!service.includes(token)) fail(`Host aggregate budget/parse missing ${token}`);
}
for (const token of ['branchAggregateWireSchema', 'branchAggregateInvocation', 'novelBranches:aggregate']) {
  if (!remote.includes(token)) fail(`Remote aggregate contract missing ${token}`);
}
for (const token of ['branchAggregateWireAdapter', "method: 'aggregate'"]) {
  if (!orchestration.includes(token)) fail(`Host aggregate adapter missing ${token}`);
}
if (!whitelist.includes("'src/core/schema/branch-aggregate.ts'")) fail('aggregate schema is not in client core whitelist');

const lock = readJson('contracts/stage18/remote-descriptors.json');
if (lock.descriptorIds.length !== 160 || lock.resultSchemaIds.length !== 66) fail('Stage 18 lock counts drifted');
if (lock.descriptorIds.at(-2) !== 'novel-creation-tool/novelBranches/aggregate') fail('aggregate descriptor is not additive at the lock tail');
if (lock.resultSchemaIds.at(-2) !== 'novel-creation-tool/novelBranches/aggregate') fail('aggregate result schema is not additive at the lock tail');
if (JSON.stringify(lock.resultSchemas['novel-creation-tool/novelBranches/aggregate']).includes('content')) fail('aggregate result lock leaks content');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/branch-service.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I130',
  requirement: 'R18-10a',
  guarantees: [
    'single-host-read-bounded-chapter-scene-branch-metadata-tree',
    'chapter-and-scene-index-order-is-deterministic',
    'implicit-single-and-branched-version-modes-are-explicit',
    'branch-summary-has-no-prose-content',
    'duplicate-or-multiple-chosen-branches-fail-closed',
    'unknown-project-and-budget-overflow-fail-closed',
    'real-repository-and-dsh-client-binder-consumers-pass',
  ],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  focusedSuites: 'I130 Host aggregate, real DSH binder, and contract-lock suites passed',
  explicitNonGoals: ['choose-or-chooseFresh', 'diff', 'c5-schema-change', 'full-book-snapshot', 'client-n-plus-one-aggregation'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i130-branch-aggregate.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I130 smoke: bounded chapter/scene/version aggregate, metadata-only contract, binder, and lock passed\n');
