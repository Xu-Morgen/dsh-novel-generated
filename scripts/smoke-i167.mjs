import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const appRoot = resolve(root, 'src/app');

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

const forbiddenImport = /(?:from\s+|import\s*\(\s*)['"][^'"]*(?:electron|@deepseek-ai\/(?:cordis|dsh)|\/desktop\/|\\desktop\\)[^'"]*['"]/i;
for (const file of sourceFiles(appRoot)) {
  const source = readFileSync(file, 'utf8');
  if (forbiddenImport.test(source)) throw new Error(`I167 src/app forbidden host import: ${file}`);
}

const result = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/app/kernel.test.ts'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (result.status !== 0) throw new Error(`I167 fake port consumer smoke failed (exit ${result.status}):\n${result.output}`);

process.stdout.write('I167 smoke: ordered composition, idempotent restart, abort/task drain, disposer cleanup, and host-boundary scan passed\n');
