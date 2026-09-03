import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';

/**
 * I166 桌面窗口的安全默认值（设计 §0.1.1 / §14.32.3）。
 *
 * 这些值由 Main 在创建每一个 BrowserWindow 时显式传入；不依赖 Electron
 * 的隐式默认值，后续窗口也必须复用同一组约束。I172 才会在此边界上
 * 增加 strict IPC bridge，I166 不提供任意 channel。
 */
export const DESKTOP_WEB_PREFERENCES = {
  contextIsolation: true,
  sandbox: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
} as const;

/**
 * 只允许当前打包 Renderer 资源目录内的 file URL 导航。
 *
 * 初始页面由 Main 的 `loadFile` 载入；其他协议、外部 URL、目录之外的
 * 本地文件和 malformed URL 均 fail closed，避免 Renderer 借导航绕出桌面
 * 应用的受控资源边界。路径比较先 resolve 再做目录边界判断，不能用裸
 * `startsWith(root)` 代替（否则 `/renderer-evil` 会误通过）。
 */
export function isAllowedRendererNavigation(url: string, rendererRoot: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') return false;

    const root = resolve(rendererRoot);
    const candidate = resolve(fileURLToPath(parsed));
    return candidate === root || candidate.startsWith(`${root}${sep}`);
  } catch {
    return false;
  }
}
