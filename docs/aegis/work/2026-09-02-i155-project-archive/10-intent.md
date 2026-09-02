# I155 DoD — 既有作品归档与恢复

## 目标

- 为活动作品提供归档操作；归档后退出主列表，并在恢复前由 Host 强制拒绝打开与编辑。
- 完整作品树原样迁入 `.archive/<projectId>`；恢复后回到活动目录，作品元数据与层文件不变。
- 以 strict additive Remote 和只允许恢复的 Client 归档区交付，不建立第二作品真相。

## 明确不做

- 不提供永久删除、自动归档、批量归档、归档内预览/编辑/搜索/导出或云同步。
- 不修改 `ProjectMeta`、B/C 层 schema、LLM prompt/schema/样本或后置 F1/F2。

## 验收与验证

- 正向：活动目录归档后只出现在归档列表；恢复后重新可打开且元数据字节不变。
- 负向：归档 ID 的 open/create、新服务访问及归档前缓存仓储迟到写均失败；非法、未知、重复和冲突转换失败关闭。
- 消费者：Client 主列表零归档项，归档区零打开入口；归档/恢复按钮刷新两个目录。
- 合同：三个 additive invocation 同步 canonical schema、descriptor/result lock、真实 binder 正负向验证。
- 验证：`pnpm run verify:i155`；`pnpm run verify:stage-24`；`artifacts/i155-project-archive.json`。
