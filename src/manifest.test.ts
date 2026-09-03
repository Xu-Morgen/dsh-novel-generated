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

  it('exposes the desktop Main entry and keeps the legacy Host export during migration', () => {
    expect(pkg.main).toBe('dist/desktop/main.cjs');
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
    expect(profilePkg.dependencies?.['@deepseek-ai/dsh-base']).toBe('0.1.1-rc.2');
    expect(profilePkg.dependencies?.['@deepseek-ai/dsh-web-app']).toBe('0.1.1-rc.2');
  });

  it('lists the plugin in the ordered bundle list exactly once (single owner)', () => {
    const bundles: string[] = profilePkg.dsh?.profile?.bundles ?? [];
    expect(bundles).toContain('novel-creation-tool');
    expect(bundles.filter((name) => name === 'novel-creation-tool')).toHaveLength(1);
  });
});

describe('I85 DSH family 0.1.1-rc.2 baseline (R17-1 / H0-11 / H0-13)', () => {
  /** 除已验证的 Cordis 4.0.1 兼容线外，DSH family 直接依赖必须精确统一为 0.1.1-rc.2。 */
  const DSH_PREFIX = '@deepseek-ai/dsh-';

  it('pins every DSH family direct dependency at exactly 0.1.1-rc.2', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    const dshDeps = Object.entries(all).filter(([name]) => name.startsWith(DSH_PREFIX));
    expect(dshDeps.length).toBeGreaterThan(0);
    for (const [name, spec] of dshDeps) {
      expect(spec, `${name} must be pinned exactly`).toBe('0.1.1-rc.2');
    }
    // typert 包进入生产依赖面：发布 .d.ts 需要消费者解析 Typert 类型（I85 交付物 1）。
    expect(pkg.dependencies?.['@deepseek-ai/dsh-typert-protocol']).toBe('0.1.1-rc.2');
    expect(pkg.dependencies?.['@deepseek-ai/dsh-typert-registry']).toBe('0.1.1-rc.2');
  });

  it('locks the manifest, selected profile and lockfile to the same exact version', () => {
    expect(profilePkg.dependencies?.['@deepseek-ai/dsh-base']).toBe('0.1.1-rc.2');
    expect(profilePkg.dependencies?.['@deepseek-ai/dsh-web-app']).toBe('0.1.1-rc.2');
    for (const name of ['@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-typert-registry']) {
      expect(lock).toContain(`${name}@0.1.1-rc.2`);
    }
  });

  it('forbids 0.1.0-rc.7 residue and rc.7/rc.2 mixing in the execution baseline', () => {
    expect(lock).not.toContain('0.1.0-rc.7');
    expect(JSON.stringify(pkg)).not.toContain('0.1.0-rc.7');
    expect(JSON.stringify(profilePkg)).not.toContain('0.1.0-rc.7');
  });
});
