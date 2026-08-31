import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

/** I110 R18-2b smoke：候选五层 projection、冻结 plan 重放、strict Remote 与 Client 消费证据。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I110 smoke: ${message}`); };

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const previewId = 'novel-creation-tool/novelWriting/previewLayers';
if (lock.descriptorIds.length !== 131 || lock.resultSchemaIds.length !== 37) {
  fail(`contract counts ${lock.descriptorIds.length}/${lock.resultSchemaIds.length}`);
}
if (lock.descriptorIds.at(-1) !== previewId || lock.resultSchemaIds.at(-1) !== previewId) {
  fail('previewLayers is not the final additive descriptor/result');
}
if (lock.descriptors[previewId]?.result?.mode !== 'strict' || lock.resultSchemas[previewId] === undefined) {
  fail('previewLayers does not have a strict locked result schema');
}

const service = read('src/host/writing-adjudication-service.ts');
for (const token of ['previewLayers(candidateId', 'saga.prepareStructuralPreviewPlan', 'entry.structuralPreviewPlan = plan']) {
  if (!service.includes(token)) fail(`Host candidate-plan seam missing ${token}`);
}
const landing = read('src/host/writing-adjudication/landing-saga.ts');
for (const token of ['assertStructuralPreviewPlanFresh', 'entry.structuralPreviewPlan.parserOutputs', 'consumeStructuralPreviewPlan']) {
  if (!landing.includes(token)) fail(`accept replay/freshness seam missing ${token}`);
}
const remote = read('src/host/remote/writing.ts');
for (const token of ['writingPreviewLayersInvocation', 'writingLayerPreviewSchema', 'strictCodec', "writingInvocation('previewLayers'"]) {
  if (!remote.includes(token)) fail(`strict previewLayers Remote contract missing ${token}`);
}
for (const forbidden of ['StructuralPreviewPlan', 'parserOutputs', 'prose']) {
  if (remote.includes(forbidden)) fail(`Remote result leaks Host-only ${forbidden}`);
}
const client = read('src/client/layers/candidate.ts');
for (const token of ['data-novel-candidate-layer-preview', 'data-novel-candidate-layer-change', 'CandidateLayerPreviewShape']) {
  if (!client.includes(token)) fail(`Client candidate projection consumer missing ${token}`);
}
const operation = read('src/client/ops/chapters-candidate.ts');
if (!operation.includes('target.previewLayers(candidateId)')) fail('candidate mode does not consume previewLayers');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/writing-adjudication-service.test.ts',
  'src/host/writing-adjudication/structural-preview-plan.test.ts',
  'src/remote-binder.test.ts',
  'src/client-chapters.test.ts',
  'src/contract-lock.test.ts',
  'src/llm/parse/state.test.ts',
  'src/llm/parse/relationship.test.ts',
  'src/llm/parse/knowledge.test.ts',
  'src/llm/parse/canon.test.ts',
  'src/llm/parse/worldview.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`I110 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 6000)}`);

const artifact = {
  iteration: 'I110',
  requirement: 'R18-2b',
  remoteMethod: 'novelWriting.previewLayers',
  previewShape: ['candidateId', 'sourceHash', 'generationBaseline', 'changes', 'validation'],
  layers: ['c2', 'c1', 'c3', 'c4', 'b2'],
  guarantees: [
    'legacy-preview-compatible',
    'strict-hash-only-layer-projection',
    'candidate-host-only-plan-cache',
    'accept-replays-frozen-parser-outputs-without-llm',
    'reject-hard-violation-zero-write',
    'stale-structural-owner-zero-write',
    'idempotent-accept',
    'real-binder-and-client-consumer-fixtures',
  ],
  explicitNonGoals: ['localized-reparse', 'plan-persistence', 'full-live-layer-snapshot', 'prompt-or-parser-schema-change'],
  contractLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length, additiveSuffix: previewId },
  focusedSuites: 'Host service, StructuralPreviewPlan, real binder, Client candidate, contract lock, and parser held-out suites passed',
};
const artifactPath = resolve(repoRoot, 'artifacts/i110-candidate-layer-preview.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log('I110 smoke: strict five-layer candidate preview, frozen accept replay, stale/reject zero-write, binder and Client fixtures passed');
