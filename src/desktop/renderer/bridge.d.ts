export {};

import type { DesktopBridge } from '../preload/bridge.js';

declare global {
  interface Window {
    readonly novelDesktop: DesktopBridge;
  }
}
