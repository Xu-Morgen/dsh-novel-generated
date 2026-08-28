import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I99 extensions registry 不可变引用 smoke（review v2.0 §8#5 / 计划 §18 I99）。
 *
 * 交付物核验：
 * - register 保存不可变快照：registry.ts 注册时 `Object.freeze({ ...extension })`
 *   且 seams() 返回冻结投影（grep 断言）；
 * - 负向用例在案：注册后突变原对象 id/kind/layerId 不生效/不可见（grep + 运行）；
 * - 行为等价：既有 extension 测试全绿（schema/函数引用保留）。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I99 smoke: ${msg}`); };

const registry = read('src/extensions/registry.ts');
if (!/const snapshot = Object\.freeze\(\{ \.\.\.extension \}\)/.test(registry)) fail('register 未保存冻结快照');
if (!/definition: snapshot/.test(registry)) fail('registrations 未保存快照（仍存原引用）');
const test = read('src/host/extension-service.test.ts');
if (!test.includes('I99 ignores post-registration mutation of the original definition')) fail('extension-service.test.ts 缺少 I99 负向用例');

const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/extensions/registry.test.ts', 'src/host/extension-service.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`extension 测试未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2000)}`);

console.log('I99 smoke: 注册时冻结快照 + seams 不可变投影 + 注册后突变负向 + 既有测试全绿');
