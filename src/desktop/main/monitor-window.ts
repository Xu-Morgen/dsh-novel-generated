import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { DESKTOP_WEB_PREFERENCES } from './security.js';
import { LLM_MONITOR_CHANNEL, llmMonitorSchema, type LlmMonitorSnapshot } from '../llm-monitor-contract.js';

/** Main owns every registered window; auxiliary close never cancels domain work. */
export class DesktopWindowRegistry {
  private readonly windows = new Map<string, BrowserWindow>();
  register(purpose: 'main' | 'llm-monitor', window: BrowserWindow): void {
    if (this.windows.has(purpose)) throw new Error('Window purpose already registered');
    this.windows.set(purpose, window);
    window.once('closed', () => { if (this.windows.get(purpose) === window) this.windows.delete(purpose); });
  }
  get(purpose: 'main' | 'llm-monitor'): BrowserWindow | undefined { return this.windows.get(purpose); }
  dispose(): void { for (const window of this.windows.values()) if (!window.isDestroyed()) window.destroy(); this.windows.clear(); }
}

/** Push-only observer window: its preload exposes no invoke, paths, provider or domain service. */
export function createMonitorWindowHost(registry: DesktopWindowRegistry, root: string) {
  let snapshot: LlmMonitorSnapshot = { version: 1, requests: [] };
  let dirty = false;
  let disposed = false;
  const send = (): void => {
    const window = registry.get('llm-monitor');
    if (!dirty || !window || window.isDestroyed() || window.webContents.isLoading()) return;
    window.webContents.send(LLM_MONITOR_CHANNEL, llmMonitorSchema.parse(snapshot)); dirty = false;
  };
  const timer = setInterval(send, 100);
  return {
    update(value: LlmMonitorSnapshot, started: boolean): void {
      if (disposed) return;
      snapshot = llmMonitorSchema.parse(value); dirty = true;
      if (!started || !registry.get('main') || registry.get('llm-monitor')) return;
      const window = new BrowserWindow({ title: 'AI 过程与错误', width: 800, height: 640, show: false,
        webPreferences: { ...DESKTOP_WEB_PREFERENCES, preload: join(root, 'monitor-preload.cjs') } });
      registry.register('llm-monitor', window);
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', event => event.preventDefault());
      window.webContents.on('will-attach-webview', event => event.preventDefault());
      window.webContents.on('did-finish-load', () => { dirty = true; send(); });
      window.once('ready-to-show', () => window.showInactive());
      void window.loadFile(join(root, 'monitor.html')).catch(() => { if (!window.isDestroyed()) window.destroy(); });
    },
    dispose(): void { disposed = true; clearInterval(timer); snapshot = { version: 1, requests: [] }; },
  };
}
