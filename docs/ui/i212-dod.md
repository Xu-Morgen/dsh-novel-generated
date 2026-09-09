# I212 DoD：冲突帮助与层级描述更新候选

- 授权：冲突类型悬浮说明；根据节下场景卡、幕下节描述生成描述候选，由作者决定是否替换。
- 目标字段：节 description；幕使用现有 goal（幕目标），用户已明确选择。
- Owner：Client outline 表单/候选状态；Main 新增有界描述候选服务，复用 LlmBackend 与 I11；strict additive generate/decide 契约与锁、preload/client 同步。
- 语义：使用已保存子内容，脏草稿先提示保存；生成候选不改大纲，显示原文/候选；拒绝零大纲写，接受仅更新目标字段；目标或输入变化拒绝旧候选；取消/切换忽略迟到 UI；空子内容零模型调用。
- 明确不做：不自动联动全部层级，不改场景卡/章节正文，不改冲突枚举，不绕过 I11。
- 验收：tooltip hover/focus；两级 mock 样本 dev/held-out 先冻结、schema负向；真实 Electron 两级生成、拒绝/替换/落盘；strict IPC 输入/输出拒绝，幂等和过期拒绝。
- 验证：`pnpm run verify:stage-56`（含 verify:i212）全绿；250 文件 / 1243 测试，typecheck/build、I212–I200 Electron 回归；I212 dev 2/2、held-out 2/2 为确定性 mock 管道验证，非真实模型质量分数。原 I44 held-out 9/10、I45 held-out 0.9。
- 证据：`artifacts/i212-verification.log`、`artifacts/desktop/ui/i212/validation.json`、`conflict-help.png`、`description-candidate.png`。修正新增接口基数断言及悬浮框拦截点击后完整重跑全绿；未改旧样本或阈值。
- 交接：I212 完成；下一可用 I213。新增 strict novelWorkspace.descriptionGenerate/descriptionDecide，canonical 234 方法、Renderer 215 消费方法；旧形状不变。原 Renderer profiles/调和列表 backlog 保留。
