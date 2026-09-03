# I164 Intent — `novel-custom` DeepSeek reasoning capability 闭环

## 根因与冲突审计

- 提交 `0073524` 引入深度思考 UI、A2 `sampling.reasoning` 与 Host port `reasoningEffort` 转发，但 provider 模型仍沿用更早提交 `821438f` 的 `{ id }` 形状。
- I85 把 DSH family 升级到 `0.1.1-rc.2`；该宿主要求 hand-declared model 通过 `reasoningEfforts` 显式声明能力，否则在 provider I/O 前拒绝任一显式 effort。I85 的 fake adapter 门验证了转发形状，却未让真实 `llm-pi-ai` 消费生成的 provider YAML。
- I152 只把凭据 I/O 归还 `ctx.credentials`，并明确保持 provider route、A2 与生成参数不变；后续 I153–I163 不触碰该链路。因此本修复与前后需求无冲突，是 I85 消费者夹具遗漏暴露的兼容漏接。

## DoD

- [x] `NovelLlmConfigService.save()` 在 `novel-custom` 模型项声明 `off/low/high/max`，其中启用档使用同名 wire value。
- [x] settings 合并仍保留其他 provider，Remote、A2 sampling、modelRef/secretRef 与 credentials seam 逐字段不变。
- [x] 单元回归覆盖 enabled/high、disabled/off、重复保存与 provider 合并。
- [x] 独立真实 DSH `0.1.1-rc.2` `llm-pi-ai` 消费者夹具以旧 `{id}` 复现 `UNSUPPORTED_REASONING_EFFORT`，以新声明接受 low/high/max 并暴露 off；重型 provider SDK 不进入默认 Vitest 并发。
- [x] 空/非法 reasoning capability 配置由真实宿主校验 fail closed。
- [x] `pnpm run verify:i164`、`pnpm run verify:stage-31` 全绿，smoke 产物可查；I164 smoke 内重跑 I85 确定性 Host 合同夹具，I152 smoke 单独回归。
- [x] 一次干净 I164 commit；用户 `docs/novels` 改动不纳入。

## 明确不做

- 不升级 DSH，不新增 Remote/UI 字段，不更改 A2 schema、prompt、样本、gold 或阈值。
- 不探测远端模型，不按模型名猜能力，不为非 DeepSeek-compatible endpoint 静默降级。
- 不改 credentials owner，不恢复后置 F1/F2。
