# Stage 15 架构债务消除实施计划（I75–I84）

## Goal

依据 `docs/novel-creation-tool-architecture-review.md`（v1.0）§9 的性价比路线图，在 I1–I74 功能交付后立项消除系统级架构债务：霰弹枪修改（一次逻辑变更横切 5~8 文件）、god file / god service（`client.ts` ~2876 行、`index.ts` 581 行、两个 adjudication service 588/648 行）、契约/形状手写多重复声明（同一形状四处各声明一遍）、边界类型安全侵蚀（18 处 `as Parameters<...>`、6 处 `as never`、12 处 `as unknown as`）。本阶段只消除复制与接线债务，不改变任何领域契约与公开 Remote/wire 形状，保持领域所有权设计（core 归 core、接线归组合根、真相单 owner）与 §0.1 宿主基线不变。

## Architecture

- **接线层**：`src/host/remote/` 收敛 19 份 `param()`/`xxxInvocation()` 助手为共享 helper；`src/index.ts` 的 16 个 bindRemote 适配块替换为参数化工厂 `defineRemote(serviceKey, methods[])`；类型安全由工厂签名恢复，方法签名变更在接线层报编译错，禁止再以 `as Parameters<...>`/`as never` 掩盖。
- **公共基座**：`src/llm/parse/shared.ts`（9 份 parse-JSON-or-throw 样板、7 份 `confidenceSchema`）、`src/llm/validate/shared.ts`（3 份 violation schema）；每域只保留 op 形状 + assert + prompt。
- **契约单一来源**：wire schema 从 core schema 派生（沿用 `host/remote/timeline.ts`/`host/remote/editor.ts` 先例）；修复 `novelReview.records`/`novelKnowledgeManager.pending` 组合根补丁；`contracts/` 存形状本体并加一致性断言；Client 投影 shape 用可打包纯 zod；「可入 client 图的 core 纯模块白名单」显式化并受构建扫描约束。
- **god service 拆分**：`writing-adjudication-service` 按「候选生产 / 校验投影 / 落地 saga」三段拆分并提取 C2→C1→C3→C4→B2 五层共享写回器（与 `text-edit-service` 去重）；`onboarding-adjudication-service` 拆出「裁决状态机」与「6 个 applyLayer」并消除 12 处 `as unknown as`。`queue-service` 判定内聚，不拆。
- **client.ts 拆分**：拆出 `src/client/{store,ops,panels}/` 与 `src/client/mount.ts`；收敛 `WorkbenchActions`/`WorkbenchState`/`ProjectSessionActions` 三接口与 `$mount` 块；`client.test.ts` 单文件 harness 抽为共享测试工具并拆分；`client/styles.ts` 按键分区。
- **core 文件拆分**：`core/statistics/index.ts`（→ types/build/repository）、`core/onboarding/analyzer.ts`（→ prompt/validate/example）、`core/search/index.ts`（→ per-layer builder）、`core/schema/onboarding.ts`（→ `characterCoreSchema.omit(...)` 组合）。
- **低优先级债务**：合并双份文本管道与 3 份 SHA-256→hex；修复分层倒置边（`core/settings-index→llm/port`、`core/upload→import`、`llm/template→core/settings-index` 往返）；修复杂项（缩进、类型撒谎参数、fire-and-forget 无日志、轮询硬编码）；统一内部命名，公开 Remote 服务名不动。

## Tech Stack

- TypeScript strict / Node.js ≥22 / ESM / pnpm；与既有工程完全一致，不引入新依赖、独立 codegen 工具链或第二构建面。
- 测试：Vitest + 既有 `pnpm test` 全量；每迭代 `pnpm run verify:iN` 追加本迭代专属负向扫描断言（grep/脚本）；阶段门 `pnpm run verify:stage-15`。

## Baseline / Authority Refs

1. `docs/novel-creation-tool-architecture-review.md` v1.0（2026-08-27）：§3 严重问题、§4 过大文件、§5 god class/DRY、§6 霰弹枪、§8 其他发现、§9 优先重构路线图（立项输入，review record，非设计权威）。
2. `docs/novel-creation-tool-design.md` v2.3：§0.1 宿主基线（不可修改）、§14.12 架构债务消除、D21–D22、§13 M15。
3. `docs/novel-creation-tool-requirements.md` v2.3：R16 组、N-9、Stage 15 覆盖矩阵。
4. `docs/novel-creation-tool-development-plan.md` v2.3：§16 Stage 15 卡片（I75–I84）与 §17 完成线、§18 Risks——本计划的执行权威卡片。
5. `AGENTS.md` v2.3：一迭代一任务、一 commit、重构叠加纪律。

## TDD Route

```text
TDD Route:
- Mode: off
- Decision: skipped
- Strict authority: not applicable
- Test posture: 最小重构 + 重构前后行为等价回归（既有全量测试 + stage 回归 + LLM 样本阈值不变 + 本迭代负向扫描断言）
- Reason: 项目级 TDD 未开启；重构类迭代以既有验收回归与新增负向扫描锁定「行为等价」
- Verification: 每迭代 `pnpm run verify:iN`；阶段门 `pnpm run verify:stage-15`
```

## Compatibility Boundary

- 不改变任何领域契约、公开 Remote 方法名/参数/结果 codec 与 wire schema 形状；I54–I74 已批准功能迭代的契约在重构后仍兼容。
- `contracts/` 由「只含字符串 shapeIds 的 JSON」升级为形状本体，属启用而非破坏。
- 公开服务破坏性改名（`novelImport`/`novelImportExport`/`novelExport` 等）明确后置 backlog，本阶段不做。
- 拆 client.ts 时保持 DOM 契约与既有测试锚点（`data-novel-workspace`/`data-novel-layer`）不变，测试迁移分批提交。
- core 反向依赖纪律：core→host/client 反向 import 保持 0；Client 可入图 core 纯模块白名单显式化，白名单外引用负测失败。

## Stage / Task Map（执行卡片见开发计划 §16）

| 迭代 | 主题 | 对应审查项 | 验证 |
|---|---|---|---|
| I75 | 共享 Remote 接线层与组合根收敛 | §9 #1、§8#3 | `pnpm run verify:i75` |
| I76 | llm 解析/检测公共基座 | §9 #2、§5.4 | `pnpm run verify:i76` |
| I77 | wire schema 单一来源与契约补丁修复 | §9 #3、§8#1、§6.3 | `pnpm run verify:i77` |
| I78 | 契约锁落地与 Client shape 收敛 | §9 #3、§8#5 | `pnpm run verify:i78` |
| I79 | writing-adjudication 拆分与共享写回器 | §9 #4、§5.4 | `pnpm run verify:i79` |
| I80 | onboarding-adjudication 拆分与类型断言消除 | §9 #4、§3.3 | `pnpm run verify:i80` |
| I81 | core 高优先文件拆分 | §4.1/§4.2 | `pnpm run verify:i81` |
| I82 | client.ts 拆分（一）store/ops | §9 #5、§5.1 | `pnpm run verify:i82` |
| I83 | client.ts 拆分（二）panels/mount/harness | §9 #5、§4.2 | `pnpm run verify:i83` |
| I84 | 低优先级债务清零 | §9 #6、§8#2/§8#4/§8#7 | `pnpm run verify:i84` |

## Risks 与 Retirement

- **重构回归风险**：以既有全量测试 + stage 回归 + LLM 样本阈值兜底；回归先定位具体迭代并回退上一可用 commit。
- **契约漂移风险**：I77/I78 以 strict codec wire smoke 证明形状等价；禁止继续在接线层以补丁掩盖契约不匹配。
- **大文件拆分风险**：I82/I83 保持 DOM 契约与测试锚点，迁移分批提交。
- **范围蔓延风险**：重构迭代禁止夹带新功能；超范围记 backlog。
- **命名统一风险**：I84 只统一内部命名；公开改名另行立项。
- **Retirement**：重构消除的重复实现（双份写回器、双份文本管道、三份 SHA、手写四重声明等）在对应迭代通过后 delete-first 退役，不保留双路径；旧代码只留在 Git 历史。
