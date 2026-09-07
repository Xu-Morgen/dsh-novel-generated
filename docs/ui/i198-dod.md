# I198 DoD：规则与文风初始化启动失败显示与恢复

目标：修复来源确认后初始化被拒绝却持续显示“正在检查 AI 配置”的假等待。

依据：设计 §14.18.2；计划 §18 修复纪律。现场只读元数据表明作品已有首次 confirmed session，后续导入被 firstConfirmed 正确拒绝。

Canonical owner：Client ImportInterpretationController 与规则文风初稿面板。兼容边界：Main 首次导入、空作品、B1/B4 保护、IPC schema、I11 和 prompt/样本保持不变。

交付物：启动失败状态、中文前置条件说明、已有高级诊断、可恢复错误同 session 重试、迟到响应隔离、确定性/负向测试与 smoke。

验收：拒绝后无流式等待；后续导入说明首次限制；暂时失败可重试且不重复 confirm/create；重复点击不重复 begin；旧 session 响应不覆盖当前来源；合法首次导入回归通过。

明确不做：不重置用户作品/session，不放宽首次导入限制，不新增 IPC 或 LLM 能力。

验证：`pnpm run verify:stage-42` exit 0（包含 `verify:i198`）：typecheck、230 文件 / 1198 测试、桌面构建、I198 消费者 smoke、I197 真实 Electron smoke、I43–I45 既有样本回归全绿。I44 held-out 9/10，I45 held-out 0.9；样本和阈值未修改。追加迟到失败负测后，目标测试及 typecheck 再次通过，最终 smoke 包含该负测。

证据：`artifacts/i198/validation.json`、`artifacts/i198/tests.json`、`artifacts/i198-verification.log`；Electron 证据沿用 `artifacts/desktop/ui/i197/validation.json`。状态：验收通过。

交接：刚完成 I198 启动失败真实显示与同 session 恢复；下一可用迭代 I199，不自动执行。无新增公开合同。历史首次导入已确认但未初始化的补偿策略需独立设计，列 backlog；本次保留 §14.18.2 保护。
