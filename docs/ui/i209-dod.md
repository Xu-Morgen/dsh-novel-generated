# I209 DoD：章节信息回填与保存

- 授权/目标：修复选章后章节标题、视角未回填及保存静默退出。
- owner：Client store 章节选择、chapters-management 创建/保存和章节面板；既有 Main C5 元数据与 strict IPC 不变（设计 §14.14.2 / §14.34）。
- 交付：切换章节填入列表中的当前元数据，同章导航/模式切换保留编辑；保存校验目标、标题、视角、读取状态并反馈结果；回填后的新建仍生成独立章节。
- 验收：缺项零调用、失败保留输入、重复点击去重、切章正确回填；Electron 修改标题/视角后重开回读，正文不变，新建不复用既有 ID。
- 明确不做：不改生成行为或公开合同，不修改用户作品；仅根据代码解释候选与队列差异。
- 验证：`pnpm run verify:stage-53`（含 verify:i209）全绿；typecheck、245 文件 / 1237 测试、构建、I209–I200 Electron 与原样本回归通过，I44 held-out 9/10、I45 held-out 0.9。
- 证据：`artifacts/i209-verification.log`；`artifacts/desktop/ui/i209/validation.json`、`chapter-saved.png`。首次 smoke 将含章节元数据的 sceneRead 外层一并比较，已修正为比较完整 scene 对象，并重新跑完整验证通过。
- 交接：I209 完成，下一可用 I210；无新增合同；原 Renderer profiles/调和列表 backlog 保留。

## 生成入口说明（现有行为，不属于本次改动）

- 候选页“按场景卡写作”：`chapters-candidate.proposeWriting` 使用选中章节与新场景 ID；`writing-context.pickCurrentCard` 取当前大纲节拍首张未完成卡（否则最后一张），不读取素材页的细纲目标下拉值。
- 队列：`queue.start` 提交选中章节及勾选 cardIds；Main 每张卡生成候选，支持预算、暂停/继续、重试与停止策略，任务及候选保存在 queue-journal.yaml 以恢复。
- 两者均使用候选服务的 scene-card 提示词路径；生成不等于接受正文，队列也不自动接受或定稿。
