import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const readJson = (path) => JSON.parse(readFileSync(resolve(repoRoot, path), 'utf8'));
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I128 smoke: ${message}`); };

const samples = readJson('samples/i128/cases.json');
const dev = readJson('samples/i128/dev.json');
const heldOut = readJson('samples/i128/held-out.json');
const gold = readJson('samples/i128/gold.json');
if (samples.immutable !== true || dev.immutable !== true || heldOut.immutable !== true || gold.immutable !== true) fail('repair samples must be immutable');
if (samples.threshold < 0.8 || samples.cases.length !== 12 || dev.caseIds.length !== 9 || heldOut.caseIds.length !== 3) fail('repair sample split or threshold drifted');
if (new Set([...dev.caseIds, ...heldOut.caseIds]).size !== samples.cases.length) fail('dev/held-out split is not exhaustive and disjoint');
if (!samples.cases.every((item) => gold.caseIds.includes(item.id))) fail('gold manifest does not cover all repair cases');

const issue = read('src/core/review/issue.ts');
const schema = read('src/core/schema/review-repair.ts');
const template = read('src/llm/template/review-repair.ts');
const workflow = read('src/host/review-repair-workflow.ts');
const remote = read('src/host/remote/review-repair.ts');
const client = read('src/client/layers/review.ts');
const router = read('src/client/router.ts');
for (const token of ['reviewIssueProvenanceSchema', 'anchorFor', 'reviewIssueFingerprintOf']) if (!issue.includes(token)) fail(`review evidence contract missing ${token}`);
for (const token of ['reviewRepairInputSchema', 'reviewRepairLineageSchema', 'reviewRepairTargetSchema']) if (!schema.includes(token)) fail(`repair schema missing ${token}`);
for (const token of ['完整场景正文', 'issue.provenance', 'references']) if (!template.includes(token)) fail(`repair prompt contract missing ${token}`);
for (const token of ['deps.review.current', 'assertTextAnchor', 'textContentHash', 'deps.writing.propose', '正文已变化']) if (!workflow.includes(token)) fail(`repair stale/candidate workflow missing ${token}`);
for (const token of ['novelReviewRepair', 'reviewRepairInputSchema', 'writingCandidateWireSchema']) if (!remote.includes(token)) fail(`repair Remote contract missing ${token}`);
for (const token of ['生成修复候选', 'data-novel-review-repair-candidate']) if (!client.includes(token)) fail(`repair Client entry missing ${token}`);
if (!router.includes('anchor')) fail('router dropped text anchor');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/core/review/issue.test.ts',
  'src/llm/template/review-repair.test.ts',
  'src/host/review-repair-workflow.test.ts',
  'src/client-i124-link-router.test.ts',
  'src/client-panels-review.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I128 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I128',
  requirement: 'R18-3a',
  guarantees: [
    'review-scan-projects-stable-fingerprint-source-hash-and-unique-utf16-anchor',
    'repair-reads-latest-host-scan-and-rejects-stale-or-mismatched-evidence',
    'repair-delegates-to-existing-writing-adjudication-owner-as-zero-write-candidate',
    'hard-issues-can-produce-candidates-but-no-automatic-accept-or-resolved-ledger',
    'review-router-and-client-panel-preserve-exact-anchor-and-candidate-lineage',
    'repair-dev-and-held-out-fake-backend-samples-pass-threshold',
  ],
  focusedSuites: 'I128 core issue, prompt sample, Host workflow, Client router/panel, binder, and contract-lock suites passed',
  explicitNonGoals: ['resolved-ledger', 'direct-c5-write', 'automatic-hard-issue-accept', 'review-threshold-change', 'new-rewrite-engine'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i128-review-repair.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I128 smoke: review anchors, stale guards, repair candidates, router preservation, and sample threshold passed\n');
