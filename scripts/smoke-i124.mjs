import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I124 smoke: ${message}`); };

const link = read('src/core/schema/link.ts');
const resolver = read('src/host/link-resolver.ts');
const router = read('src/client/router.ts');
const routerOps = read('src/client/ops/router.ts');
const searchOps = read('src/client/ops/search.ts');
const presenter = read('src/client/presenter.ts');
const store = read('src/client/store/index.ts');
for (const token of ['textAnchorSchema', 'UTF-16', 'sourceHash', 'entityLinkSchema', 'strict()']) {
  if (!link.includes(token)) fail(`link contract missing ${token}`);
}
for (const token of ['entityLinkSchema.safeParse', 'cross-project', 'unknown-target', 'textContentHash', 'assertTextAnchor']) {
  if (!resolver.includes(token)) fail(`Host resolver missing ${token}`);
}
for (const token of ['captureRoute', 'linkFromSearchHit', 'pushRoute', 'popRoute', 'backStack', 'filter', 'focus']) {
  if (!router.includes(token)) fail(`router owner missing ${token}`);
}
if (!routerOps.includes('routeNeedsDirtyGuard') || !routerOps.includes('openFromSearch')) fail('router dirty guard or Search consumer missing');
if (!searchOps.includes('router.openFromSearch') || searchOps.includes('Record<string, WorkbenchViewId>')) fail('Search still owns direct view navigation');
for (const token of ['data-novel-router-back', 'data-novel-router-error', 'ops.router.back']) {
  if (!presenter.includes(token)) fail(`router UI missing ${token}`);
}
for (const token of ['router: freshRouter()', 'routerPatch', 'd.router = freshRouter()']) {
  if (!store.includes(token)) fail(`router store state/action missing ${token}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/core/schema/link.test.ts',
  'src/host/link-resolver.test.ts',
  'src/client-i124-link-router.test.ts',
  'src/client-panels-search.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I124 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I124',
  requirement: 'R18-8a',
  guarantees: [
    'strict-entity-link-and-utf16-text-anchor-contract',
    'host-project-target-existence-and-source-hash-stale-resolution',
    'router-owns-search-navigation-adaptation',
    'back-entry-restores-view-mode-selection-and-search-filters',
    'dirty-chapter-navigation-never-silently-overwrites-draft',
    'router-errors-fail-closed-without-domain-write',
  ],
  focusedSuites: 'I124 schema, Host resolver, Client router, and legacy Search consumer suites passed',
  explicitNonGoals: ['seven-source-adapters', 'derived-link-index-rebuild', 'link-persistence', 'export-carrier', 'body-edit'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i124-link-router.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I124 smoke: strict links, Host resolution, Search-to-Router navigation, back restoration, and dirty guards passed\n');
