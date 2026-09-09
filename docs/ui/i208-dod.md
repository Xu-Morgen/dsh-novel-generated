# I208 DoD：细纲绑定操作反馈

- 用户授权：修复素材页面绑定细纲点击无反馈。
- 目标/owner：Client chapters-management.bindingSave 与绑定面板；Main 绑定/基线 owner 和 strict IPC 不变。
- 交付物：未选正文场景/细纲目标/未读绑定状态明确提示；显示当前场景选择状态；保存中锁定按钮，成功/失败在绑定区域可见，成功补齐本地 ready 投影并更新计数。
- 验收：缺项零调用、重复点击去重、失败保留选择并显示原因；实际 Electron 选择场景和卡后绑定成功，strict IPC 回读、本地绑定/基线存在，正文与大纲不变。
- 明确不做：不自动创建场景或选卡、不改卡状态、不生成/接受正文、不改 rebind/unbind 领域语义、不修改用户作品，不新增合同。
- 设计依据：§14.14.2 / §14.34；计划 §18 修复纪律。
- 验证：`pnpm run verify:stage-52`（含 verify:i208）通过：typecheck、244 文件 / 1235 测试、构建、I208–I200 Electron 回归与原样本回归；I44 held-out 9/10，I45 held-out 0.9。补充本地文件断言后 `pnpm run smoke:i208` 再次通过。
- 证据：`artifacts/i208-verification.log`；`artifacts/desktop/ui/i208/validation.json`、`missing-selection.png`、`binding-saved.png`。仅使用隔离测试作品。
- 交接：I208 完成；下一可用 I209，未自动执行。无新增合同；Renderer profiles 与完整调和列表接入等原 backlog 不变。
