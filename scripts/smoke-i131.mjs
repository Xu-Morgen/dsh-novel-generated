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
const fail = (message) => { throw new Error(`I131 smoke: ${message}`); };

const schema = read('src/core/schema/branch-aggregate.ts');
const repository = read('src/core/text/repository.ts');
const service = read('src/host/branch-service.ts');
const remote = read('src/host/remote/branch.ts');
const orchestration = read('src/host/composition/orchestration.ts');
const panel = read('src/client/layers/branch.ts');
const chapters = read('src/client/layers/chapters.ts');
const ops = read('src/client/ops/chapters-branch.ts');
const modeOps = read('src/client/ops/chapters.ts');
const clientTests = read('src/client-chapters.test.ts');
const binderTests = read('src/remote-binder.test.ts');
const lock = readJson('contracts/stage18/remote-descriptors.json');

for (const token of ['branchSourceHashSchema', 'BranchAggregate', 'implicit-single', 'branched']) {
  if (!schema.includes(token)) fail(`aggregate freshness schema missing ${token}`);
}
for (const token of ['chooseSceneBranchFresh', 'Stale branch source', 'expectedSourceHash']) {
  if (!repository.includes(token)) fail(`repository freshness guard missing ${token}`);
}
if (!service.includes('chooseFresh') || !service.includes('branchSourceHashSchema.parse')) fail('Host chooseFresh adapter missing');
for (const token of ['branchChooseFreshInvocation', 'sourceHash', 'novelBranches:chooseFresh']) {
  if (!remote.includes(token)) fail(`chooseFresh Remote contract missing ${token}`);
}
if (!orchestration.includes("method: 'chooseFresh'")) fail('chooseFresh orchestration adapter missing');
for (const token of ['versionsPanel', 'data-novel-version-tree', 'data-novel-version-diff', 'data-novel-version-choose']) {
  if (!panel.includes(token)) fail(`versions tree consumer missing ${token}`);
}
for (const token of ['versionsLoad', 'target.aggregate(projectId)', 'target.chooseFresh', 'versionSelection']) {
  if (!ops.includes(token)) fail(`versions ops missing ${token}`);
}
if (!modeOps.includes('branches.aggregate.status') || !chapters.includes('versionsPanel')) fail('versions mode activation missing');
if (!clientTests.includes('一次聚合树、按需 diff、fresh 切换重载当前场景')) fail('Client I131 consumer fixture missing');
if (!binderTests.includes('novelBranches.chooseFresh')) fail('binder I131 fixture missing');

if (lock.descriptorIds.length !== 161 || lock.resultSchemaIds.length !== 67) fail('Stage 18 lock counts drifted');
if (lock.descriptorIds.at(-3) !== 'novel-creation-tool/novelBranches/aggregate') fail('aggregate descriptor moved from additive position');
if (lock.descriptorIds.at(-2) !== 'novel-creation-tool/novelBranches/chooseFresh') fail('chooseFresh descriptor is not additive at the lock tail');
if (lock.resultSchemaIds.at(-3) !== 'novel-creation-tool/novelBranches/aggregate') fail('aggregate result moved from additive position');
if (lock.resultSchemaIds.at(-2) !== 'novel-creation-tool/novelBranches/chooseFresh') fail('chooseFresh result is not additive at the lock tail');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/core/text/branch.test.ts',
  'src/host/branch-service.test.ts',
  'src/client-chapters.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I131',
  requirement: 'R18-10b',
  guarantees: [
    'versions-mode-consumes-one-host-aggregate-and-does-not-rebuild-via-n-plus-one-list-calls',
    'aggregate-tree-preserves-chapter-scene-order-and-explicit-implicit-single-mode',
    'diff-is-requested-on-demand-without-prose-in-the-aggregate-tree',
    'chooseFresh-carries-the-chosen-source-hash-and-rejects-stale-or-cross-project-targets',
    'successful-current-scene-switch-reloads-editor-and-preserves-the-selected-focus',
    'legacy-four-parameter-choose-and-local-branch-panel-remain-compatible',
    'real-repository-client-binder-and-client-consumer-regressions-pass',
  ],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  focusedSuites: 'I131 repository, Host service, Client tree, real DSH binder, and contract-lock suites passed',
  explicitNonGoals: ['full-book-revision-timeline', 'batch-switch', 'implicit-save', 'new-confirmation-gate', 'c5-schema-change'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i131-branch-tree-client.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I131 smoke: aggregate versions tree, on-demand diff, freshness-safe switch, editor reload, binder, and lock passed\n');
