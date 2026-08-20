import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * I2 public-contract lock (design §0.1.3 I2, §0.1.4; H0-8, H0-9, H0-10).
 *
 * These assertions lock the exact public out-of-tree contract an ordinary DSH
 * plugin may rely on, and fail closed when it is absent:
 *
 *   - Client bundling: `dsh.client` manifest + `./client` export + the
 *     `@deepseek-ai/dsh-client-*`/typert packages pinned at 0.1.0-rc.7.
 *   - Negative scan: no dynamic RPC (`harness.handle`/`host.call`), no internal
 *     builder (`clientBundle`), no standalone UI (`createRoot`, HTML, vite), and
 *     no browser-side LLM/file/secret imports in any source file.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const pkg = JSON.parse(read('package.json'));
const lock = read('pnpm-lock.yaml');

/** The public DSH family contract this probe references, pinned exactly. */
const PINNED_DSH_PACKAGES = [
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-typert-protocol',
  '@deepseek-ai/dsh-typert-registry',
];

/** Symbols that would mean I2 left the public out-of-tree contract (H0-9/H0-10). */
const FORBIDDEN: Array<{ name: string; re: RegExp }> = [
  { name: 'dynamic RPC harness.handle', re: /harness\.handle/ },
  { name: 'dynamic RPC host.call', re: /host\.call/ },
  { name: 'internal builder clientBundle', re: /clientBundle/ },
  { name: 'standalone React mount createRoot', re: /createRoot\s*\(/ },
  { name: 'standalone HTML document', re: /<html[\s>]/i },
  { name: 'standalone Vite app', re: /from\s+['"]vite['"]/ },
  { name: 'browser direct LLM (openai)', re: /from\s+['"]openai['"]/ },
  { name: 'browser direct LLM (anthropic)', re: /from\s+['"]@anthropic-ai\/sdk['"]/ },
  { name: 'browser node builtin import', re: /from\s+['"]node:/ },
  { name: 'browser fetch network', re: /\bfetch\s*\(/ },
];

const sourceFiles = [
  'src/index.ts',
  'src/client.ts',
  'src/remote.ts',
];

describe('I2 client manifest contract', () => {
  it('declares the public dsh.client web bundle', () => {
    expect(pkg.dsh?.client?.platform).toBe('web');
    expect(pkg.dsh?.client).toHaveProperty('inject');
    expect(pkg.dsh?.client).toHaveProperty('immediately');
  });

  it('exposes the ./client subpath as the browser half', () => {
    expect(pkg.exports?.['./client']?.default).toBe('./lib/client.js');
    expect(pkg.files).toContain('lib/client.js');
  });

  it('pins the referenced public DSH client/typert packages at 0.1.0-rc.7', () => {
    const deps = pkg.devDependencies ?? {};
    for (const name of PINNED_DSH_PACKAGES) {
      expect(deps[name]).toBe('0.1.0-rc.7');
    }
  });

  it('lockfile locks the exact 0.1.0-rc.7 resolutions', () => {
    for (const name of PINNED_DSH_PACKAGES) {
      expect(lock).toContain(`${name}@0.1.0-rc.7`);
    }
  });
});

describe('I2 negative scan (fail closed on out-of-contract symbols)', () => {
  it('no dynamic RPC, internal builder, standalone UI, or browser LLM/file/secret in source', () => {
    for (const file of sourceFiles) {
      const content = read(file);
      for (const { name, re } of FORBIDDEN) {
        expect(content, `${file} must not contain ${name}`).not.toMatch(re);
      }
    }
  });

  it('client entry uses the public __ModuleLoader__ handoff contract', () => {
    // The build wraps src/client.ts into window.__ModuleLoader__.load; the
    // source itself must reference the public slot key it registers into.
    expect(read('src/client.ts')).toContain('shell.overlay');
  });
});
