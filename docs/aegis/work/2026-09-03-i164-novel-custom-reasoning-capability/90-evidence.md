# I164 Evidence — `novel-custom` DeepSeek reasoning capability 闭环

## 根因审计

- `821438f` 建立 `novel-custom` provider 时，模型目录只有 `{ id }`。
- `0073524` 后续引入设置页思考强度、A2 `sampling.reasoning` 与 Host port `reasoningEffort` 转发，却没有同步模型能力元数据。
- I85 将 DSH family 固定到 `0.1.1-rc.2`；该版本在 provider I/O 前校验 hand-declared model 的 `reasoningEfforts`。I85 只用 fake adapter 验证了 port 转发，没有让真实 `llm-pi-ai` 消费生成的 settings YAML。
- I152 仅迁移 credentials owner，并明确保持 provider/A2/生成行为；I153–I163 未触碰该链路。结论：这是既有能力与 rc.2 消费合同之间的漏接，不是前后需求冲突，也不是 I152 回归。

## 交付证据

- `NovelLlmConfigService.save()` 现在为 `novel-custom` 模型写入精确映射：`off: null`、`low: low`、`high: high`、`max: max`。
- 配置回归断言首次保存、重复保存、A2 round-trip 与其他 provider 合并不变。
- `scripts/i164-llm-reasoning-capability-consumer.mjs` 使用实际 `@deepseek-ai/dsh-llm-pi-ai@0.1.1-rc.2`：旧 `{ id }` 配置稳定复现 `UNSUPPORTED_REASONING_EFFORT`；生产 service 生成的 YAML 可解析 low/high/max 并暴露 off；空字典、仅 off、空 wire value 均 fail closed。夹具不发网络或计费请求。
- `scripts/smoke-i164.mjs` 重跑 I85 确定性 Host 合同夹具，并以 SHA-256 锁定 Remote descriptor、A2 schema/settings index、LLM port 与 Client 设置面未改变。
- Smoke 产物：`artifacts/i164-novel-custom-reasoning-capability.json`。

## 验收结果

- `pnpm run verify:i164`：通过；TypeScript、215 个测试文件 / 1177 条测试、构建、I164 smoke、I152 smoke 全绿。
- `pnpm run verify:stage-31`：通过；I164 累积门、Stage 30、三轮 215/215 测试文件与 1177/1177 测试、I140/I149/I151/I152/I153/I154/I162/I163/I164 smoke 全绿。
- Client bundle：`lib/client.js`，1,493,787 bytes。
- 样本、gold、阈值、prompt/schema 均未修改；本迭代只修 capability metadata 与消费者验收门。

## 范围审计

- 未改变 `novelLlmConfig` Remote、A2 sampling/schema、modelRef/secretRef、credentials seam、UI 输入形状或 LLM port。
- 未升级 DSH，仍固定 `0.1.1-rc.2`；只将同版本 `llm-pi-ai` 加入开发期真实消费者依赖。
- 未改用户 `docs/novels` 工作区文件，未恢复后置 F1/F2。
