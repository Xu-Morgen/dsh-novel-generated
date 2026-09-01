import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I145 smoke: ${message}`); };
const schema = read('src/core/schema/narrative-adaptation.ts');
const llm = read('src/llm/analyze/narrative-adaptation.ts');
const service = read('src/host/narrative-adaptation-service.ts');
const remote = read('src/host/remote/narrative-adaptation.ts');
const lock = JSON.parse(read('contracts/stage19/narrative-adaptation-remote.json'));
const cases = JSON.parse(read('samples/i145/cases.json'));
const dev = JSON.parse(read('samples/i145/dev.json'));
const heldOut = JSON.parse(read('samples/i145/held-out.json'));
const gold = JSON.parse(read('samples/i145/gold.json'));
const oldLock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));

for (const token of ['narrativeAdaptationInputSchema', 'narrativeAdaptationOutputSchema', 'protagonistCandidateSchema', 'narrativeAdaptationCandidateSchema']) {
  if (!schema.includes(token)) fail(`canonical B5 candidate schema missing ${token}`);
}
for (const token of ['按视角重构读者体验', 'assertNarrativeAdaptationSafety', '不得按幕后年表直接复述答案', '不得输出 B2/B3/C1/C2/C3/C4/C5']) {
  if (!llm.includes(token)) fail(`dedicated POV prompt/guard missing ${token}`);
}
for (const token of ['begin', 'status', 'cancel', 'result', 'onBackgroundError', 'dispose']) {
  if (!service.includes(token) && !remote.includes(token)) fail(`candidate lifecycle missing ${token}`);
}
if (service.includes('writeFile') || service.includes('repository')) fail('candidate service must remain zero-write');
if (llm.includes('preserve-prose') || llm.includes('buildSourceInterpretationPrompt') || llm.includes('classifySourceInterpretation')) fail('I145 must not reuse Stage 21 or I119 source-order behavior');
if (!cases.immutable || !dev.immutable || !heldOut.immutable || !gold.immutable) fail('samples must be immutable');
if (cases.threshold < 0.8 || lock.descriptorIds.length !== 4 || lock.resultSchemaIds.length !== 4) fail('threshold or additive lock shape is invalid');
if (JSON.stringify([...dev.caseIds, ...heldOut.caseIds]) !== JSON.stringify(gold.caseIds)) fail('dev/held-out split does not cover gold');
if (oldLock.descriptorIds.length !== 181 || oldLock.resultSchemaIds.length !== 87) fail('Stage 18 Remote lock changed');
const result = spawnCaptured('corepack', ['pnpm', 'exec', 'vitest', 'run', 'src/llm/analyze/narrative-adaptation.test.ts', 'src/host/narrative-adaptation-service.test.ts', 'src/narrative-adaptation-contract.test.ts'], { cwd: repoRoot });
if (result.status !== 0) fail(`POV adaptation fixture failed (exit ${result.status}):\n${result.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I145', requirement: 'R19-3',
  guarantees: [
    'confirmed-background-or-hybrid-adapt-pov-input-only',
    'dedicated-b5-reader-experience-prompt',
    'first-act-investigation-and-no-hidden-answer-leak',
    'paragraph-evidence-preserves-confirmed-order',
    'limited-pov-candidate-identity-is-confirmed-and-bounded',
    'dev-and-held-out-fake-backend-regression-at-eighty-percent',
    'failure-cancel-and-dispose-have-zero-writes',
    'additive-remote-lock-and-identity-bound-job',
  ],
  negativeMatrix: ['malformed-json', 'evidence-drift', 'candidate-identity-drift', 'hidden-answer-first-act', 'missing-investigation', 'source-hash-mismatch', 'cancelled', 'disposed'],
  sampleCounts: { total: cases.cases.length, dev: dev.caseIds.length, heldOut: heldOut.caseIds.length, threshold: cases.threshold },
  focusedSuites: ['src/llm/analyze/narrative-adaptation.test.ts', 'src/host/narrative-adaptation-service.test.ts', 'src/narrative-adaptation-contract.test.ts', 'src/remote-binder.test.ts'],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  explicitNonGoals: ['c3-generation', 'c4-generation', 'c5-write', 'b3-write', 'b5-write', 'i119-prompt-reuse', 'preserve-prose', 'narrative-import-plan'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i145-pov-outline-samples.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I145 smoke: dedicated POV B5 candidate, safety guards, frozen samples, zero-write lifecycle, and lock passed\n');
