import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I96 五层写回阶段合同类型化 smoke（review v2.0 §8#1 / 计划 §18 I96）。
 *
 * 交付物核验：
 * - 接线层 unknown 归零：src 下无 `LifecycleWriters<unknown>` /
 *   `executeLifecycle<unknown>` / `LifecycleResult<unknown>` /
 *   `LifecycleParsers<unknown>`（grep 断言）；
 * - 类型按层流动：core/lifecycle 的 LifecycleOutputs 按层映射 + 映射类型
 *   writers/parsers（grep 断言）；five-layer-writeback 的 buildFiveLayerWriters
 *   返回五层 parser 输出类型且无 `as C2StateParserOutput` 断言（grep 断言）；
 * - 正/负 tsc 夹具：matching 编译通过；b2 writer 形状漂移编译失败且报错定位在
 *   夹具文件；
 * - 行为等价：五层写回/裁决/lifecycle 相关测试全绿。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I96 smoke: ${msg}`); };

const lifecycle = read('src/core/lifecycle/index.ts');
const fiveLayer = read('src/host/five-layer-writeback.ts');

if (lifecycle.includes('LifecycleWriters<unknown>') || lifecycle.includes('LifecycleParsers<unknown>')) {
  fail('core/lifecycle 仍存在 unknown 统一 T');
}
if (!/LifecycleOutputs<TC2, TC1, TC3, TC4, TB2>/.test(lifecycle)) fail('LifecycleOutputs 按层映射缺失');
if (!/\[K in LifecycleStage\]: \(output: LifecycleOutputs</.test(lifecycle)) fail('LifecycleWriters 未按 stage 映射类型化');
if (!/LifecycleWriters<C2StateParserOutput, C1RelationshipParserOutput, C3KnowledgeParserOutput, C4CanonParserOutput, B2WorldviewParserOutput>/.test(fiveLayer)) {
  fail('buildFiveLayerWriters 未返回五层类型化的 LifecycleWriters');
}
for (const cast of ['output as C2StateParserOutput', 'output as C1RelationshipParserOutput', 'output as C3KnowledgeParserOutput', 'output as C4CanonParserOutput', 'output as B2WorldviewParserOutput']) {
  if (fiveLayer.includes(cast)) fail(`five-layer-writeback 仍含类型断言：${cast}`);
}
// 生产接线零 unknown（core/host 全量扫描）。
const { readdirSync } = await import('node:fs');
const { join } = await import('node:path');
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [full] : [];
});
const allSource = [...walk(resolve(repoRoot, 'src/core')), ...walk(resolve(repoRoot, 'src/host'))].map((p) => read(p)).join('\n');
for (const pattern of ['LifecycleWriters<unknown>', 'executeLifecycle<unknown>', 'LifecycleResult<unknown>', 'LifecycleParsers<unknown>']) {
  if (allSource.includes(pattern)) fail(`生产接线仍含 ${pattern}`);
}

const tscArgs = ['exec', 'tsc', '--noEmit', '--strict', '--skipLibCheck', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--types', 'node', 'src/types/js-yaml.d.ts'];
const fixture = 'scripts/fixtures/i96-positive.ts';
const positive = spawnCaptured('pnpm', [...tscArgs, fixture], { cwd: repoRoot, encoding: 'utf8' });
if (positive.status !== 0) fail(`positive tsc fixture must compile (exit ${positive.status}):\n${(positive.output || positive.stderr).slice(0, 1200)}`);
const negative = spawnCaptured('pnpm', ['exec', 'tsc', '--noEmit', '--strict', '--skipLibCheck', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', '--types', 'node', 'src/types/js-yaml.d.ts', 'scripts/fixtures/i96-negative.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (negative.status === 0) fail('negative tsc fixture must FAIL to compile (b2 writer shape drift)');
if (!negative.output.includes('scripts/fixtures/i96-negative.ts')) fail(`negative fixture failure must be located in the fixture:\n${negative.output.slice(0, 800)}`);

const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/host/five-layer-writeback.test.ts', 'src/host/writing-adjudication-service.test.ts', 'src/host/text-edit-service.test.ts', 'src/host/edit-service.test.ts', 'src/host/story-lifecycle-service.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`裁决/写回相关单测未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2000)}`);

console.log('I96 smoke: 接线层 unknown 归零 + 按层映射类型 + 正/负夹具（b2 漂移编译错）+ 裁决/写回单测全绿');
