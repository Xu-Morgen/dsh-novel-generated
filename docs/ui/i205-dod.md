# I205 DoD：正文生成缺规则反馈与素材说明

- 用户授权：排查续写/按场景卡写作失败，说明场景管理、摘要与空调和计划的用途。
- 目标/owner：Main C5 错误适配、统一固定 IPC 拒绝文案、Client 章节素材/候选说明与 unwrap/表现层错误分离；不修改 ContextAssembler 的必需规则契约。
- 跨模块发现：unwrap 追加 code/method 后，表现层会把固定中文拒绝误判为技术错误；新增内部 Error 子类分离主文案与诊断，普通显示仍经原过滤，原 Error.message 保留诊断。无 wire/schema 变化。
- 交付物：无启用规则时透传固定可行动提示；场景摘要非首次写作必填说明；调和计划无可用来源的说明与空读取防护。
- 复现：隔离副本两种写作均抛出 ContextAssemblyError 的空 rules 错误，fake backend 零调用；仅在副本加入测试规则后二者成功。用户作品零修改、真实 provider 零调用。
- 验收：缺规则/全部停用均零模型与正文写入；保存启用规则后二种生成成功且确认前零写；strict IPC 不变，伪造或附加敏感文本的异常不得透传；真实 Electron 错误→保存规则→写作候选成功。
- 兼容/退役：替换该已知错误的笼统反馈，不新增方法/schema、不绕过规则约束、不自动初始化；完整调和计划列表接入继续 backlog，不能声称已可用。
- 明确不做：不替作者写规则、不改 LLM prompt/schema/样本、不新建场景、不自动接受候选或同步定稿、不恢复 profiles/F1/F2。
- 设计依据：§8.1、§14.9、§14.14.2、§14.34；计划 §18 修复纪律。
- 验证：pnpm run verify:i205 / pnpm run verify:stage-49；已完成。

验收证据：

- `pnpm run verify:stage-49` exit 0（含 `verify:i205`）：typecheck、242 文件 / 1230 测试、生产构建、I205–I200 Electron、原样本回归全绿。日志：`artifacts/i205-verification.log`；I44 9/10、I45 0.9；未改模型样本或阈值。
- `artifacts/desktop/ui/i205/validation.json` 与 `materials-help.png` / `missing-rules.png` / `recovered-continue.png` / `recovered-scene-card.png`：真实 Electron 点击缺规则失败→手工保存启用规则→两种候选可审阅，不预建场景，拒绝候选且 C5 指纹不变。
- `writing-readiness.test.ts`：无规则/全部停用零模型调用；Main→strict IPC→unwrap→作者提示；启用后恢复；伪造和附加敏感文本错误仍为固定通用拒绝，不泄漏内容。
- `presentation.test.ts`：中文提示与诊断分离，保留高级 code/method，拒绝伪造同名属性，未知技术错误继续过滤。
- 交接：I205 / Stage 49 完成；下一可用 I206；无新增 IPC/schema。完整调和计划列表接入、按选中卡直接写作、R35 profiles、F1/F2 仍后置。
