import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ BrowserWindow: class extends EventEmitter {
  destroyed = false;
  webContents = Object.assign(new EventEmitter(), { isLoading: () => false, send: vi.fn(), setWindowOpenHandler: vi.fn() });
  constructor(public options: unknown) { super(); }
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; this.emit('closed'); }
  loadFile() { return Promise.resolve(); }
  showInactive() {}
} }));
import { BrowserWindow } from 'electron';
import { DesktopWindowRegistry, createMonitorWindowHost } from './monitor-window.js';

describe('I197 window lifecycle', () => {
  it('reuses the observer, removes closed windows, reopens on a fresh request and disposes all windows/timers', () => {
    vi.useFakeTimers();
    const registry = new DesktopWindowRegistry();
    const main = new BrowserWindow(); registry.register('main', main);
    const host = createMonitorWindowHost(registry, 'C:/fixture');
    const value = { version: 1 as const, requests: [] };
    host.update(value, true);
    const observer = registry.get('llm-monitor')!;
    expect(observer).toBeDefined();
    host.update(value, true); expect(registry.get('llm-monitor')).toBe(observer);
    vi.advanceTimersByTime(100); expect(observer.webContents.send).toHaveBeenCalledOnce();
    observer.destroy();
    host.update(value, false); expect(registry.get('llm-monitor')).toBeUndefined();
    expect(main.isDestroyed()).toBe(false);
    host.update(value, true); expect(registry.get('llm-monitor')).not.toBe(observer);
    host.dispose(); registry.dispose();
    expect(main.isDestroyed()).toBe(true); expect(vi.getTimerCount()).toBe(0);
    host.update(value, true); expect(registry.get('llm-monitor')).toBeUndefined();
    vi.useRealTimers();
  });
});
