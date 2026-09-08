# I203 DoD：绑定角色引用与受限生成修正

- 用户授权：修复角色/节拍引用错误和合并失败重试死循环，允许最多两次模型错误反馈修正。
- 目标/owner：Main source import adapter 绑定已完成 foundation；adaptation/reveal analyzer 提前校验并受限修复；I148 preflight 返回类型化失败层；Renderer 清理失败层及下游身份。
- 交付物：先冻结 dev/held-out 合成样本；strict additive beginBound 与两个 repairProgress 方法，同步 IPC lock/Main/Renderer/真实 E2E；角色 ID+姓名清单；实际 reveal anchor 示例；受限字符串引用补丁（仅程序报告的路径与合法值），不可解析/其他语义错误最多重生成当前阶段两次；修正计数可见、取消生效、无提前领域写入。
- 验收：角色别名、未知 anchor、修正越权、重试耗尽、取消、跨作品/来源绑定；合并失败可重试对应步骤；旧 IPC 不变、原样本阈值不变；完整流式 txt 沿 I202 留存。
- 明确不做：不静默按姓名匹配 ID，不修改用户原始文件，不放宽 schema，不自动确认，不实现跨重启恢复或按幕拆分。
- 设计依据：§14.15、§14.36.2；本次增加生成错误的显式有界自动修正授权。
- 验证：pnpm run verify:i203；pnpm run verify:stage-47。状态：已完成。

验收证据：

- pnpm run verify:stage-47 exit 0（含 verify:i203）：typecheck、240 文件 / 1227 测试、build、I203/I202/I201/I200 Electron 与冻结样本回归通过；日志 artifacts/i203-verification.log。
- I203 dev 3/3、held-out 3/3，阈值 1；原 I145/I157/I200/I202 样本不变。均为确定性 fake-backend 消费者，不宣称真实 provider 准确率。I44 9/10、I45 0.9。
- artifacts/desktop/ui/i203/validation.json 及 merge-failure.png / repaired-plan.png：绑定角色清单、受限 ID 补丁、拒绝剧情越权修改、合并失败后重新调用、typed outline 错误与零提前写入。
- 既有 229 个方法与 309 个 schema bodies 完全不变；新增 beginBound、adaptation/reveal repairProgress 共 3 个 strict additive 方法（总 232），负向参数/结果及跨作品/来源测试通过。
- I202 smoke 因用户新增自动修正授权，失败阶段调用上限更新为首次 + 两次修正；保留其上游复用断言与原始非法输出夹具。
- 交接：I203 完成，下一可用 I204；本次新增上述 3 个 IPC。跨重启候选恢复、按幕拆分与 R35/F1/F2 继续后置。
