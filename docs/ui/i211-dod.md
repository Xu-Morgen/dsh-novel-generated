# I211 DoD：输入提示词 TXT 存档

- 用户授权：每次 LLM 调用自动存档输入提示词。
- Owner：Main LlmMonitor 完整脱敏后交 LlmTraceStore 写入同 stem 的 .input.txt；应用 cache/llm-traces，受 DesktopLifecycle 管理。
- 交付：完整 UTF-8 输入，不使用 UI 截断预览；成功/失败/取消保留。凭据解析失败不写未经脱敏的输入。写盘失败沿用记录失败提示，不中断生成。
- 验收：并发隔离、超长完整性、密钥脱敏、失败/取消、凭据失败无输入泄漏、存储故障隔离；真实 Electron/provider 请求与磁盘匹配。
- 明确不做：不补写历史调用、不更改 prompt/模型行为/IPC、不改用户作品；无 LLM 样本变更。
- 依据：设计 §14.36 / §14.36.1。`pnpm run verify:stage-55`（含 verify:i211）全绿：247 文件 / 1240 测试、typecheck/build、I211 输入存档与 I210–I200 Electron 回归；原样本通过，I44 held-out 9/10，I45 held-out 0.9。
- 证据：`artifacts/i211-verification.log`、`artifacts/desktop/ui/i211/validation.json`；仅隔离测试作品。复用 I207 Electron 操作夹具，增加 input archive 参数与存盘配对断言。
- 交接：I211 完成；下一可用 I212。无新增公开合同；原 Renderer profiles/调和列表 backlog 保留。
