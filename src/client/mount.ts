/**
 * I83 client.ts 的 16 个结构相同 `$mount` 块收敛为参数化工厂（架构审查 §4.1 /
 * §9 #5；review §6.1「16~17 个结构完全相同的 $mount 块」）：`mountRemote` 是
 * `$mount` → `ctx.get` → bind 的唯一实现，每个 Remote 只声明
 * contribution/serviceKey/label/bind（+ 可选 after/onError）。
 *
 * 不变式（与 I46 起各迭代的 Fiber 生命周期语义一致）：
 * - unload（isActive() === false）后完成的 $mount 立即 dispose，不写任何闭包；
 * - bind 持有的处置器由 client.ts 的 unload 清理逐项回收（R10-3 监听归零）；
 * - 挂载失败默认 console.error 静默降级（面板显示不可用），workspace 是唯一
 *   显式 onError（dispatch fail 全屏错误）。
 */
import type { TypertDisposer, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';

/** client apply ctx 中 mountRemote 需要的窄化面（不持有完整 ctx）。 */
export interface MountContext {
  remote: { $mount(contribution: TypertRemoteContribution): Promise<TypertDisposer> };
  get(name: string, silent?: boolean): unknown;
  /** Fiber 存活探针：unload 后完成的 mount 立即 dispose，不写任何闭包。 */
  isActive(): boolean;
}

/** 单个 Remote 的声明式 mount 规格。 */
export interface RemoteMount<T> {
  contribution: TypertRemoteContribution;
  /** mount 成功后从 ctx 读取的 service key（remote.novelXxx）。 */
  serviceKey: string;
  /** 失败日志标签（仅供内部诊断日志使用，不作为作者文案）。 */
  label: string;
  /** 成功：持有处置器 + namespace（client.ts 闭包写入）。 */
  bind(disposer: TypertDisposer, service: T | undefined): void;
  /** 可选：bind 之后的服务可用性后处理（如 workspace 装载 viewModel）。 */
  after?(service: T | undefined): void;
  /** 可选：失败处理（默认 console.error；workspace 显式 dispatch fail）。 */
  onError?(cause: Error): void;
}

/**
 * 参数化 $mount 工厂 —— 16 个同构块的唯一实现（I83）。语义逐字保持：
 * `$mount(contribution).then((dispose) => { if (!active) { void dispose(); return; }
 * <bind>; }, <onError>)`。
 */
export function mountRemote<T>(ctx: MountContext, mount: RemoteMount<T>): void {
  void ctx.remote.$mount(mount.contribution).then((dispose) => {
    if (!ctx.isActive()) { void dispose(); return; }
    const service = ctx.get(mount.serviceKey, false) as T | undefined;
    mount.bind(dispose, service);
    mount.after?.(service);
  }, (cause: Error) => {
    if (mount.onError) mount.onError(cause);
    else console.error(`novel-creation-tool: ${mount.label} 创作台服务挂载失败`, cause);
  });
}
