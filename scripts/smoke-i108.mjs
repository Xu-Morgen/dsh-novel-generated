import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

/** I108 R18-11a smoke：不可变 generation baseline 的 schema、Host owner、Remote 与 binder 消费证据。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I108 smoke: ${message}`); };
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const baselineIds = [
  'novel-creation-tool/novelOutlineGenerationBaseline/create',
  'novel-creation-tool/novelOutlineGenerationBaseline/read',
  'novel-creation-tool/novelOutlineGenerationBaseline/current',
  'novel-creation-tool/novelOutlineGenerationBaseline/attachGenerated',
];
if (lock.descriptorIds.length !== 130 || lock.resultSchemaIds.length !== 36) fail(`contract counts ${lock.descriptorIds.length}/${lock.resultSchemaIds.length}`);
if (JSON.stringify(lock.descriptorIds.slice(-4)) !== JSON.stringify(baselineIds)) fail('baseline descriptors are not the final additive four');
if (JSON.stringify(lock.resultSchemaIds.slice(-4)) !== JSON.stringify(baselineIds)) fail('baseline result schemas are not the final additive four');
for (const id of baselineIds) {
  if (lock.descriptors[id] === undefined || lock.resultSchemas[id] === undefined) fail(`missing locked baseline body: ${id}`);
}
const preservedDescriptors = Object.fromEntries(lock.descriptorIds.slice(0, 126).map((id) => [id, lock.descriptors[id]]));
const preservedResults = Object.fromEntries(lock.resultSchemaIds.slice(0, 32).map((id) => [id, lock.resultSchemas[id]]));
if (sha256(JSON.stringify(preservedDescriptors)) !== '6be170c2773f0f6f702da052db29189d5692a635d2bbcca6a1af579eb91ac8f2') fail('I103-I107 descriptor bodies drifted');
if (sha256(JSON.stringify(preservedResults)) !== '873089fc753fcadee859b0addd9f60f0728749e7cda7006086623db2d0f93777') fail('I103-I107 result bodies drifted');

const schema = read('src/core/schema/outline-generation-baseline.ts');
for (const token of [
  'outlineGenerationBaselineSchema', 'outlineGenerationBaselineEventSchema', 'outlineGenerationBaselineCreateInputSchema',
  'OUTLINE_GENERATION_BASELINE_AUTHORING_BASE_LIMIT', 'OUTLINE_GENERATION_BASELINE_CANDIDATE_LIMIT',
  "'create', 'attach-generated', 'finalize', 'supersede'", 'superRefine',
]) if (!schema.includes(token)) fail(`baseline schema contract missing ${token}`);

const repository = read('src/host/outline-generation-baseline-repository.ts');
for (const token of ['OUTLINE_GENERATION_BASELINE_EVENTS_FILE', 'appendFile', 'replay', 'replaceCurrentBaselineId', 'structuredClone']) {
  if (!repository.includes(token)) fail(`append-only repository behavior missing ${token}`);
}
const service = read('src/host/outline-generation-baseline-service.ts');
for (const token of ['captureOnce', 'textContentHash', 'repository.create', 'assertFresh', "status: 'stale'", 'owners changed during capture']) {
  if (!service.includes(token)) fail(`freshness/service behavior missing ${token}`);
}
if (service.includes('outline.save(') || service.includes('text.replaceRange(')) fail('baseline service writes B5/C5 instead of recording evidence');
const remote = read('src/host/remote/outline-generation-baseline.ts');
for (const method of ['create', 'read', 'current', 'attachGenerated']) if (!remote.includes(`baselineInvocation('${method}'`)) fail(`Remote method missing ${method}`);
const composition = read('src/host/composition/base.ts');
if (!composition.includes("novelOutlineGenerationBaseline") || !composition.includes('createOutlineGenerationBaselineRemote')) fail('Host composition missing baseline receiver');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/outline-generation-baseline-repository.test.ts',
  'src/host/outline-generation-baseline-service.test.ts',
  'src/host/outline-generation-baseline-adapter.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 5000)}`);

const artifact = {
  iteration: 'I108', requirement: 'R18-11a',
  remoteMethods: { novelOutlineGenerationBaseline: ['create', 'read', 'current', 'attachGenerated'] },
  eventKinds: ['create', 'attach-generated', 'finalize', 'supersede'],
  ownerEvidence: ['project/chapter/scene/detailBeat', 'b5ContentFingerprint', 'bindingFingerprint', 'sceneCard', 'authoringBaseHash'],
  guarantees: ['restart-replay', 'idempotent-create', 'idempotent-attach', 'bounded-authoring-evidence', 'live-freshness', 'stale-without-write', 'target-and-binding-fail-closed', 'fake-candidate-consumer', 'real-dsh-binder'],
  contractLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length, preservedPrefix: { descriptorCount: 126, resultSchemaCount: 32, descriptorBodiesSha256: sha256(JSON.stringify(preservedDescriptors)), resultBodiesSha256: sha256(JSON.stringify(preservedResults)) } },
  explicitNonGoals: ['B5/C5-writeback', 'portable-layer-export', 'body-diff-analysis', 'outline-version-tree', 'author-edit-lock'],
  focusedSuites: 'passed',
};
const artifactPath = resolve(repoRoot, 'artifacts/i108-outline-generation-baseline.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log(`I108 smoke: ${lock.descriptorIds.length} descriptors / ${lock.resultSchemaIds.length} result schemas; baseline repository, freshness, fake candidate, Host adapter and real binder fixtures passed`);
