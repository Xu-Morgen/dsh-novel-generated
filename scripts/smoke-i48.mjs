import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath` (而非 `.pathname`) 在 Windows 上产出正确的原生绝对路径。
const root = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(root, '..', 'lib', 'client.js');
if (!existsSync(bundlePath)) throw new Error('I48 bundle missing: run pnpm build first');
const bundle = readFileSync(bundlePath, 'utf8');

// 负向：无 fs API / standalone / JSX runtime / 浏览器 LLM / 文件 seam。
for (const forbidden of [
  'createRoot', 'window.fetch', 'harness.handle', 'host.call', 'fs.readFile',
  'node:fs', 'OPENAI_API_KEY', 'jsx-runtime', 'jsxs(', '@import', '@font-face',
  'fonts.googleapis',
]) {
  if (bundle.includes(forbidden)) throw new Error(`I48 client bundle contains forbidden symbol: ${forbidden}`);
}

// 正向：B5/C1 结构化编辑器锚点 + Remote 契约仍经 novelWorkspace。
for (const required of [
  'data-novel-workspace',
  'data-novel-layer',
  'data-novel-layer-state',
  'data-novel-outline-add-act',
  'data-novel-outline-act',
  'data-novel-outline-add-beat',
  'data-novel-outline-beat',
  'data-novel-detail-card',
  'data-novel-beat-cards',
  'data-novel-outline-save',
  'data-novel-relationship-new',
  'data-novel-relationship-id',
  'data-novel-relationship-save',
  'data-novel-error',
  'novelWorkspace',
  'outlineRead',
  'outlineSave',
  'outlineBeatCards',
  'relationshipRead',
  'relationshipSave',
  'sidebar.footer.action',
  'shell.overlay',
  '--dsw-alias-',
]) {
  if (!bundle.includes(required)) throw new Error(`I48 client bundle missing ${required}`);
}

console.log('I48 smoke: B5/C1 结构化编辑器 bundle 通过正/负向扫描（无 fs API / standalone / JSX runtime，读写仅经 Host Remote）');
