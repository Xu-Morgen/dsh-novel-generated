# I218 DoD：规则与文风格式失败不再停留运行中

- 授权：2026-09-10 用户报告模型已返回完整规则与文风 JSON，创作台持续显示运行中/等待首片段；追加要求生成失败后开放重试按钮。
- 目标：多项非法规则 kind 的校验失败必须形成可持久化、可回读的 failed 状态，显示具体字段与合法枚举；重试保持同一导入身份，成功仍经 I11 审阅后写入。
- 已固化根因：原始 ZodError.message 可超过 checkpoint.error 的 4000 字符上限，失败持久化再次失败并被吞掉，留下 running；Client 状态轮询失败同样没有清理旧运行状态。作者错误映射会过滤枚举文本，现用可行动中文提示与折叠详情分开展示。
- Owner：Host rule-style-import-initialization 错误摘要/终态兜底、Client 初始化轮询终止与错误显示（普通文案解释规则分类失败，折叠详情保留字段与枚举）、同一 Main regenerate 的流式进度接线；现有 IPC 与 B1/B4 schema 不变。
- LLM 纪律：先冻结 dev/held-out 格式样本，再补充 prompt 中已有 scope/kind 合法枚举；不改金标/阈值，不自动映射非法 kind，不自动接受候选。
- 验收：长校验错误 failed 落盘与重开回读、非 Zod 长错误有界、旧孤立 running 回读恢复、轮询失败不显示等待/可重试、错误与成功均保留 B1/B4 零提前写入、实际 Electron 返回非法 JSON 结构→失败→同任务重试→可审阅。
- 验证：`pnpm run verify:stage-62`（含 `verify:i218`）全绿；258 文件 / 1278 测试、typecheck/build、I218–I200 实际 Electron 以及原有样本回归通过。冻结格式样本 dev 2/2、held-out 2/2，阈值 1 未修改。完整输出见 `artifacts/i218-verification.log`。
- 明确不做：不扩展规则分类/公开合同，不改用户作品中的规则含义，不自动付费重试或另建导入会话，不恢复后置 F1/F2。
- 实际 Electron 证据：`artifacts/desktop/ui/i218/validation.json`、`failure-retry-enabled.png`、`retry-applied.png`；13 项非法分类触发 failed，重试按钮可点击且等待清除，两次调用完成失败→重试→审阅→确认写入，确认前 B1/B4 不变。
- 交接：I218 / Stage 62 完成；下一可用 I219（未自动执行）；无新增公开合同，旧枚举与 I11 不变。Renderer profiles / F1/F2 及其他 backlog 保持原边界。
