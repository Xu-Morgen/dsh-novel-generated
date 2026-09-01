import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I143 smoke: ${message}`); };
const schema = read('src/core/schema/import-interpretation-analysis.ts');
const llm = read('src/llm/analyze/import-interpretation.ts');
const service = read('src/host/import-interpretation-analysis-service.ts');
const remote = read('src/host/remote/import-interpretation-analysis.ts');
const lock = JSON.parse(read('contracts/stage19/import-interpretation-analysis-remote.json'));
const cases = JSON.parse(read('samples/i143/cases.json'));
const dev = JSON.parse(read('samples/i143/dev.json'));
const heldOut = JSON.parse(read('samples/i143/held-out.json'));
const gold = JSON.parse(read('samples/i143/gold.json'));
const oldLock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));

for (const token of ['sourceParagraphRoleSchema', 'importInterpretationInputSchema', 'sourceInterpretationOutputSchema', 'assertImportInterpretationCoverage']) {
  if (!schema.includes(token)) fail(`canonical schema missing ${token}`);
}
for (const token of ['buildSourceInterpretationPrompt', 'classifySourceInterpretation', '不得输出 treatment、POV', 'offset 始终由 Host']) {
  if (!llm.includes(token)) fail(`LLM source-only contract missing ${token}`);
}
for (const token of ['begin', 'status', 'cancel', 'result', 'onBackgroundError', 'dispose']) {
  if (!service.includes(token) && !remote.includes(token)) fail(`analysis lifecycle missing ${token}`);
}
if (!cases.immutable || !dev.immutable || !heldOut.immutable || !gold.immutable) fail('samples must be immutable');
if (cases.threshold < 0.8 || lock.descriptorIds.length !== 4 || lock.resultSchemaIds.length !== 4) fail('I143 threshold or lock shape is invalid');
if (JSON.stringify([...dev.caseIds, ...heldOut.caseIds]) !== JSON.stringify(gold.caseIds)) fail('dev/held-out split does not cover gold');
if (oldLock.descriptorIds.length !== 181 || oldLock.resultSchemaIds.length !== 87) fail('Stage 18 Remote lock changed');
const result = spawnCaptured('corepack', ['pnpm', 'exec', 'vitest', 'run', 'src/llm/analyze/import-interpretation.test.ts', 'src/host/import-interpretation-analysis-service.test.ts', 'src/import-interpretation-analysis-contract.test.ts'], { cwd: repoRoot });
if (result.status !== 0) fail(`sample/analysis fixture failed (exit ${result.status}):\n${result.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I143', requirement: 'R19-2a',
  guarantees: [
    'five-way-paragraph-source-classification',
    'host-owned-stable-paragraph-ids-and-ranges',
    'overall-source-role-suggestion-with-evidence',
    'dev-and-held-out-fake-backend-regression-at-eighty-percent',
    'unknown-duplicate-missing-paragraph-and-malformed-json-fail-closed',
    'cancel-model-failure-and-dispose-have-zero-writes',
    'no-treatment-pov-offset-or-write-command-from-model',
  ],
  negativeMatrix: ['unknown-paragraph', 'duplicate-paragraph', 'missing-paragraph', 'duplicate-evidence', 'invalid-json', 'model-failure', 'cancelled', 'over-limit'],
  sampleCounts: { total: cases.cases.length, dev: dev.caseIds.length, heldOut: heldOut.caseIds.length, threshold: cases.threshold },
  focusedSuites: ['src/llm/analyze/import-interpretation.test.ts', 'src/host/import-interpretation-analysis-service.test.ts', 'src/import-interpretation-analysis-contract.test.ts', 'src/remote-binder.test.ts'],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  explicitNonGoals: ['treatment-selection', 'pov-selection', 'model-owned-offsets', 'layer-generation', 'ui-review', 'intent-confirmation'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i143-source-interpretation-samples.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I143 smoke: frozen source samples, coverage guard, zero-write analysis lifecycle, and lock passed\n');
