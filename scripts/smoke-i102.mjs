import { spawnCaptured } from './spawn-captured.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I102 onboarding BindingSchema / extension kind 单一 descriptor 表 / prompt 示例
 * 类型化 smoke（review v2.0 §6 / 计划 §18 I102）。
 *
 * 交付物核验：
 * - projectId/session/sourceHash 与六层 enum 重列归零：onboarding 合同只经
 *   onboarding-binding.ts 的单一 schema（grep 断言）；
 * - extension kind 单一 descriptor 表：registry.ts 只有 EXTENSION_KIND_DESCRIPTORS
 *   一个 kind 定义点，categoryByKind/keysByKind 删除，seams/validate 由表派生
 *   （grep 断言）；
 * - prompt 示例单点化：六个 parse 模块各有导出的 *_PROMPT_EXAMPLE 常量且 prompt
 *   引用常量（grep 断言）；example.ts 字面量类型化为 OnboardingAnalysisOutput；
 * - 行为等价：prompt 示例键集一致性夹具 + parse/onboarding 相关测试全绿
 *   （含样本回归阈值）。
 */
const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I102 smoke: ${msg}`); };

// Part 1 — onboarding 绑定单点化。
const binding = read('src/core/schema/onboarding-binding.ts');
if (!binding.includes('export const onboardingProjectIdSchema = entityIdSchema')) fail('projectId 未复用 entityIdSchema');
if (!binding.includes('export const onboardingLayerSchema = z.enum')) fail('六层 enum 未单点化');
if (!binding.includes('export const onboardingBindingSchema')) fail('缺少 BindingSchema');
for (const file of ['src/core/schema/onboarding-analysis.ts', 'src/core/schema/onboarding-adjudication.ts']) {
  const text = read(file);
  if (text.includes('z.enum([\'characters\'')) fail(`${file} 重列六层 enum`);
  if (text.includes('projectId: z.string().min(1).max(64)')) fail(`${file} 重列 projectId`);
}
const adjudication = read('src/core/schema/onboarding-adjudication.ts');
for (const marker of ['onboardingSessionId: z.string().min(1)', 'sourceHash: z.string().regex(/^[0-9a-f]{64}$/)']) {
  if (adjudication.includes(marker)) fail(`adjudication 片重列绑定字段：${marker}`);
}

// Part 2 — extension 单一 descriptor 表。
const registry = read('src/extensions/registry.ts');
if (!registry.includes('export const EXTENSION_KIND_DESCRIPTORS')) fail('缺少单一 kind descriptor 表');
if (registry.includes('categoryByKind')) fail('未使用的 categoryByKind 未删除');
if (registry.includes('keysByKind')) fail('keysByKind 未由表取代');
if (!registry.includes('const descriptorFor =')) fail('缺少 descriptor 查找');
if (registry.includes('switch (extension.kind)')) fail('validateDefinition 仍用手写 switch');
const tableSlice = registry.slice(registry.indexOf('EXTENSION_KIND_DESCRIPTORS'), registry.indexOf('] as const'));
if ((tableSlice.match(/kind: '/g) ?? []).length !== 6) fail('descriptor 表应有 6 个 kind');

// Part 3 — prompt 示例单点化。
for (const [file, constant] of [
  ['canon.ts', 'C4_PROMPT_EXAMPLE'], ['worldview.ts', 'B2_PROMPT_EXAMPLE'], ['state.ts', 'C2_PROMPT_EXAMPLE'],
  ['relationship.ts', 'C1_PROMPT_EXAMPLE'], ['knowledge.ts', 'C3_PROMPT_EXAMPLE'], ['split.ts', 'SPLIT_PROMPT_EXAMPLE'],
]) {
  const text = read(`src/llm/parse/${file}`);
  if (!text.includes(`export const ${constant} =`)) fail(`${file} 缺少 ${constant} 常量`);
  if (!text.includes(`    ${constant},`)) fail(`${file} prompt 未引用 ${constant}`);
}
const example = read('src/core/onboarding/example.ts');
if (!example.includes('ONBOARDING_PROMPT_EXAMPLE: OnboardingAnalysisOutput')) fail('example.ts 字面量未类型化为 OnboardingAnalysisOutput');

// Part 4 — 键集一致性夹具 + 行为等价（含样本回归）。
const fixture = read('src/llm/parse/prompt-example.test.ts');
if (!fixture.includes('I102 prompt 示例与 zod schema 键集一致')) fail('缺少 prompt 示例键集一致性夹具');
const unit = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/llm/parse/prompt-example.test.ts', 'src/llm/parse/canon.test.ts', 'src/llm/parse/worldview.test.ts', 'src/llm/parse/state.test.ts', 'src/llm/parse/relationship.test.ts', 'src/llm/parse/knowledge.test.ts', 'src/llm/parse/split.test.ts', 'src/core/onboarding/analyzer.test.ts', 'src/host/onboarding-analyzer-service.test.ts', 'src/host/onboarding-adjudication-service.test.ts', 'src/extensions/registry.test.ts', 'src/host/extension-service.test.ts'], { cwd: repoRoot, encoding: 'utf8' });
if (unit.status !== 0) fail(`I102 相关单测未全绿 (exit ${unit.status}):\n${unit.output.slice(0, 2000)}`);

console.log('I102 smoke: 绑定/六层 enum 单点化（重列归零）+ extension 单一 descriptor 表 + prompt 示例常量与键集夹具 + 样本回归全绿');
