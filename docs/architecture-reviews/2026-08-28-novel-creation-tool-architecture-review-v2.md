# AI 长篇小说创作器 — 架构审查记录 v2（2026-08-28）

> 版本：v2.0（2026-08-28）
> 性质：**审查记录（review record），非设计权威**。本文件记录 2026-08-28 对当前代码的一次独立架构审查的发现、证据与改善建议，供后续重构立项参考；不修改、不替代 `docs/novel-creation-tool-design.md` 的 §0.1 宿主基线，也不构成新的设计决策（如需决策请走 ADR/迭代流程）。
> 与 v1.0 的关系：v1.0（2026-08-27，`docs/novel-creation-tool-architecture-review.md`）的 Stage 15 六项路线图已全部进入 I75–I84 迭代并完成（见 §9 落地跟踪）。本 v2.0 是 Stage 15 完成之后的**再审查**，重点核验重构成效、发现新引入的契约缺陷与剩余债务。
> 审查方式：一手阅读关键文件 + 三个并行子代理分别深挖 Host / Client / Core+LLM 三层 + 对 DSH 运行时实现（`node_modules/@deepseek-ai/dsh/…/dsh-api-gateway/lib/client.js`）逐行核验契约执行语义；全程只读，未修改任何源码。
> 验证证据：`pnpm run typecheck` 通过；`pnpm test` 全量 116 文件 / 723 测试全绿（2026-08-28 实测）。
> 行号说明：本记录中的 `file:line` 证据均为审查当日（2026-08-28）实测，随代码演进可能漂移。

---

## 0. 审查概览

| 项 | 值 |
|---|---|
| 审查对象 | `src/` 全量（246 个生产 TS 文件，约 3.1 万行）+ `contracts/` + 权威文档 + DSH 运行时实现 |
| 项目阶段 | I1–I84 已完成；I85（DSH family `0.1.1-rc.2` 兼容升级）已批准、待执行 |
| 分层结构 | core 领域引擎 → host 服务 → wire 契约（host/remote + index 组合根）→ client 面板 |
| 审查问题 | ①严重架构问题 ②过大文件 ③god class / 过重权责 ④霰弹枪修改 ⑤过长链式调用 |
| 关键结论 | **无 Critical；但存在 1 个已证实、真实运行时会必现的高危契约缺陷（5 个 Remote 方法）**，且现有 723 个测试全部无法发现它 |

## 1. 总体结论

**分层思路清晰、领域所有权纪律严格、core 严格 DAG（零反向引用）** —— 与 v1.0 一致，仍是显著优点（见 §2）。I75–I84（Stage 15）重构**真实有效但不彻底**：I82/I83（Client store/ops/mount 拆分）与 I76/I78/I79/I80/I81（llm 基座、契约锁、god service 拆分、core 拆分）已实质落地；但 I75/I77 宣称的「端到端类型安全恢复 / 契约单一来源」**并未全局成立**，并遗留了一个此前不存在的盲区：

> **盲区**：Remote 接线被机械化（`defineRemote`/`remoteContribution`/`mountRemote`）之后，没有任何测试再验证「接线后的方法在真实 DSH 客户端绑定器下可调用」。UI 测试走 fake remote（`client/test-harness.ts`），smoke 脚本全是 Host-only Node 脚本 → 接线层 arity/形状漂移在 CI 中完全不可见，只能在真实运行时暴露。

**高严重度问题（5 项）：**

1. **Remote 契约漂移是「活的」：5 个方法在真实客户端绑定器处必现失败**（§3.1，已证实）。
2. **Agent 上下文双 owner → 语义分叉**（§3.2）。
3. **队列轮询 timer 生命周期不归属 Fiber**（§3.3）。
4. **`src/index.ts` 仍是 god composition root**（§3.4）。
5. **`src/client.ts` 仍是 god composition/controller**（§3.5）。

## 2. 正面资产（重构/修复时须保持）

| 资产 | 证据 |
|---|---|
| core 是纯领域层，不反向依赖 host/client | 全量扫描 core → host/client 反向 import 为 **0**（三方子代理一致） |
| core 对 llm 的反向依赖已清零 | `src/core` 中 `from '…llm/'` 实测 **0** 处（v1.0 记录的分层倒置边 `core/settings-index→llm/port`、`core/upload→import` 已在 I84 清零，本 v2.0 更正 v1.0 §8#4 为已修复） |
| core 模块间为严格 DAG，无循环 | 唯一残留为 `core/search/index.ts↔builders.ts` 的 **type-only** 源级双向依赖（`import type` 运行时被擦除，非 JS 循环），低危 |
| llm 边界单点隔离 | `llm/port/index.ts` 单点适配 DSH `ctx.llm`；`llm/parse/shared.ts` 收敛 confidence 与 JSON fail-closed |
| 单 owner 纪律贯穿全文 | CanonLedger append-only、ConfirmationGate 幂等、fail-closed、Fiber dispose 全量回收 |
| 契约锁已落地 | `contracts/stage15/client-projection.json` 等 3 份形状本体锁 + `src/contract-lock.test.ts` 正向/负向断言（I78） |
| Client 形状单一来源 | `client/shapes.ts` 从 core schema 派生（zod omit/extend），`WorkbenchActions`/`WorkbenchState`/`ProjectSessionActions` 收敛为单一来源（I82） |
| 机械接线已唯一化 | `mountRemote`（client/mount.ts）、`defineRemote`/`remoteContribution`/`param`（host/remote/shared.ts）取代 19 份手写 helper 与 16 个 `$mount` 块 |
| 测试安全网 | 116 文件 / 723 测试全绿；`pnpm run verify:iN` 流水线完备 |

## 3. 严重架构问题（高严重度）

### 3.1 【已证实 · 高危】5 个 Remote 方法在真实 DSH 客户端绑定器处必现失败

**结论：是，且是本审查最重要发现。** DSH 客户端绑定器（`dsh-api-gateway/lib/client.js`）对每个 descriptor 要求：

- 实参个数精确等于参数个数（`client.js:217-222`：`expected = parameters.length`，`values.length !== expected` 即抛错）；`acceptsUndefined` 只放行「显式传 undefined」，不放行缺参；
- 逐位置用 strict codec 解析（`client.js:231-237`：`parse(parameter.codec, values[i])`；`client.js:417-424`：strict codec 即 `schema.parse(value)`）。

逐一对齐 descriptor 与 Client 实参（2026-08-28 实测）：

| Remote 方法 | descriptor 参数（`src/host/remote/*.ts`） | Client 实际调用（`src/client/ops/*.ts`） | 真实运行时结果 |
|---|---|---|---|
| `novelWriting.propose` | `[projectId, input, settings]`（writing.ts:116-120） | `target.propose(projectId, { intent })`（chapters.ts:239） | `expected 3, got 2` → 拒绝 |
| `novelWriting.adjudicate` | `[candidateId, decision, settings]`（writing.ts:124-128） | `target.adjudicate(candidateId, decision)`（chapters.ts:275） | `expected 3, got 2` → 拒绝 |
| `novelReview.scan` | `[projectId, settings]`（review.ts:65-68） | `target.scan(projectId)`（review.ts ops:29） | `expected 2, got 1` → 拒绝 |
| `novelStatistics.sceneCards` | `[projectId, actId, beatId, status, limit]`（statistics.ts:197） | `(pid, { actId, beatId, status })` 传对象（statistics.ts ops:28） | `expected 5, got 2` → 拒绝 |
| `novelStatistics.tasks` | `[projectId, status, limit]`（statistics.ts:198） | `(pid, filterObj \| undefined)`（statistics.ts ops:35） | `expected 3, got 2` → 拒绝 |

**反向证据（作者知道该规则，仅部分遵守）**：`onboarding.begin/adjudicate`（client/onboarding.ts:387/423）与 `progress.inspire`（ops/progress.ts:44）、`search.search/references`（ops/search.ts:23-24）都**显式补了 `undefined`** → 正常；遗漏处全部落在**候选写作闭环（I62/I63）、审校中心（I64）、统计筛选（I72）**——产品头号功能路径。

**为何 723 测试全绿却看不见**：UI 测试走 `client/test-harness.ts` 的 fake remote（绕过真实绑定器）；smoke 脚本为 Host-only Node 脚本；I2 兼容门只证明了 1 个 probe 方法。**没有任何测试把产品 Remote 跑过真实客户端绑定器。**

**根因**：descriptor ↔ Host adapter ↔ Client namespace 三方无类型耦合 —— `RemoteMethodSpec.call: (...args: any[])`、`adapter as unknown as TService`（host/remote/shared.ts:56-64,71-80）、Client 侧手写 `Promise<unknown>` 接口 + 消费处 `as unknown as X` 强转。这正是 v1.0 §3.3 警告的「方法签名改了接线层不报编译错，错误只能运行时暴露」，且**穿透了 I75/I77**。

### 3.2 Agent 上下文双 owner → 语义分叉

`src/agents/agent-tools.ts:98-102` 自建 context builder（`NovelAgentDeps:49-70` 无 timeline）；生产候选路径在 `src/index.ts:342-355` 注入 timeline 并按当前时间线节点过滤关系（`src/host/writing-context.ts:124-135`）；Agent wiring（`src/index.ts:589-606`）未注入。结果：`novel_context` 展示的关系可能与 `novel_continue` 实际 prompt 不一致（可能暴露「未来」关系）。

**建议**：Agent 复用同一个 `NextSceneContextProvider` 实例，删除第二套 builder，杜绝双 owner。

### 3.3 队列轮询 timer 生命周期不归属 Fiber

`src/client/ops/queue.ts:17-34`：`queuePollTimer` 生长在**每次渲染重建**的 ops 闭包内（`client.ts:662` `makeOps` → `createWorkbenchOps`），自调度 `setTimeout(poll, 2000)`；`OpsContext.active` 是按值传入的**布尔快照**（`ops/context.ts:21`），Fiber 卸载（`client.ts:961`）后旧闭包仍视自己 active；`queuePollTimer` 单槽被多轮 `refresh/start` 覆盖而不清旧句柄 → 可堆积并行轮询链；清理依赖「namespace 已卸载」的调用拒绝路径而非 Fiber disposer。

**违反本项目基线**「所有副作用必须归属 Cordis Fiber，停止/更新/卸载时完整 dispose」（design §0.1.1 Fiber 行）。

**建议**：timer/poll controller 归 `apply` 级（Fiber）持有并随 Fiber dispose；ops 只发命令；活跃判定传 `isActive()` 函数而非布尔快照。

### 3.4 `src/index.ts` 仍是 god composition root

65 个 import（`:1-66`）、单个 `apply` 跨 `:145-619`、52 处 `ctx.provide`（`:148-607`），且**不只是声明式装配**：设置 fallback/错误策略（`:235-252`）、analyzer 生命周期适配（`:253-283`）、onboarding 成功后触发 timeline 副流程并 `.catch(() => undefined)` 静默吞错（`:299-309`）、统计 wire 形状转换（`:560-576`）、Tool/Typert 生命周期（`:608-618`）全部汇聚于此。

v1.0 §4.1 所称「index 接线样板可用工厂砍掉约 40%」部分实现（defineRemote 就位），但 **god 组合根本身未消除**（581→620 行，因新增服务反而略增）。此为**函数级 god（god composition-root function），不是 god class/service**。

**建议**：按「基础服务 / 管理面 / 编排面」分三段组装函数；跨域副作用（onboarding→timeline 副流程、统计形状转换）外移或改为显式注册的 hook。

### 3.5 `src/client.ts` 仍是 god composition/controller

`factory 372-1002`、`apply 382-1000`、`Overlay 703-900`（约 200 行 `ui` 方法表）、`workbenchView 160-345`（21 形参）；Remote 资源清单**平行维护五处**：namespace 变量（`:383-398`）、disposer（`:401-416`）、mount（`:912-959`）、清空（`:965-980`）、释放（`:982-997`）。

**建议**：入口只留 factory/slot 装配；拆 workspace shell、project/onboarding/settings/upload controllers、overlay presenter；mount 清单改声明式 registry + service bag + disposer Set。

## 4. 过大文件（应拆分，2026-08-28 实测）

| 文件 | 实测行数 | 判断/建议 |
|---|---|---|
| `src/client.ts` | 1002 | 生产最大文件；见 §3.5，最高优先拆 |
| `src/index.ts` | 620 | 见 §3.4 |
| `src/client/layers/chapters.ts` | 590 | 章节树 + 场景编辑 + reparse + 候选裁决 + 分支五职混装（`ChaptersEditOps` 23 方法，`:164-196`）；拆 chapters / scene-editor / candidate / branch 四片 |
| `src/host/queue-service.ts` | 566 | **不拆**：单一「可恢复队列状态机」域，内聚（v1.0 同判） |
| `src/client/onboarding.ts` | 431 | namespace 接口 + 状态形状 + 面板 + contribution re-export 四职；拆 types / panels |
| `src/client/test-harness.ts` | 426 | v1.0 拆 `client.test.ts` 后形成的次级聚合点；拆 fake runtime / remote builders / DOM helpers / onboarding fixtures |
| `src/client/ops/chapters.ts` | 348 | 分支 21-91 / 正文 92-209 / 候选 210-293 三段；随 layers 拆 |
| 测试文件 | `client-panels.test.ts` 1555（38 it）、`client-shell.test.ts` 736、`client-onboarding.test.ts` 666 | 巨型测试文件仍存在；按面板拆文件 |

## 5. god class / 过重权责

**无典型 god class**：core 侧零（CanonLedger / StateEngine / TextRepository 各守单一不变式）；v1.0 的两个 god service 已拆分：
- `writing-adjudication-service.ts` 588→**209 行组合根** + 切片（candidate-production 183 / validation-projection 137 / landing-saga 202），五层写回器共享单一实现；
- `onboarding-adjudication-service.ts` 648→**155 行组合根** + state-machine 271 / apply-layers 369，`raw as unknown as` 输入断言由类型化输入管线（`parseLayerCandidates`）替代（I80）。

**剩余过重点（中-高）：**

| 对象 | 证据 | 判定 |
|---|---|---|
| `WorkbenchActions`（约 100 方法）+ `WorkbenchState`（约 65 字段） | `client/store/types.ts:71-171 / 244-310`；单一 action table `client/store/index.ts:127-217`，`:152` 一行重置 15+ 子域 | store 契约可接受，但已接近需按 shell/project/onboarding/layers/panels/settings 切片 |
| `workbenchView` 21 形参 / `viewPanel` 10 形参 / `reloadProject` 6 形参混合七类加载 | `client.ts:160-181`、`client/panels/index.ts:207-218`、`client/project-session.ts:27-73` | 长参数列表等价 god 函数；改命名 props/context |
| `OpsContext` god dependency | `client/ops/context.ts:17-36`（完整 state/actions + 12 Remote），传入 16 个 ops 工厂 | 拆 OpsRuntime + 各域窄 port |
| `workspace-service` mega-facade | `host/workspace-service.ts:26-64`（35 方法）、`:67`（11 位置依赖）；混合纯转发 + canon correction workflow（`:75-76`）+ C5 投影/重读（`:79-105`） | 宽依赖/修改热点，非领域真相 god |
| 写作裁决依赖宽度 | deps 仍约 16 项（`writing-adjudication-service.ts:107-128`），组合时继续传递（`:146-157`）；组合根另装配 12 依赖 context / 16 依赖 adjudication / 16 依赖 agent（`index.ts:342-373,589-606`） | 文件已拆，依赖面未实质下降 |
| 横向模式：单 `acting` 互锁独立子工作流 | `client/layers/statistics.ts:115-129,166-287`（概览/详情/筛选/任务/重建删除共用一个 acting，**高**）；`knowledge.ts:86-113,163-275`、`import-export.ts:35-67,107-209`（**中**） | 拆子流程判别联合或独立 busy 状态；勿新建全局 LayerContext 掩盖依赖 |

**不应误判**：`queue-service` 约 566 行但单一队列状态机域（非 god）；`writing-context` 12 依赖是单一「上下文聚合」职责（宽但不等于 god）；Remote 导入 core 纯 zod schema 是正确契约复用，不是 Client 持有领域真相。

## 6. 霰弹枪修改

**结论：仍是全项目最值得警惕的结构性债，但形态已变。**

- **新增一个 Remote 仍横切约 6 文件**：`host/remote/<x>.ts`（descriptor）→ `src/remote.ts`（`hostContribution` 手工聚合 `:47-50` + export 表）→ `src/index.ts`（`defineRemote` 块）→ `client/shared.ts`（namespace 接口）→ `client.ts`（`mountRemote` 调用）→ 层文件 + 测试（带状态还要动 `store/types.ts`）。相比 I75 前已机械化，但**手工同步点仍在**，且 descriptor↔adapter 无类型耦合（§3.1 根因）。
- **schema 字段变更横切面已从 v1.0 的 6-8 处收敛到 2-4 处**（core schema → wire 别名 → `client/shapes.ts` 派生 → 契约锁测试），但仍有无编译期保护的手写点：`core/onboarding/example.ts` prompt 字面量、`core/search/builders.ts` searchText 拼接、`core/assemble/serializers.ts` 字段渲染、`llm/parse/*` 的 zod schema vs prompt JSON 示例双写（state.ts:9-23 vs 75-76 等）。
- **`core/schema/onboarding.ts`**：projectId/session/sourceHash 重列 6 次（115-119/136-145/149-155/195-201/231-253/257-266）、六层 enum 重列 4 次（199/219/235/260-263），未复用 `core/schema/base.ts:4` 的 `entityIdSchema`；建议抽 BindingSchema / OnboardingLayerSchema 并拆 analysis/adjudication 合同。
- **`extensions/registry.ts`**：新增一种 kind 需同步 enum（12-20）/ union（26-84）/ seams（86-93）/ maps（98-110）/ projection（150-163）/ switch（198-219）六处；`categoryByKind`（98-101）未使用；建议单一 descriptor 表派生全部。

## 7. 长链式调用评估

**结论：不构成严重问题（低严重度，三方一致）。** 生产代码无 ≥5 层 fluent/property 链的严重案例；最深仍为 `agents/agent-tools.ts:245-246` 的 `built.sources.context.sources.characters.length`（5 层，暴露内部装配形状，建议 context summary DTO）。真正等价的坏味道是：长参数列表（§5）、嵌套 Promise/轮询链（onboarding begin→poll→result，`client.ts:531-590`）、`beginOp→release→unwrap→active→patch` 样板在 `ops/import-export.ts:37-101`、`progress.ts:38-153`、`timeline.ts:27-70`、`chapters.ts:135-200` 等重复（建议抽 `executeRemote`/`refreshAfterMutation`）。

## 8. 其他发现（中-低）

| # | 问题 | 证据 | 严重度 |
|---|---|---|---|
| 1 | 五层写回阶段合同被擦成 `unknown`：`LifecycleWriters<unknown>`（`five-layer-writeback.ts:55-60`）+ 类型断言（`:64-109`）+ `executeLifecycle<unknown>`（landing-saga.ts:163-175）——parser/writer 形状漂移无完整编译期保护 | 同上 | 中 |
| 2 | Remote editor 写入口用通用 `z.unknown()` json codec（`remote/editor.ts:35-38`、`common.ts:8`），strict wire 边界未表达真实请求合同（领域服务侧仍复验，属防御设计但边界形同虚设） | 同上 | 中 |
| 3 | `write/continuation.ts:10-30` 同时消费已含 outline/navigation 的 StoryContextAssembly 与独立 OutlineNavigation（`core/pipeline/index.ts:54-59,69-79` 已把 navigation 渲染进 assembly），无一致性校验 | 同上 | 中-高（语义分叉风险） |
| 4 | `extensions/store.ts:9-11` 声称写前/读后 schema 校验，实际仅校验 layerId 后直接 `writeYaml/readYaml<unknown>`（`:25-35`），API 无 schema resolver | 同上 | 中 |
| 5 | `extensions/registry.ts:124-140` 保存原 extension、`:150-163` 返回同一可变引用——注册后突变可绕过 id/kind/layerId 不变量 | 同上 | 中 |
| 6 | LLM 批量 apply 非事务：`llm/parse/canon.ts:149-164` 逐条 append、`worldview.ts:120-137` 逐条 rewrite、`split.ts:129-153` 混合 save/create——后项失败部分落库；split 重试可能因 outline 已存在失败 | 同上 | 中-高 |
| 7 | `core/text/index.ts` 职责过密：codec/迁移（61-105）/ 仓储（108-180）/ 编辑分支策略（183-295）/ 迁移写入队列（309-356）；335-349 先提交 JSON 真相再写 Markdown 镜像，镜像失败时「主写已成功但调用报错」 | 同上 | 中 |
| 8 | `core/immutable-index/index.ts:39-167` 混合可重建 SQLite 投影 + settings 持久化 + B1/B2 读取 + SQL；SettingEntry 与 `schema/classifier.ts:5-15,26` 重复 | 同上 | 中-低 |
| 9 | `core/export/index.ts:22-85` codec/checksum、88-105 纯文本导出、107-150 导入/Gate、152-180 文件遍历混装 | 同上 | 中-低 |
| 10 | 三个 validator 重复结果/执行骨架（`llm/validate/index.ts:45-79`、`knowledge.ts:30-63`、`relationship-style.ts:29-61`） | 同上 | 中-低 |
| 11 | JSON 边界在 `llm/parse/shared.ts:21-29`，validate 模块反向依赖 parse 语义目录；`llm/analyze/onboarding.ts:151-165` 又重复 JSON.parse——建议迁 `llm/shared/json-boundary` | 同上 | 低-中 |
| 12 | 7 个仓储重复 `.tmp+rename` + Promise tail（rules:137-147、characters:147-157、worldview:205-215、relationship:81-90、style:76-85、knowledge:86-95、state:128-133）——建议抽窄基础设施 primitive 而非泛型基类 | 同上 | 低-中 |
| 13 | Agent open 生命周期重复且非 single-flight（agent-tools.ts:99-118 首次在 108 与 117 两次 openProject，并发可穿过 Set）；工具注册非事务（`:284-289` 中途抛错遗失 disposer） | 同上 | 低 |
| 14 | `agent-tools.ts:174-188,209,286` 本地复制/擦除 DSH Tool contract——建议 typed adapter + 真实边界契约测试 | 同上 | 低 |
| 15 | 最终 prompt 无总预算：`write/continuation.ts:19-31`、`chapter.ts:16-26` 在 core/pipeline 24k 组装后继续追加无限字段 | 同上 | 低-中 |
| 16 | `write/chapter.ts:29-34` 注释称 UTF-16，`[...text].length` 实际计 code points——度量名义不一致 | 同上 | 低 |
| 17 | 命名/服务边界遗留：`novelImport`/`novelImportExport`/`novelExport` 三服务并存等（v1.0 §8#2 后置项，仍在 backlog） | 同上 | 中（已入 backlog） |

## 9. 落地跟踪：哪份审改意见已进入迭代、哪份没有

> 本表是本文件夹的**索引与落地跟踪**（详见 `README.md`）。时间戳在文件名上：v1.0（2026-08-27，无时间戳文件）→ v2.0（本文件，2026-08-28）。

### 9.1 v1.0（2026-08-27）→ 已全部进入迭代并完成

v1.0 §9 六项路线图已全部进入 **Stage 15（I75–I84）** 并落地：

| v1.0 路线图项 | 进入迭代 | 落地证据（2026-08-28 实测） | 状态 |
|---|---|---|---|
| #1 共享 Remote 接线层 | I75 | `host/remote/shared.ts`（param/remoteInvocation/remoteContribution/defineRemote）；`client/mount.ts`；18 处 `as Parameters<...>` 与 6 处 `as never` 归零 | ✅ 完成（§3.1 显示类型耦合仍缺，部分成效） |
| #2 llm 解析/检测公共基座 | I76 | `llm/parse/shared.ts`（parseJsonObject/confidenceSchema 收敛） | ✅ 完成 |
| #3 契约单一来源 | I77/I78 | wire schema 别名复用 10+ 处；`client/shapes.ts`；`contracts/` 形状本体锁 + 负向测试 | ✅ 完成（§3.1/§6 显示未全局达成） |
| #4 拆分两个 god service | I79/I80 | writing 组合根 209 行 + 三切片 + 共享五层写回器；onboarding 组合根 155 行 + 类型化输入管线 | ✅ 完成 |
| #5 拆 client.ts | I82/I83 | makeOps→`client/ops/*` 18 工厂；store→`client/store`；面板注册表 `client/panels`；mount→`client/mount.ts`；client.ts 2876→1002 行 | ✅ 完成（§3.5 显示装配层仍 god） |
| #6 低优先级债务 | I84 | 分层倒置边清零、analyzer 背景错误显式 logger、workspace 构造依赖不再 optional、SHA 集中 | ✅ 完成 |

### 9.2 v2.0（本文件，2026-08-28）→ 中级以上条目已立项为 Stage 17 修复迭代

- I85（Stage 16，DSH family `0.1.1-rc.2` 兼容升级）已于 2026-08-28 完成；本文件中级及以上条目已于同日依 development-plan §21 backlog 机制立项为 **Stage 17（I86–I102，见 development-plan §18）**，按 P0 紧急 → P1 高 → P2 中-高/中 → P3 中-高/中 顺序紧接 I85 之后排期；原 R18 新增功能候选（I86–I95）延后至全部修复迭代之后并顺延重编号为 **I103–I112（development-plan §19）**。
- §8 其余中-低/低项（validator 骨架、仓储 primitive、import 格式 descriptor 等）继续标记为 **backlog / 未进入迭代**。

| 优先级 | 条目 | 来源 | 进入迭代状态 |
|---|---|---|---|
| **P0（建议紧急）** | §3.1 五个 Remote 死方法（`novelWriting.propose/adjudicate`、`novelReview.scan`、`novelStatistics.sceneCards/tasks`）+ 补端到端 binder 契约测试 | v2.0 | 进入迭代 **I86** |
| P1 | §3.2 Agent 上下文单一 owner（复用 NextSceneContextProvider） | v2.0 | 进入迭代 **I87** |
| P1 | §3.3 队列轮询 timer 归 Fiber（`isActive()` 函数 + apply 级 controller） | v2.0 | 进入迭代 **I88** |
| P1 | §3.4 index.ts 组合根分段 | v2.0 | 进入迭代 **I89** |
| P1 | §3.5 client.ts 拆 controllers/presenter | v2.0 | 进入迭代 **I90** |
| P1 | descriptor↔adapter↔client namespace 三方类型耦合（消除 `any[]`/`as unknown as`） | v2.0 | 进入迭代 **I91** |
| P2 | §8#3 双导航真相校验 | v2.0 | 进入迭代 **I92** |
| P2 | §8#6 llm 批量 apply UoW | v2.0 | 进入迭代 **I93** |
| P2 | §8#7 TextRepository 拆分与镜像 outbox 语义 | v2.0 | 进入迭代 **I94** |
| P2 | §4 大文件拆分（chapters.ts 590 / ops chapters / onboarding.ts / test-harness.ts / 巨型测试文件；client.ts、index.ts 由 I89/I90 覆盖） | v2.0 | 进入迭代 **I95** |
| P2 | §8#1 五层写回阶段合同类型化 | v2.0 | 进入迭代 **I96** |
| P2 | §8#2 Remote editor 请求合同精确化 | v2.0 | 进入迭代 **I97** |
| P2 | §8#4 extensions store schema 校验 | v2.0 | 进入迭代 **I98** |
| P2 | §8#5 extensions registry 不可变引用 | v2.0 | 进入迭代 **I99** |
| P2 | §8#17 公开 Remote 服务命名统一（`novelImport`/`novelImportExport`/`novelExport`，独立兼容迁移） | v2.0 | 进入迭代 **I100** |
| P3 | §5 单 acting 互锁 / OpsContext 窄化 / workspace-service 收敛 | v2.0 | 进入迭代 **I101** |
| P3 | §6 onboarding schema 抽 BindingSchema、extension kind 单一 descriptor 表、prompt 示例类型化 | v2.0 | 进入迭代 **I102** |
| P3 | §8 其余中-低项（validator 骨架、仓储 primitive、import 格式 descriptor 等） | v2.0 | ⬜ backlog（未进入迭代） |

> 跟踪约定：条目立项（进入某迭代卡）时在本表把状态改为「进入迭代 Ixx」并标注迭代号；迭代完成后改为「✅ 完成（Ixx）」。本表与 development-plan §21 backlog 保持一致。

## 附录 A：证据索引（2026-08-28 实测）

| 主题 | 证据 |
|---|---|
| Remote 死方法 | `host/remote/writing.ts:116-128` / `review.ts:65-68` / `statistics.ts:197-198`（descriptor）；`client/ops/chapters.ts:239,275` / `review.ts:29` / `statistics.ts:28,35`（Client 调用）；`client/shared.ts:55-59,62-66,145-147`（namespace 接口）；DSH `dsh-api-gateway/lib/client.js:217-222,231-237,417-424`（绑定器语义） |
| 正常对照（显式 undefined） | `client/onboarding.ts:387,423`；`client/ops/progress.ts:44`；`client/ops/search.ts:23-24` |
| god 组合根 | `src/index.ts`（65 import、52 provide、:235-252/:253-283/:299-310/:560-576 逻辑段） |
| god client 装配 | `src/client.ts`（factory 372-1002、Overlay 703-900、mount 912-959、清理 965-997） |
| queue 轮询 | `client/ops/queue.ts:8,17-34,114`；`client/ops/context.ts:21`；`client.ts:662,666,961` |
| Agent 双 owner | `agents/agent-tools.ts:98-102,147-153`；`agents/agent-tools.ts:49-70`（deps 无 timeline）；`index.ts:342-355` vs `589-606`；`writing-context.ts:124-135` |
| 契约锁 | `contracts/stage10/docx-upload.json`、`stage10/project-lifecycle.json`、`stage15/client-projection.json`；`src/contract-lock.test.ts` |
| 类型擦除点 | `host/remote/shared.ts:56-64,71-80`；`client/onboarding.ts:387,423,428`；`client.ts:450,904` |
| 大文件 | `client.ts` 1002、`index.ts` 620、`client/layers/chapters.ts` 590、`queue-service.ts` 566、`client/onboarding.ts` 431、`client-panels.test.ts` 1555 |
| 分层倒置（已修复） | `src/core` 对 `llm/`/`host/`/`client/` 反向 import 均为 0 |
| 测试证据 | `pnpm run typecheck` 绿；`pnpm test` 116 文件 / 723 测试全绿 |
