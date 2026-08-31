import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I118 smoke: ${message}`); };

const schema = read('src/core/schema/reference-correction.ts');
const parser = read('src/llm/analyze/reference-correction.ts');
const service = read('src/host/reference-correction-service.ts');
const remote = read('src/host/remote/reference-correction.ts');
const client = read('src/client/layers/reference-review.ts') + read('src/client/ops/reference-review.ts');
for (const token of ['referenceCorrectionProposeInputSchema', 'referenceCorrectionGatePayloadSchema', 'referenceCorrectionOperationSchema', 'referenceCorrectionCandidateSchema']) {
  if (!schema.includes(token)) fail(`strict correction schema missing ${token}`);
}
for (const token of ['collectCandidate', 'parseJsonObject', 'assertReferenceCorrectionOutput', '不能输出自由对话']) {
  if (!parser.includes(token)) fail(`LLM candidate boundary missing ${token}`);
}
for (const token of ['createCrossLayerReferenceCoordinator', 'confirmation.accept', 'confirmation.reject', 'reference-correction', 'referenceCorrectionGatePayloadSchema']) {
  if (!service.includes(token)) fail(`Host Gate/coordinator wiring missing ${token}`);
}
for (const token of ['referenceCorrectionInvocations', 'novelReferenceCorrection:propose', 'novelReferenceCorrection:accept', 'novelReferenceCorrection:reject', 'novelReferenceCorrection:pending']) {
  if (!remote.includes(token)) fail(`Remote contract missing ${token}`);
}
for (const token of ['data-novel-reference-correction-propose', 'data-novel-reference-correction-accept', 'data-novel-reference-correction-reject', 'I11']) {
  if (!client.includes(token)) fail(`Client candidate/Gate UI missing ${token}`);
}

const corpus = JSON.parse(read('samples/i118/cases.json'));
const dev = JSON.parse(read('samples/i118/dev.json'));
const heldOut = JSON.parse(read('samples/i118/held-out.json'));
const gold = JSON.parse(read('samples/i118/gold.json'));
if (!corpus.immutable || !dev.immutable || !heldOut.immutable || !gold.immutable) fail('frozen sample manifests are not immutable');
if (corpus.cases.length !== 12 || dev.caseIds.length !== 8 || heldOut.caseIds.length !== 4) fail('sample split cardinality drifted');
if (JSON.stringify([...dev.caseIds, ...heldOut.caseIds]) !== JSON.stringify(gold.caseIds)) fail('gold manifest does not cover dev + held-out cases');

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const correctionDescriptors = lock.descriptorIds.filter((id) => id.includes('/novelReferenceCorrection/'));
if (correctionDescriptors.length !== 4 || lock.resultSchemaIds.filter((id) => id.includes('/novelReferenceCorrection/')).length !== 4) fail('I118 descriptor/result contract lock is incomplete');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/llm/analyze/reference-correction.test.ts',
  'src/host/reference-correction-service.test.ts',
  'src/client-i118-reference-correction.test.ts',
  'src/client-i117-reference-review.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`I118 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I118',
  requirement: 'R18-5d',
  samples: { corpus: 'samples/i118/cases.json', dev: 'samples/i118/dev.json', heldOut: 'samples/i118/held-out.json', gold: 'samples/i118/gold.json', threshold: corpus.threshold, total: corpus.cases.length, heldOut: heldOut.caseIds.length },
  guarantees: [
    'strict-semantic-correction-candidate',
    'fake-backend-canonical-and-held-out-regression',
    'candidate-preview-before-I11-decision',
    'accepted-apply-through-cross-layer-coordinator',
    'rejected-model-failed-cancelled-and-stale-zero-narrative-write',
    'accepted-replay-is-idempotent-and-audited',
    'unknown-IDs-and-illegal-model-output-fail-closed',
    'real-remote-descriptor-and-result-contract-lock',
  ],
  focusedSuites: 'I118 parser/Host/UI plus I117 review regression passed',
  explicitNonGoals: ['background-auto-correction', 'second-confirmation-mechanism', 'free-form-write-command'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i118-reference-correction.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I118 smoke: strict reference correction candidate, I11 Gate apply/reject, audit lineage and contract lock passed\n');
