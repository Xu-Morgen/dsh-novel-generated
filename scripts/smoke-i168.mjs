import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnCaptured } from './spawn-captured.mjs';

const root = resolve(import.meta.dirname, '..');
const pathsSource = readFileSync(resolve(root, 'src/platform/desktop-paths.ts'), 'utf8');
const mainSource = readFileSync(resolve(root, 'src/desktop/main/main.ts'), 'utf8');

if (pathsSource.includes('.dsh')) throw new Error('I168 DesktopPaths contains a legacy .dsh default');
if (!mainSource.includes("app.getPath('userData')")) throw new Error('I168 Main does not source paths from Electron userData');
if (!pathsSource.includes('assertContained')) throw new Error('I168 DesktopPaths missing containment guard');
if (!pathsSource.includes('isSymbolicLink')) throw new Error('I168 DesktopPaths missing symlink guard');

const result = spawnCaptured('pnpm', ['exec', 'vitest', 'run', 'src/platform/desktop-paths.test.ts'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, CI: 'true', VITEST_MIN_WORKERS: '1', VITEST_MAX_WORKERS: '1' },
});
if (result.status !== 0) throw new Error(`I168 DesktopPaths smoke failed (exit ${result.status}):\n${result.output}`);

process.stdout.write('I168 smoke: userData/library/settings/cache/temp roots, round-trip archive semantics, containment, symlink, read-only, and cross-root guards passed\n');
