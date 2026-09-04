import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** I183 production manifest and legacy fixture boundary. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

const pkg = JSON.parse(read('package.json')) as Record<string, any>;
const profilePkg = JSON.parse(read('legacy-dsh/fixtures/selected-profile.package.json')) as Record<string, any>;
const lock = read('pnpm-lock.yaml');
const lockImporter = lock.slice(lock.indexOf('importers:'), lock.indexOf('packages:'));
const productionLockImporter = lockImporter.slice(lockImporter.indexOf('dependencies:'), lockImporter.indexOf('devDependencies:'));

describe('I183 Electron production manifest', () => {
  it('declares only the desktop package entry and artifact', () => {
    expect(pkg.type).toBe('module');
    expect(pkg.engines?.node).toBe('>=22');
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(pkg.main).toBe('dist/desktop/main.cjs');
    expect(pkg.exports).toBeUndefined();
    expect(pkg.dsh).toBeUndefined();
    expect(pkg.files).toEqual(['dist/desktop']);
  });

  it('keeps retired DSH/Cordis packages out of production dependencies and importer', () => {
    const forbidden = Object.keys(pkg.dependencies ?? {}).filter((name) => /@deepseek-ai\/(cordis|dsh-)|cordis|typert/i.test(name));
    expect(forbidden).toEqual([]);
    expect(productionLockImporter).not.toMatch(/@deepseek-ai\/(?:cordis|dsh-)/);
  });

  it('removes root composition manifests while retaining explicit historical fixtures', () => {
    expect(profilePkg.dependencies?.['novel-creation-tool']).toBe('2.0.0');
    expect(profilePkg.dsh?.profile?.bundles).toContain('novel-creation-tool');
    expect(() => read('cordis.yml')).toThrow();
    expect(() => read('cordis.patch.yml')).toThrow();
  });
});

describe('I85 historical DSH fixture baseline', () => {
  it('keeps every historical DSH fixture pin exact without promoting it to production', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies } as Record<string, string>;
    const dshDeps = Object.entries(all).filter(([name]) => name.startsWith('@deepseek-ai/dsh-'));
    expect(dshDeps.length).toBeGreaterThan(0);
    for (const [name, spec] of dshDeps) expect(spec, `${name} must be pinned exactly`).toBe('0.1.1-rc.2');
    expect(pkg.dependencies?.['@deepseek-ai/dsh-typert-protocol']).toBeUndefined();
    expect(pkg.dependencies?.['@deepseek-ai/dsh-typert-registry']).toBeUndefined();
  });

  it('forbids 0.1.0-rc.7 residue', () => {
    expect(lock).not.toContain('0.1.0-rc.7');
    expect(JSON.stringify(pkg)).not.toContain('0.1.0-rc.7');
    expect(JSON.stringify(profilePkg)).not.toContain('0.1.0-rc.7');
  });
});
