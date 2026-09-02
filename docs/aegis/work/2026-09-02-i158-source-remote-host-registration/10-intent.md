# I158 Intent — 来源 Remote Host 注册修复

## 目标

1. 将来源导入链六组既有 strict invocations 登记到唯一 `hostContribution`。
2. 真实 Typert Registry + Gateway + plugin 可调用 `novelImportInterpretation/create`，不再由 HTTP 层返回 404。
3. 建立 Client-mounted descriptors 对 Host face 的完整性守卫，防止后续只挂 Client、漏挂 Host。

## DoD

- [x] import interpretation、analysis、rule/style initialization、narrative adaptation/reveal/import-plan 六组 descriptor 在 Host face 中零缺失、零重复。
- [x] 真实 Gateway create 返回合法 draft session；未知 endpoint 仍不被认领。
- [x] Fiber dispose 后来源 descriptors 从 Host registry 消失；Gateway 对已见 endpoint 返回结构化 withdrawn 错误而非裸 404。
- [x] invocation ID、namespace、参数/结果 schema 与现有 contract locks 字节不变。
- [x] `pnpm run verify:i158` 与 `pnpm run verify:stage-27` 全绿，smoke 产物可查。
- [x] 仅提交 I158 文件；用户 DOCX 变更不纳入提交。

## 明确不做

- 不新增 REST server、动态 RPC、fallback endpoint 或第二 Host 注册 owner。
- 不改 Client UI、来源语义、LLM prompt/样本、I11、持久化或 DOCX 分段。
- 不修改 DSH pin，不恢复 F1/F2。
