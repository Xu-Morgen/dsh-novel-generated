# I163 Intent — 来源解释异步失败重试闭环

## 根因

`begin` 在后台分析完成前返回；后台失败后 job 仍留在 Host Map。Client 重试复用同一 import session 再次调用 `begin`，而 Host 对任何已存在 ID 一律拒绝，导致作者永久得到 `already exists`。同时 Client 只读取 failed 状态，未调用既有 `result` 取得原始异常。

## DoD

- [x] Host 允许 failed job 仅在 projectId、sourceHash 与 paragraphs 逐字段一致时原位重启。
- [x] queued/running/succeeded 重复 begin 继续拒绝，不产生并行或覆盖调用。
- [x] 跨项目、sourceHash 或 paragraph 变化的 failed retry fail closed。
- [x] Client 观察到 failed 后读取既有 result，将中文行动提示与原始技术原因分层展示。
- [x] Client retry 保留同一 import session、作者选择和 Host 投影片段，不创建新 session。
- [x] 迟到的旧 session status/result 不覆盖当前审阅。
- [x] 不修改 Remote/schema、LLM prompt/样本、session YAML、I162 分段或领域层 owner。
- [x] `pnpm run verify:i163`、`pnpm run verify:product-flow` 与 `pnpm run verify:stage-30` 全绿，smoke 产物可查。
- [x] 仅提交 I163 文件；用户 DOCX 变更不纳入提交。

## 明确不做

- 不新增 retry Remote，不持久化 LLM job/error。
- 不调整模型 prompt、解析容错、样本、gold 或阈值。
- 不修改 B/C/C5、I11、非空作品门或后置 F1/F2。
