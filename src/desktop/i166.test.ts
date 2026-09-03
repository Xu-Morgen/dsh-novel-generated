import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DESKTOP_WEB_PREFERENCES, isAllowedRendererNavigation } from './main/security.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('I166 desktop runtime contract', () => {
  it('locks the exact desktop toolchain and Windows-first package target', () => {
    const pkg = JSON.parse(read('package.json')) as {
      main?: string;
      devDependencies?: Record<string, string>;
      build?: { electronVersion?: string; win?: { target?: Array<{ target?: string }> } };
    };

    expect(pkg.main).toBe('dist/desktop/main.cjs');
    expect(pkg.devDependencies?.electron).toBe('44.1.1');
    expect(pkg.devDependencies?.['electron-builder']).toBe('26.0.6');
    expect(pkg.build?.electronVersion).toBe('44.1.1');
    expect(pkg.devDependencies?.['react-dom']).toBe('18.3.1');
    expect(pkg.build?.win?.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
  });

  it('uses explicit secure BrowserWindow defaults', () => {
    expect(DESKTOP_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });

  it('fails closed for external, malformed, and outside-root navigation', () => {
    const rendererRoot = resolve('/tmp/novel-desktop/renderer');
    const localPage = `file://${rendererRoot}/index.html`;
    expect(isAllowedRendererNavigation(localPage, rendererRoot)).toBe(true);
    expect(isAllowedRendererNavigation('https://example.com/', rendererRoot)).toBe(false);
    expect(isAllowedRendererNavigation('not a URL', rendererRoot)).toBe(false);
    expect(isAllowedRendererNavigation(`file://${rendererRoot}-evil/index.html`, rendererRoot)).toBe(false);
  });

  it('keeps the production entry local and the renderer outside Node/second roots', () => {
    const main = read('src/desktop/main/main.ts');
    const renderer = read('src/desktop/renderer/main.ts');
    const html = read('src/desktop/renderer/index.html');

    expect(main).toContain('requestSingleInstanceLock');
    expect(main).toContain('loadFile');
    expect(main).not.toMatch(/loadURL\s*\(/);
    expect(main).not.toMatch(/\.listen\s*\(/);
    expect(renderer.match(/createRoot\s*\(/g)).toHaveLength(1);
    expect(renderer).not.toMatch(/from ['"](?:electron|node:)/);
    expect(html.match(/id="root"/g)).toHaveLength(1);
    expect(html).toContain("connect-src 'none'");
  });
});
