# I202 DoD：叙事计划分步重试与完整 LLM 诊断

用户授权：逐份诊断附件，检查并缩减提示词输出，失败仅重试对应调用，每次流式内容及最终结果以 txt 留存。

- 目标/owner：Renderer source-plan 只保留 Main 任务身份，成功结果每次从原 Host 读取；Main LlmMonitor 全量脱敏记录；POV prompt 输出简洁 B5。
- 依据：设计 §14.15、§14.36；保留三次生成边界和 I11，不新增公开 IPC，不放宽输出 schema。
- 交付物：两附件局部校验报告；先冻结 dev/held-out 样本；紧凑输出要求；同一页面/来源下成功步骤复用，失败步骤重启，下游失效；完整流式 txt 与最终文本及结构诊断。
- 验收：adaptation/reveal 失败单步重试与零领域写入；来源变更/取消隔离；长于 16000 字符的完整记录、分块密钥脱敏、失败/取消/并发、日志故障不阻断模型；真实 Electron 与全量回归。
- 明确不做：不从附件残片猜测完整错误，不保存请求密钥/endpoint/prompt，不宣称真实模型准确率；不做跨重启生成恢复或按幕新调用合同，已有 I52 自动修正策略不变。
- 验证：pnpm run verify:i202；pnpm run verify:stage-46。状态：已完成。

附件诊断：两份均缺少 JSON 开头，第二份恰为 16000 字符；LlmMonitor 的尾部截取可解释此现象。第一份 2 个完整 act、8 个 beat、18 个 detail、6 个 foreshadowing、3 个 ending、1 个 protagonist 全部符合各自 schema，无法验证缺失顶层、第一幕和证据回引。第二份是 foundation 的 evidence/layers，并非 reveal；仅凭残片不能证明原始返回不合规。用户正文不进入 Git。

第二份补充检查：完整 layers 中 characters/worldview/outline/relationship/state/canon 六层均通过各自 schema；缺失 evidence 开头，不能验证整个 envelope 或全部证据引用。第一份 CRLF 文本 16447 字符，换行规范化为 LF 后为窗口 16000 字符，进一步符合尾部截取特征。

验收证据：

- pnpm run verify:stage-46 exit 0（含 verify:i202）：typecheck、238 文件 / 1221 测试、build、I202/I201/I200 Electron、原样本回归全部通过。日志 artifacts/i202-verification.log。
- I202 dev 3/3、held-out 3/3，阈值 1；沿用 I200 合成基例及原 I145/I157 样本。属于确定性 fake backend 验证，不代表真实 provider 成功率。I44 9/10、I45 0.9。
- artifacts/desktop/ui/i202/validation.json：foundation 1 次、adaptation 2 次（首次失败）、reveal 2 次（首次失败），单步恢复且零领域写入；同目录 profile 的 cache/llm-traces 可查完整 txt 与 schema 错误。
- 长输出、跨 chunk 密钥脱敏、并发、取消/dispose、存储错误不影响生成、输入变化与迟到响应负测通过；无公开 IPC 变化。
- 交接：I202 完成；下一可用 I203。本次未按幕进一步拆分或跨重启恢复；完整调用证据可作为下一切片输入，R35/F1/F2 仍后置。
