import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = '/tmp';
process.env.TEMP = '/tmp';
process.env.TMP = '/tmp';
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I125 smoke: ${message}`); };

const adapters = read('src/client/link-adapters.ts');
if (!adapters.includes('EntityLink') || !adapters.includes('contextLinkButton') || !adapters.includes('aria-label')) {
  fail('thin adapter contract missing');
}
for (const panel of ['characters', 'relationship', 'knowledge', 'review', 'timeline', 'outline']) {
  const source = read(`src/client/layers/${panel}.ts`);
  if (!source.includes('contextLinkButton') || !source.includes(panel === 'review' ? 'textContextLink' : 'entityContextLink')) fail(`${panel} adapter missing`);
}
const panels = read('src/client/panels/index.ts');
if ((panels.match(/ops\.router/g) ?? []).length < 6) fail('panel registry does not pass the shared Router sink');
const router = read('src/client/router.ts');
const routerOps = read('src/client/ops/router.ts');
const ops = read('src/client/ops/index.ts');
for (const token of ['RouterTargetFocus', 'linkForRouteFocus', "'scene-card': 'outline'", 'focus']) {
  if (!router.includes(token)) fail(`router target focus missing ${token}`);
}
for (const token of ['targetFocus.focus(link)', 'unknown-target', 'linkForRouteFocus(popped.route)']) {
  if (!routerOps.includes(token)) fail(`router stale-target guard missing ${token}`);
}
for (const token of ['const targetFocus', 'createRouterOps(runtime, chaptersRef, targetFocus)', 'createSearchOps(runtime, { searchNamespace: ports.searchNamespace }, router)']) {
  if (!ops.includes(token)) fail(`ops composition missing ${token}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/client-i125-link-adapters.test.ts',
  'src/client-i124-link-router.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`I125 focused suites failed (exit ${focused.status}):\n${focused.output.slice(0, 8000)}`);

const artifact = {
  iteration: 'I125',
  requirement: 'R18-8b',
  guarantees: [
    'character-relationship-knowledge-review-timeline-search-and-scene-card-sources',
    'thin-adapters-only-construct-entity-link-and-router-owns-navigation',
    'host-projection-target-focus-and-safe-unknown-target-degradation',
    'accessible-context-link-dom-anchors-and-return-selection-fixtures',
  ],
  focusedSuites: 'I125 seven-source adapter/target fixtures and I124 Router regression suite passed',
  explicitNonGoals: ['derived-link-index-rebuild', 'stale-relink', 'link-persistence', 'export-carrier', 'text-relink'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i125-link-adapters.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I125 smoke: seven link sources, shared Router target focus, safe degradation, and return fixtures passed\n');
