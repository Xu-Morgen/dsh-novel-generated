import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'node:path';

import { createApplicationKernel } from '../../app/kernel.js';
import { createCredentialStore } from '../../app/credentials.js';
import type { IpcHandler } from '../../app/ipc-registry.js';
import type { ApplicationPorts } from '../../app/ports.js';
import { createDesktopPaths } from '../../platform/desktop-paths.js';
import { createElectronSecureStorage } from '../../platform/electron-secure-storage.js';
import { createOpenAICompatibleBackend } from '../../platform/openai-compatible-llm.js';
import { LLM_BACKEND_MARKER, type LlmBackend } from '../../llm/port/index.js';
import { createLlmConfigService } from '../../host/llm-config-service.js';
import { bindElectronIpc } from '../../platform/electron-ipc-binder.js';
import { desktopIpcRegistry } from '../../platform/desktop-ipc-registry.js';
import { DESKTOP_WEB_PREFERENCES, isAllowedRendererNavigation } from './security.js';
import { createDesktopProjectHandlers } from './project-handlers.js';

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
    ports.registerTask(window.webContents.executeJavaScript(
      "window.novelDesktop.invoke('novel-creation-tool/novelReviewRepair/propose', [], 'i174-review-repair-negative').then((result) => { document.documentElement.dataset.novelI174Probe = JSON.stringify(result); return result; })",
      true,
    ).then((result) => {
      if (result && typeof result === 'object') writeSmokeMarker(`[I174] review-repair-negative ${JSON.stringify(result)}`);
    }).catch(() => undefined), 'desktop review repair strict IPC probe');
    ports.registerTask(window.webContents.executeJavaScript(
      "new Promise((resolve) => setTimeout(() => resolve(JSON.stringify({ rootCount: document.querySelectorAll('#root').length, desktopRoots: document.querySelectorAll('[data-novel-desktop-root]').length, connection: document.querySelector('[data-novel-desktop-root]')?.getAttribute('data-novel-connection-status'), workspace: document.querySelector('[data-novel-workspace]')?.getAttribute('data-novel-workspace'), text: document.querySelector('[data-novel-workspace]')?.textContent })), 50))",
      true,
    ).then((probe) => {
      if (typeof probe === 'string' && probe.length > 0) writeSmokeMarker(`[I173] renderer-shell ${probe}`);
    }).catch(() => undefined), 'desktop renderer shell probe');
    ports.registerTask(window.webContents.executeJavaScript(
      `(async () => {
        const invoke = (method, args, requestId) => window.novelDesktop.invoke(method, args, requestId);
        const created = await invoke('novel-creation-tool/novelWorkspace/projectCreate', [{ projectId: 'i175-smoke', name: '桌面冒烟作品' }], 'i175-create');
        const opened = await invoke('novel-creation-tool/novelWorkspace/projectOpen', ['i175-smoke'], 'i175-open');
        const archived = await invoke('novel-creation-tool/novelWorkspace/projectArchive', ['i175-smoke'], 'i175-archive');
        const archivedOpen = await invoke('novel-creation-tool/novelWorkspace/projectOpen', ['i175-smoke'], 'i175-archived-open');
        const restored = await invoke('novel-creation-tool/novelWorkspace/projectRestore', ['i175-smoke'], 'i175-restore');
        const settings = await invoke('novel-creation-tool/novelWorkbenchSettings/load', [], 'i175-settings');
        await new Promise((resolve) => setTimeout(resolve, 50));
        return JSON.stringify({ created, opened, archived, archivedOpen, restored, settings, chooser: document.querySelectorAll('[data-novel-project-chooser]').length });
      })()`,
      true,
    ).then((probe) => {
      if (typeof probe === 'string' && probe.length > 0) writeSmokeMarker(`[I175] project-loop ${probe}`);
    }).catch(() => undefined), 'desktop project lifecycle smoke');
    ports.registerTask(window.webContents.executeJavaScript(
      `(async () => {
        const invoke = (method, args, requestId) => window.novelDesktop.invoke(method, args, requestId);
        const projectId = 'i176-smoke';
        const created = await invoke('novel-creation-tool/novelWorkspace/projectCreate', [{ projectId, name: '结构化编辑冒烟作品' }], 'i176-create');
        const opened = await invoke('novel-creation-tool/novelWorkspace/projectOpen', [projectId], 'i176-open');
        const [characters, worldview, outline, relationship, state, canon, knowledge, knowledgePending, ruleStyle] = await Promise.all([
          invoke('novel-creation-tool/novelWorkspace/characterList', [projectId], 'i176-characters'),
          invoke('novel-creation-tool/novelWorkspace/worldviewList', [projectId], 'i176-worldview'),
          invoke('novel-creation-tool/novelWorkspace/outlineRead', [projectId], 'i176-outline'),
          invoke('novel-creation-tool/novelWorkspace/relationshipRead', [projectId], 'i176-relationship'),
          invoke('novel-creation-tool/novelWorkspace/stateSnapshots', [projectId], 'i176-state'),
          invoke('novel-creation-tool/novelWorkspace/canonQuery', [projectId, undefined], 'i176-canon'),
          invoke('novel-creation-tool/novelKnowledgeManager/list', [projectId], 'i176-knowledge'),
          invoke('novel-creation-tool/novelKnowledgeManager/pending', [projectId], 'i176-knowledge-pending'),
          invoke('novel-creation-tool/novelRuleStyleManager/list', [projectId], 'i176-rule-style'),
        ]);
        return JSON.stringify({ created, opened, characters, worldview, outline, relationship, state, canon, knowledge, knowledgePending, ruleStyle });
      })()`,
      true,
    ).then((probe) => {
      if (typeof probe === 'string' && probe.length > 0) writeSmokeMarker(`[I176] structured-loop ${probe}`);
    }).catch(() => undefined), 'desktop structured editing smoke');
    ports.registerTask(window.webContents.executeJavaScript(
      `(async () => {
        const invoke = (method, args, requestId) => window.novelDesktop.invoke(method, args, requestId);
        const projectId = 'i177-smoke';
        const created = await invoke('novel-creation-tool/novelWorkspace/projectCreate', [{ projectId, name: 'C5 workbench smoke' }], 'i177-create');
        const opened = await invoke('novel-creation-tool/novelWorkspace/projectOpen', [projectId], 'i177-open');
        const initial = await invoke('novel-creation-tool/novelText/fingerprint', [projectId], 'i177-fingerprint-1');
        const initialHash = initial?.value?.fingerprint;
        const chapter = await invoke('novel-creation-tool/novelText/chapterCreate', [projectId, { id: 'chapter-1', index: 1, title: 'First chapter', pov: 'hero', status: 'draft', expectedFingerprint: initialHash }], 'i177-chapter');
        const afterChapter = await invoke('novel-creation-tool/novelText/fingerprint', [projectId], 'i177-fingerprint-2');
        const scene = await invoke('novel-creation-tool/novelText/sceneCreate', [projectId, { chapterId: 'chapter-1', index: 0, scene: { id: 'scene-1', content: 'abc', summary: 'Opening', beats: [], canonEvents: [], notes: '' }, expectedFingerprint: afterChapter?.value?.fingerprint }], 'i177-scene');
        const chapters = await invoke('novel-creation-tool/novelWorkspace/chapterList', [projectId], 'i177-list');
        const read = await invoke('novel-creation-tool/novelWorkspace/sceneRead', [projectId, 'chapter-1', 'scene-1'], 'i177-read');
        const edited = await invoke('novel-creation-tool/novelWorkspace/sceneEdit', [projectId, 'chapter-1', 'scene-1', { start: 0, end: 3 }, 'xyz', undefined], 'i177-edit');
        const branch = await invoke('novel-creation-tool/novelBranches/save', [projectId, 'chapter-1', 'scene-1', 'before-final'], 'i177-branch');
        const branchRead = await invoke('novel-creation-tool/novelBranches/read', [projectId, 'chapter-1', 'scene-1', branch?.value?.branches?.[0]?.id], 'i177-branch-read');
        const binding = await invoke('novel-creation-tool/novelSceneOutlineBinding/read', [projectId], 'i177-binding');
        const invalid = await invoke('novel-creation-tool/novelWorkspace/sceneEdit', [projectId, 'chapter-1', 'scene-1', { start: 3, end: 1 }, 'bad', undefined], 'i177-invalid-range');
        return JSON.stringify({ created, opened, chapter, scene, chapters, read, edited, branch, branchRead, binding, invalid });
      })()` ,
      true,
    ).then((probe) => {
      if (typeof probe === 'string' && probe.length > 0) writeSmokeMarker(`[I177] c5-loop ${probe}`);
    }).catch(() => undefined), 'desktop C5 workbench smoke');
    ports.registerTask(window.webContents.executeJavaScript(
      `(async () => {
        const invoke = (method, args, requestId) => window.novelDesktop.invoke(method, args, requestId);
        const projectId = 'i178-smoke';
        const created = await invoke('novel-creation-tool/novelWorkspace/projectCreate', [{ projectId, name: 'review queue smoke' }], 'i178-create');
        const opened = await invoke('novel-creation-tool/novelWorkspace/projectOpen', [projectId], 'i178-open');
        const review = await invoke('novel-creation-tool/novelReview/scan', [projectId, undefined], 'i178-review');
        const records = await invoke('novel-creation-tool/novelReview/records', [projectId], 'i178-records');
        const queue = await invoke('novel-creation-tool/novelQueue/status', [projectId], 'i178-queue');
        const paused = await invoke('novel-creation-tool/novelQueue/pause', [projectId], 'i178-pause');
        const audit = await invoke('novel-creation-tool/novelReferenceAudit/list', [projectId, undefined], 'i178-audit');
        const pending = await invoke('novel-creation-tool/novelReferenceCorrection/pending', [projectId], 'i178-pending');
        const invalid = await invoke('novel-creation-tool/novelReview/adjudicate', [projectId, { decision: 'continue', issueIds: [] }], 'i178-invalid');
        return JSON.stringify({ created, opened, review, records, queue, paused, audit, pending, invalid });
      })()` ,
      true,
    ).then((probe) => {
      if (typeof probe === 'string' && probe.length > 0) writeSmokeMarker(`[I178] review-queue-loop ${probe}`);
    }).catch(() => undefined), 'desktop review queue smoke');
    ports.registerTask(window.webContents.executeJavaScript(
      `(async () => {
        const invoke = (method, args, requestId) => window.novelDesktop.invoke(method, args, requestId);
        const projectId = 'i179-smoke';
        const created = await invoke('novel-creation-tool/novelWorkspace/projectCreate', [{ projectId, name: 'source import smoke' }], 'i179-create');
        const opened = await invoke('novel-creation-tool/novelWorkspace/projectOpen', [projectId], 'i179-open');
        const normalized = await invoke('novel-creation-tool/novelImportExport/normalizeSource', [projectId, { fileName: 'pasted.txt', format: 'txt', text: 'idea\\n\\nplan' }], 'i179-normalize');
        const sourceHash = normalized?.value?.sourceHash;
        const session = await invoke('novel-creation-tool/novelImportInterpretation/create', [{ projectId, sourceHash, intent: { sourceRole: 'idea', treatment: 'expand-outline' }, paragraphDecisions: [{ paragraphId: 'paragraph-0001', decision: 'pending', summary: 'awaiting author review' }] }], 'i179-session');
        const importSessionId = session?.value?.importSessionId;
        const read = await invoke('novel-creation-tool/novelImportInterpretation/read', [{ projectId, importSessionId, sourceHash }], 'i179-read');
        const discarded = await invoke('novel-creation-tool/novelImportInterpretation/discard', [{ projectId, importSessionId, sourceHash }], 'i179-discard');
        const invalid = await invoke('novel-creation-tool/novelImportInterpretation/read', [{ projectId: 'other-project', importSessionId, sourceHash }], 'i179-invalid');
        return JSON.stringify({ created, opened, normalized, session, read, discarded, invalid });
      })()` ,
      true,
    ).then((probe) => {
      if (typeof probe === 'string' && probe.length > 0) writeSmokeMarker(`[I179] source-import-loop ${probe}`);
    }).catch(() => undefined), 'desktop source import smoke');
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
      const llmConfig = createLlmConfigService({
        describe: async (ref) => ({ ...await credentials.store.describe(ref), writable: true }),
        set: (ref, secret) => credentials.store.set(ref, secret),
      }, undefined, paths.settingsRoot);
      const llm: LlmBackend = {
        [LLM_BACKEND_MARKER]: true,
        async *stream(request) {
          const config = await llmConfig.load();
          if (config.baseUrl === '') throw new Error('LLM endpoint is not configured');
          const backend = createOpenAICompatibleBackend({ endpoint: config.baseUrl, providerId: config.providerId, credentials: credentials.resolver });
          yield* backend.stream(request);
        },
      };
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
        ...createDesktopProjectHandlers(paths, (directory) => { void shell.openPath(directory); }, {
          llm,
          onDispose: (dispose) => { ports.registerDisposer(dispose, 'desktop C5 services'); },
          selectDocxFile: async () => {
            if (mainWindow === null || mainWindow.isDestroyed()) return undefined;
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [{ name: 'Word document', extensions: ['docx'] }],
            });
            return result.canceled ? undefined : result.filePaths[0];
          },
        }),
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
