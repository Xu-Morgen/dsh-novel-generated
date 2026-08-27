# AI 长篇小说创作器 — 架构审查记录

> 版本：v1.0（2026-08-27）
> 性质：**审查记录（review record），非设计权威**。本文件只记录一次独立架构审查的发现、证据与改善建议，供后续重构立项参考；不修改、不替代 `novel-creation-tool-design.md`（v2.2）的 §0.1 宿主基线，也不构成新的设计决策（如需决策请走 ADR/迭代流程）。
> 审查方式：一手阅读关键文件 + 三个并行子代理分别深挖 Client / Host / Core+LLM 三层；全程只读，未修改任何源码。
> 行号说明：本记录中的 `file:line` 证据均为审查当日（2026-08-27）实测，随代码演进可能漂移。

---

## 0. 审查概览

| 项 | 值 |
|---|---|
| 审查对象 | `src/` 全量（295 个 TS 文件，约 2.7 万行生产代码）+ `contracts/` + 权威文档 |
| 项目阶段 | I1–I74 逐迭代推进（128 次提交）；I1–I53 已完成 |
| 分层结构 | core 领域引擎 → host 服务 → wire 契约（host/remote）→ client 面板 |
| 审查问题 | ①严重架构问题 ②过大文件 ③god class / 过重权责 ④霰弹枪类 ⑤过长链式调用 |

## 1. 总体结论

**分层思路清晰、领域所有权纪律严格、core 内部严格 DAG（零反向引用）** —— 这是显著优点（见 §2）。

**但存在 3 个系统性架构问题，均为「高」严重度：**

1. **霰弹枪修改（shotgun surgery）是全项目最核心的问题**（§6）—— 一次逻辑变更横切 5~8 个文件，多处是机械重复声明，且部分同步点无编译期保护。
2. **两个 god file + 两个 god service**（§4、§5）—— `src/client.ts`（约 2876 行）、`src/index.ts`（581 行）；`host/writing-adjudication-service.ts`（588 行）、`host/onboarding-adjudication-service.ts`（648 行）。
3. **契约/形状被手写多重复声明**（§6.3）—— 同一形状在 core schema、服务 view、wire schema、client shape 各声明一遍，缺少单一来源与 codegen。

**长链式调用不构成严重问题**（§7，低严重度），但存在等价的「长参数列表 / 巨型闭包」坏味道。

## 2. 正面资产（重构时须保持）

| 资产 | 证据 |
|---|---|
| core 是纯领域层，不反向依赖 host/client | 全量扫描 core → host/client 反向 import 为 **0** |
| core 模块间为严格 DAG，无循环 | `queue/task → candidate`、`statistics → queue/task`、`pipeline → assemble/canon/knowledge/filter`、`trace → assemble/pipeline` 等交叉边均为单向，无回边 |
| 单 owner 纪律贯穿全文 | CanonLedger append-only、ConfirmationGate 幂等、fail-closed、只读零写、Fiber dispose 全量回收 |
| 领域模块「小而内聚」的正面范例 | `core/queue/`、`core/candidate/` 采用「index 只 re-export + schema/纯函数/持久化分文件」 |
| schema 复用的正面反例（证明解法存在） | `host/remote/timeline.ts` 用 `timelineWireSchema = timelineSchema` 直接别名复用；`host/remote/editor.ts` 复用 `characterCoreSchema` —— 凡复用 schema 处均不霰弹 |
| 契约注释完备 | 每个引擎模块、每层 Schema、每个扩展点均有 JSDoc 契约与不变式说明 |

## 3. 严重架构问题（高严重度，需立项解决）

### 3.1 问题一：霰弹枪修改（详见 §6）

**结论：是，全项目最严重的架构问题。** 新增一个 Remote 方法横切 5~6 个文件，新增一个 Remote 服务横切 7~8 个文件；schema 一个字段变更影响 6~8 个文件、其中 3 处是无类型检查的字符串/字面量。

### 3.2 问题二：god file 与 god class（详见 §4、§5）

**结论：是。** `src/client.ts` 同时承担 store 定义、视图分发、渲染、1300 行操作闭包、Remote 挂载、上传/onboarding 业务逻辑；`src/index.ts` 约 45~50% 是样板接线；`writing-adjudication-service`（17 个依赖）与 `onboarding-adjudication-service` 是编排型 god service。

### 3.3 问题三：类型安全在边界被系统性侵蚀

**结论：是，集中于两处。** 统计（非测试代码）：

| 模式 | 数量 | 集中位置 |
|---|---|---|
| `as Parameters<...>` | 19 | 18 处在 `src/index.ts` 的 bindRemote 适配层 |
| `as never` | 8（生产） | `src/index.ts` L335–337/L359–361 等；其中 3 个探测器**在同一函数内已 provide 给局部变量**却绕回 `ctx.get(...) as never`，可零成本消除 |
| `as unknown as` | 13（生产） | `onboarding-adjudication-service.ts` 占 12 处（`raw as unknown as XxxInput`） |
| `String(...)` 强转 | ~77 | 约 60 处在 index.ts 接线层 |

**核心风险**：bindRemote 层用 `as Parameters<...>` 断言后，**方法签名改了但接线层不报编译错，错误只能运行时暴露**。

## 4. 过大文件清单（应拆分）

### 4.1 功能拆分优先级高

| 文件 | 实测行数 | 混装内容 | 建议拆分 |
|---|---|---|---|
| `src/client.ts` | ~2876 | store 接口（`WorkbenchActions` 75 方法 + `WorkbenchState` 45 字段）、`viewPanel`（33 形参）、`workbenchView`（~40 形参）、`makeOps` 约 1308 行（L1194–2501）、16~17 个 `$mount` 块（L2727–2833） | `client/store/`、`client/ops/`（按层拆）、`client/panels/` 注册表、`client/mount.ts` |
| `src/host/writing-adjudication-service.ts` | ~588 | propose / preview / accept-saga / reject / rewrite / 恢复注册 7 类职责，17 个依赖 | 候选生产 / 校验投影 / 落地 saga 三段 |
| `src/host/onboarding-adjudication-service.ts` | ~648 | 4 种裁决语义 + 会话状态机 + 跨层 preflight + 6 个 applyLayer | 裁决状态机与 applyLayer 拆出 |
| `src/core/statistics/index.ts` | ~524 | ~190 行只读接口类型 + 纯函数 + `StatisticsRepository` 三类挤一文件 | `types.ts` / `build.ts` / `repository.ts` |
| `src/core/onboarding/analyzer.ts` | ~426 | prompt 构建 + 输出校验 + **170 行 few-shot 示例字面量** + 超长契约字符串 | `prompt.ts` / `validate.ts` / `example.ts` |
| `src/core/search/index.ts` | ~432 | `buildSearchEntries`（178 行）内联六层条目构建 | per-layer builder |

### 4.2 结构拆分优先级中

| 文件 | 实测行数 | 说明 |
|---|---|---|
| `src/client/styles.ts` | ~2052 | 单个 `WORKBENCH_STYLES` 模板字符串（L52–2052）+ 8 个常量；纪律好但粒度过粗，可按键分区 |
| `src/index.ts` | ~581 | 接线样板无法消失，但可用「Remote 定义即接线」工厂砍掉约 40% |
| `src/client.test.ts` | ~4838 | 30 个 describe / 约 137 个 it 全堆一文件；350 行测试 harness 单文件独有 |
| `src/core/text/index.ts` | ~357 | `TextRepository` 承担 CRUD + legacy 迁移 + 分支版本 + 可读镜像 + 串行队列（同一域内可接受） |
| `src/core/schema/onboarding.ts` | ~322 | 六层候选 schema 手写重复，可用 `characterCoreSchema.omit(...)` 组合表达 |
| `src/core/assemble/serializers.ts` | ~364 | 6 个 serializer + 9 个私有辅助，同一序列化域，可接受 |
| `src/client/layers/chapters.ts` | ~563 | 面板层最大的一个文件，可按面板分区 |

## 5. god class / 过重权责

### 5.1 Client 侧

- **`WorkbenchActions`（75 方法）+ `WorkbenchState`（45 字段）+ `ProjectSessionActions` 平行重复声明**（`project-session.ts:7–18` vs `client.ts:199–240`）—— 真正的 god 接口三件套。
- `viewPanel`（33 形参）与 `workbenchView`（~40 形参）—— 长参数列表等价于 god 函数。
- `makeOps`（L1194–2501）—— 约 1300 行内联闭包承载全部面板的操作/加载/错误处理，且内部重复 40+ 处 `beginOp/unwrap/release` 样板、9 个一字不差的 `xxxPatch` action、6 个 loading/error 三态外壳、两个几乎相同的 `run<T>` 助手（search L2287 / statistics L2378）。

### 5.2 Host 侧

| 服务 | 实测行数 | 依赖数 | 判定 |
|---|---|---|---|
| `writing-adjudication-service.ts` | ~588 | 17 | **god service**：职责与依赖双高；`buildWriters`（L277–322）与 `text-edit-service.ts`（L153–201）的 **C2→C1→C3→C4→B2 五层写回器几乎逐行相同**（已逐行比对确认） |
| `onboarding-adjudication-service.ts` | ~648 | 8 | **god service**：裁决语义 + 状态机 + preflight + 6 个 applyLayer |
| `queue-service.ts` | ~612 | 6 | 偏长但内聚（围绕「队列状态机」），不宜拆 |
| `workspace-service.ts` | — | 11（位置参数） | 纯透传 mega-facade（28 个方法几乎全是转发） |
| `writing-context.ts` | 173 | 11~12 | 装配中枢，语义单一可接受，但依赖面全文最宽 |

### 5.3 Core 侧

**无典型 god class**：CanonLedger、StateEngine、TextRepository 各自围绕单一不变量/单一域（178~357 行自洽）；`queue/`、`candidate/` 的分文件模式是正面范例。过重的是文件而非类（见 §4.1）。

### 5.4 重复实现（DRY 违约）

| 重复 | 位置 |
|---|---|
| 5 层写回器双份 | `writing-adjudication-service.ts:277–322` vs `text-edit-service.ts:153–201` |
| `normalizeText` / `chunkText` 双份 | `core/upload/index.ts:36–63` vs `src/import/index.ts:56–83`（默认 chunk 均为 4000） |
| SHA-256→hex 三份 | `client.ts:1325`、`client.ts:2673`、`client/upload.ts:39` |
| `confidenceSchema` 定义 7 次 | `llm/parse/{state,canon,worldview,relationship,knowledge,split}.ts` + `schema/onboarding.ts` |
| 「parse-JSON-or-throw」样板 9 份 | `llm/parse/*.ts`（每个 parser 一份） |
| violation schema 三份 | `llm/validate/{index,knowledge,relationship-style}.ts` 与 `core/validate/index.ts:14–19` 结构重复 |

## 6. 霰弹枪修改（shotgun surgery）

**结论：存在，且是全项目最严重的问题。** 本质是「一次逻辑变更 → 多处机械同步」。

### 6.1 新增一个 Remote 方法的文件链（以 `novelReview` 为例，实测）

```
host/review-service.ts（服务实现）
→ host/remote/review.ts（InvocationDescriptor + wire schema）
→ src/index.ts（bindRemote 适配块）
→ client/shared.ts（namespace 接口 + re-export）
→ client/layers/review.ts（面板调用）
→ client.test.ts（UI 测试）
```

- 新增一个**方法**：5~6 个文件；新增一个**服务**：7~8 个文件（另需动 `src/remote.ts` 的 hostContribution 数组与 re-export、`client.ts` 的 `$mount` 块）。
- 功能关键词横切面实测：`novelQueue` 5 个文件、`novelReview` 7 个、`novelStatistics` 6 个。
- `client.ts` 中 16~17 个结构完全相同的 `$mount` 块（L2727–2833）。

### 6.2 Schema 层变更横切（以 characters 层为例）

给 `characterCoreSchema`（`core/schema/characters.ts:52`）改名一个字段，影响面：

1. `core/schema/characters.ts:52`（必然）
2. `core/schema/onboarding.ts:50` —— `onboardingCharacterSchema` **逐字段手写重列**（不复用 `omit()`）
3. `core/onboarding/analyzer.ts:211–253` 的 `ONBOARDING_PROMPT_EXAMPLE` 字面量 + L387–395 的契约字符串（**无类型检查**）
4. `core/search/index.ts:177–194` 的 searchText 拼接
5. `core/assemble/serializers.ts:249–271` 的 `renderCharacter`
6. `client/layers/characters.ts:4–21` 的 `CharacterShape`（全 optional + `kind: string` 失型）+ L109 硬编码 kind 枚举（**无编译期约束**）

共 6~8 处，其中 3 处是字符串/字面量，漏改只在运行时暴露。

### 6.3 根因：契约/形状被手写四重声明

同一形状在四处各声明一遍（如队列任务：`QueueTaskView` 接口 / `queueTaskViewWireSchema` / client 投影 / 测试 fixture）。`host/remote/` 下 `param()` 助手与 `xxxInvocation()` 工厂各复制 **19 份**；`contracts/` 契约锁形同虚设（只有 2 个只含字符串 shapeIds 的 JSON，形状本体不在其中）。**正面反例**：`host/remote/timeline.ts:21` 与 `host/remote/editor.ts:52` 直接复用 core schema，凡复用处均不霰弹。

## 7. 长链式调用评估

**结论：不构成严重问题（低严重度）。** 全量扫描（非测试代码）5 层以上点链仅 5 处，最深 6 层：

| 实例 | 层级 | 说明 |
|---|---|---|
| `agents/agent-tools.ts:245` — `built.sources.context.sources.characters.length` | 5 | `sources.context.sources` 嵌套形状值得审视（同文件 L246 重复） |
| `core/assemble/serializers.ts:144–152` — 6 层 `.register(...)` 链 | 6 | 可读性好，可接受 |
| `core/outline/index.ts:80–88` — 5 层 flatMap 嵌套 | 5 | 排序有注释保证 |
| `core/trace/index.ts:120` — trace 重跑整条 `ContextAssembler` 链 | — | **第二组装路径**：改组装预算/顺序时需同步验证，是真正的隐患 |
| `core/export/index.ts:179`、`core/statistics/index.ts:419` | 4 | 数据管道，可接受 |

**真正值得警惕的「长链等价物」**：33~40 形参的巨型函数（`viewPanel`/`workbenchView`）、client.ts 的 `beginOp/unwrap/release` 重复样板、host 侧多段 `??` 回退 + await 挤一行的表达式（`writing-adjudication-service.ts:222`）、`JSON.parse(JSON.stringify(...))` 深拷贝链（`onboarding-adjudication-service.ts:150`）。

## 8. 其他发现

| # | 问题 | 证据 | 严重度 |
|---|---|---|---|
| 1 | 契约不匹配在组合根打补丁 | `novelReview.records`（index.ts:376）与 `novelKnowledgeManager.pending`（index.ts:419–423）服务返回裸数组、wire 要 envelope，适配层整形——契约漂移被接线层掩盖 | 中 |
| 2 | 命名不一致 | `novelImport` / `novelImportExport` / `novelExport` 三服务并存；`novelOutlineProgress` 实为 C6 进度+灵感；`novelTextEdit` vs `novelLocalizedEdit` 边界模糊 | 中 |
| 3 | 组合根重复闭包 | `resolveA2GenerationConfig(...)` 5 次（index.ts L215/296/338/362/389）；`(dispose) => ctx.effect(...)` 27 次 | 低 |
| 4 | 分层倒置边（非环） | `core/settings-index → llm/port`、`core/upload → import`——core 依赖上层；另有 `llm/template → core/settings-index`，形成 `core → llm → core` 往返（未成环，属脆弱点） | 中 |
| 5 | client bundle 直连 core 纯模块 | `client/layers/review.ts:2 → core/review/issue.js`、`host/remote/timeline.ts → core/timeline/schema.js`——功能正确且注释说明为刻意，但字面上与「Client 不拥有领域真相」表述有张力，建议将「可入 client 图的 core 纯模块白名单」显式化进文档 | 低 |
| 6 | 导入概念碎片化 | 「导入」横跨 `src/import`（文件导入）、`core/upload`（docx 分块）、`core/export.importProject`（档案恢复）、`host/import-export-service`（统一 Remote 面）四个 owner，重叠点即 §5.4 的双份文本管道 | 中 |
| 7 | 杂项 | index.ts L191–193 缩进错误；`workspace-service.ts` 可选参数 + 运行时 throw（类型撒谎）；`onboarding-analyzer-service.ts:119` fire-and-forget 无日志；队列轮询 2000ms 硬编码（client.ts:1729） | 低 |

## 9. 优先重构路线图（按性价比排序）

| # | 动作 | 预期收益 | 验证方式 | 工作量 |
|---|---|---|---|---|
| 1 | **抽取共享 Remote 接线层**：`param()`/`xxxInvocation()` 19 份助手、16 个 bindRemote 适配块、27 个 dispose 钩子、client.ts 16 个 `$mount` 统一为参数化工厂（`defineRemote(serviceKey, methods[])`），同步消除 18 处 `as Parameters<...>` 与 6 处 `as never` | index.ts 减约 40%，霰弹枪中心面砍半 | `pnpm test` + `pnpm run verify:stage-*` 全绿（纯机械重构，安全网完备） | 中 |
| 2 | **收敛 llm 解析/检测公共基座**：9 份 parse-JSON 样板、7 份 `confidenceSchema`、3 份 violation schema 提到 `llm/parse/shared.ts` / `llm/validate/shared.ts`，每域只留 op 形状 + assert + prompt | 消灭全仓库最大复制源 | 各 parser 样本回归 + `pnpm test` | 中 |
| 3 | **契约单一来源**：wire schema 从 `core/schema` 派生（沿用 timeline/editor 先例）；`CharacterShape`/`OutlineShape` 改 client 可打包的纯 zod 直用；修复 `records`/`pending` 的组合根补丁；真正启用 `contracts/` 存形状本体 | 消除四重声明，schema 变更影响面 6~8 → 2~3 文件 | 类型检查 + wire smoke（strict codec） | 中-大 |
| 4 | **拆分两个 god service**：`writing-adjudication-service`（含 5 层写回器提取共享）与 `onboarding-adjudication-service` 按职责段拆模块 | 单一修改热点分散 | 既有 service 级测试 + `pnpm test` | 中 |
| 5 | **拆 client.ts**：store / ops（makeOps 1300 行按层拆）/ 面板注册表 / mount；收敛 `WorkbenchActions`/`WorkbenchState`/`ProjectSessionActions` 三接口；抽测试 harness 并拆 `client.test.ts` | god file 消除 | 既有 UI 测试（client.test.ts）逐步迁移 | 大 |
| 6 | **低优先级**：合并 upload/import 文本管道、合并 3 份 SHA-256、统一服务命名、修正分层倒置边、修复 `onboarding-adjudication` 12 处 `as unknown as` | 债务清零 | `pnpm test` | 小-中 |

**执行策略建议**：
- 第 1、2 项为纯机械重构，有完整 verify 流水线兜底，建议**优先做**；
- 第 4、5 项为结构性拆分，建议按 AGENTS.md 单迭代纪律**一次一个切片**推进（每切片一个 commit、`pnpm run verify:iN` 通过再进下一步）；
- 所有改动须保持既有领域所有权设计不变（core 归 core、接线归组合根、真相单 owner），本记录只消除复制与接线债务，不要求改变任何领域契约；
- 本记录中「高严重度」问题建议在重构立项时逐项挂迭代号追踪（backlog），避免被新功能继续叠加。

## 附录 A：证据索引（审查当日实测）

| 主题 | 证据 |
|---|---|
| god file | `src/client.ts`（2876 行；makeOps L1194–2501；`$mount` L2727–2833；viewPanel L386–470；workbenchView L518） |
| god 组合根 | `src/index.ts`（581 行；52 次 `ctx.provide`；17 个 bindRemote；18 处 `as Parameters<...>`；6 处 `as never`） |
| god service | `src/host/writing-adjudication-service.ts`（588 行，17 依赖；buildWriters L277–322）；`src/host/onboarding-adjudication-service.ts`（648 行） |
| 写回器重复 | `src/host/writing-adjudication-service.ts:277–322` vs `src/host/text-edit-service.ts:153–201` |
| wire 契约 | `src/host/remote/*.ts`（21 文件；`param()` 助手 19 份；104 个 InvocationDescriptor；90 个 WireSchema） |
| 霰弹枪横切 | `novelQueue` 5 文件、`novelReview` 7 文件、`novelStatistics` 6 文件；`client/shared.ts`（namespace 接口 L61–148） |
| 契约锁空置 | `contracts/` 仅 `stage10/docx-upload.json`、`stage10/project-lifecycle.json`（只含字符串 shapeIds） |
| 长链 | `agents/agent-tools.ts:245`；`core/assemble/serializers.ts:144–152`；`core/outline/index.ts:80–88`；`core/trace/index.ts:120` |
| 分层倒置 | `core/settings-index/index.ts:7 → llm/port`；`core/upload/index.ts:5 → import/docx` |
| 文本管道重复 | `core/upload/index.ts:36–63` vs `src/import/index.ts:56–83` |
| 哈希重复 | `client.ts:1325`、`client.ts:2673`、`client/upload.ts:39` |
