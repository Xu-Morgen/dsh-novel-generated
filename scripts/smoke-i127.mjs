import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I127 smoke: ${message}`); };

const core = read('src/core/export/index.ts');
const coreTest = read('src/core/export/index.test.ts');
const host = read('src/host/import-export-service.ts');
const hostTest = read('src/host/import-export-service.test.ts');
for (const token of ['DERIVED_EXPORT_DIRECTORIES', "'.links', '.search'", 'derived path', 'rebuildable cache', 'rm(join(root, derivedDirectory)']) {
  if (!core.includes(token)) fail(`portable export/import safety contract missing ${token}`);
}
for (const token of ['DERIVED_EXPORT_DIRECTORIES', 'rm(join(directory, derivedDirectory)', 'portable payload never carries links']) {
  if (!host.includes(token)) fail(`Host restore cleanup contract missing ${token}`);
}
for (const token of ['.links/index.json', '.search/index.json', 'fresh rebuild', 'derived path']) {
  if (!coreTest.includes(token)) fail(`core export safety fixture missing ${token}`);
}
for (const token of ['round-trip 后不恢复链接内部数据', 'createLinkIndexService', 'restored-link']) {
  if (!hostTest.includes(token)) fail(`Host round-trip rebuild fixture missing ${token}`);
}
if (core.includes("collectFiles(root, '.links'") || core.includes("collectFiles(root, '.search'")) fail('derived stores became portable export sources');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/core/export/index.test.ts',
  'src/host/import-export-service.test.ts',
  'src/core/link/index.test.ts',
  'src/host/link-index-service.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I127 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I127',
  requirement: 'R18-8d',
  guarantees: [
    'full-and-template-portable-archives-exclude-links-and-search-derived-stores',
    'portable-archive-rejects-derived-path-carriers-before-write',
    'txt-and-markdown-export-read-only-pure-prose-and-settings',
    'restore-removes-target-derived-stores-before-fresh-rebuild',
    'restored-c5-can-rebuild-link-index-without-transported-internal-data',
  ],
  focusedSuites: 'I127 export/restore safety, I126 link rebuild, and Host invalidation regression suites passed',
  explicitNonGoals: ['portable-sidecar', 'html-link-carrier', 'portable-content-semantic-change', 'llm-relink-analysis'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i127-link-export-safety.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I127 smoke: portable archives, text exports, restore cleanup, and prose-only rebuild passed\n');
