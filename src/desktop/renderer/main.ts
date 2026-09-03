import * as React from 'react';
import { createRoot } from 'react-dom/client';

/** I166 单一 React root 占位；产品面板迁移属于 I173–I180。 */
const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('desktop renderer root is missing');

const bridgeVersion = window.novelDesktop.version;
document.documentElement.dataset.novelI166Probe = JSON.stringify({
  bridgeVersion,
  hasNodeRequire: typeof Reflect.get(window, 'require') === 'function',
  hasNodeProcess: typeof Reflect.get(window, 'process') !== 'undefined',
  rootCount: document.querySelectorAll('#root').length,
});

const appView = React.createElement(
  'main',
  { className: 'desktop-placeholder', 'data-novel-desktop-root': 'true' },
  React.createElement('p', { className: 'eyebrow' }, 'NOVEL CREATION TOOL'),
  React.createElement('h1', null, '桌面创作器'),
  React.createElement('p', null, `Electron 桌面骨架已启动 · Bridge v${bridgeVersion}`),
);

createRoot(rootElement).render(appView);
