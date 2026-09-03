import { contextBridge } from 'electron';

/** I166 的最小版本化桥；I172 才会从 canonical registry 派生业务方法。 */
export const DESKTOP_BRIDGE_VERSION = 1 as const;

export const desktopBridge = Object.freeze({
  version: DESKTOP_BRIDGE_VERSION,
});

if (!process.contextIsolated) {
  throw new Error('novelDesktop requires contextIsolation');
}

contextBridge.exposeInMainWorld('novelDesktop', desktopBridge);
