# I197 DoD：统一 LLM 观察与独立窗口

目标：所有生产 LlmBackend 请求自动进入独立 Electron AI 过程窗口，展示连接、推理、正文、完成、取消和脱敏失败；不依赖业务 IPC 方法名。

Owner：Main 统一 backend 装饰器、窗口注册表与观察窗口；独立 preload 和 HTML/React root。既有领域方法保持；新增只读 push 通道使用 strict schema 和锁文件，不授予辅助窗领域调用权限。

验收：fake backend 的透传/并发/失败/取消/跨 chunk secret 脱敏负测；真实 Electron 从来源分析触发第二窗口、失败保留、辅助窗无领域 bridge；关闭辅助窗不取消任务，主窗关闭回收所有窗口；全量测试、构建、smoke。

验证：pnpm run verify:i197；pnpm run verify:stage-41。不修改 prompt、样本、领域合同，不实现 profiles。

状态：已完成。`pnpm run verify:stage-41` exit 0（包含 `verify:i197`）：typecheck、230 文件 / 1195 测试、桌面构建、开发态与打包态真实 Electron smoke、Windows NSIS 打包、既有 I43–I45 样本回归全部通过。I44 held-out 9/10，I45 held-out 0.9；未修改样本或阈值。

验收证据：`artifacts/desktop/ui/i197/validation.json`、`artifacts/desktop/ui/i197-packaged/validation.json`；独立窗口、来源分析完成、HTTP 失败保留、受限 preload、密钥零回显均通过。窗口复用/关闭/重开/清理及跨 chunk 脱敏由确定性测试覆盖。

交接：新增合同仅为 `novel:llm-monitor:v1` 只读投影，既有领域 IPC 不变。下一可用迭代 I198，未自动执行；多 profile、业务校验错误汇总和旧 F1/F2 仍不在本次范围。
