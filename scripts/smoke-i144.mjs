import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I144 smoke: ${message}`); };
const review = read('src/client/import-interpretation-review.ts');
const presenter = read('src/client/presenter.ts');
const registry = read('src/client/mount-registry.ts');
const store = read('src/client/store/index.ts');
const packageJson = JSON.parse(read('package.json'));
const oldLock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));

for (const token of ['sourceInterpretationReview', 'IMPORT_SOURCE_ROLE_OPTIONS', 'IMPORT_TREATMENT_OPTIONS', 'canConfirmImportIntent', 'paragraphsFromHostChunks', 'Stage 21']) {
  if (!review.includes(token)) fail(`review UI contract missing ${token}`);
}
for (const token of ['importInterpretationReview', 'beginImportInterpretation', 'confirmImportInterpretation', 'data-novel-import-interpretation-start']) {
  if (!presenter.includes(token) && !store.includes(token)) fail(`workflow integration missing ${token}`);
}
for (const token of ['remote.novelImportInterpretation', 'remote.novelImportInterpretationAnalysis']) {
  if (!registry.includes(token)) fail(`Client Remote registry missing ${token}`);
}
if (review.includes('preserve-prose') || presenter.includes('preserve-prose')) fail('Stage 21 treatment leaked into I144');
if (oldLock.descriptorIds.length !== 181 || oldLock.resultSchemaIds.length !== 87) fail('Stage 18 Remote lock changed');
if (packageJson.scripts['verify:i144'] === undefined) fail('verify:i144 script missing');
const result = spawnCaptured('corepack', ['pnpm', 'exec', 'vitest', 'run', 'src/client/import-interpretation-review.test.ts'], { cwd: repoRoot });
if (result.status !== 0) fail(`Client review fixture failed (exit ${result.status}):\n${result.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I144', requirement: 'R19-2b',
  guarantees: [
    'same-onboarding-import-step-no-new-route',
    'five-source-roles-and-two-stage19-treatments-reachable',
    'model-suggestion-is-separate-from-explicit-author-confirmation',
    'low-confidence-never-advances-automatically',
    'limited-pov-requires-a-protagonist-and-paragraphs-must-be-resolved',
    'existing-prose-exposes-stage21-fidelity-boundary-without-preserve-prose',
    'host-owned-paragraph-ranges-only',
    'hidden-review-is-render-free-and-dispose-clears-poll-timer',
  ],
  focusedSuites: ['src/client/import-interpretation-review.test.ts', 'src/client/remote-binder.test.ts'],
  explicitNonGoals: ['new-route', 'upload-controller-duplication', 'long-draft-controller-duplication', 'b5-generation', 'c3-generation', 'c4-generation', 'c5-write'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i144-import-intent-review.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I144 smoke: source intent review, dual gating, accessibility anchors, and Stage 21 boundary passed\n');
