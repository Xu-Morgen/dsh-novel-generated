import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * I1 manifest / bundle composition contract assertions (design §0.1.1, §0.1.3).
 *
 * These are deterministic static checks over the repository's own files, not
 * the DSH runtime: they lock the selected-profile dependency, the unique
 * bundle-patch row owner, the Host ESM entry, and the toolchain pins so a
 * later change that breaks the composition contract fails here first.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

const pkg = JSON.parse(read('package.json'));
const profilePkg = JSON.parse(read('examples/selected-profile.package.json'));
const lock = read('pnpm-lock.yaml');
const patch = read('cordis.patch.yml');

describe('I1 manifest contract', () => {
  it('is an ESM package with Node >=22 engine and a pnpm manager pin', () => {
    expect(pkg.type).toBe('module');
    expect(pkg.engines?.node).toBe('>=22');
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });

  it('exposes the Host entry and declares the bundle patch layer', () => {
    expect(pkg.main).toBe('lib/index.js');
    expect(pkg.exports?.['.']?.default).toBe('./lib/index.js');
    expect(pkg.dsh?.bundle?.patch).toBe('./cordis.patch.yml');
  });

  it('pins the Cordis plugin framework dependency', () => {
    expect(pkg.dependencies?.['@deepseek-ai/cordis']).toBe('^4.0.1');
  });

  it('lockfile pins the exact Cordis resolution', () => {
    expect(lock).toContain("'@deepseek-ai/cordis':");
    expect(lock).toMatch(/version:\s*4\.0\.1\(/);
  });

  it('bundle patch inserts exactly one uniquely-named row', () => {
    expect(patch).toContain('insert:');
    expect(patch.match(/id:\s*novel-creation-tool/g)).toHaveLength(1);
    expect(patch.match(/name:\s*novel-creation-tool/g)).toHaveLength(1);
  });
});

describe('I1 selected-profile reference', () => {
  it('declares the plugin dependency and the DSH family pins', () => {
    expect(profilePkg.dependencies?.['novel-creation-tool']).toBe('2.0.0');
    expect(profilePkg.dependencies?.['@deepseek-ai/dsh-base']).toBe('0.1.0-rc.7');
    expect(profilePkg.dependencies?.['@deepseek-ai/dsh-web-app']).toBe('0.1.0-rc.7');
  });

  it('lists the plugin in the ordered bundle list exactly once (single owner)', () => {
    const bundles: string[] = profilePkg.dsh?.profile?.bundles ?? [];
    expect(bundles).toContain('novel-creation-tool');
    expect(bundles.filter((name) => name === 'novel-creation-tool')).toHaveLength(1);
  });
});
