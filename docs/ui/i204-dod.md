# I204 DoD：角色改名与章节创建修复

- 用户授权：修复角色名称无法保存、正文素材模式新建章节失败。
- 目标/owner：Client 角色编辑请求构造、章节管理表单；Main 领域与 strict IPC 合同保持原样。
- 交付物：角色更新只传可变字段；章节创建前校验标题、视角和管理状态，防止空值/读取中请求；错误保留输入，明确指出下一步；成功后可继续创建下一章。
- 兼容/退役边界：移除更新复用含 id 创建请求的错误路径；不新增 IPC、持久化格式或领域 owner。
- 验收：改名持久化且 stable ID 不变；空标题、空视角、未读管理状态和重复提交零写；合法章节保存；真实 Electron 表单→strict IPC→本地文件 smoke；原回归全绿。
- 明确不做：不改模型/prompt/样本、不改用户作品、不自动绑定细纲或生成正文、不开放后置 profiles/F1/F2。
- 设计依据：§14.14.2、§14.34；计划 §18 修复纪律。
- 验证：pnpm run verify:i204；pnpm run verify:stage-48（含前阶段累积门）。
- 状态：已完成。

验收证据：

- `pnpm run verify:stage-48` exit 0（含 `verify:i204`）：typecheck、241 文件 / 1228 测试、生产构建、I204/I203/I202/I201/I200 Electron 与原样本回归通过。日志：`artifacts/i204-verification.log`。
- `artifacts/desktop/ui/i204/validation.json`、`character-saved.png`、`required-pov.png`、`chapter-created.png`：真实 Renderer 表单保存、strict IPC、角色文件读取、章节落地与重新打开作品后的读取。
- 新增消费者夹具覆盖不可变 ID 拒绝、空标题/空视角/未读管理状态/读取中零创建、连点去重、标题长度、连续创建两章及陈旧写入保留输入。旧 UI mock 错把更新携带 id 当作正确行为，已改为符合原合同的负向断言；未改样本、金标或阈值。
- 原样本结果：I44 9/10、I45 0.9；本次不涉及 LLM 实现。
- 交接：I204 / Stage 48 完成；下一可用 I205。本阶段无新合同；按选中卡直接写作、R35 profiles、F1/F2 仍属后续范围，不自动执行。
