import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I98 extensions store schema 校验落地 smoke（review v2.0 §8#4 / 计划 §18 I98）。
 *
 * 交付物核验：
 * - store 层 schema resolver：ExtensionLayerStore 构造注入 resolveSchema，save
 *   写前 parse、load 读后 parse（grep 断言）；
 * - extension-service 注入按 layerId 解析 provider schema 的 resolver（grep 断言）；
 * - 负向用例在案：写前非法内容零写 + 绕过 save 直写非法 YAML 读后被拒（grep +
 *   运行 extension-service.test.ts）；
 * - 行为等价：既有 extension 测试全绿。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I98 smoke: ${msg}`); };

const store = read('src/extensions/store.ts');
const service = read('src/host/extension-service.ts');
if (!/resolveSchema: \(layerId: string\) => ZodType<unknown>/.test(store)) fail('ExtensionLayerStore 缺少 schema resolver 注入点');
if (!/this\.resolveSchema\(id\)\.parse\(value\)/.test(store)) fail('save 缺少写前 schema 校验');
if (!/this\.resolveSchema\(id\)\.parse\(raw\)/.test(store)) fail('load 缺少读后 schema 校验');
if (!/\(layerId\) => providerFor\(layerId\)\.schema/.test(service)) fail('extension-service 未注入按 layerId 解析的 resolver');
const test = read('src/host/extension-service.test.ts');
if (!test.includes('I98 rejects invalid layer content at the store write-before / read-after boundary')) fail('extension-service.test.ts 缺少 I98 负向用例');

const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/host/extension-service.test.ts', 'src/extensions/registry.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`extension 测试未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2000)}`);

console.log('I98 smoke: store 层 schema resolver + 写前/读后校验 + 非法内容负向（零写/读拒）+ 既有测试全绿');
