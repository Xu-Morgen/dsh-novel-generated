import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// I85：URL.pathname 在 Windows 上产生 `C:\C:\...` 双盘符根（Stage-6 smoke 的既有
// 路径 bug，I85 验收⑤「Stage 6 关键宿主消费者回归全绿」暴露），改 fileURLToPath。
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const bundlePath = resolve(root, 'lib/client.js');
if (!existsSync(bundlePath)) throw new Error('I34 bundle missing: run pnpm build first');
const bundle = readFileSync(bundlePath, 'utf8');
for (const forbidden of ['createRoot', 'window.fetch', 'harness.handle', 'host.call', 'fs.readFile', 'OPENAI_API_KEY', 'node:fs']) {
  if (bundle.includes(forbidden)) throw new Error(`I34 client bundle contains forbidden symbol: ${forbidden}`);
}
// I85：I46 锚点迁移后 `data-novel-editors`/旧标签已退役，本 smoke 重新锚定当前
// 契约（层/视图锚点 + B3/B2 编辑 Remote），目的不变（Host-only + 边界负扫）。
for (const required of ['data-novel-layer', 'data-novel-view', 'data-novel-workspace', 'characterCreate', 'worldviewRewrite']) {
  if (!bundle.includes(required)) throw new Error(`I34 client bundle missing ${required}`);
}
console.log('I34 smoke: B3/B2 editor bundle passes Host-only and forbidden-boundary scans');
