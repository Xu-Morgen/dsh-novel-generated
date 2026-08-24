import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath` (而非 `.pathname`) 在 Windows 上产出正确的原生绝对路径。
const root = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(root, '..', 'lib', 'client.js');
if (!existsSync(bundlePath)) throw new Error('I46 bundle missing: run pnpm build first');
const bundle = readFileSync(bundlePath, 'utf8');

// 负向：无 standalone / JSX runtime / 浏览器 LLM / 文件 seam / 网络资产。
for (const forbidden of [
  'createRoot', 'window.fetch', 'harness.handle', 'host.call', 'fs.readFile',
  'OPENAI_API_KEY', 'node:fs', 'jsx-runtime', 'jsxs(', '@import', '@font-face',
  'fonts.googleapis',
]) {
  if (bundle.includes(forbidden)) throw new Error(`I46 client bundle contains forbidden symbol: ${forbidden}`);
}

// 正向：新契约锚点 + 视觉体系 + 六层 IA + 启动入口。
for (const required of [
  'novel-creation-tool-workspace',
  'data-novel-workspace',
  'data-novel-layer',
  'data-novel-layer-state',
  'data-novel-brand',
  'data-novel-launch',
  'sidebar.footer.action',
  'shell.overlay',
  'novelWorkspace/viewModel',
  '--dsw-alias-',
  'body[data-ds-dark-theme]',
  'nv-workbench',
]) {
  if (!bundle.includes(required)) throw new Error(`I46 client bundle missing ${required}`);
}

console.log('I46 smoke: 创作台地基 + 视觉体系 bundle 通过正/负向扫描（无 standalone/JSX runtime/新增 Host seam）');
