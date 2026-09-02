import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const digest = (path) => createHash('sha256').update(readFileSync(resolve(repoRoot, path))).digest('hex');
const fail = (message) => { throw new Error(`I159 smoke: ${message}`); };

const clientEntry = read('src/client.ts');
const presenter = read('src/client/presenter.ts');
const navigation = read('src/client/nav.ts');
const importExportPanel = read('src/client/layers/import-export.ts');
const sourceImport = read('src/client/source-import.ts');
for (const forbidden of ['createOnboardingController', 'startAnalysis: (', 'onboarding.startAnalysis']) {
  if (clientEntry.includes(forbidden)) fail(`product composition still calls legacy analyzer: ${forbidden}`);
}
for (const forbidden of ['data-novel-onboarding-start', '分析原文', '粘贴原文以生成六层候选']) {
  if (presenter.includes(forbidden)) fail(`legacy product entry remains: ${forbidden}`);
}
if (navigation.includes("{ view: 'onboarding', label: '六层初始化审阅' }")) fail('advanced navigation still exposes legacy six-layer review');
if (importExportPanel.includes('docx 导入请使用「六层初始化」入口')) fail('obsolete DOCX guidance remains');
for (const token of ['normalizeSource', 'sourceImportGate', 'data-novel-source-import-entry', '进入来源语义审阅']) {
  if (!sourceImport.includes(token)) fail(`single source-import owner missing ${token}`);
}

const unchangedContracts = {
  'contracts/stage19/import-interpretation-remote.json': 'de734e61709fff528450a69a644aa2eb234f80447f7914c7c7ebfd36ddab539b',
  'contracts/stage19/import-interpretation-analysis-remote.json': 'b2f6c6104ffc2d870aa5a93efee99a47e359fde2766aba01c91e1c39cdb74b2a',
  'contracts/stage20/rule-style-import-initialization-remote.json': '5228ffd7b8a68d275991edf607e4d1466e502504588f63839c8b6d7ad442ab09',
};
for (const [path, expected] of Object.entries(unchangedContracts)) if (digest(path) !== expected) fail(`existing source contract changed: ${path}`);

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/client-i159-source-import.test.ts',
  'src/client-onboarding-docx.test.ts',
  'src/client-onboarding-project-dir.test.ts',
  'src/client/workflow.test.ts',
  'src/host/import-export-service.test.ts',
  'src/contract-lock.test.ts',
  'src/remote-binder.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`source-entry regression failed (exit ${focused.status}):\n${focused.output.slice(0, 18000)}`);

const artifact = {
  iteration: 'I159',
  requirement: 'R30-1',
  guarantees: [
    'workflow-and-legacy-route-share-one-source-import-presenter',
    'directory-docx-empty-work-docx-and-pasted-text-enter-source-semantic-review',
    'pasted-text-hash-and-ranges-are-host-owned',
    'non-empty-work-fails-closed-before-upload-or-normalization',
    'legacy-six-layer-product-entry-and-navigation-removed',
    'legacy-public-remotes-remain-compatible',
    'i151-begins-only-after-source-confirmation',
  ],
  additiveRemote: 'novelImportExport/normalizeSource',
  unchangedContractDigests: unchangedContracts,
  unchangedBoundaries: ['source-enums', 'narrative-import-plan', 'llm-and-samples', 'confirmation-gate', 'docx-parser', 'f1-f2'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i159-single-source-import-entry.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I159 smoke: single source import entry, Host normalization, N-7 block, legacy-route convergence, and unchanged source contracts passed\n');
