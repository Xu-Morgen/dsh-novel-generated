import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnCaptured } from './spawn-captured.mjs';

/** I103 Remote 返回合同门与 Branch 基线修复（计划 §19 I103）。 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
const fail = (message) => { throw new Error(`I103 smoke: ${message}`); };

const shared = read('src/host/remote/shared.ts');
if (!shared.includes('RemoteResultShape<CodecOut<D[\'result\']>>')) fail('MethodSpecFor.call 未从 descriptor result codec 派生');
if (!shared.includes('| Promise<RemoteResultShape<CodecOut<D[\'result\']>>>')) fail('MethodSpecFor.call 未允许 Promise result');
if (!shared.includes('Out extends undefined ? undefined')) fail('undefined result 被 void 放宽');

const compileFixture = read('src/host/remote/shared-result-contract.test.ts');
if ((compileFixture.match(/@ts-expect-error/g) ?? []).length < 2) fail('缺少 result 类型负向编译夹具');
if (!compileFixture.includes('syncListSpec') || !compileFixture.includes('asyncListSpec')) fail('缺少 sync/Promise 正向编译夹具');

const orchestration = read('src/host/composition/orchestration.ts');
if ((orchestration.match(/function branchListWireAdapter/g) ?? []).length !== 1) fail('Branch list Host adapter 不是唯一 owner');
if (!orchestration.includes("{ method: 'list', call: (projectId: string, chapterId: string, sceneId: string) => branchListWireAdapter")) fail('novelBranches.list 未使用唯一 Host adapter');

const client = read('src/client/ops/chapters-branch.ts');
for (const forbidden of ['.branches ?? []', 'saved ?? current.list', 'chosen.branches ?? current.list', 'result as { branches?']) {
  if (client.includes(forbidden)) fail(`Client 仍含契约漂移 fallback/cast: ${forbidden}`);
}

const lock = JSON.parse(read('contracts/stage18/remote-descriptors.json'));
if (!Array.isArray(lock.descriptorIds) || lock.descriptorIds.length === 0) fail('Remote descriptor baseline 为空');
if (Object.keys(lock.descriptors ?? {}).length !== lock.descriptorIds.length) fail('descriptorIds 与 descriptors 数量不一致');
if (Object.keys(lock.resultSchemas ?? {}).length !== lock.resultSchemaIds.length) fail('resultSchemaIds 与 resultSchemas 数量不一致');
for (const id of [
  'novel-creation-tool/novelBranches/list',
  'novel-creation-tool/novelWriting/propose',
  'novel-creation-tool/novelReview/scan',
  'novel-creation-tool/novelWorkspace/chapterList',
]) {
  if (!(id in lock.resultSchemas)) fail(`result schema baseline 缺少 ${id}`);
}

const typecheck = spawnCaptured('pnpm', ['run', 'typecheck'], { cwd: repoRoot, encoding: 'utf8' });
if (typecheck.status !== 0) fail(`编译期正/负夹具未通过 (exit ${typecheck.status}):\n${typecheck.output.slice(0, 2000)}`);
const focused = spawnCaptured('pnpm', ['exec', 'vitest', 'run',
  'src/host/remote/shared-result-contract.test.ts',
  'src/contract-lock.test.ts',
  'src/remote-binder.test.ts',
], { cwd: repoRoot, encoding: 'utf8' });
if (focused.status !== 0) fail(`Remote contract/binder 测试未通过 (exit ${focused.status}):\n${focused.output.slice(0, 3000)}`);

const artifact = {
  iteration: 'I103',
  contract: 'remote-result-contract',
  descriptorCount: lock.descriptorIds.length,
  resultSchemaCount: lock.resultSchemaIds.length,
  resultFamilies: ['Branch', 'Writing', 'Review', 'C5'],
  branchListWireShape: '{ branches: BranchSummary[] }',
  domainListShape: 'BranchSummary[]',
  invalidResultsFailClosed: ['raw-array', 'missing-branches', 'extra-field'],
  compileFixtures: { sync: true, promise: true, rawArrayRejected: true, missingFieldRejected: true, undefinedResultRejected: true },
  checks: ['typecheck', 'shared-result-contract', 'contract-lock', 'real-dsh-client-binder'],
};
const artifactPath = resolve(repoRoot, 'artifacts/i103-remote-result-contract.json');
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

console.log(`I103 smoke: ${lock.descriptorIds.length} descriptors + ${lock.resultSchemaIds.length} result schemas locked; Branch Domain→adapter→codec→Client and invalid-result fail-closed fixtures passed`);
