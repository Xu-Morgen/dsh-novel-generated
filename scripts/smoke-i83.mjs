import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I83 client.ts 拆分（二）面板注册表、mount 与测试 harness smoke（架构审查
 * §4.1/§4.2 / §9 #5；重构纪律 §16-2 行为等价）。
 *
 * 交付物核验：
 * - 面板注册表：src/client/panels/index.ts —— viewPanel 16 分支 if 链收敛为
 *   PANEL_REGISTRY（13 个非层视图键）+ contentArea 层兜底；client.ts 不再定义
 *   viewPanel/contentArea。
 * - mount 收敛：src/client/mount.ts 的 mountRemote 是 `$mount` 唯一实现；
 *   client.ts 无任何 `$mount(` 内联调用，16 个 Remote 全部经参数化规格声明。
 * - styles 分区：src/client/styles/ 下 tokens + 8 个按键分区；styles.ts 只做
 *   组合与 token re-export；构建产物 WORKBENCH_STYLES 携带各分区规则。
 * - 测试拆分：client.test.ts 删除；共享 harness 抽取（src/client/test-harness.ts
 *   mount/flush/collect/cleanup）；6 个拆分测试文件共 30 个 describe（锚点不变，
 *   137 条断言由 verify 链 `pnpm test` 覆盖）。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I83 smoke: ${msg}`); };

/** 过滤注释行，只留代码行做 grep 断言。 */
const codeLines = (p) => read(p).split('\n').filter((line) => {
  const t = line.trim();
  return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
});

// Part 1 — 面板注册表：viewPanel 收敛 + 13 个非层视图键 + 层兜底。
{
  const panels = read('src/client/panels/index.ts');
  const client = read('src/client.ts');
  if (!panels.includes('const PANEL_REGISTRY')) fail('panels/index.ts missing PANEL_REGISTRY');
  if (!panels.includes('export function viewPanel(')) fail('panels/index.ts missing viewPanel dispatcher');
  // 13 个非层视图注册键（I58 任务导航 + I60 正文 + I64 审校 + I65 队列 +
  // I66 知情 + I67 规则文风 + I68 进度 + I69 导入导出 + I71 搜索 + I72 统计 +
  // 时间线 + 设置 + 创作设置 + 六层初始化）。
  for (const view of ['settings', 'creationSettings', 'onboarding', 'chapters', 'review', 'queue',
    'knowledge', 'ruleStyle', 'progress', 'importExport', 'search', 'statistics', 'timeline']) {
    if (!panels.includes(`${view}: (`) && !panels.includes(`  ${view}: `)) fail(`panels registry missing ${view} entry`);
  }
  // 层兜底：contentArea 留在注册表模块，client.ts 不再持有视图分发。
  if (!panels.includes('function contentArea(')) fail('panels/index.ts missing contentArea layer fallback');
  if (codeLines('src/client.ts').some((line) => line.includes('function viewPanel(') || line.includes('function contentArea('))) {
    fail('client.ts 残留 viewPanel/contentArea 定义（应迁至 panels/index.ts）');
  }
  console.log('I83 Part 1: 面板注册表 OK（PANEL_REGISTRY + 13 非层视图键 + contentArea 层兜底，client.ts 零残留）');
}

// Part 2 — $mount 块重复归零：mountRemote 唯一实现 + 16 个声明式规格。
{
  const mount = read('src/client/mount.ts');
  const client = read('src/client.ts');
  const mountImpls = codeLines('src/client/mount.ts').filter((line) => line.includes('export function mountRemote'));
  if (mountImpls.length !== 1) fail(`mount.ts 应有恰好 1 个 mountRemote 实现，实际 ${mountImpls.length}`);
  if (!mount.includes('export interface RemoteMount<T>')) fail('mount.ts missing RemoteMount spec type');
  // client.ts 不再内联 $mount：16 个同构块收敛为 mountRemote 调用。
  const inlineMounts = codeLines('src/client.ts').filter((line) => line.includes('$mount('));
  if (inlineMounts.length > 0) fail(`client.ts 残留 ${inlineMounts.length} 处内联 $mount 调用`);
  // 16 个 Remote 全部经声明式规格挂载（contribution + serviceKey 一一对应，
  // I90 起清单收敛到 mount-registry.ts 的 mountRemoteRegistry 数组）。
  const contributions = ['workspaceRemoteContribution', 'onboardingAnalyzerRemoteContribution', 'onboardingRemoteContribution', 'llmConfigRemoteContribution',
    'workbenchSettingsRemoteContribution', 'writingRemoteContribution', 'reviewRemoteContribution', 'queueRemoteContribution', 'knowledgeRemoteContribution',
    'ruleStyleRemoteContribution', 'progressRemoteContribution', 'importExportRemoteContribution', 'branchRemoteContribution', 'searchRemoteContribution',
    'statisticsRemoteContribution', 'timelineRemoteContribution'];
  const serviceKeys = ['remote.novelWorkspace', 'remote.novelOnboardingAnalyzer', 'remote.novelOnboarding', 'remote.novelLlmConfig',
    'remote.novelWorkbenchSettings', 'remote.novelWriting', 'remote.novelReview', 'remote.novelQueue', 'remote.novelKnowledgeManager',
    'remote.novelRuleStyleManager', 'remote.novelOutlineProgress', 'remote.novelImportExport', 'remote.novelBranches', 'remote.novelSearch',
    'remote.novelStatistics', 'remote.novelTimeline'];
  const registry = read('src/client/mount-registry.ts');
  const registryBody = codeLines('src/client/mount-registry.ts').join('\n');
  if (registryBody.match(/mountRemote\(ctx, entry\)/g)?.length !== 1) fail('mount-registry 应恰好 1 处 mountRemote 调用');
  for (const contribution of contributions) {
    if (!registry.includes(contribution)) fail(`mount-registry 缺少 ${contribution}`);
  }
  for (const serviceKey of serviceKeys) {
    if (!registry.includes(serviceKey)) fail(`mount-registry 缺少 ${serviceKey}`);
  }
  // 声明式规格唯一：registry 条目（serviceKey:）共 16 项。
  const registryEntries = registryBody.match(/serviceKey: 'remote\.[A-Za-z]+'/g) ?? [];
  if (registryEntries.length !== 16) fail(`mount-registry 应有 16 个声明式规格，实际 ${registryEntries.length}`);
  for (const contribution of contributions) {
    if (!registry.includes(contribution)) fail(`mount-registry 规格缺失 ${contribution}`);
  }
  for (const key of serviceKeys) {
    if (!registry.includes(`'${key}'`)) fail(`mount-registry 规格缺失 serviceKey ${key}`);
  }
  console.log(`I83 Part 2: $mount 块重复归零 OK（mount.ts 唯一 mountRemote 实现；mount-registry.ts 16 个声明式规格，内联 $mount 归零）`);
}

// Part 3 — styles 按键分区：tokens + 8 分区 + 组合器；构建产物携带全部规则。
{
  const partitions = ['tokens', 'base', 'navigation', 'forms', 'chapters', 'layers', 'onboarding', 'panels', 'responsive'];
  const dir = resolve(repoRoot, 'src/client/styles');
  for (const name of partitions) {
    if (!existsSync(resolve(dir, `${name}.ts`))) fail(`styles partition missing: ${name}.ts`);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts')).sort();
  assert.deepEqual(files, partitions.map((p) => `${p}.ts`).sort(), 'styles/ 目录应恰好包含 tokens + 8 个分区');
  const composer = read('src/client/styles.ts');
  for (const name of partitions.slice(1)) {
    if (!composer.includes(`./styles/${name}.js`)) fail(`styles.ts composer missing ${name} import`);
  }
  if (!composer.includes('export {') || !composer.includes("from './styles/tokens.js'")) fail('styles.ts 未 re-export tokens');
  // 每个分区导出其命名块（键分区成立）。
  const blocks = { base: 'BASE_STYLES', navigation: 'NAVIGATION_STYLES', forms: 'FORMS_STYLES', chapters: 'CHAPTERS_STYLES',
    layers: 'LAYERS_STYLES', onboarding: 'ONBOARDING_STYLES', panels: 'PANELS_STYLES', responsive: 'RESPONSIVE_STYLES' };
  for (const [name, symbol] of Object.entries(blocks)) {
    if (!read(`src/client/styles/${name}.ts`).includes(`export const ${symbol}`)) fail(`styles/${name}.ts missing ${symbol}`);
  }
  // 构建产物：lib 的样式分区模块携带各分区规则（编译产物保留模板插值文本）。
  const libStyles = ['lib/client/styles.js', 'lib/client/styles/base.js', 'lib/client/styles/navigation.js',
    'lib/client/styles/forms.js', 'lib/client/styles/chapters.js', 'lib/client/styles/layers.js',
    'lib/client/styles/onboarding.js', 'lib/client/styles/panels.js', 'lib/client/styles/responsive.js',
    'lib/client/styles/tokens.js'].map((p) => read(p)).join('\n');
  for (const marker of ['--nv-cinnabar: ${CINNABAR}', '.nv-workbench__nav-group', '.nv-chapters__editor', '.nv-onboarding__apply-retry', '.nv-queue__task', '.nv-knowledge__empty', '@media (max-width: ${RESPONSIVE_BREAKPOINT_NAV}px)']) {
    if (!libStyles.includes(marker)) fail(`lib client styles missing partition marker: ${marker}`);
  }
  console.log('I83 Part 3: styles 分区 OK（tokens + 8 分区 + 组合器；lib 拼接携带全部规则）');
}

// Part 4 — 测试 harness 抽取与测试拆分。
{
  if (existsSync(resolve(repoRoot, 'src/client.test.ts'))) fail('client.test.ts 应已拆分删除');
  // I95：harness 四片（fake runtime + remote builders + dom helpers + onboarding fixtures）。
  const harnessParts = ['src/client/test-harness.ts', 'src/client/test-harness/remote-builders.ts',
    'src/client/test-harness/dom-helpers.ts', 'src/client/test-harness/onboarding-fixtures.ts'];
  for (const file of harnessParts) {
    if (!existsSync(resolve(repoRoot, file))) fail(`test-harness 拆分文件缺失：${file}`);
  }
  const harness = harnessParts.map((file) => read(file)).join('\n');
  for (const symbol of ['export function mount(', 'export const flush', 'export function collect(', 'export function cleanupClientTestEnv', 'export const READY_MODEL', 'export class FakeFileReader']) {
    if (!harness.includes(symbol)) fail(`test-harness missing ${symbol}`);
  }
  // I95：巨型测试文件按面板拆分（22 个新文件 + 3 个既有文件，describe 总数仍为 30）。
  const splitFiles = [
    'src/client-shell-workbench.test.ts', 'src/client-shell-visual.test.ts', 'src/client-shell-registration.test.ts',
    'src/client-shell-sidebar.test.ts', 'src/client-shell-ia.test.ts', 'src/client-shell-navigation.test.ts', 'src/client-shell-responsive.test.ts',
    'src/client-panels-candidate.test.ts', 'src/client-panels-review.test.ts', 'src/client-panels-queue.test.ts',
    'src/client-panels-knowledge.test.ts', 'src/client-panels-rules.test.ts', 'src/client-panels-progress.test.ts',
    'src/client-panels-import-export.test.ts', 'src/client-panels-search.test.ts', 'src/client-panels-statistics.test.ts', 'src/client-panels-timeline.test.ts',
    'src/client-onboarding-docx.test.ts', 'src/client-onboarding-project-dir.test.ts', 'src/client-onboarding-analysis-error.test.ts',
    'src/client-onboarding-adjudication.test.ts', 'src/client-onboarding-progress.test.ts',
    'src/client-project.test.ts', 'src/client-layers.test.ts', 'src/client-chapters.test.ts'];
  let describes = 0;
  for (const file of splitFiles) {
    if (!existsSync(resolve(repoRoot, file))) fail(`split test file missing: ${file}`);
    describes += (read(file).match(/^describe\(/gm) ?? []).length;
  }
  if (describes !== 30) fail(`拆分测试文件应共 30 个 describe，实际 ${describes}`);
  // 巨型测试文件（原 client-panels/shell/onboarding）不得再作为单一文件存在。
  for (const file of ['src/client-panels.test.ts', 'src/client-shell.test.ts', 'src/client-onboarding.test.ts']) {
    if (existsSync(resolve(repoRoot, file))) fail(`${file} 应按面板拆分删除`);
  }
  // harness 不进构建产物（tsconfig.build.json exclude）。
  const buildConfig = read('tsconfig.build.json');
  if (!buildConfig.includes('src/client/test-harness.ts')) fail('tsconfig.build.json 未排除 test-harness.ts');
  if (existsSync(resolve(repoRoot, 'lib/client/test-harness.js'))) fail('lib 不应包含 test-harness.js');
  console.log(`I83 Part 4: 测试拆分 OK（client.test.ts 删除；harness 四片共享；${splitFiles.length} 文件共 ${describes} 个 describe）`);
}

// Part 5 — 构建产物存在性。
{
  for (const file of ['lib/client/panels/index.js', 'lib/client/mount.js', 'lib/client/styles/base.js', 'lib/client/styles/tokens.js']) {
    if (!existsSync(resolve(repoRoot, file))) fail(`${file} missing — run \`pnpm build\` first`);
  }
  const libClient = read('lib/client.js');
  assert.ok(libClient.includes('mountRemote') && libClient.includes('viewPanel'), 'lib bundle 必须携带 panels/mount 接线');
  console.log('I83 Part 5: 构建产物 OK（panels/mount/styles 分区均入 lib bundle）');
}

console.log('I83 smoke: 面板注册表 + $mount 归零 + styles 分区 + 测试拆分 + 构建产物通过');
