import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I92 双导航真相一致性校验 smoke（review v2.0 §8#3 / 计划 §18 I92）。
 *
 * 交付物核验：
 * - assembly 记录 navigation：core/pipeline/index.ts 的 StoryContextAssembly
 *   带 `navigation` 字段并在 assembleStoryContext 返回（grep 断言）；
 * - 一致性校验存在：write/continuation.ts 导出 assertNavigationConsistent 且
 *   buildContinuationPrompt 首行调用它（grep 断言）；
 * - 负向测试在案：continuation.test.ts 含 forked-view 拒绝用例（grep 断言）；
 * - 行为等价：运行 continuation 单测 + pipeline 单测（一致输入行为不变）。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I92 smoke: ${msg}`); };

const pipeline = read('src/core/pipeline/index.ts');
const continuation = read('src/write/continuation.ts');
const test = read('src/write/continuation.test.ts');

if (!/readonly navigation: OutlineNavigation/.test(pipeline)) fail('StoryContextAssembly 未记录 navigation 字段');
if (!/navigation: sources\.navigation/.test(pipeline)) fail('assembleStoryContext 未把 sources.navigation 写入 assembly 返回值');
if (!/export function assertNavigationConsistent/.test(continuation)) fail('write/continuation.ts 未导出 assertNavigationConsistent');
if (!/assertNavigationConsistent\(context, navigation\)/.test(continuation)) fail('buildContinuationPrompt 未在入口调用一致性校验');
if (!/Navigation mismatch: assembled context outline and explicit navigation diverge/.test(continuation)) fail('校验失败未 fail loudly（无明确拒绝消息）');
if (!/forked view/.test(test)) fail('continuation.test.ts 缺少分叉视图负向用例');

const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/write/continuation.test.ts', 'src/core/pipeline/index.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`continuation/pipeline 单测未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2000)}`);

console.log('I92 smoke: assembly 记录 navigation + 一致性校验 fail loudly + 分叉负向用例 + 一致输入单测全绿');
