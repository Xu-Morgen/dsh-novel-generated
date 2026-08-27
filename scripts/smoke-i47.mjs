import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath` (而非 `.pathname`) 在 Windows 上产出正确的原生绝对路径。
const root = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(root, '..', 'lib', 'client.js');
if (!existsSync(bundlePath)) throw new Error('I47 bundle missing: run pnpm build first');
const bundle = readFileSync(bundlePath, 'utf8');

// 负向：无 fs API / standalone / JSX runtime / 浏览器 LLM / 文件 seam。
for (const forbidden of [
  'createRoot', 'window.fetch', 'harness.handle', 'host.call', 'fs.readFile',
  'node:fs', 'OPENAI_API_KEY', 'jsx-runtime', 'jsxs(', '@import', '@font-face',
  'fonts.googleapis',
]) {
  if (bundle.includes(forbidden)) throw new Error(`I47 client bundle contains forbidden symbol: ${forbidden}`);
}

// 正向：B3/B2 真表单锚点 + Remote 契约仍经 novelWorkspace，且不改写（supersede）。
for (const required of [
  'data-novel-workspace',
  'data-novel-layer',
  'data-novel-layer-state',
  'data-novel-character-new',
  'data-novel-character-save',
  'data-novel-worldview-new',
  'data-novel-worldview-save',
  'data-novel-worldview-rewritten',
  'data-novel-error',
  'novelWorkspace',
  'characterList',
  'characterCreate',
  'characterUpdate',
  'worldviewList',
  'worldviewCreate',
  'worldviewRewrite',
  'nv-launch',
  'shell.overlay',
  '--dsw-alias-',
]) {
  if (!bundle.includes(required)) throw new Error(`I47 client bundle missing ${required}`);
}

console.log('I47 smoke: B3/B2 真表单 bundle 通过正/负向扫描（无 fs API / standalone / JSX runtime，CRUD 仅经 Host Remote）');
