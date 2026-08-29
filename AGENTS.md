# AGENTS.md — AI 执行约定

> 规则版本：v2.7

本文件是 AI 编码工具在本仓库工作时自动读取的固定约定。用户每次只发送「单迭代执行模板」（格式：`执行迭代 Ixx`），其余规则一律以本文件为准。

## 1. 项目与权威文档

项目：AI 长篇小说创作器（结构化叙事状态引擎 + 分层上下文组装器 + LLM 生成器 + 创作环境工具链），作为 **DeepSeek Harness（DSH）中的 ordinary persistent Cordis Plugin** 交付。

权威文档（优先级从高到低）：

1. `docs/novel-creation-tool-design.md`（v2.7）—— 产品与架构唯一权威来源；§0.1 为**不可由普通变更修改**的宿主基线。
2. `docs/novel-creation-tool-requirements.md`（v2.7）—— 需求 ID、验收证据、非目标与迭代覆盖矩阵。
3. `docs/novel-creation-tool-development-plan.md`（v2.7）—— 执行层，19 个阶段、128 个迭代（I1–I128）；**I1–I102 全部完成**；Stage 18 新增功能与合同地基迭代（I103–I128）已按依赖顺序正式立项，当前从 I103 开始执行；每一步从对应阶段/迭代卡片出发。
4. `docs/novel-creation-tool-architecture-review.md`（v1.0）与 `docs/architecture-reviews/2026-08-28-novel-creation-tool-architecture-review-v2.md`（v2.0）—— 架构审查记录，架构债务治理的立项输入（v1.0 → 已完成 Stage 15；v2.0 → 已完成 Stage 17）；**review record，非设计权威**，不覆盖以上产品权威。

## 1.1 宪法级宿主基线（不可修改）

- 本项目的唯一运行宿主和主交付形态是 DeepSeek Harness；交付物必须是 ordinary persistent Cordis Plugin。
- 生产安装走**所选 profile 的 bundle path**：package 声明 `dsh.bundle.patch` 并显式列入所选 profile 的 `dsh.profile.bundles`；plugin row 只有一个 insertion owner。
- Host 拥有作品文件、凭据、`ctx.llm`、持久化、领域 Services/Events/Tools 与导入导出；Client 只拥有注册到 DSH Slot 的 UI，不拥有领域真相。
- 禁止独立 HTML、`createRoot()` 自挂载、独立 Vite SPA、第二 Web server、浏览器直连 LLM、浏览器持有长期密钥、绕过 Host 改文件。
- 动态 `cordis_define` 仅限原型，绝非 release/安装/生产路径；动态 `harness.handle`/`host.call` 不是普通插件的生产 RPC 合同。
- I1 为 Host-only；I2 为 gate-only 最小 Client 探针，若公开合同无法证明则停止。产品 Client 仅在 I2 通过后开始。
- 所有副作用必须归属 Cordis Fiber，停止/更新/卸载时完整 dispose。

## 2. 总控铁律

- 一迭代一任务：每次只执行一个 Ixx，绝不跨迭代顺手改别的。
- 动手前先读计划对应迭代的「目标 / 明确不做 / 交付物 / 验收 / 验证」，填 DoD 卡片，再写代码。
- 确定性模块：实现 → 回归测试 + 负向测试 → `pnpm test` 全绿。
- LLM 模块：先建/更新样本集（含 held-out 子集）再改 prompt/schema，跑样本回归；低于阈值即失败，禁止「接受并继续」。
- 集成点先接 mock：任何接 LLM 的集成，先 fake backend / mock parser 跑通管道，再换真实 DSH `ctx.llm`。
- 任何「用户确认」必须复用 I11 ConfirmationGate，禁止各迭代临时实现。
- 地基切片必配「消费者夹具」（至少一条按下游消费方式的测试）。
- 样本禁改：禁止为让测试通过而修改样本/金标/阈值，违者该迭代判失败并回退。
- 验收不达标 = 未完成，不得进入下一迭代；超范围想法记 backlog，不在本迭代实现。
- 架构债务治理方向：重构/修复只消除复制与接线债务，**不改变领域契约与公开契约形状**，不夹带新功能；结构性拆分一次一个切片；验收以既有回归全绿为准（详见计划 §16；修复迭代纪律见计划 §18）。
- 新增功能的公开合同政策：既有 invocation 的方法名、参数、结果必须向后兼容；允许新增 strict additive Remote 方法/namespace，但必须同步 canonical schema、descriptor/结果 contract lock、adapter 返回类型耦合、真实 DSH binder E2E 与负向参数/结果验证，禁止用 `unknown`、调用方 fallback 或静默结果整形绕过。
- I1–I102 已完成：I85 已把唯一 DSH family pin 切换为 `0.1.1-rc.2`；Stage 17 修复迭代 I86–I102 已按 review v2.0 完成并成为 Stage 18 的真实基线。**Stage 18 I103–I128** 已于 v2.7 按依赖顺序正式立项：I103 先修 Remote 返回合同基线，I104–I128 交付 R18-1–R18-10；不得恢复“Stage 18 先于 Stage 17”或旧 I103–I112 十张大卡。每迭代单独 commit，验证命令为 `pnpm run verify:i103`–`verify:i128`。

## 3. 完成定义（DoD）

每个迭代以「确定性断言绿 + 负向断言绿 +（LLM 模块时）样本回归达标 + smoke 产物可查 + 一次干净 commit」为完成，不以「代码写完」为完成。每迭代验证命令固定为 `pnpm run verify:iN`；每阶段累积验证为 `pnpm run verify:stage-N`。

## 4. Commit 与代码注释规范

### commit 消息格式

```text
<type>(Ixx): <一句话目标>

- 做了什么：本迭代范围
- 为什么：设计依据 / 决策引用（标 § 编号）
- 如何验证：测试命令 + 结果 / 样本准确率
- 明确不做：本迭代有意留白
```

### 纪律

- type：`feat` / `test` / `docs` / `refactor` / `fix`。
- 一次迭代一个 commit；禁止把多个迭代的改动混进一个 commit。
- 提交前自检：`git status` 只含本迭代文件；`git diff` 无 console.log / 临时文件 / 注释掉的死代码；测试绿。
- 绝不提交 node_modules、.env、真实 API key；凭据只经 DSH credentials/settings seam。

### 代码注释

- 注释「为什么 / 契约 / 决策」，不注释「显而易见做什么」。
- 每个引擎模块、每层 Schema、每个扩展点的**公共接口与契约**必须写 JSDoc，写明语义与不变式（如 CanonLedger append-only、ConfirmationGate 幂等、C1.knownTo 与 C3 知情边界）。
- 涉及设计决策处标注 § 编号（如「见设计 §6.6 逐层解析」）。
- TODO/FIXME 必须带迭代号与理由，否则视为残留，不得提交。

## 5. 目录结构约定

- 顶层：`src/` 源码、`scripts/` demo 与回归脚本、`projects/` 作品数据、`samples/` LLM 样本、`docs/` 文档、`contracts/` 契约锁、`examples/` 安装/组合示例、`cordis.yml`（本地 Loader smoke）。
- `src/` 一模块一目录：
  - Host 领域核心：`src/core/{project,io,schema,state,canon,confirm,assemble,relationship,outline,knowledge,validate,pipeline,settings-index}/`
  - Host LLM：`src/llm/{port,parse,validate,template}/`
  - Host 领域服务与 Remote：`src/host/`
  - Client Slot UI：`src/client/`、`src/ui/editor/`
  - 内部扩展点：`src/extensions/`（不是外层 Cordis Plugin）
  - 导入/导出/写作辅助：`src/import/`、`src/export/`、`src/write/`、`src/agents/`
- 层 Schema 集中在 `src/core/schema/`（rules.ts、style.ts、characters.ts、worldview.ts、relationship.ts、outline.ts、knowledge.ts…）。
- 数据目录由 I3 的 `createProject()` 生成（对应设计 §10.1），源码不硬编码路径。
- 新迭代优先在自属目录内新增文件；不得**静默**改动已交付目录语义。只有对应迭代卡明确列出 canonical owner、兼容/退役边界和跨模块验收时，才可对既有目录做最小 owner-level 修改；跨模块共享类型走 `contracts/` 契约锁。
- 不创建任何空目录（git 不跟踪空目录）。

## 6. 阶段收尾

每阶段末跑 `pnpm test` 全量 + 本阶段全部 held-out 样本回归 + `pnpm run verify:stage-N`，确认本阶段及之前产物累积可用；出现回归先定位到具体迭代，回退到上一可用 commit 修复，不带着红灯进入下一阶段。

## 7. 汇报格式（每迭代结束输出）

交付物清单 / 验收证据（测试输出、样本准确率、smoke 路径）/ commit hash / 下一步迭代。同时输出「交接块」（刚完成、下一步、本阶段引入的契约、backlog），供换窗口续接。
