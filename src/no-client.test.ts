import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * I1 Host-only negative scan (design §0.1.2–§0.1.4, H0-7 / H0-10).
 *
 * I1 must not ship any Client code, Remote seam, Slot registration, standalone
 * UI entry, browser LLM, or dynamic RPC. These assertions scan the manifest
 * and the compiled build output for the code patterns that would indicate any
 * of those, and fail the iteration if one leaks in.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Recursively list file paths under a directory (never follows symlinks). */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

/** Code markers that would mean Client/Remote/Slot/standalone-UI/dynamic-RPC leaked into I1. */
const FORBIDDEN_CODE = [
  /from\s+['"]react['"]/,
  /from\s+['"]@deepseek-ai\/dsh-client/,
  /createRoot\(/,
  /createElement\(/,
  /harness\.handle/,
  /host\.call/,
  /clientBundle/,
  /ctx\.slot/,
  /ctx\.remote/,
];

describe('I1 Host-only: no Client bundle or code', () => {
  it('manifest declares no client entry and no UI/react/vite dependencies', () => {
    expect(pkg.dsh?.client).toBeUndefined();
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const forbidden = Object.keys(deps).filter((name) =>
      name === 'react' ||
      name === 'react-dom' ||
      name === 'vite' ||
      name.startsWith('@vitejs/') ||
      name.startsWith('@deepseek-ai/dsh-client') ||
      name.startsWith('@deepseek-ai/dsh-web'),
    );
    expect(forbidden).toEqual([]);
  });

  it('compiled build output carries no client/browser/remote code', () => {
    const libFiles = walk(resolve(root, 'lib')).filter((f) => f.endsWith('.js'));
    expect(libFiles.length).toBeGreaterThan(0);
    for (const file of libFiles) {
      const content = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN_CODE) {
        expect(content).not.toMatch(pattern);
      }
    }
  });

  it('has no standalone UI entry files under src/', () => {
    const uiFiles = walk(resolve(root, 'src')).filter((f) => /\.(html|tsx|jsx|css)$/.test(f));
    expect(uiFiles).toEqual([]);
  });
});
