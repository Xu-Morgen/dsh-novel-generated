# I156 DoD — 来源审阅 session 持久化恢复

## 目标

- Windows 瞬时文件锁不再直接击穿来源审阅 session 首次原子落盘。
- 会话或分析失败后保留 Host 来源证据，作者可在当前审阅面板原地重试。
- 普通提示保持可行动；原始错误只在折叠高级详情显示。

## 明确不做

- 不修改公开 Remote、session/schema/contract lock、DOCX chunk、分类 enum、LLM prompt/样本或 I151 首次确认语义。
- 不重新上传文件、不重建来源 range、不启动旧六层分析、不恢复后置 F1/F2。

## 验收与验证

- Host：故障注入 EPERM/EBUSY/EACCES 后有界退避成功；非 transient 与耗尽重试 fail closed。
- Client：无 session 时重试建立 checkpoint；已有 session 时只重启分析；输入逐字段复用原 sourceHash/paragraph ranges。
- UI：失败态提供 `data-novel-import-interpretation-retry`；高级详情保留原始技术原因。
- 验证：`pnpm run verify:i156`；`pnpm run verify:stage-25`；`artifacts/i156-source-review-session-recovery.json`。
