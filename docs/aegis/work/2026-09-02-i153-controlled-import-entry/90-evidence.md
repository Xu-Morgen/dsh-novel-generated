# I153 验收证据

## 交付结果

- 目录层 DOCX 新建作品后进入 Stage 19 来源审阅，不再直接启动旧六层分析。
- 来源审阅在没有 `OnboardingState` 时仍可见，作者可选择“背景设定 / 幕后资料”或“已有正文”。
- 背景资料的按视角重构路径可填写“已有主角 ID”或“待创建主角候选 ID”。
- 来源 session 确认前 I151 零调用；首次确认后精确启动一次规则/文风候选生成。
- Host chunk 范围非法与陈旧作品回调均 fail closed。
- I151 smoke 直接调用项目内 Vitest，不再要求新设备全局提供 `corepack`。

## 自动验证

- `pnpm run verify:i153`：通过。
  - TypeScript 类型检查通过。
  - Vitest：212 test files passed，1152 tests passed。
  - Client build：`lib/client.js` 生成成功。
  - I153 smoke：通过。
- `pnpm run verify:stage-22`：通过。
  - I153 与 product-flow 两轮全量回归均为 212 test files / 1152 tests 全绿。
  - I140、I149、I151、I153 smoke 全部通过。
- 定向产品夹具：`src/client-onboarding-docx.test.ts` 2/2、`src/client-onboarding-project-dir.test.ts` 3/3 通过。
- 负向夹具覆盖非法 Host chunk range、确认前零 I151 调用、旧六层零启动。

## 环境复核

全量并行回归曾分别触发既有 I104/I111 的固定 5 秒超时和一次 Windows 临时目录清理竞争；隔离复跑分别在 210 ms、439 ms 及 130 ms 内通过，随后原样 I153 与 Stage 22 门禁完整通过。未放宽测试超时，也未改动这些旧业务用例。

## 产物

- `artifacts/i153-controlled-import-entry.json`
- `scripts/smoke-i153.mjs`

## 明确未改

- I150 仍是范围细纲生成合同，不改名、不改语义。
- I151 Host/Remote/schema/prompt/样本与“一次初始化 + I11 确认后落盘”合同不变。
- 未新增来源 enum，未恢复后置的正文保真导入包。
