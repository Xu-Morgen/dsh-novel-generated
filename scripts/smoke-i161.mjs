import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';
import { scanAuthorPresentationSources, scanAuthorText } from './scan-author-presentation.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const digest = (path) => createHash('sha256').update(readFileSync(resolve(repoRoot, path))).digest('hex');
const fail = (message) => { throw new Error(`I161 smoke: ${message}`); };

const scan = scanAuthorPresentationSources();
if (scan.violations.length > 0) fail(`author terminology violations:\n${JSON.stringify(scan.violations.slice(0, 20), null, 2)}`);
if (scanAuthorText('DOCX TXT Markdown gpt-4o https://example.test/v1').length !== 0) fail('narrow allowlist rejected supported author-visible values');
if (scanAuthorText('holder Gate Stage 9 I161 N-7 planned').length < 6) fail('forbidden terminology negative fixture was not rejected');

const structured = read('src/client/structured-editor.ts');
for (const token of ['structuredEditor', 'FIELD_LABELS', 'ENUM_BY_FIELD', 'data-novel-structured-input', '由系统维护']) {
  if (!structured.includes(token)) fail(`structured editor invariant missing: ${token}`);
}
const legacyEditors = `${read('src/client/onboarding-panels.ts')}\n${read('src/client/import-interpretation-review.ts')}`;
if (legacyEditors.includes('data-novel-onboarding-edit-text')) fail('legacy raw onboarding editor remains');
if (!legacyEditors.includes('structuredEditor')) fail('structured review editor is not wired');

const unchangedContracts = {
  'contracts/stage18/remote-descriptors.json': 'cd960a7bcc00e7b53f5f2a0fdf3610feaa1293d6b02bf729b2d9d7068265a1d7',
  'contracts/stage19/import-interpretation-remote.json': '9f8427f805563aaca71d514c21e7e3b057e2d5df234cafb493cfacb85afa36b5',
  'contracts/stage20/rule-style-import-initialization-remote.json': '5228ffd7b8a68d275991edf607e4d1466e502504588f63839c8b6d7ad442ab09',
};
for (const [path, expected] of Object.entries(unchangedContracts)) if (digest(path) !== expected) fail(`public contract changed: ${path}`);

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/client-i161-author-presentation.test.ts', 'src/client/import-interpretation-review.test.ts',
  'src/client-panels-candidate.test.ts', 'src/client-panels-rules.test.ts', 'src/client-panels-search.test.ts',
  'src/client-panels-queue.test.ts', 'src/client-panels-knowledge.test.ts', 'src/client-panels-progress.test.ts',
  'src/client-chapters.test.ts', 'src/client-presentation.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`presentation consumer regression failed (exit ${focused.status}):\n${focused.output.slice(0, 18000)}`);

const artifact = {
  iteration: 'I161', requirement: 'R30-3',
  scannedAstVisibleLiterals: scan.literalCount,
  guarantees: [
    'reachable-author-enums-and-mechanism-terms-use-chinese-display-dictionaries',
    'unknown-canonical-values-fail-closed-without-raw-fallback',
    'legacy-six-layer-and-rule-style-json-editors-use-structured-controls',
    'static-typescript-ast-and-dynamic-render-tree-scanners-cover-text-options-placeholders-and-aria',
    'docx-txt-markdown-model-url-and-author-content-are-narrowly-allowlisted',
    'canonical-enums-wire-storage-data-anchors-and-public-contracts-are-unchanged',
  ],
  unchangedContractDigests: unchangedContracts,
  unchangedBoundaries: ['domain-schemas', 'public-remotes', 'llm-prompts-and-samples', 'confirmation-gate', 'source-of-truth'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i161-chinese-author-presentation-gate.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write(`I161 smoke: ${scan.literalCount} AST-visible literals, structured editors, dynamic scanner fixtures, focused regressions, and unchanged contracts passed\n`);
