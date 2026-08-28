import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I90 client.ts 拆 controllers/presenter smoke（review v2.0 §3.5 / 计划 §18 I90）。
 *
 * Part 0 — 静态负向扫描（验收）：
 * - Remote 资源清单单份维护：mount-registry.ts 含唯一 registry 声明数组
 *   （16 项 serviceKey，卡片称「15 个 namespace」为笔误，枚举清单与迁移前实测
 *   均为 16）；client.ts 不再有 `mountRemote<` 调用与 `xxxDisposer` 变量声明；
 * - `$mount` 块归零：client.ts 不含 `.remote.$mount(` / `$mount(`；
 * - 行数护栏：client.ts ≤ 500 行（按 \n 计数）；
 * - workbenchView 形参收敛：presenter.ts 的 workbenchView 签名含
 *   `WorkbenchViewProps` 对象参数（21 形参 → 2 形参 + props 对象）；
 * - 入口契约保留：client.ts 仍 re-export NAV/PANEL 常量（client.test.ts 锚点）。
 * Part 1 — lib 产物抽查：lib/client.js 含既有 data-novel-* 锚点（随机抽 5 个，
 *   锚点池覆盖 项目目录/六层分析/正文场景/上传/审阅 等既有契约）。
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I90 smoke: ${msg}`); };

// Part 0 — 静态负向扫描。
{
  const client = read('src/client.ts');
  const registry = read('src/client/mount-registry.ts');
  const presenter = read('src/client/presenter.ts');
  const lines = client.split('\n');

  // Remote 资源清单单份维护（review v2.0 §3.5）。
  const registryEntries = (registry.match(/serviceKey: 'remote\.novel/g) ?? []).length;
  if (registryEntries !== 16) fail(`mount-registry.ts registry 声明数组应为 16 项，实测 ${registryEntries}`);
  if (!registry.includes('new Set<')) fail('mount-registry.ts 缺少内部 disposer Set<TypertDisposer>');
  // mountRemote< 是 I83 参数化工厂的类型化调用形态（旧 client.ts 16 处）；
  // mountRemoteRegistry 是 I90 声明式 registry，允许存在。
  if (client.includes('mountRemote<') || client.includes('mountRemote(')) fail('client.ts 仍含 mountRemote 调用（应只在 mount-registry.ts）');
  // 16 个 Remote disposer 变量（remoteDisposer/onboardingDisposer/.../timelineDisposer）
  // 归入 registry 内部 Set；slotDisposer（slot 注册 disposer）是装配生命周期的一部分，允许保留。
  const remoteDisposerVars = client.match(/\b(remote|onboarding|analyzer|llmConfig|workbenchSettings|writing|review|queue|knowledge|ruleStyle|progress|importExport|branch|search|statistics|timeline)Disposer\b/g) ?? [];
  if (remoteDisposerVars.length !== 0) fail(`client.ts 仍含 ${remoteDisposerVars.join('、')} Remote disposer 变量声明（应归入 registry disposer Set）`);
  if (client.includes("serviceKey: 'remote.novel")) fail('client.ts 仍平行声明 Remote serviceKey（应只在 mount-registry.ts）');

  // `$mount` 块归零。
  if (client.includes('$mount')) fail('client.ts 仍含 $mount 调用（应只在 mount.ts 工厂内部）');

  // 行数护栏 + 入口契约。
  if (lines.length > 500) fail(`client.ts 行数护栏失败：${lines.length} 行（应 ≤ 500）`);
  if (!client.includes('export { NAV_WIDTH_MIN')) fail('client.ts 丢失 NAV/PANEL 常量 re-export（client.test.ts 契约）');

  // workbenchView 形参收敛（21 形参 → props 对象）。
  const viewSignature = presenter.match(/function workbenchView\([^)]*\)/)?.[0];
  if (viewSignature === undefined || !viewSignature.includes('props: WorkbenchViewProps')) {
    fail(`presenter.ts workbenchView 未收敛为 (React, props: WorkbenchViewProps)：${viewSignature ?? '签名缺失'}`);
  }
}

// Part 1 — lib 产物抽查（5 个既有 data-novel-* 锚点，随机抽）。
{
  let clientBundle;
  try {
    clientBundle = read('lib/client.js');
  } catch {
    fail('lib/client.js 缺失（先运行 pnpm run build）');
  }
  const anchorPool = [
    'data-novel-project-create',
    'data-novel-onboarding-start',
    'data-novel-scene-save',
    'data-novel-upload-input',
    'data-novel-workspace',
    'data-novel-project-open',
    'data-novel-onboarding-apply',
    'data-novel-llm-save',
    'data-novel-view-panel',
    'data-novel-directory-review',
  ];
  const sampled = [...anchorPool].sort(() => Math.random() - 0.5).slice(0, 5);
  for (const anchor of sampled) {
    if (!clientBundle.includes(anchor)) fail(`lib/client.js 缺失既有锚点 ${anchor}`);
  }
  console.log(`I90 smoke: 静态（registry 单份维护 / \$mount 归零 / client.ts ${read('src/client.ts').split('\n').length} 行护栏 / workbenchView props 收敛）+ lib 产物锚点抽查 ${sampled.join('、')} 通过`);
}
