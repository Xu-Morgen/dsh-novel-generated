import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanAuthorLexicon } from './scan-author-lexicon.mjs';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I132 smoke: ${message}`); };

const presentation = read('src/client/presentation.ts');
const presenter = read('src/client/presenter.ts');
const navigation = read('src/client/styles/navigation.ts');
const expectedAnchors = [
  ['src/client/presenter.ts', 'data-novel-project-error'],
  ['src/client/presenter.ts', 'data-novel-nav-badge'],
  ['src/client/layers/reference-review.ts', 'data-novel-reference-audit-record'],
  ['src/client/layers/review.ts', 'data-novel-review-issue'],
  ['src/client/layers/chapters.ts', 'data-novel-reconciliation-plan'],
];

for (const term of ['toUserMessage', 'advancedError', 'advancedReference', 'AUTHOR_VISIBLE_TERM_DENYLIST']) {
  if (!presentation.includes(term)) fail(`presentation contract missing ${term}`);
}
for (const term of ['toUserMessage(routerState.error.message)', 'advancedError(h, projectError', 'data-novel-advanced-view']) {
  if (!presenter.includes(term)) fail(`presenter error/advanced view wiring missing ${term}`);
}
if (!navigation.includes('.nv-advanced-only') || !navigation.includes('.nv-advanced-details')) fail('advanced view styles missing');
for (const [path, anchor] of expectedAnchors) if (!read(path).includes(anchor)) fail(`technical anchor changed: ${path} / ${anchor}`);
const scan = scanAuthorLexicon();
if (scan.violations.length > 0) fail(`author lexicon violations:\n${scan.violations.map((item) => `${item.file}: ${item.term}`).join('\n')}`);
if (/cause\.message|\(cause as Error\)\.message/.test(read('src/client/presenter.ts'))) fail('presenter exposes raw cause.message');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/client/presentation.test.ts',
  'src/client-layers.test.ts',
  'src/client-chapters.test.ts',
  'src/client-onboarding-adjudication.test.ts',
  'src/client-i120-long-draft.test.ts',
  'src/client-panels-review.test.ts',
  'src/client-shell-workbench.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I132',
  requirement: 'R18-7',
  guarantees: [
    'all-existing-stage18-author-panels-use-actionable-error-language',
    'five-dynamic-error-classes-map-to-stable-author-actions',
    'raw-technical-errors-and-identifiers-are-explicitly-advanced-only',
    'author-visible-rendered-literals-have-zero-denylist-violations',
    'data-novel-dom-anchors-and-wire-contracts-remain-unchanged',
    'accessibility-alert-status-and-advanced-details-fixtures-pass',
  ],
  focusedSuites: 'presentation mapper, existing client panels, review, long-draft, and workbench fixtures passed',
  lexicon: { forbiddenTermCount: scan.terms.length, violations: scan.violations.length },
  explicitNonGoals: ['i18n-framework', 'navigation-structure-change', 'host-remote-wire-schema-storage-change'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i132-author-lexicon.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I132 smoke: author lexicon, actionable errors, advanced diagnostics, DOM anchors, and panel fixtures passed\n');
