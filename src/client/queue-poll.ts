import type { QueueNamespace } from './shared.js';
import type { QueueStatusShape } from './layers/queue.js';
import { unwrap } from './shared.js';

export const QUEUE_POLL_INTERVAL_MS = 2_000;

/**
 * I88 队列轮询控制器（review v2.0 §3.3 / 计划 §18 I88；设计 §0.1.1 Fiber 行）。
 *
 * 职责：**唯一的**队列状态轮询 timer 持有者。控制器在 Fiber（apply 级）创建一次、
 * 随 Fiber dispose 完整回收 —— 不再生长在每次渲染重建的 ops 闭包内。
 *
 * 不变式：
 * - 单飞行：`start()` 在已有挂起轮询或已有在途 status 拉取时不重复调度
 *   （消除「单槽 timer 被覆盖、堆积并行轮询链」）；
 * - `stop()` 清挂起 timer（可逆：之后 `start()` 可重启；Fiber 卸载时由 disposer
 *   调用一次，配合 `isActive()` 守卫保证卸载后零新调度）；
 * - 活跃判定经 `isActive()` 函数（而非布尔快照）：卸载后旧闭包立即自视 inactive，
 *   不再 patch 不再续调；
 * - 轮询间隔与队列业务语义不变（不改 Host queue-service / 不改队列 UI 行为）。
 *
 * ops 只发命令（start/stop），不持有任何 timer。
 */
export interface QueuePollDeps {
  isActive(): boolean;
  projectId(): string | undefined;
  queue(): QueueNamespace | undefined;
  onStatus(next: QueueStatusShape): void;
  intervalMs?: number;
}

export interface QueuePollHandle {
  /** 立即拉取一次并（运行/暂停态）续调；已有挂起轮询或在途拉取时不重复调度。 */
  start(): void;
  /** 清挂起 timer（可逆）；Fiber disposer 与面板 dismiss 都调用它。 */
  stop(): void;
}

export function createQueuePollController(deps: QueuePollDeps): QueuePollHandle {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;

  const clear = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  // timer 触发时先清句柄引用再 tick：否则已触发的句柄仍占着 `timer` 槽，
  // 下一次 resolve 的 `timer === undefined` 判 False，续调静默丢失（链自停）。
  const onTimer = (): void => {
    timer = undefined;
    tick();
  };

  const tick = (): void => {
    const projectId = deps.projectId();
    const target = deps.queue();
    if (!deps.isActive() || target === undefined || projectId === undefined) {
      clear();
      return;
    }
    // 在途拉取期间不重复发起（单飞行；Host 状态机幂等，轮询只是观察）。
    if (inFlight) return;
    inFlight = true;
    void unwrap(target.status(projectId)).then((projection) => {
      inFlight = false;
      if (!deps.isActive()) { clear(); return; }
      const next = projection;
      deps.onStatus(next);
      if (next.runState === 'running' || next.runState === 'paused') {
        if (timer === undefined) timer = setTimeout(onTimer, deps.intervalMs ?? QUEUE_POLL_INTERVAL_MS);
      } else {
        clear();
      }
    }, () => {
      inFlight = false;
      clear();
    });
  };

  return Object.freeze({
    start(): void {
      // 已有挂起轮询：不重复调度（单槽）。在途拉取由 tick 的 inFlight 守卫挡住。
      if (timer !== undefined) return;
      tick();
    },
    stop(): void {
      clear();
    },
  });
}
