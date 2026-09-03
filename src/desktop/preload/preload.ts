import { contextBridge, ipcRenderer } from 'electron';

import { IPC_CANCEL_CHANNEL, IPC_INVOKE_CHANNEL, IPC_PROGRESS_CHANNEL } from '../../app/ipc-transport.js';
import type { IpcProgressEvent } from '../../app/ipc-transport.js';
import { IPC_METHOD_IDS } from './ipc-method-ids.js';
import { createDesktopBridge } from './bridge.js';

export { DESKTOP_BRIDGE_VERSION } from './bridge.js';

const desktopBridge = createDesktopBridge(IPC_METHOD_IDS, {
  invoke: (request) => ipcRenderer.invoke(IPC_INVOKE_CHANNEL, request),
  cancel: (request) => ipcRenderer.invoke(IPC_CANCEL_CHANNEL, request),
  onProgress: (listener) => {
    const wrapped = (_event: unknown, payload: unknown): void => {
      if (!isProgressEvent(payload)) return;
      listener(payload);
    };
    ipcRenderer.on(IPC_PROGRESS_CHANNEL, wrapped);
    return () => ipcRenderer.removeListener(IPC_PROGRESS_CHANNEL, wrapped);
  },
});

if (!process.contextIsolated) {
  throw new Error('novelDesktop requires contextIsolation');
}

contextBridge.exposeInMainWorld('novelDesktop', desktopBridge);

function isProgressEvent(value: unknown): value is IpcProgressEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.keys(value).sort().join('|') !== 'requestId|value') return false;
  const candidate = value as { requestId?: unknown; value?: unknown };
  return typeof candidate.requestId === 'string' && candidate.requestId.length > 0 && isSerializableValue(candidate.value);
}

function isSerializableValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || value === null || seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => isSerializableValue(item, seen));
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  return Object.values(value).every((item) => isSerializableValue(item, seen));
}
