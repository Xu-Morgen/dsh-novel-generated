import type { Context } from '@deepseek-ai/cordis';

import { assembleBaseServices } from './host/composition/base.js';
import { assembleManagementSurface } from './host/composition/management.js';
import { assembleOrchestrationSurface } from './host/composition/orchestration.js';
import type { CompositionBase, NovelCreationConfig } from './host/composition/types.js';

export type { NovelCreationConfig } from './host/composition/types.js';

/**
 * I1 Host plugin extended by I2 (design §0.1.3 I2): proves the ordinary
 * out-of-tree Cordis package contract with a Host service, and now also
 * registers the gate-only public Remote probe.
 *
 * I89（review v2.0 §3.4）：组合根按「基础服务 / 管理面 / 编排面」三段组装函数
 * 拆分（src/host/composition/），本文件只保留 Fiber 装配基座与三段调用；跨域
 * 副作用（onboarding→timeline 钩子、统计 wire 形状转换）已外移/显式化。
 *
 * - `novelCreation` (I1): minimal read-only status service, removed on dispose.
 * - 其余服务契约见各装配段与既有文档（本文件不再维护 60+ 服务的逐条注释）。
 */
export const name = 'novel-creation-tool';

/** Minimal I1 status service, read-only and versioned for smoke assertions. */
export interface NovelCreationStatus {
  readonly version: '2.0.0';
  readonly ready: true;
}

export function apply(ctx: Context, config: NovelCreationConfig = {}): void {
  const status: NovelCreationStatus = { version: '2.0.0', ready: true };
  // Services are owned by the current Fiber and removed on dispose.
  ctx.provide('novelCreation', status);
  // I75：把 dispose 回调归属到当前 Fiber 的单一钩子，收敛原 27 处
  // `(dispose) => ctx.effect(...)` 重复闭包（见架构审查 §8#3 / §9#1）。
  const onFiberDispose = (dispose: () => void): void => { ctx.effect(() => dispose); };
  const base: CompositionBase = {
    ctx,
    config,
    projectsRoot: config.projectsRoot,
    onFiberDispose,
    logger: ctx.logger(name),
  };
  // I89：三段组装按依赖顺序执行，装配行为与拆分前等价（不改任何 Service/Remote 契约）。
  const baseServices = assembleBaseServices(base);
  const management = assembleManagementSurface(base, baseServices);
  assembleOrchestrationSurface(base, baseServices, management);
}
