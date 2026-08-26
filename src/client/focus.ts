/**
 * I59 焦点管理（design §14.8 / R12-6）：侧板打开时焦点进入、关闭/Esc 后焦点恢复。
 *
 * 契约与不变式：
 * - 所有 DOM 访问都经 safeDocument() 收敛；在无 DOM 表面（单元测试 fake document、
 *   非浏览器宿主）下安全降级为 no-op，绝不抛错（R12-6「Fiber 清理/明暗回归」不受影响）。
 * - 焦点进入目标由 `data-novel-focus-scope`（面板根）+ `data-novel-focus-target`
 *   （品牌头栏，tabIndex=-1，见 client.ts）声明；关闭后焦点恢复到侧栏启动按钮
 *   `data-novel-launch`，保证「焦点进入/恢复」闭环。
 * - 本模块只做「找节点 + focus()」，不持有状态、不绑定监听器；Esc 键处理在
 *   client.ts 的根节点 onKeyDown（事件处理属性随 Fiber 卸载自动回收）。
 */

/** 安全的 document 引用：`document` 未定义（非浏览器/测试收尾）时返回 undefined。 */
export function safeDocument(): Document | undefined {
  return typeof document === 'undefined' ? undefined : document;
}

/**
 * 聚焦第一个匹配选择器的可聚焦元素；返回是否成功。无 DOM、选择器缺失或节点
 * 不可聚焦时 no-op（返回 false）。
 */
export function focusSelector(selector: string): boolean {
  const doc = safeDocument();
  const node = doc?.querySelector?.(selector);
  if (node != null && typeof (node as HTMLElement).focus === 'function') {
    (node as HTMLElement).focus();
    return true;
  }
  return false;
}

/**
 * 打开面板后经一次宏任务聚焦目标（等 React 提交真实 DOM）；宿主没有定时器时
 * 直接 no-op（I59 依赖浏览器宿主，测试环境静默跳过）。
 */
export function scheduleFocus(selector: string): void {
  if (typeof setTimeout !== 'function') return;
  setTimeout(() => { focusSelector(selector); }, 0);
}
