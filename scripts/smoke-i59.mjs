import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I59 响应式、可访问性与保存反馈 smoke（design §14.8 / R12-6）。
 *
 * 交付物核验：
 * - 构建产物（lib/client.js）：`aria-live`/`role=status` 播报锚点、保存状态
 *   `data-novel-save-state` / `data-novel-save-status`、焦点 `data-novel-focus-scope` /
 *   `data-novel-focus-target` / `data-novel-launch`、Esc 键处理、请求去重
 *   （beginOp/endOp inflight）、响应式 `@media (max-width:` 断点；负向：bundle 样式
 *   无裸 `outline: none`（除 :focus:not(:focus-visible) 白名单），窄屏仍只注册一个
 *   `shell.overlay` 落点（同一 Slot）。
 * - 源码（src/client/focus.ts + save-status.ts + styles.ts + client.ts）：焦点进入/
 *   恢复与保存状态实现存在；断点常量与 media query 一致；:focus-visible 焦点环存在。
 * - 模型行为（lib/client/focus.js + save-status.js）：focusSelector 命中聚焦/无 DOM
 *   降级 no-op；saveButtonLabel 忙碌文案；saveStatusLine 三态投影。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I59 smoke: ${msg}`); };

/**
 * esbuild 默认 ascii charset 会把 CJK 输出为 `\uXXXX`（大写十六进制），因此
 * 对 bundle 的 CJK 断言同时检查原始与转义两种形态。
 */
const escapeForBundle = (text) => Array.from(text).map((ch) => {
  const code = ch.codePointAt(0);
  return code > 0x7f ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}` : ch;
}).join('');
const containsText = (bundle, text) => bundle.includes(text) || bundle.includes(escapeForBundle(text));

// Part 1 — 构建产物：aria-live / 保存状态 / 焦点 / Esc / 去重 / 响应式，窄屏同一 Slot。
{
  const bundlePath = resolve(repoRoot, 'lib', 'client.js');
  if (!existsSync(bundlePath)) fail('lib/client.js missing — run `pnpm build` first');
  const bundle = readFileSync(bundlePath, 'utf8');
  for (const required of [
    // 异步播报：aria-live / role=status / aria-busy。
    'aria-live', 'role: "status"', 'aria-busy',
    // 保存状态三态锚点。
    'data-novel-save-state', 'data-novel-save-status',
    // 焦点进入/恢复/Esc 锚点。
    'data-novel-focus-scope', 'data-novel-focus-target', 'data-novel-launch',
    // Esc 键处理。
    'Escape',
    // 请求去重（inflight）。
    'beginOp(', 'endOp(',
    // 响应式断点。
    '@media (max-width:', 'flex-direction: column',
  ]) {
    if (!bundle.includes(required)) fail(`bundle missing I59 marker: ${required}`);
  }
  // 保存中/已保存/失败文案（转义或原文）。
  for (const text of ['正在保存…', '保存中…', '应用中…', '已保存']) {
    if (!containsText(bundle, text)) fail(`bundle missing I59 save-status copy: ${text}`);
  }
  // 负向：bundle 内的样式不允许裸 `outline: none`（唯一允许的是 :focus:not(:focus-visible)）。
  const outlineNones = bundle.match(/outline:\s*none/g) ?? [];
  if (outlineNones.length > 1) fail(`bundle styles contain bare outline:none ×${outlineNones.length}`);
  if (outlineNones.length === 1 && !bundle.includes(':focus:not(:focus-visible)')) {
    fail('bundle bare outline:none is not paired with :focus:not(:focus-visible)');
  }
  // 窄屏仍只注册一个 shell.overlay 落点（同一 Slot/Fiber，无第二路径）。
  const overlayCount = (bundle.match(/slots\.inject\("shell\.overlay"/g) ?? []).length
    + (bundle.match(/slots\.inject\('shell\.overlay'/g) ?? []).length;
  if (overlayCount !== 1) fail(`narrow-screen regression: shell.overlay registration count = ${overlayCount}`);
}

// Part 2 — 源码：焦点/保存状态/样式实现存在；断点常量与 media query 一致。
{
  const focus = read('src/client/focus.ts');
  const saveStatus = read('src/client/save-status.ts');
  // I83：styles 按键分区（架构审查 §4.2）——扫描组合器 + 全部分区文件。
  const styles = ['src/client/styles.ts', 'src/client/styles/base.ts', 'src/client/styles/navigation.ts',
    'src/client/styles/forms.ts', 'src/client/styles/chapters.ts', 'src/client/styles/layers.ts',
    'src/client/styles/onboarding.ts', 'src/client/styles/panels.ts', 'src/client/styles/responsive.ts',
    'src/client/styles/tokens.ts'].map((p) => read(p)).join('\n');
  const client = read('src/client.ts');
  // I90：焦点/键盘/Esc 渲染锚点随 workbenchView 迁至 presenter.ts（review v2.0 §3.5）。
  const presenter = read('src/client/presenter.ts');
  for (const fn of ['safeDocument', 'focusSelector', 'scheduleFocus']) {
    if (!focus.includes(fn)) fail(`src/client/focus.ts missing ${fn}`);
  }
  for (const fn of ['renderSaveStatus', 'saveButtonLabel', 'saveStatusLine', 'SaveStatusKind']) {
    if (!saveStatus.includes(fn)) fail(`src/client/save-status.ts missing ${fn}`);
  }
  if (!presenter.includes('data-novel-focus-scope')) fail('presenter.ts missing focus-scope anchor');
  if (!presenter.includes('data-novel-focus-target')) fail('presenter.ts missing focus-target anchor');
  if (!presenter.includes('onKeyDown')) fail('presenter.ts missing keydown/Esc handler');
  if (!client.includes('const inflight = new Set<string>')) fail('client.ts missing inflight dedup');
  if (!styles.includes('.nv-workbench :focus-visible')) fail('styles missing :focus-visible ring');
  const mediaN = styles.match(/@media \(max-width: \$\{RESPONSIVE_BREAKPOINT_NAV\}px\)/);
  const mediaC = styles.match(/@media \(max-width: \$\{RESPONSIVE_BREAKPOINT_COMPACT\}px\)/);
  if (!mediaN || !mediaC) fail('styles media queries must reference the exported breakpoint constants');
}

// Part 3 — 模型行为：focusSelector 聚焦/降级；saveButtonLabel；saveStatusLine 三态。
{
  const { focusSelector, safeDocument } = await import('../lib/client/focus.js');
  const { saveButtonLabel, saveStatusLine } = await import('../lib/client/save-status.js');

  // focusSelector：无 DOM 降级 no-op。
  const hadDocument = typeof globalThis.document !== 'undefined';
  const savedDocument = globalThis.document;
  delete globalThis.document;
  try {
    assert.equal(safeDocument(), undefined, 'safeDocument without document');
    assert.equal(focusSelector('[data-novel-launch]'), false, 'focusSelector without DOM must no-op');
  } finally {
    if (hadDocument) globalThis.document = savedDocument;
  }
  // focusSelector：命中可聚焦节点 → 聚焦并返回 true。
  let captured = '';
  let focused = false;
  globalThis.document = {
    querySelector: (selector) => { captured = selector; return { focus() { focused = true; } }; },
  };
  assert.equal(focusSelector('[data-novel-launch]'), true);
  assert.equal(captured, '[data-novel-launch]');
  assert.equal(focused, true);

  // saveButtonLabel：saving 时固定忙碌文案。
  assert.equal(saveButtonLabel(false, '保存'), '保存');
  assert.equal(saveButtonLabel(true, '保存'), '保存中…');

  // saveStatusLine：失败优先 → 保存中 → 已保存 → undefined（空闲）。
  assert.deepEqual(saveStatusLine(false, '', 'boom'), { kind: 'failed', message: 'boom' });
  assert.deepEqual(saveStatusLine(true, '', ''), { kind: 'saving', message: '正在保存…' });
  assert.deepEqual(saveStatusLine(false, '已保存', ''), { kind: 'saved', message: '已保存' });
  assert.equal(saveStatusLine(false, '', ''), undefined);

  delete globalThis.document;
  console.log('I59 smoke: aria-live/保存三态/焦点进入·恢复·Esc/focus-visible/请求去重/响应式断点（bundle/源码/模型）+ 窄屏同一 Slot + 无裸 outline:none 通过');
}
