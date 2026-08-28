import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * I74 剧情时间线面板 smoke（design §14.11，R15-4/R15-5）。
 *
 * 交付物核验：
 * - Client bundle（lib/client.js）含时间线面板渲染入口与 `novelTimeline` Remote
 *   挂载，且 bundle 不包含 node:fs（Client 不持有时间线真相）。
 * - 源码：nav 新增「时间线」稳定视图（策划组）；client/layers/timeline 提供
 *   面板（节点列表/编辑/手动设当前/自建/保存）；client.ts 挂载 timelineRemoteContribution。
 * - Client 行为（lib 构建产物源码扫描）：面板数据锚点齐全，仅经 novelTimeline
 *   Remote 提交受控命令。
 */

const root = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(root, '..');
const read = (p) => readFileSync(resolve(repoRoot, p), 'utf8');
const fail = (msg) => { throw new Error(`I74 smoke: ${msg}`); };

// Part 1 — 构建产物。
{
  if (!existsSync(resolve(repoRoot, 'lib/client.js'))) fail('lib/client.js missing — run `pnpm build` first');
  const bundle = read('lib/client.js');
  for (const symbol of ['data-novel-timeline-node', 'data-novel-timeline-ensure', 'data-novel-timeline-save', 'data-novel-timeline-set-current']) {
    if (!bundle.includes(symbol)) fail(`client bundle missing timeline panel anchor ${symbol}`);
  }
  if (bundle.includes("require('node:fs") || bundle.includes("from 'node:fs") || bundle.includes('node:fs/promises')) {
    fail('client bundle must not include node:fs');
  }
}

// Part 2 — 源码：nav 稳定视图、面板层、Remote 挂载与受控命令。
{
  const nav = read('src/client/nav.ts');
  const layer = read('src/client/layers/timeline.ts');
  const shared = read('src/client/shared.ts');
  if (!nav.includes("view: 'timeline'") || !nav.includes("view === 'timeline'")) {
    fail('nav.ts missing the timeline view / stable-view handling');
  }
  for (const anchor of ['data-novel-timeline-node', 'data-novel-timeline-refresh', 'data-novel-timeline-ensure', 'data-novel-timeline-set-current', 'data-novel-timeline-save']) {
    if (!layer.includes(anchor)) fail(`timeline layer missing ${anchor}`);
  }
  // I83 起 Remote 挂载经 mount.ts 参数化工厂；I90 起 per-Remote 声明式规格在 mount-registry.ts。
  const mountRegistry = read('src/client/mount-registry.ts');
  const mount = read('src/client/mount.ts');
  if (!mount.includes('export function mountRemote') || !mountRegistry.includes('timelineRemoteContribution') || !mountRegistry.includes("'remote.novelTimeline'")) {
    fail('client mount wiring missing timeline Remote mount');
  }
  if (!shared.includes('TimelineNamespace')) fail('shared.ts missing TimelineNamespace');
}

console.log('I74 smoke: 剧情时间线面板（策划组稳定视图/节点编辑/手动设当前/自建/保存/受控命令/无 node:fs）通过');
