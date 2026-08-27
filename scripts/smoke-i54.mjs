import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I54 DSH Slot 兼容门 + 右侧停靠侧板 smoke（design D20 / §14.8；R12-1）。
 *
 * Slot 版本门证据（执行 I54 时重新核验，非项目 pin 之外的运行时观测）：
 * - 项目 pin：selected-profile 与 devDependency 均锁定 DSH family `0.1.0-rc.7`。
 * - 当前已安装环境观测：`@deepseek-ai/dsh-client-ui-slots@0.1.0-rc.7`；其 `SlotMap`
 *   为空接口（纯类型增广层），无 additive 侧区内容 Slot。
 * - 本机运行 DSH（`dsh-app-boot/dsh-web-app@0.1.0-rc.8`）的 live Slot tree
 *   （Inspect `Slots.listSubTree`）：root → { sidebar(single), conversation(single),
 *   details(single), shell.overlay(list) }，无 additive 侧区内容 Slot。
 * - npm 最新版 `0.1.1-rc.2`（`next` tag）静态合同：`dsh-client-ui-layout` 只声明
 *   sidebar/conversation/details（均 single，替换整列）+ `shell.overlay`（list，唯一
 *   additive 帧级浮层）；`dsh-client-ui-sidebar`/`dsh-client-ui-workspace` 只声明列内
 *   single/list 座。均无 additive 侧区内容 Slot。
 *
 * 结论：无公共侧区 Slot → 只实现 `shell.overlay` 右侧停靠侧板，不升级 DSH、不写 fallback。
 * 退休清单（居中浮窗 → 停靠侧板）：`min-width/max-width/min-height/max-height:80vh`
 * 居中几何、`border-radius` 窗口圆角、`box-shadow: 0 24px 60px` 四向投影；无测试锚点改动
 * （`data-novel-workspace` 等锚点与几何无关，继续有效）。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I54 smoke: ${msg}`); };

// Part 1 — 项目 pin 与已安装包版本（Slot 版本门）。
{
  const pkg = JSON.parse(read('package.json'));
  if (pkg.devDependencies?.['@deepseek-ai/dsh-client-ui-slots'] !== '0.1.0-rc.7') {
    fail('devDependency @deepseek-ai/dsh-client-ui-slots pin must be 0.1.0-rc.7');
  }
  const profile = JSON.parse(read('examples/selected-profile.package.json'));
  if (profile.dependencies?.['@deepseek-ai/dsh-base'] !== '0.1.0-rc.7'
    || profile.dependencies?.['@deepseek-ai/dsh-web-app'] !== '0.1.0-rc.7') {
    fail('selected-profile DSH family pin must be 0.1.0-rc.7');
  }

  const installedPath = resolve(repoRoot, 'node_modules', '@deepseek-ai', 'dsh-client-ui-slots', 'package.json');
  if (!existsSync(installedPath)) fail('@deepseek-ai/dsh-client-ui-slots not installed');
  const installed = JSON.parse(readFileSync(installedPath, 'utf8'));
  if (installed.version !== '0.1.0-rc.7') {
    fail(`installed dsh-client-ui-slots version ${installed.version} != pin 0.1.0-rc.7`);
  }

  // 已安装类型层 `SlotMap` 必须为空（additive 侧区内容 Slot 不存在于本层）。
  const slotsDts = read('node_modules/@deepseek-ai/dsh-client-ui-slots/lib/types/index.d.ts');
  const match = slotsDts.match(/export interface SlotMap\s*\{\s*\}/);
  if (!match) fail('dsh-client-ui-slots SlotMap is not empty — re-run the I54 Slot gate');
}

// Part 2 — 构建产物：右侧停靠侧板、无居中浮窗、单 shell.overlay、无单槽替换/双路径。
{
  const bundlePath = resolve(repoRoot, 'lib', 'client.js');
  if (!existsSync(bundlePath)) fail('lib/client.js missing — run `pnpm build` first');
  const bundle = readFileSync(bundlePath, 'utf8');

  // 贴右全高非模态：确定性 CSS 标记必须存在于停靠侧板。
  for (const required of [
    'position: fixed', 'top: 0', 'right: 0', 'bottom: 0',
    'height: 100%', 'width: min(860px, 100vw)', 'border-left: 1px solid var(--nv-line)',
    'pointer-events: auto',
    'shell.overlay', 'nv-launch', 'novel-creation-tool-workspace',
  ]) {
    if (!bundle.includes(required)) fail(`bundle missing docked-side-panel marker: ${required}`);
  }

  // 居中浮窗几何/阴影必须全部退休（双路径禁止）。
  for (const retired of [
    'min-width: 520px', 'max-width: 860px', 'min-height: 360px', 'max-height: 80vh',
    'border-radius: calc(var(--nv-grid) * 1.5)', '0 24px 60px',
  ]) {
    if (bundle.includes(retired)) fail(`centered floating-window marker not retired: ${retired}`);
  }

  // 禁止接管 root/sidebar/conversation/details 单槽（只注册 shell.overlay，悬浮圆形入口同 slot 内自渲染）。
  if (/\.inject\(\s*['"](sidebar|conversation|details|root)['"]\s*,/.test(bundle)) {
    fail('bundle registers into a single slot (sidebar/conversation/details/root)');
  }
}

console.log('I54 smoke: Slot 版本门（无 additive 侧区内容 Slot）+ 右侧停靠侧板 bundle 通过正/负向扫描（无居中浮窗/单槽替换/双路径）');
