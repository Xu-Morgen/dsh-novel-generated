import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'dist/desktop');
const source = (path) => resolve(root, path);

mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [source('src/desktop/main/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  outfile: resolve(outDir, 'main.cjs'),
  logLevel: 'silent',
});

await build({
  entryPoints: [source('src/desktop/preload/preload.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'es2022',
  external: ['electron'],
  outfile: resolve(outDir, 'preload.cjs'),
  logLevel: 'silent',
});

await build({
  entryPoints: [source('src/desktop/renderer/main.ts')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile: resolve(outDir, 'renderer.js'),
  logLevel: 'silent',
});

copyFileSync(source('src/desktop/renderer/index.html'), resolve(outDir, 'index.html'));
copyFileSync(source('src/desktop/renderer/renderer.css'), resolve(outDir, 'renderer.css'));

process.stdout.write('I166 desktop bundle: dist/desktop (Main/Preload/Renderer + local HTML)\n');
