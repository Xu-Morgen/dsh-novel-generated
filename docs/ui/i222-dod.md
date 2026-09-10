# I222 DoD：新章节写作引用与诊断恢复

验收完成：`pnpm run verify:stage-66`（含 verify:i222）全绿，265 文件 / 1288 测试，累计 Electron 与旧样本通过。初次队列等待超时的单独复跑及最终全量均通过；累计 smoke 发现并修正空大纲合并后的刷新错误。独立打包程序 `smoke-i222.mjs --packaged` 通过。

证据：`artifacts/desktop/ui/i222/validation.json`、`artifacts/desktop/ui/i222-packaged/validation.json` 及两种写作截图；真实作品副本验证两种候选成功，真实作品字节与正文未改写。

使用：退出旧版，启动 `artifacts/desktop/i222-release/win-unpacked/Novel Creation Tool.exe`，在左侧选中新章节，再进入候选写作。

交接块：刚完成 I222；下一可用 I223，未自动立项；公开 IPC 无变更，新增内部已完成合并身份解析；本次无未完成修复，完整合并撤销等沿用 I221 backlog。

- 证据：真实作品副本两个 proposeAt 均在模型前失败，旧场景卡引用已合并并删除的主角，C3 已无该身份；I11 与完成标记证明迁移已确认，B5 被旧草稿回写。
- 目标：B5 owner 按已完成 I11 合并解析退役身份，阻止旧草稿回写；合并后刷新 B5 草稿。追加新场景不依赖旧场景修改基线，旧场景编辑继续严格验证。
- Owner/合同：生命周期和 I11 提供身份授权，OutlineRepository 负责读写解析；writing-context 和 Main 错误白名单修复写作诊断。旧 IPC、B3、C3、prompt 不变。
- 验收：已确认合并后旧 B5 重现与两种写作恢复；未完成/普通冻结不猜测替代；循环失败、旧场景基线不放宽、错误脱敏；fake backend、Electron、真实作品副本、全量回归及打包。
- 明确不做：不修改真实正文，不恢复删除角色，不用空知情或知情并集掩盖错误，不调用付费模型诊断。
- 验证：verify:i222 / verify:stage-66。
