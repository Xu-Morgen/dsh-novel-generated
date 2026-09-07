# I201 DoD：作者确认后的规则与文风重新生成

用户授权：非首次初始化经作者确认替换原规则与文风后可再次自动生成。本卡显式修改旧 §14.18 产品限制。

Owner：RuleStyleImportInitializationService / I11；B1/B4 repository CAS 替换与补偿；Client 初稿面板。新增 strict additive prepareRegeneration / regenerate / rejectRegeneration，同步 schema、desktop lock、preload、Renderer 类型及 Main。

交付物：生成前冻结旧内容快照与 fingerprint、Gate、来源身份；作者接受后沿用原 prompt 生成；新候选仍需编辑/提案/接受；最终替换保留快照补偿，生成失败/取消/拒绝不写 B1/B4。重放不重复模型请求，再生成需新 Gate。

验收：非首次和非空作品可显式申请；未确认零 LLM、拒绝零写入、幂等；失败保留旧内容；最终接受替换所有规则与单一文风；跨作品/stale/非法参数结果拒绝；写盘失败补偿及重开恢复；真实 Electron 两次确认/取消/成功。

明确不做：不在 app/open 触发，不改 prompt/样本及其他故事层，不删除数据绕过首次检查。替换范围含全部 B1（包括 immutable 标记）及 B4，生成规则仍 immutable:false。

验证：pnpm run verify:i201；pnpm run verify:stage-45。状态：已完成。

验收证据：

- 阶段门 pnpm run verify:stage-45 exit 0，含 verify:i201；235 文件 / 1214 测试、typecheck、build 全绿。
- Electron 验证：artifacts/desktop/ui/i201/validation.json；replacement-scope / replacement-applied 截图。覆盖后续导入、既有规则与文风、拒绝零 LLM、两次 Gate 与最终替换。
- 既有 I200 Electron/冻结样本及 I43–I45 held-out 通过（I44 9/10；I45 0.9），未改 prompt、样本、金标或阈值。
- 226 个既有 IPC descriptor/schema 不变；新增 3 个 strict 方法，参数/结果负向验证通过。
- 交接：I201 完成，下一可用 I202；新增 prepareRegeneration / regenerate / rejectRegeneration；R35 多 profile、F1/F2 继续后置。
