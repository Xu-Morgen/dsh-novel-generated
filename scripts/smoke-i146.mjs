import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I146 smoke: ${message}`); };
const schema = read('src/core/schema/narrative-reveal.ts');
const llm = read('src/llm/analyze/narrative-reveal.ts');
const service = read('src/host/narrative-reveal-planner-service.ts');
const remote = read('src/host/remote/narrative-reveal.ts');
const lock = JSON.parse(read('contracts/stage19/narrative-reveal-remote.json'));
const cases = JSON.parse(read('samples/i146/cases.json'));
const dev = JSON.parse(read('samples/i146/dev.json'));
const heldOut = JSON.parse(read('samples/i146/held-out.json'));
const gold = JSON.parse(read('samples/i146/gold.json'));
const oldLock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));

for (const token of ['narrativeRevealB5AnchorSchema', 'narrativeRevealInputSchema', 'narrativeRevealEntrySchema', 'narrativeRevealOutputSchema', 'narrativeRevealCandidateSchema']) {
  if (!schema.includes(token)) fail(`canonical C3 reveal schema missing ${token}`);
}
for (const token of ['NARRATIVE_REVEAL_PROMPT_EXAMPLE', 'assertNarrativeRevealSafety', 'revealAt 必须精确引用', 'holders 表示故事起点已知者']) {
  if (!llm.includes(token)) fail(`C3 reveal prompt/guard missing ${token}`);
}
for (const token of ['begin', 'status', 'cancel', 'result', 'onBackgroundError', 'dispose']) {
  if (!service.includes(token) && !remote.includes(token)) fail(`reveal lifecycle missing ${token}`);
}
if (service.includes('writeFile') || service.includes('saveAll') || service.includes('restoreForCompensation')) fail('C3 planner must remain candidate-only');
if (llm.includes('saveAll') || llm.includes('finalApply')) fail('C3 planner must not contain writeback');
if (!cases.immutable || !dev.immutable || !heldOut.immutable || !gold.immutable) fail('samples must be immutable');
if (cases.threshold < 0.8 || lock.descriptorIds.length !== 4 || lock.resultSchemaIds.length !== 4) fail('threshold or additive lock shape is invalid');
if (JSON.stringify([...dev.caseIds, ...heldOut.caseIds]) !== JSON.stringify(gold.caseIds)) fail('dev/held-out split does not cover gold');
if (oldLock.descriptorIds.length !== 181 || oldLock.resultSchemaIds.length !== 87) fail('Stage 18 Remote lock changed');
const result = spawnCaptured('corepack', ['pnpm', 'exec', 'vitest', 'run', 'src/llm/analyze/narrative-reveal.test.ts', 'src/host/narrative-reveal-planner-service.test.ts', 'src/narrative-reveal-contract.test.ts'], { cwd: repoRoot });
if (result.status !== 0) fail(`C3 reveal fixture failed (exit ${result.status}):\n${result.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I146', requirement: 'R19-4a',
  guarantees: [
    'confirmed-i145-b5-anchor-input-only',
    'secret-backstory-foreshadow-plotpoint-candidates',
    'holders-and-knowledge-state-bidirectional-invariant',
    'reveal-to-excludes-current-holders',
    'reveal-at-must-reference-b5-anchor',
    'protagonist-starts-unknown-unless-initial-known',
    'dev-and-held-out-fake-backend-regression-at-eighty-percent',
    'failure-cancel-and-dispose-have-zero-writes',
    'additive-remote-lock-and-identity-bound-job',
  ],
  negativeMatrix: ['malformed-json', 'unknown-entry', 'unknown-b5-anchor', 'holder-state-mismatch', 'reveal-target-holder', 'protagonist-hidden-fact', 'source-hash-mismatch', 'cancelled', 'disposed'],
  sampleCounts: { total: cases.cases.length, dev: dev.caseIds.length, heldOut: heldOut.caseIds.length, threshold: cases.threshold },
  focusedSuites: ['src/llm/analyze/narrative-reveal.test.ts', 'src/host/narrative-reveal-planner-service.test.ts', 'src/narrative-reveal-contract.test.ts', 'src/remote-binder.test.ts'],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  explicitNonGoals: ['c3-apply', 'confirmation-gate', 'c4-generation', 'c5-write', 'b5-regeneration', 'knowledge-repository-mutation', 'narrative-import-plan'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i146-secret-reveal-plan.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I146 smoke: C3 reveal candidates, B5 anchors, holder/knows guard, frozen samples, zero-write lifecycle, and lock passed\n');
