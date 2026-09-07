# I199 DoD：初始化拒绝原因穿过真实 IPC

目标：修复 I198 未覆盖的 IPC 通用异常替换，令已知首次导入/空作品拒绝原因到达 Client。

依据：设计 §0.1.2、§14.18.2；计划 §18。Canonical owner：framework-neutral IPC 错误安全边界、Main source import adapter；Client 复用 I198 投影。既有 IPC 方法、参数、结果、错误 envelope 形状和领域前置条件不变。

交付物：仅固定已知消息的内部拒绝类型、Main 精确匹配映射、真实 Main/registry/Client 消费者及未知异常密钥零回显负测。

验收：旧首次 confirmed + 新 confirmed、无初始化 checkpoint 时返回可解释拒绝；Client 显示首次限制且无等待；未知异常、伪造类型/携带敏感内容仍通用失败；合法首次初始化回归通过。

明确不做：不透传任意 Error.message，不改用户作品，不放宽首次导入，不新增公开方法或修改 prompt/样本。

验证：`pnpm run verify:stage-43` exit 0（包含 `verify:i199`）：typecheck、231 文件 / 1201 测试、桌面构建、I199 真实 Electron 拒绝路径、I198 消费者和 I197 窗口 smoke、I43–I45 样本回归通过。I44 held-out 9/10，I45 held-out 0.9，样本/阈值未改。状态：验收通过。

证据：`artifacts/i199-verification.log`；`artifacts/desktop/ui/i199/validation.json` 与 `initialization-refusal.png`。真实窗口展示首次限制，无等待/重试/密钥回显。

交接：刚完成 I199；下一可用迭代 I200，不自动执行。公开 IPC shape 不变，仅内部固定消息拒绝类型可穿过通用错误边界；任意异常仍不回传。历史首次导入补偿策略仍在 backlog。
