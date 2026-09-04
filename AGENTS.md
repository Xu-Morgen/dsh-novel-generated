# AGENTS.md — AI 执行约定

> 规则版本：v4.1

本文件是 AI 编码工具在本仓库工作时自动读取的固定约定。用户每次只发送「单迭代执行模板」（格式：`执行迭代 Ixx`），其余规则一律以本文件为准。

## 1. 项目与权威文档

项目：AI 长篇小说创作器（结构化叙事状态引擎 + 分层上下文组装器 + LLM 生成器 + 创作环境工具链），在 `desktop` 分支作为 **Electron 本地桌面应用**交付。

权威文档（优先级从高到低）：

1. `docs/novel-creation-tool-design.md`（v4.1）—— 产品与架构唯一权威来源；§0.1 为**不可由普通变更修改**的 Electron 宿主基线。
2. `docs/novel-creation-tool-requirements.md`（v4.1）—— 需求 ID、验收证据、非目标与迭代覆盖矩阵。
3. `docs/novel-creation-tool-development-plan.md`（v4.1）—— 执行层；**I1–I186 / Stage 0–36 已完成，I187 / Stage 37 为当前架构基线修订迭代**。v3.2 原 I151–I162 只作非执行 provenance，不占用当前连续迭代编号。
4. `docs/novel-creation-tool-architecture-review.md`（v1.0）与 `docs/architecture-reviews/2026-08-28-novel-creation-tool-architecture-review-v2.md`（v2.0）—— 架构审查记录，架构债务治理的立项输入（v1.0 → 已完成 Stage 15；v2.0 → 已完成 Stage 17）；**review record，非设计权威**，不覆盖以上产品权威。

## 1.1 宪法级 Electron 宿主基线（不可修改）

- Electron 是 `desktop` 分支唯一运行宿主和主交付形态；不得同时维护 DSH 插件、Web server 或 PWA 生产路径。
- Main Process 是唯一领域 Host，拥有作品文件、`LlmBackend`、持久化、领域 Services、任务与导入导出，并统一管理窗口注册表；Provider 调用仍只在 Main 执行。
- Preload 只通过 `contextBridge` 暴露按窗口用途裁剪的版本化 strict IPC allowlist；应用可有多个受管 Renderer，每个 Renderer 不拥有作品领域真相。
- BrowserWindow 必须 `contextIsolation:true`、`sandbox:true`、`nodeIntegration:false`；Renderer 禁止 Node/Electron、作品文件、路径和 provider client，但可拥有并明文持久化多套 provider profiles（含访问密钥）。
- 每个 Renderer shell 使用自己的 HTML/React `createRoot()`；生产不启动 localhost Web server。所有窗口必须由 Main 登记并归 `DesktopLifecycle` 回收。
- Renderer 可把当前 profile 的 endpoint/model/明文 secret 作为 strict IPC 请求输入交给 Main；secret 不得进入 IPC 结果、进度、错误详情、日志、作品文件、导出包或崩溃诊断。`CredentialStore` 只作可选兼容/导入适配器，不再是唯一凭据 owner。
- 明文 Renderer 存储是经用户明确接受的安全降级：Renderer compromise、XSS、DevTools、同一 OS 账户或本地存储读取都可能暴露密钥；不得将其描述为安全存储。
- 所有副作用必须归属 `DesktopLifecycle`，窗口关闭、应用退出和升级重启时完整 dispose。
- I1–I164 的 DSH/Cordis/Slot/Typert/Fiber/`ctx.llm` 仅为历史实现与迁移来源；I183 后不得进入生产依赖图、构建或发布物。

## 2. 总控铁律

- 一迭代一任务：每次只执行一个 Ixx，绝不跨迭代顺手改别的。
- 动手前先读计划对应迭代的「目标 / 明确不做 / 交付物 / 验收 / 验证」，填 DoD 卡片，再写代码。
- 确定性模块：实现 → 回归测试 + 负向测试 → `pnpm test` 全绿。
- LLM 模块：先建/更新样本集（含 held-out 子集）再改 prompt/schema，跑样本回归；低于阈值即失败，禁止「接受并继续」。
- 集成点先接 mock：任何接 LLM 的集成，先 fake backend / mock parser 跑通管道，再换 Main `LlmBackend` 的真实 provider adapter。
- 任何「用户确认」必须复用 I11 ConfirmationGate，禁止各迭代临时实现。
- 地基切片必配「消费者夹具」（至少一条按下游消费方式的测试）。
- 样本禁改：禁止为让测试通过而修改样本/金标/阈值，违者该迭代判失败并回退。
- 验收不达标 = 未完成，不得进入下一迭代；超范围想法记 backlog，不在本迭代实现。
- 架构债务治理方向：重构/修复只消除复制与接线债务，**不改变领域契约与公开契约形状**，不夹带新功能；结构性拆分一次一个切片；验收以既有回归全绿为准（详见计划 §16；修复迭代纪律见计划 §18）。
- 公开合同政策：既有 canonical invocation 的方法名、参数、结果是 IPC 基线；新增 strict additive method 必须同步 canonical schema、contract lock、Main adapter/Renderer client 类型耦合、真实 IPC E2E 与负向参数/结果验证，禁止用 `unknown`、调用方 fallback 或静默结果整形绕过。secret-bearing 输入必须显式标记并经过统一 redaction 门。
- I1–I186 与 Stage 0–36 已完成；当前只执行 I187 / Stage 37 的治理修订。I187 不授权运行时实现；多窗口、Renderer profile store 和敏感 IPC 的代码变更必须另立后续连续迭代。不得擅自恢复后置 F1/F2。

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
- 绝不提交 node_modules、.env、真实 API key。运行时 API key 可按 v4.1 明文进入 Renderer profile store 与 strict IPC 请求，但不得进入源码、测试夹具、Git、日志、IPC 结果、作品文件、导出包或诊断。

### 代码注释

- 注释「为什么 / 契约 / 决策」，不注释「显而易见做什么」。
- 每个引擎模块、每层 Schema、每个扩展点的**公共接口与契约**必须写 JSDoc，写明语义与不变式（如 CanonLedger append-only、ConfirmationGate 幂等、C1.knownTo 与 C3 知情边界）。
- 涉及设计决策处标注 § 编号（如「见设计 §6.6 逐层解析」）。
- TODO/FIXME 必须带迭代号与理由，否则视为残留，不得提交。

## 5. 目录结构约定

- 顶层：`src/` 源码、`scripts/` demo 与回归脚本、`projects/` 作品数据、`samples/` LLM 样本、`docs/` 文档、`contracts/` 契约锁、`examples/` 安装/迁移示例；旧 `cordis.yml` 仅为 I1–I164 历史资产并将在 I183 隔离/退役。
- `src/` 一模块一目录：
  - Host 领域核心：`src/core/{project,io,schema,state,canon,confirm,assemble,relationship,outline,knowledge,validate,pipeline,settings-index}/`
  - Host LLM：`src/llm/{port,parse,validate,template}/`
  - 迁移来源领域服务：`src/host/`
  - 迁移来源 Client UI：`src/client/`、`src/ui/editor/`
  - 桌面应用：`src/desktop/{main,preload,renderer}/`
  - 框架无关组合与 ports：`src/app/`；平台 adapters：`src/platform/`
  - 内部扩展点：`src/extensions/`（不是 Electron 外层插件）
  - 导入/导出/写作辅助：`src/import/`、`src/export/`、`src/write/`、`src/agents/`
- 层 Schema 集中在 `src/core/schema/`（rules.ts、style.ts、characters.ts、worldview.ts、relationship.ts、outline.ts、knowledge.ts…）。
- 数据目录由 I3 的 `createProject()` 生成（对应设计 §10.1），源码不硬编码路径。
- 新迭代优先在自属目录内新增文件；不得**静默**改动已交付目录语义。只有对应迭代卡明确列出 canonical owner、兼容/退役边界和跨模块验收时，才可对既有目录做最小 owner-level 修改；跨模块共享类型走 `contracts/` 契约锁。
- 不创建任何空目录（git 不跟踪空目录）。

## 6. 阶段收尾

每阶段末跑 `pnpm test` 全量 + 本阶段全部 held-out 样本回归 + `pnpm run verify:stage-N`，确认本阶段及之前产物累积可用；出现回归先定位到具体迭代，回退到上一可用 commit 修复，不带着红灯进入下一阶段。

## 7. 汇报格式（每迭代结束输出）

交付物清单 / 验收证据（测试输出、样本准确率、smoke 路径）/ commit hash / 下一步迭代。同时输出「交接块」（刚完成、下一步、本阶段引入的契约、backlog），供换窗口续接。
