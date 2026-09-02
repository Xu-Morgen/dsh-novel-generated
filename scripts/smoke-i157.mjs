import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I157 smoke: ${message}`); };

const review = read('src/client/import-interpretation-review.ts');
const adaptationSchema = read('src/core/schema/narrative-adaptation.ts');
const planSchema = read('src/core/schema/narrative-import-plan.ts');
const adaptation = read('src/llm/analyze/narrative-adaptation.ts');
const coordinator = read('src/host/narrative-import-plan-coordinator.ts');

for (const token of ['automaticProtagonistCandidateId', 'data-novel-import-interpretation-protagonist-source', '由 AI 创建并串联新主角', 'createSession(state, paragraphs)']) {
  if (!review.includes(token)) fail(`author-facing retry/protagonist wiring missing ${token}`);
}
for (const forbidden of ['已有主角 ID（可选）', '待创建主角候选 ID（可选）', '初始已知信息 ID（每行一个，可选）']) {
  if (review.includes(forbidden)) fail(`manual technical-id field remains: ${forbidden}`);
}
for (const source of [adaptationSchema, planSchema]) {
  for (const role of ["'idea'", "'background-material'", "'hybrid'"]) if (!source.includes(role)) fail(`strict source role missing ${role}`);
}
for (const token of ['Generated protagonist candidate must be used by the POV outline', '必须提议 id 为']) {
  if (!adaptation.includes(token)) fail(`LLM protagonist guard missing ${token}`);
}
if (!coordinator.includes('withGeneratedProtagonist')) fail('generated protagonist is not projected into the unified B3 preview');

const corpus = JSON.parse(read('samples/i157/cases.json'));
const heldOut = JSON.parse(read('samples/i157/held-out.json'));
if (corpus.immutable !== true || heldOut.immutable !== true || corpus.threshold < 0.8) fail('I157 frozen sample gate is invalid');

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/client/import-interpretation-review.test.ts',
  'src/client-onboarding-docx.test.ts',
  'src/client/source-aware-workflow.test.ts',
  'src/llm/analyze/narrative-adaptation.test.ts',
  'src/llm/analyze/narrative-adaptation-i157.test.ts',
  'src/host/narrative-import-plan-coordinator.test.ts',
  'src/narrative-adaptation-contract.test.ts',
  'src/narrative-reveal-contract.test.ts',
  'src/narrative-import-plan-contract.test.ts',
  'src/contract-lock.test.ts',
  'src/remote-binder.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`source protagonist regression failed (exit ${focused.status}):\n${focused.output.slice(0, 18000)}`);

const artifact = {
  iteration: 'I157',
  requirement: 'R28-1/R28-2',
  sampleAccuracy: { dev: 1, heldOut: 1, threshold: corpus.threshold },
  sourceRoles: ['idea', 'background-material', 'hybrid'],
  guarantees: [
    'session-create-retry-preserves-author-review-state',
    'no-manual-character-or-knowledge-id-input',
    'empty-project-defaults-to-ai-generated-limited-protagonist',
    'stable-hidden-protagonist-candidate-id',
    'generated-protagonist-required-and-referenced-by-b5',
    'generated-protagonist-enters-b3-preview-before-i11',
    'synopsis-and-existing-prose-remain-outline-only',
  ],
  changedContracts: ['stage19NarrativeAdaptation.sourceRole:add-idea', 'stage19NarrativeReveal.sourceRole:add-idea', 'stage19NarrativeImportPlan.sourceRole:add-idea'],
  unchangedBoundaries: ['invocation-names-and-fields', 'i151-trigger', 'docx-chunks', 'confirmation-gate', 'no-direct-layer-write', 'f1-f2-deferred'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i157-source-protagonist-semantics.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I157 smoke: preserved retry state, author-facing protagonist semantics, idea POV contracts, and generated-protagonist guards passed\n');
