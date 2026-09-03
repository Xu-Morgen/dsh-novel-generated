# Cordis composition → ApplicationKernel 映射（I167）

本文件记录迁移期的等价接线，不改变领域 Service、Remote 或作品文件契约。`src/app` 只定义框架无关的组合与生命周期边界；旧 `src/host/composition` 仍是 I167 的来源实现，后续迭代逐段把同一依赖顺序接入 Main。

## 固定装配顺序

| ApplicationKernel 阶段 | 当前 Cordis 来源 | 允许消费的前置产物 | 等价约束 |
| --- | --- | --- | --- |
| `base` | `assembleBaseServices(base)` | ports 与平台服务 | 先创建六层 Domain Service、项目/文本 owner、解析/检测与设置解析，再提供基础 service |
| `management` | `assembleManagementSurface(base, baseServices)` | `base` service | 只消费基础 service，按时间线、受控编辑、写作裁决、审校、队列与导入管理依赖顺序构造 |
| `orchestration` | `assembleOrchestrationSurface(base, baseServices, management)` | `base` + `management` service | 最后接入管理 Remote、workspace、Agent、统计与 portability；不反向创建基础 owner |

Kernel 以固定 `base → management → orchestration` 顺序运行阶段。service key 只能首次 `provide`，重复 owner 直接失败；重启先完整停止并清空本轮注册，再以新周期注册一次。

## 生命周期映射

| Cordis 语义 | ApplicationKernel / DesktopLifecycle | 保持的语义 |
| --- | --- | --- |
| `ctx.provide` / `ctx.get` | `ApplicationPorts.provide` / `get` / `has` | 组合阶段间显式传递依赖；禁止静默替换 owner |
| `ctx.effect` | `registerDisposer` | 注册一次、停止时统一执行、逆序清理、单次 stop 幂等 |
| `onFiberDispose` | `ApplicationLifecyclePort` | Service 的 cleanup 进入同一个生命周期，不再散落到宿主事件 |
| Service 内的 active `AbortController` | `createAbortController` 或 `trackAbortController` | stop 先 abort，再等待任务收敛，最终计数归零 |
| 异步 Fiber 工作 | `registerTask` | 任务 settle 后自动退出计数；stop 等待仍在飞任务并观察其 rejection |
| `ctx.logger(scope)` | `ports.logger(scope)` | 仅保留窄 logger seam，平台 logger 由 Main 注入 |

`DesktopLifecycle.stop()` 即使某个 disposer 失败也会继续清理其余资源，最后以聚合错误报告；服务注册表由 `ApplicationKernel` 在停止后清空。这样窗口关闭、应用退出和后续升级都不会遗留 handler、timer、任务或请求。

## 边界与迁移留白

- `src/app` 不依赖 Electron、Node、DSH、Cordis 或具体 provider；平台能力由 Main 组装时通过 ports/adapters 提供。
- I167 只建立组合与生命周期地基；IPC、路径、CredentialStore、LlmBackend、Remote 迁移和旧组合退役分别属于 I168–I186。
- I166 Main 已创建唯一 `ApplicationKernel`，其三阶段暂保持空 composition seam；窗口监听、smoke timer 和 renderer probe 已通过同一 `DesktopLifecycle` 注册。领域 Service 的三段等价接线在后续 Main 迁移卡中替换这些 seam。
