# I206 DoD：管理刷新清理残留错误

- 用户授权：排查“刷新管理状态”仍显示操作未完成。
- 复现：当前作品隔离副本的 novelText/fingerprint 与 novelSceneOutlineBinding/read 均通过 strict IPC；Client 刷新开始/成功未覆盖 management.message，旧错误跨成功刷新残留。
- 目标/owner：仅 Client chapters-management 刷新状态机；Main、领域、IPC 保持不变。
- 交付物：刷新开始清理旧消息；两项读取均成功才显示管理状态已刷新；真实失败仍显示错误且保留作者输入；回归与真实 Electron smoke。
- 验收：失败→刷新成功替换旧错误，读取中无陈旧错误；任一读取失败不显示成功，重试可恢复；重复点击去重、输入保留、刷新零作品写入。
- 明确不做：不修复/改写用户作品、不生成内容、不更改领域或公开合同、不开放后置功能。
- 设计依据：§14.14.2 / §14.34；计划 §18 修复纪律。
- 验证：pnpm run verify:i206 / pnpm run verify:stage-50；状态：已完成。

验收证据：

- `pnpm run verify:stage-50` exit 0（含 verify:i206）：typecheck、243 文件 / 1232 测试、生产构建、I206–I200 Electron 与原样本回归全绿；日志 `artifacts/i206-verification.log`。I44 9/10、I45 0.9，样本与阈值未变。
- `artifacts/desktop/ui/i206/validation.json`、`refresh-recovered.png`：真实操作先触发新建章节失败，再填写未保存标题并刷新；旧错误被成功状态替换、输入保留、重复刷新正常、所有作品文件内容哈希不变。
- `management-refresh.test.ts` 分别覆盖正文读取失败与绑定读取失败、读取中清理旧错、重试恢复、重复点击去重；`editor-save.test.ts` 通过真实 Main/strict IPC 验证刷新成功文案。
- 交接：I206 / Stage 50 完成，下一可用 I207；无新增合同。完整调和计划列表、按选中卡写作、R35 profiles、F1/F2 继续后置。
