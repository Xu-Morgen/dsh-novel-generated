# I217 DoD：整章阅读与一次确认定稿

- 授权：2026-09-10 用户确认整章流程并要求开始修复。
- 目标：点击章节按场景顺序阅读已保存全文；按完整章节分析，一次 I11 确认同步五层故事状态、已绑定且全部卡完成的节进度，并标记章节定稿；提供下一章入口。场景仍可单独编辑。
- Owner：新增 Main chapter-finalization 编排，复用五层 parser、structural-preview、five-layer-writeback、TextService 与 I11。Client 章节导航/阅读/定稿状态；strict additive IPC 与合同锁同步。BookCompletion 将新增章级待确认记录纳入原发布阻塞规则。旧单场景公开合同保持兼容。
- 不变式：不复制或改写场景正文；不依赖临时候选；空场景明确提示并排除分析，整章无正文禁止分析；全文不静默截断。确认前校验章节身份/顺序/内容与五层 freshness，取消零领域写，重复确认不重复应用；失败明确显示已完成阶段并可重试。
- 下一步：完成后打开下一章；尚无下一章时引导章节管理创建，保留作者标题/视角选择，不自动生成正文或擅自选卡。
- 明确不做：不改既有 LLM prompt/输出 schema/阈值，不自动重写后续细纲，不恢复 F1/F2，不将整章副本持久化为第二正文真相。已有细纲完成状态保留；C6 完成仅复用原 nextProgress 规则，新章级合同不改变既有场景合同。
- 验收：多场景顺序及空首场景、重开可分析、整章完整 parser 输入、未确认零写/取消/过期/跨项目/部分失败/重复确认、实际 Electron 全章→分析→确认→下一章，strict 双向负向与原样本全绿。
- 验证：`pnpm run verify:stage-61`（含 verify:i217）已通过；257 文件 / 1270 测试、typecheck/build、I217–I200 实际 Electron 与原有样本回归全绿。LLM prompt/schema/样本/阈值均未修改，新增完整章节 parser 输入由 fake backend 与实际 HTTP 消费者验证。
- 证据：`artifacts/i217-verification.log`、`artifacts/desktop/ui/i217/validation.json`、`whole-chapter.png`、`chapter-confirmation.png`。覆盖空首场景、重开完整正文、五层输入、取消零正文/故事资料写、整章定稿、C6 节完成、已有下一章与末章创建入口；真实 State/Canon owner 覆盖部分失败后重开重试不重复写入。
- 交接：I217 / Stage 61 完成，下一可用 I218（未自动执行）。新增 3 个 strict 章级方法；239 descriptors / Renderer 220 methods，旧合同不变。后续细纲语义调和仍由既有进阶入口承担，Renderer profiles / F1/F2 后置项保持原边界。
