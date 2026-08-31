import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));
const fail = (message) => { throw new Error(`I138 smoke: ${message}`); };

const schema = read('src/core/schema/manuscript.ts');
const compiler = read('src/host/manuscript-compiler.ts');
const service = read('src/host/import-export-service.ts');
const remote = read('src/host/remote/import-export.ts');
const orchestration = read('src/host/composition/orchestration.ts');
const panel = read('src/client/layers/import-export.ts');
const ops = read('src/client/ops/import-export.ts');
const binder = read('src/remote-binder.test.ts');
const consumer = read('src/host/manuscript-compiler.test.ts');
const lock = readJson('contracts/stage18/remote-descriptors.json');

for (const token of ['manuscriptFormatSchema', 'manuscriptReadinessReceiptSchema', 'compileManuscriptInputSchema', 'compileManuscriptResultSchema']) {
  if (!schema.includes(token)) fail(`canonical manuscript schema missing ${token}`);
}
for (const token of ['createManuscriptCompiler', 'sameFreshness', 'renderTxt', 'renderMarkdown', 'chosen C5', '正文在编译期间发生变化']) {
  if (!compiler.includes(token)) fail(`compiler gate or renderer missing ${token}`);
}
for (const token of ['compileManuscript', 'ManuscriptCompiler']) if (!service.includes(token) && !orchestration.includes(token)) fail(`Host adapter missing ${token}`);
for (const token of ['compileManuscriptInvocation', 'compileManuscriptOutcomeWireSchema']) if (!remote.includes(token)) fail(`Remote contract missing ${token}`);
for (const token of ['data-novel-ie-compile-txt', 'data-novel-ie-compile-md', '编译单一全文']) if (!panel.includes(token)) fail(`download UI missing ${token}`);
for (const token of ['compileManuscript', 'downloadText', 'text/markdown']) if (!ops.includes(token)) fail(`download action missing ${token}`);
for (const token of ['novelImportExport/compileManuscript', 'rejected "input"', 'rejected "result"']) if (!binder.includes(token)) fail(`real binder fixture missing ${token}`);
for (const token of ['旧分支不应混入', 'receipt 已过期', '正文在发布门扫描后发生变化']) if (!consumer.includes(token)) fail(`compiler consumer fixture missing ${token}`);
if (lock.descriptorIds.length !== 181 || lock.resultSchemaIds.length !== 87) fail('Stage 18 lock counts drifted after I138');
if (lock.descriptorIds.at(-1) !== 'novel-creation-tool/novelImportExport/compileManuscript') fail('I138 descriptor is not the additive lock tail');
if (lock.resultSchemaIds.at(-1) !== 'novel-creation-tool/novelImportExport/compileManuscript') fail('I138 result is not the additive lock tail');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/manuscript-compiler.test.ts',
  'src/client-panels-import-export.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 10000)}`);

const artifact = {
  iteration: 'I138', requirement: 'R18-14b',
  guarantees: [
    'one-byte-stable-txt-or-markdown-manuscript-with-chapter-toc',
    'chosen-c5-only-rendering-in-real-chapter-and-scene-order',
    'no-branches-settings-sidecars-links-ids-or-technical-metadata',
    'i137-readiness-receipt-freshness-and-concurrent-text-change-fail-closed',
    'legacy-per-chapter-export-remains-available',
    'real-client-download-consumer-binder-and-contract-lock-pass',
  ],
  remoteLock: { descriptorCount: lock.descriptorIds.length, resultSchemaCount: lock.resultSchemaIds.length },
  focusedSuites: 'ManuscriptCompiler, import/export Client, real binder, and contract-lock fixtures passed',
  explicitNonGoals: ['docx', 'pdf', 'epub', 'typesetting-engine', 'external-publishing-upload'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i138-single-manuscript.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I138 smoke: single TXT/Markdown manuscript, TOC, readiness freshness, binder, and lock passed\n');
