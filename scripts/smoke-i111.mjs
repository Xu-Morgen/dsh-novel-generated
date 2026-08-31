import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

/** I111 R18-2c smoke：重解析五层 preview、Gate 时序、回放与 post-commit 回扫证据。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I111 smoke: ${message}`); };

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const previewId = 'novel-creation-tool/novelWorkspace/sceneReparsePreview';
const previousPreviewId = 'novel-creation-tool/novelWriting/previewLayers';
if (lock.descriptorIds.length !== 132 || lock.resultSchemaIds.length !== 38) {
  fail(`contract counts ${lock.descriptorIds.length}/${lock.resultSchemaIds.length}`);
}
if (lock.descriptorIds.at(-1) !== previewId || lock.resultSchemaIds.at(-1) !== previewId) {
  fail('sceneReparsePreview is not the final additive descriptor/result');
}
if (lock.descriptorIds.at(-2) !== previousPreviewId || lock.resultSchemaIds.at(-2) !== previousPreviewId) {
  fail('I110 previewLayers is not immediately before the I111 suffix');
}
if (lock.descriptors[previewId]?.result?.mode !== 'strict' || lock.resultSchemas[previewId] === undefined) {
  fail('sceneReparsePreview does not have a strict locked result schema');
}

const editService = read('src/host/text-edit-service.ts');
for (const token of [
  'reparsePreview', 'prepareStructuralPreviewPlan', 'assertStructuralPreviewPlanFresh',
  'consumeStructuralPreviewPlan', 'scanStructuralPreviewCommit', 'structuredApplied',
  'retry accept resumes C5 only', 'Invalid UTF-16 text range',
]) if (!editService.includes(token)) fail(`Host reparse workflow missing ${token}`);
for (const forbidden of ['writeFile(']) {
  if (read('src/host/writing-adjudication/structural-preview-plan.ts').includes(forbidden)) {
    fail(`session plan contains forbidden ${forbidden}`);
  }
}

const remote = read('src/host/remote/text.ts');
for (const token of ['sceneReparsePreviewResultSchema', 'sceneReparsePreviewInvocation', 'reparsePostScanSchema']) {
  if (!remote.includes(token)) fail(`strict reparse preview Remote contract missing ${token}`);
}
for (const forbidden of ['parserOutputs:', 'layerBaselines']) {
  if (remote.includes(forbidden)) fail(`Remote result leaks Host-only ${forbidden}`);
}

const workspace = read('src/host/workspace-service.ts');
if (!workspace.includes('sceneReparsePreview')) fail('workspace adapter missing sceneReparsePreview');
const client = read('src/client/layers/scene-editor.ts');
for (const token of ['data-novel-scene-reparse-preview', 'data-novel-scene-reparse-layer-change', 'ReparseLayerPreviewShape']) {
  if (!client.includes(token)) fail(`Client reparse projection consumer missing ${token}`);
}
const operation = read('src/client/ops/chapters-editor.ts');
for (const token of ['target.sceneReparsePreview', 'r.preview === undefined', 'data-novel-scene-reparse-accept']) {
  if (!operation.includes(token) && !client.includes(token)) fail(`Client reparse Gate/preview flow missing ${token}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/text-edit-service.test.ts',
  'src/host/writing-adjudication/structural-preview-plan.test.ts',
  'src/host/five-layer-writeback.test.ts',
  'src/remote-binder.test.ts',
  'src/client-chapters.test.ts',
  'src/contract-lock.test.ts',
  'src/llm/parse/state.test.ts',
  'src/llm/parse/relationship.test.ts',
  'src/llm/parse/knowledge.test.ts',
  'src/llm/parse/canon.test.ts',
  'src/llm/parse/worldview.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`I111 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 6000)}`);

const artifact = {
  iteration: 'I111',
  requirement: 'R18-2c',
  remoteMethod: 'novelWorkspace.sceneReparsePreview',
  previewShape: ['proposalId', 'range', 'replacement', 'sourceHash', 'targetHash', 'generationBaseline', 'changes', 'postScan'],
  layers: ['c2', 'c1', 'c3', 'c4', 'b2'],
  guarantees: [
    'Gate-pending-frozen-five-layer-preview',
    'UTF-16-range-and-baseHash-freshness',
    'hash-only-change-projection-without-live-layer-leak',
    'host-only-session-plan',
    'accept-replays-frozen-plan-without-parser-rerun',
    'reject-parser-error-stale-and-write-failure-fail-closed',
    'structured-writeback-before-C5-and-C5-only-retry',
    'post-commit-scan-mismatch-is-explicit-error',
    'real-binder-and-client-consumer-fixtures',
  ],
  explicitNonGoals: ['ordinary-C5-save-semantics-unchanged', 'plan-persistence', 'full-live-layer-snapshot', 'prompt-or-parser-schema-change'],
  contractLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length, additiveSuffix: [previousPreviewId, previewId] },
  focusedSuites: 'Host reparse service, StructuralPreviewPlan, five-layer writeback, real binder, Client chapters, contract lock, and parser held-out suites passed',
};
const artifactPath = resolve(repoRoot, 'artifacts/i111-reparse-layer-preview.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
console.log('I111 smoke: Gate-pending reparse preview, frozen replay, C5 landing, freshness and post-scan fixtures passed');
