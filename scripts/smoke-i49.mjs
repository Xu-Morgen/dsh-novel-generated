import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// `fileURLToPath` (而非 `.pathname`) 在 Windows 上产出正确的原生绝对路径。
const root = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(root, '..', 'lib', 'client.js');
if (!existsSync(bundlePath)) throw new Error('I49 bundle missing: run pnpm build first');
const bundle = readFileSync(bundlePath, 'utf8');

// 负向：无 fs API / standalone / JSX runtime / 浏览器 LLM / 文件 seam。
for (const forbidden of [
  'createRoot', 'window.fetch', 'harness.handle', 'host.call', 'fs.readFile',
  'node:fs', 'OPENAI_API_KEY', 'jsx-runtime', 'jsxs(', '@import', '@font-face',
  'fonts.googleapis',
]) {
  if (bundle.includes(forbidden)) throw new Error(`I49 client bundle contains forbidden symbol: ${forbidden}`);
}

// 正向：C2 状态时间线/回滚/diff 与 C4 只读账本 + supersede 更正锚点，Remote 契约经 novelWorkspace。
for (const required of [
  'data-novel-workspace',
  'data-novel-layer',
  'data-novel-layer-state',
  'data-novel-state-snapshot',
  'data-novel-state-rollback',
  'data-novel-state-diff',
  'data-novel-state-diff-view',
  'data-novel-canon-id',
  'data-novel-canon-readonly',
  'data-novel-canon-propose',
  'data-novel-canon-accept',
  'data-novel-error',
  'novelWorkspace',
  'stateSnapshots',
  'stateRollback',
  'stateDiff',
  'canonQuery',
  'canonCorrectionPropose',
  'canonCorrectionAccept',
  'nv-launch',
  'shell.overlay',
  '--dsw-alias-',
]) {
  if (!bundle.includes(required)) throw new Error(`I49 client bundle missing ${required}`);
}

console.log('I49 smoke: C2/C4 面板 bundle 通过正/负向扫描（无 fs API / standalone / JSX runtime，回滚与更正确认均只经 Host Remote）');
