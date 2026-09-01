import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I147 smoke: ${message}`); };
const schema = read('src/core/schema/narrative-visibility.ts');
const projector = read('src/core/narrative/public-at-start.ts');
const tests = read('src/core/narrative/public-at-start.test.ts');
const packageJson = JSON.parse(read('package.json'));
const oldLock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));

for (const token of ['narrativeVisibilitySchema', 'publicAtStartEvidenceSchema', 'publicAtStartCanonCandidateSchema', 'povContextSchema']) {
  if (!schema.includes(token)) fail(`visibility schema missing ${token}`);
}
for (const token of ['projectPublicAtStart', 'buildSafePovContext', 'detectPovContextLeaks', 'assertPovContextNoLeak']) {
  if (!projector.includes(token)) fail(`deterministic visibility projector missing ${token}`);
}
for (const token of ['backstage', 'future', 'presentation', 'author-instruction', 'hidden fact leaks']) {
  if (!tests.includes(token)) fail(`negative visibility fixture missing ${token}`);
}
if (projector.includes('collectCandidate') || projector.includes('ctx.llm') || projector.includes('writeFile')) fail('I147 must be deterministic and write-free');
if (packageJson.scripts['verify:i147'] === undefined) fail('verify:i147 script missing');
if (oldLock.descriptorIds.length !== 181 || oldLock.resultSchemaIds.length !== 87) fail('Stage 18 Remote lock changed');
const result = spawnCaptured('corepack', ['pnpm', 'exec', 'vitest', 'run', 'src/core/narrative/public-at-start.test.ts'], { cwd: repoRoot });
if (result.status !== 0) fail(`visibility fixture failed (exit ${result.status}):\n${result.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I147', requirement: 'R19-4b',
  guarantees: [
    'only-explicit-public-at-start-prose-enters-c4',
    'backstage-future-presentation-author-instruction-rejected',
    'unknown-evidence-and-duplicate-events-fail-closed',
    'c3-filtered-by-knowledge-state-before-pov-context',
    'b5-b2-trigger-c4-context-hidden-fact-leak-detector',
    'same-input-projection-is-deterministic',
    'no-new-llm-no-layer-write-no-plan-coordinator',
  ],
  negativeMatrix: ['backstage-evidence', 'future-evidence', 'presentation-evidence', 'author-instruction-evidence', 'world-truth-masquerading-as-prose', 'unknown-evidence', 'hidden-fact-in-b5', 'hidden-fact-in-b2-trigger', 'hidden-fact-in-c4'],
  focusedSuites: ['src/core/narrative/public-at-start.test.ts', 'src/host/knowledge-leak-detection-service.test.ts'],
  explicitNonGoals: ['new-llm-call', 'c3-write', 'c4-write', 'c5-write', 'narrative-import-plan', 'canon-schema-change', 'knowledge-filter-change'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i147-c4-visibility-guard.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I147 smoke: public-at-start C4 projector, deterministic POV context, leak negatives, and no-new-LLM boundary passed\n');
