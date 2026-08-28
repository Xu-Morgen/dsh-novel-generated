import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I93 LLM 批量 apply 事务化（UoW）smoke（review v2.0 §8#6 / 计划 §18 I93）。
 *
 * 交付物核验：
 * - canon：CanonLedger.appendBatch（单次写入 + 全成功才提交），
 *   applyC4CanonOperations 经 appendBatch 提交（grep 断言）；
 * - worldview：WorldRepository.rewriteBatch（先校验后写盘 + 失败补偿），
 *   applyAcceptedB2WorldviewSupersedeOperations 经 rewriteBatch 提交（grep 断言）；
 * - split：applyAcceptedSplitCandidates 先 planSplitApply（纯准备零写）再
 *   commitSplitApply，含幂等重放（grep 断言）；
 * - 负向用例在案：canon/worldview/split 三个测试文件各含 I93 负向/重试用例
 *   （grep 断言）；
 * - 行为等价：三个 parser 测试文件 + 三个 core 仓储测试全绿（一致输入行为不变）。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I93 smoke: ${msg}`); };

const canon = read('src/core/canon/index.ts');
const canonParse = read('src/llm/parse/canon.ts');
const worldview = read('src/core/worldview/index.ts');
const worldviewParse = read('src/llm/parse/worldview.ts');
const split = read('src/llm/parse/split.ts');

if (!/appendBatch\(inputs: readonly CanonEventInput\[\]/.test(canon)) fail('CanonLedger 缺少 appendBatch 批量原语');
if (!/appendFile\(this\.filePath, events\.map/.test(canon)) fail('appendBatch 未以单次 appendFile 写入整批');
if (!/ledger\.appendBatch\(/.test(canonParse)) fail('applyC4CanonOperations 未经 appendBatch 提交');
if (!/rewriteBatch\(/.test(worldview) || !/prepareRewriteBatch/.test(worldview)) fail('WorldRepository 缺少 rewriteBatch/prepareRewriteBatch');
if (!/repository\.rewriteBatch\(/.test(worldviewParse)) fail('applyAcceptedB2WorldviewSupersedeOperations 未经 rewriteBatch 提交');
if (!/planSplitApply\(/.test(split) || !/commitSplitApply\(/.test(split)) fail('split apply 缺少 plan/commit 两段式 UoW');
if (!/equalsSplitOutline\(/.test(split) || !/重放/.test(split)) fail('split 缺少幂等重放（outline 已存在不误报）');

for (const [file, marker] of [
  ['src/llm/parse/canon.test.ts', 'mid-batch event shape failure'],
  ['src/llm/parse/worldview.test.ts', 'mid-batch write failure'],
  ['src/llm/parse/split.test.ts', 'retries an accepted split proposal idempotently'],
]) {
  if (!read(file).includes(marker)) fail(`${file} 缺少 I93 负向/重试用例（${marker}）`);
}

const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/llm/parse/canon.test.ts', 'src/llm/parse/worldview.test.ts', 'src/llm/parse/split.test.ts', 'src/core/canon/index.test.ts', 'src/core/worldview/index.test.ts', 'src/core/outline/index.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`I93 相关单测未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2000)}`);

console.log('I93 smoke: canon/worldview/split UoW（prepare 先校验 + 单次/补偿提交 + split 幂等重放）+ 负向用例 + 既有行为等价单测全绿');
