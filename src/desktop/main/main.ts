import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { DESKTOP_WEB_PREFERENCES, isAllowedRendererNavigation } from './security.js';

const DESKTOP_SMOKE = '1';
const DEFAULT_SMOKE_HOLD_MS = 1_000;

let mainWindow: BrowserWindow | null = null;

function desktopRoot(): string {
  return join(app.getAppPath(), 'dist', 'desktop');
}

function isSmokeRun(): boolean {
  return process.env.NOVEL_DESKTOP_SMOKE === DESKTOP_SMOKE;
}

function writeSmokeMarker(message: string): void {
  if (isSmokeRun()) process.stdout.write(`${message}\n`);
}

function focusMainWindow(): void {
  if (mainWindow === null || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function installWindowSecurity(window: BrowserWindow, rendererRoot: string): void {
  window.webContents.on('will-navigate', (event, url) => {
    if (isAllowedRendererNavigation(url, rendererRoot)) return;
    event.preventDefault();
    writeSmokeMarker('[I166] navigation-blocked');
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    writeSmokeMarker(`[I166] new-window-blocked ${url}`);
    return { action: 'deny' };
  });

  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
    writeSmokeMarker('[I166] webview-blocked');
  });
}

function installSmokeProbe(window: BrowserWindow): void {
  if (!isSmokeRun()) return;

  window.webContents.once('did-finish-load', () => {
    void window.webContents.executeJavaScript(
      "document.documentElement.dataset.novelI166Probe ?? ''",
      true,
    ).then((probe) => {
      if (typeof probe === 'string' && probe.length > 0) writeSmokeMarker(`[I166] renderer-probe ${probe}`);
    }).catch(() => undefined);
    writeSmokeMarker(`[I166] ready windows=${BrowserWindow.getAllWindows().length}`);
    void window.webContents.executeJavaScript(
      "window.open('https://invalid.novel-creation-tool.test/'); location.href = 'https://invalid.novel-creation-tool.test/';",
      true,
    );

    const holdMs = Number(process.env.NOVEL_DESKTOP_SMOKE_HOLD_MS ?? DEFAULT_SMOKE_HOLD_MS);
    setTimeout(() => app.quit(), Number.isFinite(holdMs) && holdMs >= 0 ? holdMs : DEFAULT_SMOKE_HOLD_MS);
  });
}

function createMainWindow(): BrowserWindow {
  if (mainWindow !== null && !mainWindow.isDestroyed()) {
    focusMainWindow();
    return mainWindow;
  }

  const root = desktopRoot();
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    webPreferences: {
      ...DESKTOP_WEB_PREFERENCES,
      preload: join(root, 'preload.cjs'),
    },
  });

  mainWindow = window;
  installWindowSecurity(window, root);
  installSmokeProbe(window);
  window.once('ready-to-show', () => window.show());
  window.once('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  void window.loadFile(join(root, 'index.html')).catch(() => undefined);
  return window;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    writeSmokeMarker('[I166] second-instance-focused');
    focusMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => { void createMainWindow(); });

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.novelcreationtool.desktop');
    createMainWindow();
  });
}
