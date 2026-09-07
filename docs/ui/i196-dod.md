# I196 DoD：AI Token 明文本地文件

状态：验收通过；编码前已阅读计划 Stage 39 / I195 交接、设计 §0.1 / §14.33、需求 H0 与现有 CredentialStore、Electron safeStorage、AI 设置消费者。

目标：把桌面端 `NOVEL_CUSTOM_API_KEY` 的持久化 owner 调整为应用数据目录下的 `settings/ai-token.txt`。文件只保存一行明文 token，允许用户用文本编辑器直接修改；Main 在每次 provider 调用前重新读取。明确提示这不是安全存储。

交付：单 token 明文存储 adapter；旧 `credentials.bin` 一次性迁移；Main 接线；AI 设置风险与位置说明；正向、外部编辑、迁移、非法多行/错误 ref、IPC 零回显测试；`verify:i196` 与 smoke 证据；独立 `feat(I196)` commit。

验收：设置保存后 txt 含原始 token；外部修改后 resolver 读取新值；空文件视为未配置；多行 token fail closed；旧加密记录仅在 txt 缺失时迁移，明文原子写成功后删除旧记录；token 不进入 IPC 结果、错误、日志、作品、导出或 smoke 产物。

不做：不新增 provider、prompt/schema/样本/阈值，不把 token 放入作品目录或仓库，不向 Renderer 回传 token/宿主绝对路径，不实现多 profile、多窗口或 Renderer 直连 provider。

证据：`pnpm run verify:i196` exit 0；228 文件 / 1189 测试；真实 Electron smoke 完成 strict IPC 保存、txt 明文断言、外部编辑与零回显检查。非 secret 证据位于 `artifacts/desktop/ui/i196/validation.json`。
