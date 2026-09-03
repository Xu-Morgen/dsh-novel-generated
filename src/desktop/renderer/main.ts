import * as React from 'react';
import { createRoot } from 'react-dom/client';

import { mountDesktopWorkbench } from './shell.js';
import { createDesktopWorkbenchStore } from './store-adapter.js';

/** I173 单一 React root；业务 IPC 与具体领域面板按 I174–I180 继续接入。 */
const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('desktop renderer root is missing');

const bridgeVersion = window.novelDesktop.version;
document.documentElement.dataset.novelI166Probe = JSON.stringify({
  bridgeVersion,
  hasNodeRequire: typeof Reflect.get(window, 'require') === 'function',
  hasNodeProcess: typeof Reflect.get(window, 'process') !== 'undefined',
  rootCount: document.querySelectorAll('#root').length,
});

const rendererRoot = createRoot(rootElement);
const dispose = mountDesktopWorkbench(rendererRoot, createDesktopWorkbenchStore());
window.addEventListener('unload', dispose, { once: true });
