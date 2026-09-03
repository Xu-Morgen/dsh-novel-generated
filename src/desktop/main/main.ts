import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';

import { createApplicationKernel } from '../../app/kernel.js';
import { createCredentialStore } from '../../app/credentials.js';
import type { IpcHandler } from '../../app/ipc-registry.js';
import type { ApplicationPorts } from '../../app/ports.js';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { createElectronSecureStorage } from '../../platform/electron-secure-storage.js';
import { createOpenAICompatibleBackend } from '../../platform/openai-compatible-llm.js';
import { bindElectronIpc } from '../../platform/electron-ipc-binder.js';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
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

function installSmokeProbe(window: BrowserWindow, ports: ApplicationPorts): void {
  if (!isSmokeRun()) return;

  window.webContents.once('did-finish-load', () => {
    ports.registerTask(window.webContents.executeJavaScript(
      "document.documentElement.dataset.novelI166Probe ?? ''",
      true,
    ).then((probe) => {
      if (typeof probe === 'string' && probe.length > 0) writeSmokeMarker(`[I166] renderer-probe ${probe}`);
    }).catch(() => undefined), 'desktop smoke renderer probe');
    ports.registerTask(window.webContents.executeJavaScript(
      "window.novelDesktop.invoke('novel-creation-tool/novelProbe/probe', [], 'i172-smoke').then((result) => { document.documentElement.dataset.novelI172Probe = JSON.stringify(result); return result; })",
      true,
    ).then((result) => {
      if (result && typeof result === 'object') writeSmokeMarker(`[I172] ipc-probe ${JSON.stringify(result)}`);
    }).catch(() => undefined), 'desktop smoke IPC probe');
    writeSmokeMarker(`[I166] ready windows=${BrowserWindow.getAllWindows().length}`);
    void window.webContents.executeJavaScript(
      "window.open('https://invalid.novel-creation-tool.test/'); location.href = 'https://invalid.novel-creation-tool.test/';",
      true,
    );

    const holdMs = Number(process.env.NOVEL_DESKTOP_SMOKE_HOLD_MS ?? DEFAULT_SMOKE_HOLD_MS);
    const timer = setTimeout(() => app.quit(), Number.isFinite(holdMs) && holdMs >= 0 ? holdMs : DEFAULT_SMOKE_HOLD_MS);
    ports.registerDisposer(() => clearTimeout(timer), 'desktop smoke hold timer');
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
  installSmokeProbe(window, applicationKernel.ports);
  window.once('ready-to-show', () => window.show());
  window.once('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  void window.loadFile(join(root, 'index.html')).catch(() => undefined);
  return window;
}

/**
 * Main owns the only application kernel. The three empty composition seams
 * preserve the base → management → orchestration order until later iterations
 * attach the migrated domain services; window listeners and smoke timers are
 * already registered through the same lifecycle owner.
 */
const applicationKernel = createApplicationKernel({
  composition: {
    base: async (ports) => {
      const paths = await createDesktopPaths({ userDataRoot: app.getPath('userData') });
      ports.provide('desktopPaths', paths);
      const credentials = createCredentialStore(createElectronSecureStorage(paths.settingsFile('credentials.bin')));
      ports.provide('credentialStore', credentials.store);
      ports.provide('credentialResolver', credentials.resolver);
      ports.provide('createLlmBackend', (endpoint: string, providerId: string) => createOpenAICompatibleBackend({ endpoint, providerId, credentials: credentials.resolver }));
      ports.registerDisposer(() => {
        if (mainWindow !== null && !mainWindow.isDestroyed()) mainWindow.close();
        mainWindow = null;
      }, 'main window');

      const onSecondInstance = (): void => {
        writeSmokeMarker('[I166] second-instance-focused');
        focusMainWindow();
      };
      const onWindowAllClosed = (): void => {
        if (process.platform !== 'darwin') app.quit();
      };
      const onActivate = (): void => {
        if (applicationKernel.snapshot().state === 'running') void createMainWindow();
      };
      let quitting = false;
      const onBeforeQuit = (event: Electron.Event): void => {
        if (quitting) return;
        event.preventDefault();
        quitting = true;
        void applicationKernel.stop().catch(() => undefined).then(() => app.quit());
      };

      app.on('second-instance', onSecondInstance);
      app.on('window-all-closed', onWindowAllClosed);
      app.on('activate', onActivate);
      app.on('before-quit', onBeforeQuit);
      ports.registerDisposer(() => {
        app.removeListener('second-instance', onSecondInstance);
        app.removeListener('window-all-closed', onWindowAllClosed);
        app.removeListener('activate', onActivate);
        app.removeListener('before-quit', onBeforeQuit);
      }, 'Electron application listeners');

      const ipcHandlers = new Map<string, IpcHandler>([
        ['novel-creation-tool/novelProbe/probe', async () => ({ marker: 'I2-PROBE', ready: true })],
      ]);
      const ipcBinder = bindElectronIpc({
        ipcMain,
        registry: desktopIpcRegistry,
        handlers: ipcHandlers,
        isSenderAllowed: (event) => mainWindow !== null && !mainWindow.isDestroyed() && event.sender === mainWindow.webContents,
        registerDisposer: ports.registerDisposer,
      });
      ports.provide('ipcBinder', ipcBinder);
    },
    management: () => undefined,
    orchestration: () => undefined,
  },
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  void app.whenReady().then(() => {
    app.setAppUserModelId('com.novelcreationtool.desktop');
    return applicationKernel.start();
  }).then(() => {
    createMainWindow();
  }).catch(() => {
    writeSmokeMarker('[I167] kernel-start-failed');
    app.quit();
  });
}
