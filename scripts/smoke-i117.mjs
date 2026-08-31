import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

/** I117 R18-5c smoke：引用审查 UI、错误标记与名称选择器退役手填 ID 主路径。 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I117 smoke: ${message}`); };

const review = read('src/client/layers/reference-review.ts');
const ops = read('src/client/ops/reference-review.ts');
const store = read('src/client/store/types.ts');
const selectors = read('src/client/entity-selectors.ts');
const presenter = read('src/client/presenter.ts');
const panels = read('src/client/panels/index.ts');
for (const token of ['referenceReviewPanel', 'data-novel-reference-audit-refresh', 'data-novel-reference-audit-mark-error', '不执行引用修正写回']) {
  if (!review.includes(token)) fail(`reference review UI missing ${token}`);
}
for (const token of ['referenceAuditNamespace', 'referenceReviewPatch', 'markedErrors', 'namespace.list']) {
  if (!(ops + store + review + presenter).includes(token)) fail(`reference review wiring missing ${token}`);
}
for (const token of ['entitySelect', 'entityMultiSelect', '未找到实体', 'aria-label']) {
  if (!selectors.includes(token)) fail(`entity selector missing ${token}`);
}
if (!panels.includes('referenceReviewPanel') || !presenter.includes('referenceAuditNamespace')) fail('reference review is not mounted in the review view');
if (/namespace\.(markError|retry|correct|save)/.test(review + ops)) fail('Client introduced a narrative/reference correction write');

const timeline = read('src/client/layers/timeline.ts');
const outline = read('src/client/layers/outline.ts');
const relationship = read('src/client/layers/relationship.ts');
for (const source of [timeline, outline, relationship]) {
  if (source.includes('角色 id') || source.includes('C1 id') || source.includes('C3 entryId')) fail('retired manual ID label remains');
}
for (const [name, source, tokens] of [
  ['timeline', timeline, ['entityMultiSelect', 'timeline-relationships', 'timeline-knowledge']],
  ['outline', outline, ['entityMultiSelect', 'outline-characters-involved', 'outline-prerequisites']],
  ['relationship', relationship, ['entitySelect', 'relationship-from', 'relationship-to', 'relationship-known-to']],
]) {
  for (const token of tokens) if (!source.includes(token)) fail(`${name} selector wiring missing ${token}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/client-i117-reference-review.test.ts',
  'src/client-panels-review.test.ts',
  'src/client-panels-timeline.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp' } });
if (focused.status !== 0) fail(`I117 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 6000)}`);

const artifact = {
  iteration: 'I117',
  requirement: 'R18-5c',
  guarantees: [
    'host-reference-audit-to-client-review-panel',
    'layer-and-status-filtering-with-local-session-error-mark',
    'unknown-or-deleted-entity-ids-remain-visible',
    'timeline-outline-relationship-manual-id-main-path-retired',
    'selector-labels-and-fieldsets-are-accessible',
    'error-marking-has-no-narrative-layer-write',
  ],
  focusedSuites: 'reference review E2E plus existing review/timeline regressions passed',
  explicitNonGoals: ['LLM-reference-correction', 'reference-correction-writeback', 'new-reference-remote-mutation'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i117-reference-review.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I117 smoke: reference review UI, local error marks, named selectors and retired manual ID paths passed\n');
