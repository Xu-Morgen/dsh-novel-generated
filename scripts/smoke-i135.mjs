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
const fail = (message) => { throw new Error(`I135 smoke: ${message}`); };

const schema = read('src/core/schema/finalization.ts');
const mutationSchema = read('src/core/schema/text-mutation.ts');
const textService = read('src/host/text-service.ts');
const service = read('src/host/writing-adjudication-service.ts');
const builder = read('src/host/finalization-plan-builder.ts');
const management = read('src/host/composition/management.ts');
const remote = read('src/host/remote/writing.ts');
const candidatePanel = read('src/client/layers/candidate.ts');
const candidateOps = read('src/client/ops/chapters-candidate.ts');
const binder = read('src/remote-binder.test.ts');
const consumer = read('src/host/finalization-plan-builder.test.ts');
const lock = readJson('contracts/stage18/remote-descriptors.json');

for (const token of ['draftAdoptionResultSchema', 'finalizationPlanSchema', 'generationBaseline', 'degradedReasons', 'forbiddenAutomatic']) {
  if (!schema.includes(token)) fail(`strict finalization schema missing ${token}`);
}
for (const token of ['SceneContentMutation', 'expectedFingerprint']) if (!mutationSchema.includes(token)) fail(`C5 mutation schema missing ${token}`);
if (!textService.includes('replaceSceneContentMutation')) fail('C5 mutation service seam missing replaceSceneContentMutation');
for (const token of ['adoptDraft', 'prepareFinalizationStructuralPreview', 'sourceHash is stale', 'use finalization']) if (!service.includes(token)) fail(`draft adoption owner missing ${token}`);
for (const token of ['createFinalizationPlanBuilder', 'impact.prepare', 'reconciliationProjection', 'application-owned-by-i136']) if (!builder.includes(token)) fail(`FinalizationPlanBuilder missing ${token}`);
for (const token of ['finalizationPlanBuilder', 'prepareFinalizationPlan', 'cancelFinalizationPlan']) if (!management.includes(token)) fail(`composition root missing ${token}`);
for (const token of ['writingAdoptDraftInvocation', 'writingPrepareFinalizationPlanInvocation', 'writingReadFinalizationPlanInvocation', 'writingCancelFinalizationPlanInvocation']) if (!remote.includes(token)) fail(`additive writing Remote missing ${token}`);
for (const token of ['接受为草稿', 'data-novel-candidate-adopt-draft', 'adoptDraftCandidate']) if (!candidatePanel.includes(token) && !candidateOps.includes(token)) fail(`author draft consumer missing ${token}`);
for (const token of ['novelWriting/adoptDraft', 'novelWriting/prepareFinalizationPlan', 'rejected "result"']) if (!binder.includes(token)) fail(`real binder fixture missing ${token}`);
for (const token of ['无 baseline 时显式降级', 'wording-only', 'freshness', '不创建可消费的 session']) if (!consumer.includes(token)) fail(`finalization consumer fixture missing ${token}`);
if (lock.descriptorIds.length !== 175 || lock.resultSchemaIds.length !== 81) fail('Stage 18 lock counts drifted after I135');
if (lock.descriptorIds.at(-1) !== 'novel-creation-tool/novelWriting/cancelFinalizationPlan') fail('I135 descriptor is not the additive lock tail');
if (lock.resultSchemaIds.at(-1) !== 'novel-creation-tool/novelWriting/cancelFinalizationPlan') fail('I135 result is not the additive lock tail');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/finalization-plan-builder.test.ts',
  'src/host/writing-adjudication-service.test.ts',
  'src/host/remote/shared-result-contract.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I135', requirement: 'R18-13a',
  guarantees: [
    'adopt-draft-writes-only-chosen-c5-content-with-project-cas',
    'adoption-is-idempotent-and-stale-source-fails-closed',
    'finalization-plan-reuses-pure-five-layer-preview-and-final-source-hash',
    'no-baseline-is-explicitly-degraded-without-fake-b5-reconciliation',
    'wording-only-uses-existing-impact-owner-without-b5-mutation',
    'finalization-plan-is-bounded-and-excludes-prose-and-live-objects',
    'additive-remote-contract-and-real-client-binder-pass',
  ],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  focusedSuites: 'C5 adoption, FinalizationPlanBuilder, typed adapter, real binder, and contract-lock fixtures passed',
  explicitNonGoals: ['apply-finalization-plan', 'automatic-card-completion', 'automatic-b5-reconciliation', 'remove-legacy-candidate-accept'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i135-finalization-plan.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I135 smoke: C5 draft adoption, finalization plan, freshness gates, binder, and lock passed\n');
