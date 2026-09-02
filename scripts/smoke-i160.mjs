import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const digest = (path) => createHash('sha256').update(readFileSync(resolve(repoRoot, path))).digest('hex');
const fail = (message) => { throw new Error(`I160 smoke: ${message}`); };

const authorForms = [
  'src/client/layers/chapters.ts', 'src/client/layers/rule-style.ts', 'src/client/layers/search.ts',
  'src/client/layers/worldview.ts', 'src/client/layers/outline.ts',
].map(read).join('\n');
for (const forbidden of ['章节 ID', '场景 ID', 'POV ID', '细纲目标 ID', '调和计划 ID', '规则 ID', '角色 id', '条目 id', 'data-novel-rule-edit-id']) {
  if (authorForms.includes(forbidden)) fail(`free-text technical identity remains: ${forbidden}`);
}
for (const required of ['chapter-pov', 'binding-target', 'reconciliation-plan', 'search-pov', 'search-reference', 'worldview-parent', 'outline-detail-pov']) {
  if (!authorForms.includes(required)) fail(`named selector missing: ${required}`);
}
const identity = read('src/client/draft-identity.ts');
for (const token of ['draftEntityId', "'chapter'", "'scene'", "'rule'", 'while (used.has']) if (!identity.includes(token)) fail(`draft identity invariant missing: ${token}`);

const unchangedContracts = {
  'contracts/stage18/remote-descriptors.json': 'cd960a7bcc00e7b53f5f2a0fdf3610feaa1293d6b02bf729b2d9d7068265a1d7',
  'contracts/stage19/import-interpretation-remote.json': 'de734e61709fff528450a69a644aa2eb234f80447f7914c7c7ebfd36ddab539b',
  'contracts/stage20/rule-style-import-initialization-remote.json': '5228ffd7b8a68d275991edf607e4d1466e502504588f63839c8b6d7ad442ab09',
};
for (const [path, expected] of Object.entries(unchangedContracts)) if (digest(path) !== expected) fail(`public contract changed: ${path}`);

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/client-i160-id-free-controls.test.ts', 'src/client-chapters.test.ts', 'src/client-panels-rules.test.ts',
  'src/client-panels-search.test.ts', 'src/client-i117-reference-review.test.ts',
  'src/client-i150-outline-detail-generation.test.ts', 'src/client-onboarding-docx.test.ts', 'src/remote-binder.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`consumer regression failed (exit ${focused.status}):\n${focused.output.slice(0, 18000)}`);

const artifact = {
  iteration: 'I160', requirement: 'R30-2',
  guarantees: [
    'chapter-scene-and-rule-identities-are-generated-outside-author-controls',
    'pov-parent-binding-reconciliation-and-search-submit-selected-canonical-values',
    'duplicate-names-have-chinese-disambiguation',
    'missing-references-retain-canonical-values-without-free-text-editing-or-id-display',
    'public-remotes-schemas-and-storage-contracts-are-unchanged',
  ],
  unchangedContractDigests: unchangedContracts,
  unchangedBoundaries: ['id-schema-and-format', 'host-repositories', 'public-remotes', 'reference-domain-semantics', 'i161-terminology'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i160-id-free-author-controls.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I160 smoke: hidden draft identities, named selectors, missing-reference safety, consumer regressions, and unchanged contracts passed\n');
