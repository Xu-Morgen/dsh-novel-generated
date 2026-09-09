# I210 DoD：范围细纲生成携带已保存场景卡

- 目标：补缺、追加、单卡重生成调用均携带当前解析范围内已保存场景卡，作为只读上下文。
- Owner：Main OutlineGenerationScope.targets 为范围与顺序唯一来源；outline-detail-generation-service 组装；内部 parser input/schema 与 prompt 消费。兼容既有 IPC、输出 schema、I11 和持久化 owner。
- 包含：幕/节 ID、卡在节内位置及完整 detailBeat（标题、摘要、视角、字数、要点、状态、ID）；bound-chapter 只用已解析卡集合，分页只用当前已解析页；空范围卡列表明确标注为空。
- 明确不做：不扩大写入范围，不自动替换已有卡，不引入全文/全书额外上下文，不改公开 IPC，不修改用户作品。
- 先建 samples/i210 冻结 dev/held-out，阈值 100% 的确定性上下文传递回归；mock backend 验证提示词及旧输出合同，不冒称真实模型质量分数。
- 验收：范围内完整保序、范围外排除、三种模式均传入、补缺/追加零已有卡写入、真实 Electron IPC 到 HTTP provider 输入可查；原 I134/I150 样本回归不修改。
- 验证：`pnpm run verify:stage-54`（含 verify:i210）全绿；246 文件 / 1239 测试、typecheck、build、I210–I200 Electron 回归与旧样本通过。I210 dev 2/2、held-out 2/2 为确定性上下文与输出管道验证，非真实模型质量评分；I134/I150 冻结样本通过，I44 held-out 9/10、I45 held-out 0.9。
- 证据：`artifacts/i210-verification.log`；`artifacts/desktop/ui/i210/validation.json` 与 `prompts.json`。smoke 补齐严格 IPC 可选 settings 的 undefined 参数位置后，完整验证重跑通过。
- 交接：I210 完成；下一可用 I211。内部 parser input 可选新增 scopeCards，公开合同无变化；原 Renderer profiles/调和列表 backlog 不变。
