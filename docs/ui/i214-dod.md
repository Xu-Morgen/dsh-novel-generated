# I214 DoD：场景卡写作上下文接线修复

- 授权：修复按场景卡写作遗漏细纲信息与人物设定、模型变更主角姓名的问题。
- Owner：writing-context 当前节选卡优先 writing；candidate-production 将同次装配 sources 传入 candidate-service；write 层复用 I19 上下文和 I43 场景卡指令，补明确卡片身份、人物姓名表；trace 如实反映结构层。
- 兼容边界：保留既有 IPC 与旧 I43/队列内部无 sources 调用；正文工作区必须带 sources。不改导航进度、不自动绑定或写 B5/C5，不修改已生成正文。
- 验收：当前节 writing 优先于 planned；无 writing 仍按既有顺序；真实卡标题/摘要/全部要点/POV/字数及角色姓名、设定进入实际 provider prompt 和 input.txt；角色名册不受详细人物段裁剪影响；双导航/POV 分叉拒绝；候选未接受零作品写入。
- LLM 样本：先冻结 samples/i214，dev/held-out 各两例，确定性输入完整性阈值 100%；fake backend 验证，不宣称真实模型姓名遵循率。
- 验证：`pnpm run verify:stage-58`（含 verify:i214）全绿；251 文件 / 1250 测试、typecheck/build、I214–I200 Electron 回归及原样本通过。冻结输入完整性 dev 2/2、held-out 2/2（100%，fake backend；非真实模型质量评估）。
- 证据：`artifacts/i214-verification.log`、`artifacts/desktop/ui/i214/validation.json`、`scene-card-context.png`；隔离 profile 下 `.input.txt` 与实际 HTTP prompt 一致，模型访问凭据不入档，未接受零 B5/C5 写入。
- 验证过程：首次桌面夹具把检测器请求错误回答为正文，已修正模拟响应分流；一次旧 queue-service 等待测试超时，单独 24 条及随后完整阶段回归全绿，未改原样本/阈值/队列代码。
- 明确不做：不增任意选卡 UI/IPC，不更改知识边界与全局预算，不扩大到队列重构或润色；选择仍由当前大纲导航节决定。
- 交接：I214 完成，下一可用 I215；无新增公开合同。任意选卡/绑定基线操作简化、队列恢复入口继续 backlog；已生成正文需作者重新生成或修正。
