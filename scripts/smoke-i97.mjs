import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I97 Remote editor 请求合同精确化 smoke（review v2.0 §8#2 / 计划 §18 I97）。
 *
 * 交付物核验：
 * - editor 写方法 wire 请求不再走通用 json codec：characterCreate/Update、
 *   worldviewCreate/Rewrite、outlineSave、relationshipSave、
 *   canonCorrectionPropose 全部携带精确 strictCodec schema（grep 断言）；
 * - 精确 schema 存在：editor.ts 导出 characterCoreInputWireSchema 等 6 个
 *   wire 输入 schema（grep 断言）；
 * - 非法请求在 wire 边界拒绝：editor-remote.test.ts 含 I97 负向用例
 *   （parse 拒绝缺必填/未知字段，grep + 运行）；
 * - 行为等价：editor/workspace/client 相关 wire 测试全绿（含既有断言更新）。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I97 smoke: ${msg}`); };

const editor = read('src/host/remote/editor.ts');
for (const schema of ['characterCoreInputWireSchema', 'characterPatchWireSchema', 'worldEntryInputWireSchema', 'outlineInputWireSchema', 'relationshipInputWireSchema', 'canonCorrectionInputWireSchema']) {
  if (!editor.includes(`export const ${schema}`)) fail(`editor.ts 缺少精确 wire schema：${schema}`);
}
const writes = [
  ['characterCreate', 'characterCoreInputWireSchema'],
  ['characterUpdate', 'characterPatchWireSchema'],
  ['worldviewCreate', 'worldEntryInputWireSchema'],
  ['worldviewRewrite', 'worldEntryInputWireSchema'],
  ['outlineSave', 'outlineInputWireSchema'],
  ['relationshipSave', 'relationshipInputWireSchema'],
  ['canonCorrectionPropose', 'canonCorrectionInputWireSchema'],
];
for (const [method, schema] of writes) {
  const line = editor.split('\n').find((l) => l.includes(`'${method}'`) && l.includes('editorInvocation'));
  if (!line) fail(`editor.ts 缺少 ${method} 调用`);
  if (!line.includes(schema)) fail(`${method} 未携带精确 schema ${schema}`);
  if (line.includes('param(\'input\')') || line.includes('param(\'patch\')')) fail(`${method} 仍走默认 json codec`);
}
const test = read('src/editor-remote.test.ts');
if (!test.includes('I97 expresses the exact write request contract')) fail('editor-remote.test.ts 缺少 I97 wire 负向用例');

const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/editor-remote.test.ts', 'src/workspace-remote.test.ts', 'src/remote.test.ts', 'src/client-layers.test.ts', 'src/client-contract.test.ts', 'src/client-shape-contract.test.ts', 'src/host/remote/shared.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`wire/editor 相关单测未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2000)}`);

console.log('I97 smoke: editor 写入口 7 方法全部精确 wire schema（json codec 归零）+ 非法请求 wire 边界拒绝 + 既有 wire 测试全绿');
