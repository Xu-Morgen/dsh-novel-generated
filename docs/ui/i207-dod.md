# I207 DoD：逐调用折叠输入提示词

- 用户授权：AI 过程与错误中每次调用展示可折叠输入提示词。
- 目标/owner：Main LlmMonitor、只读 monitor strict projection、独立 Renderer；所有实际 LlmBackend 调用自动覆盖。
- 交付物：每条请求默认折叠的输入栏，开始生成前提供脱敏输入，失败/取消保留；最多 256000 字符并明确标记截断；密钥解析失败不发送未经脱敏输入。
- 合同：monitor v1 增加可选 prompt/promptTruncated 字段并同步 strict lock，兼容旧无输入快照；领域 IPC 不变。新增授权覆盖设计 §14.36 原不传播 prompt 的观察投影限制，不涉及 §0.1 宿主基线。
- 验收：实际请求不变、成功/失败/取消/并发独立输入；密钥替换先于截断、解析失败零泄漏；strict 负向、旧快照兼容、真实独立 Electron 折叠/展开与失败保留。
- 明确不做：不改生成 prompt、模型、样本、作品数据，不将输入写入日志/txt；不扩展窗口领域权限，不恢复后置项。
- 验证：pnpm run verify:i207 / pnpm run verify:stage-51；状态：已完成。

验收证据：

- `pnpm run verify:stage-51` exit 0（含 verify:i207）：typecheck、243 文件 / 1234 测试、生产构建、I207–I200 Electron 与原样本回归全绿。日志：`artifacts/i207-verification.log`；I44 9/10、I45 0.9，未改样本/阈值。
- `artifacts/desktop/ui/i207/validation.json`：真实独立窗口逐调用默认折叠、展开/收起、HTTP 失败输入保留、展示输入匹配实际 provider 请求的脱敏版本，受限 preload 与密钥零回显。
- `llm-monitor.test.ts`：成功/失败/取消/并发输入、请求对象不变、密钥先过滤再截断、凭据解析失败不展示输入、旧快照兼容、长度/类型负向与 strict lock；`llm-trace-store.test.ts` 继续证明输入不进 txt。
- 交接：I207 / Stage 51 完成，下一可用 I208；仅 monitor 只读投影增加可选 prompt/promptTruncated，领域 IPC 不变；原 backlog 后置。
