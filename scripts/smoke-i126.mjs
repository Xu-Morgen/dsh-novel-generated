import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I126 smoke: ${message}`); };

const core = read('src/core/link/index.ts');
const schema = read('src/core/schema/link.ts');
const repository = read('src/core/text/repository.ts');
const textService = read('src/host/text-service.ts');
const service = read('src/host/link-index-service.ts');
for (const token of ['TEXT_LINK_INDEX_DIRECTORY', "'.links'", 'sourceFingerprint', 'relinkTextAnchor', 'ambiguous-quote', 'missing-quote', 'TextLinkIndexRepository', 'invalidateTextLinkIndex']) {
  if (!core.includes(token)) fail(`core link rebuild contract missing ${token}`);
}
for (const token of ['textLinkSourceSchema', 'textLinkRecordSchema', 'textLinkIndexSchema', 'version: z.literal(1)', "status: z.enum(['ready', 'stale'])"]) {
  if (!schema.includes(token)) fail(`link schema missing ${token}`);
}
for (const token of ['onTextChanged', 'notifyTextChanged']) {
  if (!repository.includes(token) && !textService.includes(token)) fail(`C5 invalidation callback missing ${token}`);
}
for (const token of ['build(projectId', 'rebuild(projectId', 'drop(projectId', 'invalidate(projectId', '请先构建派生索引']) {
  if (!service.includes(token)) fail(`Host index service missing ${token}`);
}
if (service.includes('readCompleteChapter') || service.includes('renderChapterMarkdown')) fail('link index service reached a portable text carrier');

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/core/link/index.test.ts',
  'src/host/link-index-service.test.ts',
  'src/host/link-resolver.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I126 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I126',
  requirement: 'R18-8c',
  guarantees: [
    'versioned-deletable-links-index-derived-only-from-c5',
    'deterministic-utf16-quote-rebuild-with-ambiguous-and-missing-failures',
    'old-anchor-source-hash-stale-after-successful-c5-edit',
    'c5-edit-invalidation-is-best-effort-and-never-vetoes-committed-prose',
    'drop-and-rebuild-recover-corrupt-or-missing-derived-index',
  ],
  focusedSuites: 'I126 core rebuild, Host invalidation service, and resolver regression suites passed',
  explicitNonGoals: ['markdown-link-carrier', 'portable-archive-sidecar', 'llm-relink-analysis', 'review-repair-workflow'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i126-link-rebuild.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I126 smoke: versioned link index, deterministic relink, stale invalidation, and safe rebuild passed\n');
