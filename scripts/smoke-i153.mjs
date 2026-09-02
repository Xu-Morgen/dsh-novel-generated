import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I153 smoke: ${message}`); };
const controllers = read('src/client/controllers.ts');
const composition = read('src/client.ts');
const presenter = read('src/client/presenter.ts');
const productTest = read('src/client-onboarding-docx.test.ts');

for (const token of ['startSourceReview', 'deps.startSourceReview(openedId', '来源语义审阅', 'I151 的唯一触发事件']) {
  if (!controllers.includes(token)) fail(`directory controlled-import routing missing ${token}`);
}
for (const token of ['paragraphsFromHostChunks', 'currentProjectId !== projectId', 'importInterpretation.begin']) {
  if (!composition.includes(token)) fail(`source-review composition missing ${token}`);
}
if (!presenter.includes("importReview === null ? null : h('div', { className: 'nv-onboarding-stack', 'data-novel-directory-review': '' }, importReview)")) fail('directory review is not independent of legacy onboarding state');
for (const token of ["toContain('background-material')", "toContain('existing-prose')", '由 AI 创建并串联新主角', 'ruleStyleBegins', 'onboardingBegins).toBe(0)']) {
  if (!productTest.includes(token)) fail(`product regression missing ${token}`);
}

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/client-onboarding-docx.test.ts',
  'src/client/import-interpretation-review.test.ts',
  'src/client/source-aware-workflow.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`controlled-import product regression failed (exit ${focused.status}):\n${focused.output.slice(0, 14000)}`);

const artifact = {
  iteration: 'I153', requirement: 'R24-1',
  rootCause: 'directory DOCX creation launched legacy six-layer analysis and rendered source review only when OnboardingState existed',
  guarantees: [
    'new-project-docx-opens-source-review', 'background-and-existing-prose-options-visible',
    'existing-protagonist-input-reachable', 'legacy-six-layer-not-started-before-source-confirmation',
    'i151-starts-once-after-confirmed-first-import', 'directory-review-independent-of-onboarding-state',
  ],
  explicitNonGoals: ['i150-outline-contract-change', 'new-import-enum', 'preserve-prose', 'prompt-or-sample-change', 'host-remote-change', 'subsequent-import-redesign'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i153-controlled-import-entry.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I153 smoke: directory DOCX source choices, existing protagonist field, and first-import I151 trigger passed\n');
