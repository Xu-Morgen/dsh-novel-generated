import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I154 smoke: ${message}`); };
const review = read('src/client/import-interpretation-review.ts');
const styles = read('src/client/styles/onboarding.ts');
const test = read('src/client/import-interpretation-review.test.ts');

for (const token of ['SOURCE_ROLE_HELP_LINES', 'PARAGRAPH_ROLE_HELP_LINES', 'PARAGRAPH_DECISION_HELP_LINES', 'MERGE_CLASSIFICATION_HELP_LINES', "role: 'tooltip'", "'aria-describedby': help.id"]) {
  if (!review.includes(token)) fail(`help renderer/content missing ${token}`);
}
for (const token of ['nv-import-help:hover', 'nv-import-help:focus-within', 'visibility: visible', 'cursor: help']) {
  if (!styles.includes(token)) fail(`hover/focus style missing ${token}`);
}
for (const token of ['source-role', 'paragraph-source-type', 'paragraph-decision', 'merge-classification', '不会拼接相邻来源片段']) {
  if (!test.includes(token) && !review.includes(token)) fail(`consumer assertion missing ${token}`);
}

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/client/import-interpretation-review.test.ts',
  'src/client-onboarding-docx.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`source-review regression failed (exit ${focused.status}):\n${focused.output.slice(0, 14000)}`);

const artifact = {
  iteration: 'I154', requirement: 'R25-1',
  guarantees: [
    'four-context-help-buttons', 'mouse-hover-tooltip', 'keyboard-focus-tooltip',
    'native-title-fallback', 'aria-describedby-role-tooltip-link', 'detailed-canonical-option-meanings',
    'source-chunk-not-word-paragraph-disclosure', 'merge-means-accepted-not-text-concatenation',
  ],
  explicitNonGoals: ['docx-segmentation-change', 'enum-change', 'host-or-remote-change', 'prompt-or-sample-change', 'domain-write'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i154-source-review-help.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I154 smoke: source-role, source-fragment, decision, and merge hover/focus help passed\n');
