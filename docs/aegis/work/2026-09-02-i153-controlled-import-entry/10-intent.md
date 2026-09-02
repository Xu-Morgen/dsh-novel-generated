# I153 DoD — 目录层 DOCX 首次受控导入接线修复

- 目标：修复新建作品上传 DOCX 后仍直接进入旧六层分析，导致 Stage 19 来源选项与 I151 首次导入初始化不可达的问题。
- canonical owner：目录层上传控制器只负责新建/打开作品并启动 `ImportInterpretationReview`；来源选择归既有 I141–I144 合同，I151 仍只消费首个已确认 import session。
- 兼容边界：I150 范围细纲合同、I151 Host/Remote/schema、来源角色 enum、I11、项目创建与上传 Remote 形状均不变。
- 正向验收：目录层 DOCX 自动新建并打开作品；直接显示背景资料、已有正文等来源选项；选择背景资料→按视角重构→限知后可填写已有主角；确认前 I151 零调用，确认后精确一次调用并显示规则/文风初稿区。
- 负向验收：来源确认前不启动旧六层分析，不启动 I151；Host chunks 范围非法时 fail closed；创建回调对应作品已变化时不消费陈旧上传结果；来源审阅渲染不依赖 `OnboardingState`。
- 明确不做：不修改 I150、不新增来源类型、不交付正文保真导入、不改 prompt/schema/样本、不修改后续导入策略。
- 消费者夹具：真实 Client mount 的“空目录→DOCX→新建/打开→来源选择→已有主角→确认→I151 begin”产品路径。
- 验证：`pnpm run verify:i153`；`pnpm run verify:product-flow`；`pnpm run verify:stage-22`。
- 产物：`artifacts/i153-controlled-import-entry.json`。
