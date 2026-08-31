import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I123 smoke: ${message}`); };

const corpus = JSON.parse(read('samples/i123/cases.json'));
const dev = JSON.parse(read('samples/i123/dev.json'));
const heldOut = JSON.parse(read('samples/i123/held-out.json'));
const gold = JSON.parse(read('samples/i123/gold.json'));
if (!corpus.immutable || !dev.immutable || !heldOut.immutable || !gold.immutable) fail('frozen sample manifests are not immutable');
if (corpus.cases.length !== 12 || dev.caseIds.length !== 9 || heldOut.caseIds.length !== 3) fail('sample split cardinality drifted');
if (JSON.stringify([...dev.caseIds, ...heldOut.caseIds]) !== JSON.stringify(gold.caseIds)) fail('gold manifest does not cover dev + held-out cases');
if (corpus.threshold < 0.8 || JSON.stringify(corpus.modes) !== JSON.stringify(['language', 'condense', 'expand'])) fail('mode threshold or mode list is invalid');
for (const mode of corpus.modes) {
  const count = corpus.cases.filter((sample) => sample.mode === mode).length;
  const heldOutCount = heldOut.caseIds.filter((id) => corpus.cases.find((sample) => sample.id === id)?.mode === mode).length;
  if (count !== 4 || heldOutCount !== 1) fail(`${mode} sample/held-out boundary is incomplete`);
}

const prompt = read('src/write/polish.ts');
const candidate = read('src/host/candidate-service.ts');
const chapters = read('src/client/layers/chapters.ts');
for (const token of ['POLISH_MODE_PRESETS', 'buildPolishPrompt', '语言润色', '压缩精简', '扩写细节']) {
  if (!prompt.includes(token)) fail(`prompt preset owner missing ${token}`);
}
if (!candidate.includes('buildPolishPrompt')) fail('shared rewrite pipeline does not consume polish preset owner');
for (const token of ["'language', 'condense', 'expand'", 'data-novel-polish-start', 'data-novel-polish-restart']) {
  if (!chapters.includes(token)) fail(`Client mode UI missing ${token}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/write/polish.test.ts',
  'src/host/candidate-service.test.ts',
  'src/host/writing-adjudication-service.test.ts',
  'src/client-i122-polish.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I123 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I123',
  requirement: 'R18-4b',
  samples: {
    corpus: 'samples/i123/cases.json', dev: 'samples/i123/dev.json', heldOut: 'samples/i123/held-out.json', gold: 'samples/i123/gold.json',
    threshold: corpus.threshold, total: corpus.cases.length, heldOut: heldOut.caseIds.length, perMode: { language: 4, condense: 4, expand: 4 },
  },
  guarantees: [
    'three-mode-frozen-dev-heldout-gold-corpus',
    'shared-parameterized-rewrite-pipeline-with-single-prompt-owner',
    'language-condense-expand-intent-presets-are-distinct',
    'Client-start-current-scene-next-stop-restart-mode-controls',
    'illegal-output-cancellation-model-failure-and-hard-violation-stay-zero-write',
    'accepted-scene-reuses-existing-validation-preview-landing-idempotency',
  ],
  focusedSuites: 'I123 sample/preset, Host rewrite, adjudication, and Client session suites passed',
  explicitNonGoals: ['free-text-chapter-splitting', 'full-book-polish', 'auto-accept', 'three-independent-pipelines'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i123-polish-heldout.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I123 smoke: frozen per-mode held-out samples, shared polish presets, Client controls, and zero-write failure boundaries passed\n');
