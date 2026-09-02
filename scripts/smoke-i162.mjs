import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const digest = (path) => createHash('sha256').update(readFileSync(resolve(repoRoot, path))).digest('hex');
const fail = (message) => { throw new Error(`I162 smoke: ${message}`); };

const review = read('src/client/import-interpretation-review.ts');
const segmentation = read('src/client/import-segmentation.ts');
const sessionSchema = read('src/core/schema/import-interpretation-session.ts');
for (const token of ['PARAGRAPH_TREATMENT_SUGGESTIONS', 'data-novel-import-interpretation-treatment-suggestion', '在光标处分段', '与下一段合并', "decision: role === paragraph.suggestedRole ? 'accepted' : 'edited'"]) {
  if (!review.includes(token)) fail(`review invariant missing: ${token}`);
}
for (const token of ['splitImportParagraph', 'mergeImportParagraphWithNext', '来源片段与规范原文范围不一致', '不能在一个完整字符中间分段']) {
  if (!segmentation.includes(token)) fail(`segmentation invariant missing: ${token}`);
}
if (!sessionSchema.includes('role: sourceParagraphRoleSchema.optional()')) fail('final author role is not a backward-compatible optional checkpoint field');
if (review.includes("[['pending', '待处理'], ['accepted'")) fail('legacy author-selectable decision enum remains');
if (review.includes('合并此分类')) fail('misleading classification merge action remains');

const unchangedLlmAssets = {
  'src/llm/analyze/import-interpretation.ts': 'cde979a4b7cbfbe97a7aeefae03c6705486fc7a00f6338f0b31cbe3acf938792',
  'src/core/schema/import-interpretation-analysis.ts': '763f9997771077fe21ad4f4d458f7e9e7ca64ba52cb1dea2d299767d32699150',
  'samples/i143/dev.json': '1b4f6178914c289f1bccb5c6d3ce0085ddec92227e4a5391b3acf2897b9dd69d',
  'samples/i143/cases.json': '1f360e6a144d6c75a3f6fa330eaf0cb42b607b291e58fd7f6aba8890143b3142',
  'samples/i143/gold.json': '4e84343cabfe7ccd102fa4118229b1526e16be6e35b8e9bc5c254587cd66c411',
};
for (const [path, expected] of Object.entries(unchangedLlmAssets)) if (digest(path) !== expected) fail(`LLM prompt/schema/sample changed: ${path}`);

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/client/import-segmentation.test.ts',
  'src/client/import-interpretation-review.test.ts',
  'src/client-onboarding-docx.test.ts',
  'src/host/import-interpretation-session-service.test.ts',
  'src/import-interpretation-contract.test.ts',
  'src/remote-binder.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`source-segmentation regression failed (exit ${focused.status}):\n${focused.output.slice(0, 18000)}`);

const artifact = {
  iteration: 'I162', requirement: 'R31-1',
  decision: 'keep-source-role-as-generation-safety-dependency',
  guarantees: [
    'type-and-deterministic-treatment-suggestions-appear-together',
    'author-split-and-adjacent-merge-preserve-normalized-source-ranges',
    'surrogate-pair-empty-and-forged-range-boundaries-fail-closed',
    'resegmentation-discards-old-session-and-runs-one-new-analysis',
    'edited-is-derived-only-from-an-actual-role-change',
    'confirmed-summary-carries-final-role-with-legacy-optional-compatibility',
  ],
  unchangedLlmAssets,
  unchangedBoundaries: ['source-text-and-hash', 'source-role-enum', 'llm-output', 'narrative-layer-owners', 'confirmation-gate', 'f1-f2'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i162-source-segmentation-review.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I162 smoke: source-role dependency, treatment advice, author segmentation, stale-session retirement, and final-role checkpoint passed\n');
