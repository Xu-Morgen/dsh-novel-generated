import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/** I183 locks the production Electron graph while leaving old source testable as history. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const pkg = JSON.parse(read('package.json')) as Record<string, any>;
const lock = read('pnpm-lock.yaml');

const productionSources = [
  'src/desktop/main/main.ts',
  'src/desktop/preload/preload.ts',
  'src/desktop/renderer/main.ts',
  'src/desktop/renderer/shell.ts',
  'src/platform/desktop-ipc-registry.ts',
];

describe('I183 desktop production contract', () => {
  it('has no DSH manifest surface or production dependency', () => {
    expect(pkg.main).toBe('dist/desktop/main.cjs');
    expect(pkg.exports).toBeUndefined();
    expect(pkg.dsh).toBeUndefined();
    expect(Object.keys(pkg.dependencies ?? {}).some((name) => /@deepseek-ai|cordis|typert|slot/i.test(name))).toBe(false);
    const importer = lock.slice(lock.indexOf('dependencies:'), lock.indexOf('devDependencies:'));
    expect(importer).not.toMatch(/@deepseek-ai\/(?:cordis|dsh-)/);
  });

  it('keeps DSH/Cordis/Slot/Typert/ModuleLoader/ctx.llm out of production sources', () => {
    const forbidden = /@deepseek-ai|ModuleLoader|ctx\.llm|from ['"]\.\.\/remote\.js['"]|from ['"].*host\/remote/;
    for (const path of productionSources) expect(read(path), path).not.toMatch(forbidden);
  });

  it('keeps the retired client wrapper outside the build entry', () => {
    expect(read('scripts/build-desktop.mjs')).toContain("source('src/desktop/renderer/main.ts')");
    expect(read('scripts/build-desktop.mjs')).not.toContain('src/client.ts');
    expect(read('package.json')).not.toContain('build:legacy');
    expect(read('package.json')).not.toContain('build:client');
  });
});

describe('historical client source checks', () => {
  it('retains the old source as a non-production regression fixture', () => {
    expect(read('src/client.ts')).toContain('shell.overlay');
  });
});
