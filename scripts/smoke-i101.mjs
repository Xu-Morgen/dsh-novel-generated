import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I101 单 acting 互锁拆分 / OpsContext 窄化 / workspace-service 收敛 smoke
 * （review v2.0 §5 / 计划 §18 I101）。
 *
 * 交付物核验：
 * - 单 acting 归零：statistics/knowledge/import-export 三层与对应 ops 无
 *   `acting` 字段/读写，busy 按子工作流键独立（grep 断言）；
 * - OpsContext 窄化：context.ts 只有 OpsRuntime + OpsPorts（无完整 OpsContext），
 *   各 ops 工厂首参 OpsRuntime、port 为 Pick<OpsPorts,...>（grep 断言）；
 * - workspace-service 收敛：createWorkspaceEditorService 只收 deps 对象（无
 *   11 位置参数，grep 断言）；
 * - 并行断言在案：statistics 测试含 I101 并行子工作流用例（grep + 运行）；
 * - 行为等价：三层面板 + workspace + 相关 client 测试全绿。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I101 smoke: ${msg}`); };

// Part 1 — 单 acting 归零。
for (const [layer, ops] of [
  ['src/client/layers/statistics.ts', 'src/client/ops/statistics.ts'],
  ['src/client/layers/knowledge.ts', 'src/client/ops/knowledge.ts'],
  ['src/client/layers/import-export.ts', 'src/client/ops/import-export.ts'],
]) {
  for (const file of [layer, ops]) {
    const text = read(file);
    if (/\bacting\b/.test(text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''))) {
      fail(`${file} 仍含 acting 互锁`);
    }
  }
}
if (!read('src/client/layers/statistics.ts').includes('StatisticsBusy')) fail('statistics 缺少 StatisticsBusy');
if (!read('src/client/layers/knowledge.ts').includes('KnowledgeBusy')) fail('knowledge 缺少 KnowledgeBusy');
if (!read('src/client/layers/import-export.ts').includes('ImportExportBusy')) fail('import-export 缺少 ImportExportBusy');

// Part 2 — OpsContext 窄化。
const context = read('src/client/ops/context.ts');
if (!context.includes('export interface OpsRuntime')) fail('缺少 OpsRuntime');
if (!context.includes('export interface OpsPorts')) fail('缺少 OpsPorts');
if (context.includes('export interface OpsContext')) fail('完整 OpsContext 仍存在');
const opsFiles = ['canon', 'state', 'worldview', 'relationship', 'characters', 'import-export', 'knowledge', 'outline',
  'progress', 'queue', 'review', 'rule-style', 'search', 'statistics', 'timeline', 'chapters-editor', 'chapters-branch', 'chapters-candidate'];
for (const file of opsFiles) {
  const text = read(`src/client/ops/${file}.ts`);
  if (!/create\w+Ops\(runtime: OpsRuntime, port: \w+Port/.test(text)) fail(`ops/${file}.ts 未按 OpsRuntime + 窄 port 签名`);
  if (text.includes('OpsContext')) fail(`ops/${file}.ts 仍引用完整 OpsContext`);
  if (text.includes('Pick<OpsPorts') && !text.includes("type ") ) fail(`ops/${file}.ts port 类型未声明`);
}

// Part 3 — workspace-service 收敛。
const workspace = read('src/host/workspace-service.ts');
if (!workspace.includes('export interface WorkspaceEditorDeps')) fail('缺少 WorkspaceEditorDeps');
if (!/createWorkspaceEditorService\(deps: WorkspaceEditorDeps\)/.test(workspace)) fail('createWorkspaceEditorService 未收敛为 deps 对象');

// Part 4 — 并行断言 + 行为等价。
if (!read('src/client-panels-statistics.test.ts').includes('I101：并行子工作流互不阻塞')) fail('缺少 I101 并行断言用例');
const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/client-panels-statistics.test.ts', 'src/client-panels-knowledge.test.ts', 'src/client-panels-import-export.test.ts', 'src/client-layers.test.ts', 'src/client-panels-progress.test.ts', 'src/client-shell-workbench.test.ts', 'src/editor-remote.test.ts', 'src/host/workspace-service.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`I101 相关单测未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2000)}`);

console.log('I101 smoke: 单 acting 归零（三层 busy 独立）+ OpsContext→OpsRuntime/窄 port + workspace-service deps 收敛 + 并行断言 + 既有测试全绿');
