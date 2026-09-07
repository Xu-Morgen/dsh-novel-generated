# I195 DoD：来源分析即时失败

状态：验收通过；编码前已阅读计划 §38B、设计 §14.34、需求 R36-6 与既有 adapter/分析 owner。

实测：HTTP 200 首帧 delta 为 role:string / content:null / reasoning_content:string，旧 adapter 报 `invalid-response: LLM text delta is invalid`，IPC 脱敏为 handler-failed。诊断只读取配置，通过已有凭据 owner 使用密钥；不输出密钥或响应正文，不修改用户配置/作品。

交付：唯一 SSE owner 最小兼容修改；新增传输夹具（不改 frozen samples）；来源分类消费者和非法类型负测；verify:i195、verify:stage-39；真实 Electron 与 packaged author flow；独立 fix(I195) commit。

验收：null 等价该帧没有该类增量，字符串保持原值；其他类型严格拒绝，reasoning 不进入 candidate.text。生成失败/取消/确认和密钥隔离不变。

不做：不透传原始错误、修改模型配置、prompt/schema/金标/阈值；不夹带多窗口/profiles。

完成证据：`pnpm run verify:stage-39`（含 verify:i195）exit 0，227 文件 / 1185 测试；开发版和 Windows 包各 18 项真实作者流程检查，全部 HTTP 测试响应带 nullable delta；I43/I44/I45/I151 适用样本通过。

日志：`artifacts/desktop/i195-before.log`（修复前确定性复现）、`i195-after.log`（正负向通过）、`i195-stage-39.log`（正式门）、`i195-live-diagnostic.log`（真实 DeepSeek HTTP 200、首帧类型、正文和来源分类成功；无密钥/原文/响应正文）。截图和验证：`artifacts/desktop/ui/i195`、`i195-packaged`。

交接：I195 / Stage 39 完成；后续 I196 尚未立项。新增公开合同为零。原始 IPC 错误继续按既有秘密隔离规则脱敏，本片不扩展通用错误透传。
