import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I119 smoke: ${message}`); };

const schema = read('src/core/schema/long-draft.ts');
const parser = read('src/llm/analyze/long-draft-outline.ts');
const coordinator = read('src/host/long-draft-workflow-coordinator.ts');
const remote = read('src/host/remote/long-draft.ts');
const composition = read('src/host/composition/management.ts');
for (const token of ['longDraftOutlineInputSchema', 'longDraftOutlineAgentOutputSchema', 'longDraftOutlineCandidateSchema', 'longDraftOutlineProvenanceSchema', 'longDraftReadinessSchema']) {
  if (!schema.includes(token)) fail(`strict schema missing ${token}`);
}
for (const token of ['parseLongDraftOutlineOutput', 'assertLongDraftOutlineOutput', 'sourceChunkIndices', '不能返回 I38 的 candidates 数组']) {
  if (!parser.includes(token)) fail(`outline-only parser boundary missing ${token}`);
}
for (const token of ['createLongDraftWorkflowCoordinator', 'preflight', 'LONG_DRAFT_CHUNK_SIZE', 'longDraftOutlineCandidateSchema', 'never owns B5/B2/C-layer writes']) {
  if (!coordinator.includes(token)) fail(`Host coordinator invariant missing ${token}`);
}
for (const token of ['longDraftPreflightInvocation', 'longDraftBeginInvocation', 'longDraftStatusInvocation', 'longDraftCancelInvocation', 'longDraftResultInvocation']) {
  if (!remote.includes(token)) fail(`Remote contract missing ${token}`);
}
if (!composition.includes("ctx.provide('novelLongDraft'")) fail('composition root does not bind novelLongDraft');
if (coordinator.indexOf('const readiness = await preflight') > coordinator.indexOf('const output = await classifyLongDraftOutline')) fail('LLM call is not after readiness preflight');

const corpus = JSON.parse(read('samples/i119/cases.json'));
const dev = JSON.parse(read('samples/i119/dev.json'));
const heldOut = JSON.parse(read('samples/i119/held-out.json'));
const gold = JSON.parse(read('samples/i119/gold.json'));
if (!corpus.immutable || !dev.immutable || !heldOut.immutable || !gold.immutable) fail('frozen sample manifests are not immutable');
if (corpus.cases.length !== 12 || dev.caseIds.length !== 8 || heldOut.caseIds.length !== 4) fail('sample split cardinality drifted');
if (JSON.stringify([...dev.caseIds, ...heldOut.caseIds]) !== JSON.stringify(gold.caseIds)) fail('gold manifest does not cover dev + held-out cases');
if (corpus.threshold < 0.8) fail('sample threshold below 80%');

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const descriptorIds = lock.descriptorIds.filter((id) => id.includes('/novelLongDraft/'));
const resultIds = lock.resultSchemaIds.filter((id) => id.includes('/novelLongDraft/'));
if (descriptorIds.length !== 5 || resultIds.length !== 5) fail('I119 descriptor/result contract lock is incomplete');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/llm/analyze/long-draft-outline.test.ts',
  'src/host/long-draft-workflow-coordinator.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I119 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I119',
  requirement: 'R18-6a',
  samples: { corpus: 'samples/i119/cases.json', dev: 'samples/i119/dev.json', heldOut: 'samples/i119/held-out.json', gold: 'samples/i119/gold.json', threshold: corpus.threshold, total: corpus.cases.length, heldOut: heldOut.caseIds.length },
  guarantees: [
    'empty-project-readiness-preflight-before-llm',
    'non-empty-project-fail-closed-with-zero-llm-call',
    'deterministic-normalize-and-ordered-chunking',
    'strict-outline-only-candidate-with-source-provenance',
    'i38-worldview-and-standalone-detail-beat-envelope-rejected',
    'cancelled-and-model-failed-candidate-zero-write',
    'begin-status-cancel-result-lifecycle',
    'additive-real-remote-descriptor-and-result-contract-lock',
  ],
  focusedSuites: 'I119 parser and Host coordinator tests passed',
  explicitNonGoals: ['outline-apply', 'confirmation-gate', 'worldview-writeback', 'standalone-detail-beat-candidates', 'chapter-loop'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i119-long-draft-outline-samples.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I119 smoke: empty preflight, ordered outline-only candidate, cancellation boundary and Remote contract lock passed\n');
