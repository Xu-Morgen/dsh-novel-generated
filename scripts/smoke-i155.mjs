import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCaptured } from './spawn-captured.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I155 smoke: ${message}`); };

const projectRepository = read('src/core/project/index.ts');
const pathPolicy = read('src/core/io/path.ts');
const lifecycleRemote = read('src/host/remote/project-lifecycle.ts');
const presenter = read('src/client/presenter.ts');

for (const token of ['PROJECT_ARCHIVE_DIRECTORY', 'archiveProject', 'restoreProject', 'ARCHIVE_TOMBSTONE_PREFIX', 'removeArchiveTombstone']) {
  if (!projectRepository.includes(token) && !pathPolicy.includes(token)) fail(`Host archive/read-only guard missing ${token}`);
}
for (const token of ['projectArchiveListInvocation', 'projectArchiveInvocation', 'projectRestoreInvocation']) {
  if (!lifecycleRemote.includes(token)) fail(`additive lifecycle descriptor missing ${token}`);
}
for (const token of ['data-novel-project-archive', 'data-novel-project-archive-section', 'data-novel-project-restore', '恢复前不可打开或编辑']) {
  if (!presenter.includes(token)) fail(`archive chooser contract missing ${token}`);
}

const focused = spawnCaptured('node', [resolve(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run',
  'src/core/project/index.test.ts',
  'src/host/project-service.test.ts',
  'src/client-project.test.ts',
  'src/workspace-remote.test.ts',
  'src/remote-binder.test.ts',
  'src/contract-lock.test.ts',
], { cwd: repoRoot, env: { ...process.env, TMPDIR: '/tmp', TEMP: '/tmp', TMP: '/tmp' } });
if (focused.status !== 0) fail(`archive regression failed (exit ${focused.status}):\n${focused.output.slice(0, 16000)}`);

const artifact = {
  iteration: 'I155', requirement: 'R26-1',
  guarantees: [
    'active-catalog-excludes-archived', 'separate-restore-only-archive-list',
    'host-owned-tree-move', 'active-path-tombstone-blocks-stale-writes',
    'archived-project-open-denied', 'byte-preserving-restore',
    'strict-additive-project-lifecycle-remotes', 'binder-positive-and-negative-validation',
  ],
  explicitNonGoals: ['permanent-delete', 'automatic-or-bulk-archive', 'archive-editing', 'project-meta-change', 'llm-change', 'f1-or-f2'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i155-project-archive.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
process.stdout.write('I155 smoke: Host archive, stale-write tombstone, restore-only UI, and strict Remote contracts passed\n');
