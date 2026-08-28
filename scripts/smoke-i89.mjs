import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Context } from '@deepseek-ai/cordis';
import { apply } from '../lib/index.js';

/**
 * I89 index.ts 组合根分段 smoke（review v2.0 §3.4 / 计划 §18 I89）。
 *
 * Part 0 — 静态负向扫描（验收）：
 * - 单 apply 行数护栏：src/index.ts 的 apply 函数体 ≤ 40 行（拆分前 470+）；
 * - src/index.ts import 数护栏（拆分前 65 个）；
 * - `.catch(() => undefined)` 静默吞错在生产组合源码归零；
 * - onboarding→timeline 副流程为显式钩子（management.ts 的
 *   ensureTimelineAfterOnboarding + logger.warn）；
 * - 统计 wire 形状转换外移为显式命名适配器（orchestration.ts 的
 *   sceneCardsWireAdapter/tasksWireAdapter）；
 * - 三段组装函数定义唯一且 index.ts 依序调用。
 * Part 1 — lib 产物装配等价：真实 boot 组合根，抽样断言三段服务均被提供
 *   （基础段 novelText / 管理段 novelWritingAdjudication / 编排段 novelStatistics
 *   与 novelAgent），卸载后消失（Fiber 归属不变）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I89 smoke: ${msg}`); };

const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});
const countIn = (p, fragment) => codeLines(p).filter((line) => line.includes(fragment)).length;

// Part 0 — 静态负向扫描。
{
  const index = codeLines('src/index.ts');
  const allComposition = ['src/index.ts', 'src/host/composition/base.ts', 'src/host/composition/management.ts', 'src/host/composition/orchestration.ts']
    .flatMap((p) => codeLines(p));

  // 单 apply 行数护栏：apply 函数体（首个 `export function apply` 到文件尾）。
  const applyStart = index.findIndex((line) => line.includes('export function apply('));
  if (applyStart < 0) fail('src/index.ts 缺少 apply');
  const applyBody = index.slice(applyStart).filter((line) => line.trim() !== '' && line.trim() !== '}').length;
  if (applyBody > 40) fail(`单 apply 行数护栏失败：${applyBody} 行（应 ≤ 40）`);

  // import 数护栏：index.ts 顶层 import 语句（拆分前 65 个）。
  const imports = index.filter((line) => line.startsWith('import ')).length;
  if (imports > 10) fail(`src/index.ts import 数护栏失败：${imports} 个（应 ≤ 10）`);

  // `.catch(() => undefined)` 静默吞错归零（生产组合源码）。
  const silentCatches = allComposition.filter((line) => line.includes('.catch(() => undefined)')).length;
  if (silentCatches !== 0) fail(`生产组合源码仍含 ${silentCatches} 处 .catch(() => undefined) 静默吞错`);

  // onboarding→timeline 副流程显式化。
  if (!countIn('src/host/composition/management.ts', 'ensureTimelineAfterOnboarding')) fail('management.ts 缺少 ensureTimelineAfterOnboarding 显式钩子');
  if (!countIn('src/host/composition/management.ts', 'logger.warn(')) fail('management.ts 时间线副流程缺少显式 logger');

  // 统计 wire 形状转换外移为显式命名适配器。
  if (!countIn('src/host/composition/orchestration.ts', 'sceneCardsWireAdapter')) fail('orchestration.ts 缺少 sceneCardsWireAdapter');
  if (!countIn('src/host/composition/orchestration.ts', 'tasksWireAdapter')) fail('orchestration.ts 缺少 tasksWireAdapter');

  // 三段组装函数定义唯一且依序调用。
  for (const fn of ['assembleBaseServices', 'assembleManagementSurface', 'assembleOrchestrationSurface']) {
    const defined = countIn(`src/host/composition/${fn === 'assembleBaseServices' ? 'base' : fn === 'assembleManagementSurface' ? 'management' : 'orchestration'}.ts`, `export function ${fn}(`);
    if (defined !== 1) fail(`${fn} 定义必须唯一`);
  }
  const order = index.map((line) => line.match(/assemble(BaseServices|ManagementSurface|OrchestrationSurface)\(/)?.[0]).filter(Boolean);
  if (order.join(',') !== 'assembleBaseServices(,assembleManagementSurface(,assembleOrchestrationSurface(') {
    fail(`三段组装调用顺序错误：${order.join(',')}`);
  }
}

// Part 1 — lib 产物装配等价。
{
  const ctx = new Context();
  const fiber = await ctx.plugin(apply);
  try {
    const assertProvided = (key) => {
      if (ctx.get(key, false) === undefined) fail(`拆分后服务 ${key} 未提供`);
    };
    // I1 状态 + 基础段 / 管理段 / 编排段各抽一个。
    if (ctx.get('novelCreation', false)?.version !== '2.0.0') fail('novelCreation 状态缺失');
    assertProvided('novelText');
    assertProvided('novelWritingAdjudication');
    assertProvided('novelStatistics');
    assertProvided('novelAgent');
    assertProvided('novelWorkspace');
    assertProvided('novelTimeline');
  } finally {
    await fiber.dispose();
  }
  if (ctx.get('novelText', false) !== undefined) fail('Fiber 卸载后基础段服务未回收');
  console.log('I89 smoke: 静态（apply 行数/import 护栏、静默吞错归零、副作用显式化、三段依序调用）+ lib 装配等价 通过');
}
