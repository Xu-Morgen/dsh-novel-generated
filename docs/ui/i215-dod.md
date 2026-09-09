# I215 DoD：单卡剧情范围与章节承接上下文

- 授权：场景卡正文只展开单张目标卡，移除节描述诱导；核验并补齐同章已保存正文，避免重复或冲突。
- Owner：write/chapter 与 scene-card-context 的单卡指令；pipeline 的内部可选 omit-outline 与末尾优先历史策略；writing-context 接收内部目标章/意图，candidate-production 传递既有输入章 ID。
- 合同边界：公开 IPC/持久化 schema 不变；不传目标章的既有 Agent/队列消费者保持原行为；继续按既有导航选一张卡，不自动推进/改状态/绑定。
- 交付：场景卡 prompt 不含节 description/instruction/Outline 段；保留完整目标卡及人物设定，限定动作/对话/感官细节只展开本卡；明确前文为已发生事件，不重复、不接写后续规划。
- 历史：目标章全部非空当前正文 + 之前最多三个非空场景，按叙事顺序，排除后章/空场景/未选版本；5000 字符段预算内完整注入，超限用已保存摘要与最新正文末尾并明确截断，trace 如实反映。
- 样本：实现前冻结 samples/i215，dev/held-out 各 2 例，输入范围/承接/末尾保留断言 100%；不宣称模型零重复率。
- 验收：目标章隔离、无节后续事件、全卡保留、短前文完整/长前文结尾保留、POV 与导航一致性拒绝、真实 Electron 两种写作意图和 TXT 核验；未接受零作品写。
- 验证：`pnpm run verify:stage-59`（含 verify:i215）全绿；251 文件 / 1256 测试、typecheck/build、I215–I200 Electron 累计回归及原样本通过。新增冻结输入断言 dev 2/2、held-out 2/2（100%，fake backend；非模型零重复率评估）。
- 证据：`artifacts/i215-verification.log`、`artifacts/desktop/ui/i215/validation.json`、`scene-card-context.png`；隔离 profile 中真实 strict IPC 保存长正文及后章，再从界面分别生成；两份实际 provider prompt 与 input.txt 含当前章末尾、无后章，scene-card 无节描述，拒绝/未接受零 B5/C5 写。
- 只读核验：用户当前《初窥》场景 content 长度为 0，因此最近写作调用无 History；候选/调用存档不能冒充已保存 C5。
- 明确不做：不自动接受候选或修正用户正文，不改字数配置，不声称整个长章节无损进入有限预算，不增加 LLM 自动总结调用。
- 交接：I215 完成，下一可用 I216；无新增公开合同。任意选卡、自动推进与绑定简化继续 backlog；多张 writing 仍取当前导航节内第一张。
