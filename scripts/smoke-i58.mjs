import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I58 任务型创作台信息架构 smoke（design §14.8 / R12-5）。
 *
 * 交付物核验：
 * - 构建产物（lib/client.js）：四任务组（写作/策划/连续性/作品设置）导航 +
 *   稳定 route/state/data 锚点（`data-novel-route` / `data-novel-view` /
 *   `data-novel-view-panel` / `data-novel-nav-group` / `data-novel-nav-badge`）；
 *   负向：旧九项扁平导航确定性标记（'创作台层级' aria-label、四互斥页签状态
 *   字段 showOnboarding/showCreationSettings/showSettings）必须零引用。
 * - 源码（src/client/nav.ts + src/client.ts + src/client/styles.ts）：分组模型、
 *   视图分发与组样式存在；旧扁平导航 aria-label 零引用。
 * - 模型行为（lib/client/nav.js）：四组迁移映射、技术层徽标仅辅助位、
 *   resolveWorkbenchView 非法/陈旧值回退默认视图（刷新/重开保持合法 active view）。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I58 smoke: ${msg}`); };

/**
 * esbuild 默认 ascii charset 会把 CJK 输出为 `\uXXXX`（大写十六进制），因此
 * 对 bundle 的 CJK 断言同时检查原始与转义两种形态。
 */
const escapeForBundle = (text) => Array.from(text).map((ch) => {
  const code = ch.codePointAt(0);
  return code > 0x7f ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}` : ch;
}).join('');
const containsText = (bundle, text) => bundle.includes(text) || bundle.includes(escapeForBundle(text));

// Part 1 — 构建产物：分组导航 + 稳定锚点，旧九项扁平导航零引用。
{
  const bundlePath = resolve(repoRoot, 'lib', 'client.js');
  if (!existsSync(bundlePath)) fail('lib/client.js missing — run `pnpm build` first');
  const bundle = readFileSync(bundlePath, 'utf8');
  for (const required of [
    // 四任务组与组标签。
    'data-novel-nav-group', '写作', '策划', '连续性', '作品设置',
    // 稳定 route/state/data 锚点。
    'data-novel-route', 'data-novel-view', 'data-novel-view-panel', 'data-novel-nav-item',
    // 技术层编号辅助徽标。
    'data-novel-nav-badge', 'B3', 'B2', 'B5', 'C1', 'C2', 'C4',
  ]) {
    if (!containsText(bundle, required)) fail(`bundle missing I58 marker: ${required}`);
  }
  // 负向：旧九项扁平导航确定性标记全部退役（旧 aria-label 与四互斥页签状态字段）。
  if (containsText(bundle, '创作台层级')) fail('retired flat-navigation aria-label still referenced');
  for (const retired of ['showOnboarding', 'showCreationSettings']) {
    if (bundle.includes(retired)) fail(`retired flat-navigation state flag still referenced: ${retired}`);
  }
}

// Part 2 — 源码：分组模型 / 视图分发 / 组样式存在；旧扁平导航 aria-label 零引用。
{
  const nav = read('src/client/nav.ts');
  const client = read('src/client.ts');
  // I83：styles 按键分区（架构审查 §4.2）——扫描组合器 + 全部分区文件。
  const styles = ['src/client/styles.ts', 'src/client/styles/base.ts', 'src/client/styles/navigation.ts',
    'src/client/styles/forms.ts', 'src/client/styles/chapters.ts', 'src/client/styles/layers.ts',
    'src/client/styles/onboarding.ts', 'src/client/styles/panels.ts', 'src/client/styles/responsive.ts',
    'src/client/styles/tokens.ts'].map((p) => read(p)).join('\n');
  for (const label of ['写作', '策划', '连续性', '作品设置']) {
    if (!nav.includes(`label: '${label}'`)) fail(`nav model missing group label: ${label}`);
  }
  if (!nav.includes('resolveWorkbenchView')) fail('nav model missing resolveWorkbenchView');
  if (!client.includes('function groupNav(')) fail('client.ts missing grouped nav renderer');
  // I83：per-view dispatcher 迁至面板注册表（viewPanel + PANEL_REGISTRY）。
  if (!read('src/client/panels/index.ts').includes('export function viewPanel(')) fail('panels/index.ts missing per-view dispatcher');
  if (client.includes('创作台层级')) fail('client.ts still references the retired flat-nav aria-label');
  for (const required of ['.nv-workbench__nav-group', '.nv-workbench__nav-group-label', '.nv-workbench__nav-item-badge']) {
    if (!styles.includes(required)) fail(`styles missing I58 class: ${required}`);
  }
}

// Part 3 — 模型行为：迁移映射 / 徽标仅辅助 / resolve 回退默认视图。
{
  const { NAV_GROUPS, NAV_ITEMS, DEFAULT_VIEW, isWorkbenchViewId, isLayerView, resolveWorkbenchView } = await import('../lib/client/nav.js');
  // I60 起各迭代陆续新增视图（C5 正文 / C6 进度 / 审校 / 队列 / 搜索 / 统计 /
  // 时间线 / 规则文风 / 知情 / 导入导出），导航项从 I58 的 9 项演进到当前 19 项；
  // 本断言随 stage 回归维护，只锁定「四组模型 + 项数与徽标」的当前真实形状。
  assert.equal(NAV_ITEMS.length, 19, 'nineteen views in the current four-group nav model');
  assert.deepEqual(NAV_GROUPS.map((g) => g.id), ['writing', 'planning', 'continuity', 'settings']);
  // 迁移映射（旧九项 → 新四组；写作组 = 大纲 + 正文 + 后置写作能力）。
  const itemsOf = (id) => NAV_GROUPS.find((g) => g.id === id).items.map((item) => item.view);
  assert.deepEqual(itemsOf('writing'), ['outline', 'progress', 'chapters', 'review', 'queue', 'search', 'statistics']);
  assert.deepEqual(itemsOf('planning'), ['characters', 'worldview', 'timeline', 'ruleStyle']);
  assert.deepEqual(itemsOf('continuity'), ['relationship', 'state', 'canon', 'knowledge']);
  assert.deepEqual(itemsOf('settings'), ['onboarding', 'creationSettings', 'importExport', 'settings']);
  // 技术层编号只作辅助徽标：十个带徽标项（含 C5/C6/C3 与 B1/B4），九个无 badge 项。
  assert.deepEqual(NAV_ITEMS.filter((item) => item.badge !== undefined).map((item) => item.badge), ['B5', 'C6', 'C5', 'B3', 'B2', 'B1/B4', 'C1', 'C2', 'C4', 'C3']);
  assert.deepEqual(NAV_ITEMS.filter((item) => item.badge === undefined).map((item) => item.view), ['review', 'queue', 'search', 'statistics', 'timeline', 'onboarding', 'creationSettings', 'importExport', 'settings']);
  // 刷新/重开保持合法 active view：非法/陈旧/空值回退默认，合法值原样保留。
  assert.equal(resolveWorkbenchView('bogus-view'), DEFAULT_VIEW);
  assert.equal(resolveWorkbenchView(undefined), DEFAULT_VIEW);
  assert.equal(resolveWorkbenchView(null), DEFAULT_VIEW);
  for (const item of NAV_ITEMS) {
    assert.equal(isWorkbenchViewId(item.view), true);
    assert.equal(resolveWorkbenchView(item.view), item.view);
    assert.equal(isLayerView(item.view), item.layer !== undefined);
  }
  console.log('I58 smoke: 四组导航 + 稳定 route/state/data 锚点（bundle/源码/模型）+ 旧九项扁平导航零引用 + resolve 回退默认视图 通过');
}
