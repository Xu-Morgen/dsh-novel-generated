import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnCaptured } from './spawn-captured.mjs';

/** I104 C5 mutation + project reorder smoke（计划 §19 I104 / R18-1a）。 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I104 smoke: ${message}`); };

const schema = read('src/core/schema/text-mutation.ts');
for (const owner of ['chapterMetadataPatchSchema', 'sceneMetadataPatchSchema', 'projectReorderMutationSchema']) {
  if (!schema.includes(`export const ${owner}`)) fail(`缺少 strict mutation owner: ${owner}`);
}
const repository = read('src/core/text/repository.ts');
for (const primitive of ['createChapterAt', 'updateChapterMetadata', 'insertScene', 'updateSceneMetadata', 'reorderProject', 'deleteChapterPrimitive', 'deleteScenePrimitive']) {
  if (!repository.includes(`${primitive}(`)) fail(`TextRepository 缺少 ${primitive}`);
}
if (!repository.includes('Cannot delete the project last valid scene landing')) fail('未实现最后有效场景落点保护');
if (!repository.includes('Stale text project fingerprint')) fail('未实现并发 stale 拒绝');

const queue = read('src/core/text/write-queue.ts');
if (!queue.includes('async commitProject(') || !queue.includes('.project-uow-journal') || !queue.includes('restorePreparedProject')) fail('缺少可重启恢复的项目级 UoW journal/rollback');
if (!queue.includes('return this.commitProject([chapter])')) fail('单章节真相写未复用 journal/outbox UoW');
if (!queue.includes('projectCoordinators') || !queue.includes('coordinatorFor(canonicalProjectDirectory)')) fail('缺少同项目路径跨 repository 实例 coordinator');
if (!queue.includes('writeDurableFile') || !queue.includes('syncTextDirectory')) fail('journal/truth 缺少 durability barrier');
if (!queue.includes('.mirror-outbox') || !queue.includes("operation: 'delete'") || !queue.includes("entry.operation === 'delete'")) fail('Markdown write/delete 未进入 durable typed outbox');
const remote = read('src/host/remote/text-mutation.ts');
if (!remote.includes("textMutationInvocation('reorder'")) fail('缺少 additive novelText reorder descriptor');
if (/textMutationInvocation\([^\n]*(delete|remove)/i.test(remote)) fail('I104 禁止公开硬删除 Remote');
const adapter = read('src/host/text-mutation-adapter.ts');
if (!adapter.includes("defineRemoteOnService('novelText', 'novelText'")) fail('novelText adapter 未绑定到真实 descriptor.service receiver');
const base = read('src/host/composition/base.ts');
if (base.includes("ctx.provide('novelTextMutations'")) fail('存在 gateway 无法解析的第二 Remote service owner');

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
const expectedResultIds = [
  'novel-creation-tool/novelText/fingerprint',
  'novel-creation-tool/novelText/chapterCreate',
  'novel-creation-tool/novelText/chapterUpdate',
  'novel-creation-tool/novelText/sceneCreate',
  'novel-creation-tool/novelText/sceneUpdate',
  'novel-creation-tool/novelText/reorder',
];
for (const id of expectedResultIds) {
  if (!(id in lock.resultSchemas)) fail(`result schema lock 缺少 ${id}`);
}

const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/core/text/mutation.test.ts',
  'src/host/remote/shared-result-contract.test.ts',
  'src/contract-lock.test.ts',
  'src/remote-binder.test.ts',
], { cwd: repoRoot, encoding: 'utf8' });
if (focused.status !== 0) fail(`C5 mutation/contract/binder 测试失败 (exit ${focused.status}):\n${focused.output.slice(0, 3000)}`);

const artifact = {
  iteration: 'I104',
  requirement: 'R18-1a',
  publicNamespace: 'novelText',
  publicMethods: ['fingerprint', 'chapterCreate', 'chapterUpdate', 'sceneCreate', 'sceneUpdate', 'reorder'],
  hardDeletePublic: false,
  metadataPatchAllowlist: {
    chapter: ['title', 'pov', 'status'],
    scene: ['summary', 'beats', 'canonEvents', 'notes'],
  },
  reorder: { shape: 'complete-project-permutation', optimisticToken: 'sha256 project fingerprint', projectUowRollback: true, processCrashJournalRecovery: true, posixDirectoryFsync: true, windowsPowerLossDurability: 'best-effort', pathGlobalCoordinator: true, serializedReaders: true },
  deletion: { primitive: 'host-only', lastProjectSceneLandingProtected: true, postDeleteFingerprint: true, impactIncludes: ['proseCharacters', 'branchCount', 'sources.sourceHash', 'sources.branches', 'targetFingerprint', 'projectFingerprint'] },
  descriptorCount: lock.descriptorIds.length,
  resultSchemaCount: lock.resultSchemaIds.length,
  negativeFixtures: ['duplicate-id', 'out-of-range-index', 'unknown-scene', 'incomplete-permutation', 'stale-fingerprint', 'invalid-wire-input', 'invalid-wire-result', 'mid-commit-fault'],
  checks: ['repository-reopen', 'durable-json-markdown-mirror-delete-outbox', 'project-uow-journal-recovery', 'single-chapter-shares-journal-outbox-uow', 'path-global-multi-repository-serialization', 'process-crash-recovery-and-platform-fsync-boundary', 'reader-writer-serialization', 'global-scene-id-preflight', 'post-delete-token', 'type-result-coupling', 'contract-lock', 'real-dsh-host-gateway', 'real-dsh-client-binder', 'TextService-adapter-client-consumer'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i104-c5-mutations.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

console.log(`I104 smoke: ${expectedResultIds.length} additive novelText contracts locked; path-global CRUD/reorder/durable journal+mirror recovery/real Host gateway+Client binder passed`);
