# I200 DoD：视角大纲完整输出约束与失败状态

目标：修复 POV 提示词只展示空细纲/伏笔而未给嵌套合同，及 source plan 将结构失败混同取消且保留运行提示的问题。

依据：设计 §14.15、§14.18；计划 §18。Owner：I145 narrative-adaptation prompt、Main adaptation result adapter、Renderer source-plan poll。兼容边界：canonical schema、严格拒绝、IPC shape、I11 与零写入约束不变；不把非法输出整形或放宽为合法。

交付物：先冻结 I200 dev/held-out 嵌套字段样本；由 canonical schema 生成完整 JSON Schema 提示；parser 将 JSON/Zod 失败转换为不携带模型原文或 cause 的固定格式错误，经 I199 seam 回传；source-plan 去除 unwrap 的诊断后缀后再选中文作者提示；失败获取 result 且结束运行文案；真实 Electron 格式失败与手动重试回归。

验收：新主角、非空 detailBeats、伏笔、关系冲突正测；附件同构的 social/experience/conclusion/provisionalName 等负测；无敏感模型内容回显；失败不进入揭示、不写故事资料；既有 I145/I157 样本阈值不变并达标。

明确不做：不更改作者附件、不放宽 schema、不自动纠正模型结果、不添加自动付费重试、不调整揭示语义。

附件定位：第一份为 POV 大纲，出现 social 冲突、experience/conclusion 细纲、provisionalName 主角、observedAt/paidAt 伏笔等非 canonical 字段；第二份顶层 evidence/layers 属于六层 foundation，不能视为 reveal 成功。仅以合成结构夹具回归，不提交用户附件正文。

验证：`pnpm run verify:stage-44` exit 0（包含 `verify:i200`）：typecheck、233 文件 / 1205 测试、桌面构建、I200 格式失败与手动重试真实 Electron、I199 拒绝回归、I43–I45 既有 smoke 全绿。状态：验收通过。

样本证据：`artifacts/desktop/ui/i200/samples.json`、`sample-validation.json`。原 I145/I157 冻结 dev/held-out 回归达标；I200 dev 3/3、held-out 3/3，阈值 1。均为确定性 fake-backend 消费者，不宣称真实 provider 成功率。I44 held-out 9/10，I45 held-out 0.9。

Smoke：`artifacts/desktop/ui/i200/validation.json`、`invalid-output.png`；完整命令日志 `artifacts/i200-verification.log`。非法输出无故事资料写入、未调用 reveal、错误不回显模型内容；手动重试后进入 pending 且仍零故事资料写入。

交接：刚完成 I200；下一可用迭代 I201，不自动执行。未新增公开 IPC/schema；新增内部安全格式错误及完整 prompt schema。历史首次导入补偿与退役 smoke 的桌面适配继续 backlog。

历史门差异：直接执行 I145 smoke 时，在样本运行前因退役 Stage 18 Remote lock 固定数量断言失败。本次不改旧锁、旧脚本或样本；当前阶段用 `smoke:i200:samples` 直接执行原 I145/I157 冻结 dev/held-out 消费者及新增 I200 样本。旧脚本的桌面适配列 backlog。
